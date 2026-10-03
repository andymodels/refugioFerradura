import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, instagramQueueTable, postsTable, partnerMediaTable } from "@workspace/db";
import { and, desc, eq, inArray, gte } from "drizzle-orm";
import { executarFila } from "../lib/instagram-queue";
import { isB2Url } from "../lib/engine";
import { logger } from "../lib/logger";

// Fila do Instagram. Duas portas:
//  - /cron/instagram-queue/* : usada pelo Mac (enfileirar/consultar) e pelo
//    GitHub Actions (rodar a fila). Exige CRON_SECRET ou ENGINE_SECRET.
//  - /instagram-queue/*      : painel admin (login), só para ver, cancelar e
//    mudar horário.
export const cronRouter: IRouter = Router();
export const adminRouter: IRouter = Router();

function autorizado(req: any, res: any): boolean {
  const h = req.headers.authorization;
  const ok = [process.env.CRON_SECRET, process.env.ENGINE_SECRET].some((s) => s && h === `Bearer ${s}`);
  if (!ok) res.status(401).json({ error: "Não autorizado" });
  return ok;
}
function admin(req: any, res: any): boolean {
  if (!(req.session as any)?.adminId) {
    res.status(401).json({ error: "Não autorizado" });
    return false;
  }
  return true;
}

// ─── Publicador (GitHub Actions a cada ~10 min) ────────────────────────────
cronRouter.all("/run", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  try {
    const r = await executarFila();
    // 500 quando algum item esgotou as tentativas: o workflow falha e o GitHub avisa por e-mail.
    res.status(r.falhas.length ? 500 : 200).json({ ok: r.falhas.length === 0, ...r });
  } catch (err: any) {
    logger.error({ erro: String(err?.message ?? err) }, "[fila-instagram] Erro ao executar a fila");
    res.status(500).json({ ok: false, erro: String(err?.message ?? err).slice(0, 200) });
  }
});

// ─── Entrada de conteúdo FINALIZADO (vem do Mac) ───────────────────────────
cronRouter.post("/enqueue", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { titulo, scheduledAt, caption, imageUrls, postId, capaFundo, dryRun } = req.body || {};
  const quando = new Date(String(scheduledAt));
  const erros: string[] = [];
  if (typeof titulo !== "string" || titulo.trim().length < 3) erros.push("titulo obrigatório.");
  if (isNaN(quando.getTime())) erros.push("scheduledAt inválido (use ISO com fuso, ex.: 2026-10-05T19:00:00-03:00).");
  else if (quando.getTime() < Date.now() - 60_000) erros.push("scheduledAt está no passado.");
  if (typeof caption !== "string" || caption.trim().length < 10 || caption.length > 2200) erros.push("caption inválida (10 a 2200 caracteres).");
  if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 10 || !imageUrls.every((u: unknown) => isB2Url(u))) erros.push("imageUrls: de 2 a 10 URLs do nosso B2.");
  if (postId !== undefined && postId !== null && !Number.isInteger(postId)) erros.push("postId inválido.");
  if (erros.length) {
    res.status(400).json({ status: "error", erros });
    return;
  }
  // Cada imagem precisa existir e ser JPEG (a Meta recusa o resto).
  const checadas: { arquivo: string; http: number; tipo: string | null }[] = [];
  for (const u of imageUrls as string[]) {
    try {
      const h = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      checadas.push({ arquivo: u.split("/").pop() || u, http: h.status, tipo: h.headers.get("content-type") });
    } catch {
      checadas.push({ arquivo: u.split("/").pop() || u, http: 0, tipo: null });
    }
  }
  if (checadas.some((c) => c.http !== 200 || !(c.tipo || "").includes("jpeg"))) {
    res.status(422).json({ status: "invalid", erro: "imagem inacessível ou que não é JPEG", checadas });
    return;
  }
  if (postId) {
    const [p] = await db.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.id, Number(postId)));
    if (!p) {
      res.status(404).json({ status: "error", erro: "postId não existe." });
      return;
    }
  }
  const dedupeKey = crypto.createHash("sha256").update(JSON.stringify([imageUrls, caption.trim()])).digest("hex");
  const [dup] = await db.select().from(instagramQueueTable).where(eq(instagramQueueTable.dedupeKey, dedupeKey));
  if (dup) {
    res.status(409).json({ status: "duplicate", id: dup.id, estado: dup.status, scheduledAt: dup.scheduledAt });
    return;
  }
  if (dryRun === true) {
    res.json({ status: "dry_run_ok", slides: imageUrls.length, quando: quando.toISOString(), legendaCaracteres: caption.length });
    return;
  }
  const [row] = await db
    .insert(instagramQueueTable)
    .values({ titulo: titulo.trim(), scheduledAt: quando, caption: caption.trim(), imageUrls, postId: postId ? Number(postId) : null, capaFundo: typeof capaFundo === "string" ? capaFundo : null, dedupeKey })
    .returning();
  res.status(201).json({ status: "queued", id: row.id, scheduledAt: row.scheduledAt, slides: imageUrls.length });
});

// Para o Mac consultar a fila (e saber quais fundos de capa já foram usados).
cronRouter.get("/list", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const limite = Math.min(Number(req.query.limite) || 60, 200);
  const rows = await db.select().from(instagramQueueTable).orderBy(desc(instagramQueueTable.scheduledAt)).limit(limite);
  res.json({ itens: rows.map((r) => ({ id: r.id, titulo: r.titulo, scheduledAt: r.scheduledAt, status: r.status, attempts: r.attempts, capaFundo: r.capaFundo, permalink: r.permalink, postId: r.postId, slides: r.imageUrls.length })) });
});

// Acervo de imagens do blog no B2 (capa e fotos das matérias publicadas), para
// o Mac escolher fundos de capa variados. Só lista; classificar é trabalho do Mac.
cronRouter.get("/acervo", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const posts = await db.select({ id: postsTable.id, titulo: postsTable.title, slug: postsTable.slug, capa: postsTable.coverImage, midia: postsTable.mediaItems }).from(postsTable).where(eq(postsTable.status, "published"));
  const vistos = new Set<string>();
  const itens: { url: string; postId: number; titulo: string; slug: string; origem: "capa" | "midia" }[] = [];
  const add = (url: unknown, p: (typeof posts)[number], origem: "capa" | "midia") => {
    if (!isB2Url(url) || vistos.has(url)) return;
    vistos.add(url);
    itens.push({ url, postId: p.id, titulo: p.titulo, slug: p.slug, origem });
  };
  for (const p of posts) {
    add(p.capa, p, "capa");
    try {
      for (const m of JSON.parse(p.midia || "[]")) if (m?.kind === "foto") add(m.urlArquivo, p, "midia");
    } catch { /* mídia mal formada: ignora */ }
  }
  // Paisagens já avaliadas do acervo de mídia (fotos oficiais guardadas no B2).
  const paisagens = await db
    .select({ url: partnerMediaTable.urlArquivo, partnerId: partnerMediaTable.partnerId, cena: partnerMediaTable.cena })
    .from(partnerMediaTable)
    .where(and(inArray(partnerMediaTable.cena, ["paisagem", "ponto"]), gte(partnerMediaTable.score, 6)));
  for (const m of paisagens) {
    if (!isB2Url(m.url) || vistos.has(m.url)) continue;
    vistos.add(m.url);
    itens.push({ url: m.url, postId: 0, titulo: `acervo de mídia (lugar ${m.partnerId})`, slug: "", origem: "midia" });
  }
  res.json({ total: itens.length, itens });
});

// ─── Painel admin ──────────────────────────────────────────────────────────
adminRouter.get("/instagram-queue", async (req, res): Promise<void> => {
  if (!admin(req, res)) return;
  const rows = await db.select().from(instagramQueueTable).orderBy(desc(instagramQueueTable.scheduledAt)).limit(100);
  res.json(rows);
});

adminRouter.post("/instagram-queue/:id/cancelar", async (req, res): Promise<void> => {
  if (!admin(req, res)) return;
  const id = Number(req.params.id);
  const r = await db.update(instagramQueueTable).set({ status: "cancelado", updatedAt: new Date() }).where(and(eq(instagramQueueTable.id, id), inArray(instagramQueueTable.status, ["aguardando", "falhou"]))).returning({ id: instagramQueueTable.id });
  if (!r.length) {
    res.status(409).json({ error: "Só dá para cancelar item aguardando ou que falhou." });
    return;
  }
  res.json({ ok: true });
});

adminRouter.post("/instagram-queue/:id/horario", async (req, res): Promise<void> => {
  if (!admin(req, res)) return;
  const id = Number(req.params.id);
  const quando = new Date(String(req.body?.scheduledAt));
  if (isNaN(quando.getTime()) || quando.getTime() < Date.now() - 60_000) {
    res.status(400).json({ error: "Horário inválido ou no passado." });
    return;
  }
  // Também reativa um item que falhou/cancelou, zerando as tentativas.
  const r = await db
    .update(instagramQueueTable)
    .set({ scheduledAt: quando, status: "aguardando", attempts: 0, nextAttemptAt: null, lastError: null, updatedAt: new Date() })
    .where(and(eq(instagramQueueTable.id, id), inArray(instagramQueueTable.status, ["aguardando", "falhou", "cancelado"])))
    .returning({ id: instagramQueueTable.id });
  if (!r.length) {
    res.status(409).json({ error: "Este item não pode mais ser alterado (já publicado ou em publicação)." });
    return;
  }
  res.json({ ok: true });
});
