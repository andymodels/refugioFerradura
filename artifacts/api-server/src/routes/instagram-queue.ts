import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, instagramQueueTable, postsTable, partnerMediaTable, instagramPartnersTable } from "@workspace/db";
import { and, desc, eq, inArray, gte, isNotNull, sql } from "drizzle-orm";
import { executarFila } from "../lib/instagram-queue";
import { getInstagramToken } from "../lib/instagram-token";
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
  const { titulo, scheduledAt, caption, imageUrls, postId, capaFundo, dryRun, pauta, partnerIds } = req.body || {};
  const quando = new Date(String(scheduledAt));
  const erros: string[] = [];
  if (typeof titulo !== "string" || titulo.trim().length < 3) erros.push("titulo obrigatório.");
  if (isNaN(quando.getTime())) erros.push("scheduledAt inválido (use ISO com fuso, ex.: 2026-10-05T19:00:00-03:00).");
  else if (quando.getTime() < Date.now() - 60_000) erros.push("scheduledAt está no passado.");
  if (typeof caption !== "string" || caption.trim().length < 10 || caption.length > 2200) erros.push("caption inválida (10 a 2200 caracteres).");
  if (!Array.isArray(imageUrls) || imageUrls.length < 1 || imageUrls.length > 10 || !imageUrls.every((u: unknown) => isB2Url(u))) erros.push("imageUrls: de 1 a 10 URLs do nosso B2 (1 = foto única, 2 ou mais = carrossel).");
  if (postId !== undefined && postId !== null && !Number.isInteger(postId)) erros.push("postId inválido.");
  if (partnerIds !== undefined && !(Array.isArray(partnerIds) && partnerIds.every((n: unknown) => Number.isInteger(n)))) erros.push("partnerIds deve ser uma lista de números.");
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
    .values({ titulo: titulo.trim(), scheduledAt: quando, caption: caption.trim(), imageUrls, postId: postId ? Number(postId) : null, capaFundo: typeof capaFundo === "string" ? capaFundo : null, pauta: typeof pauta === "string" ? pauta.trim() : null, partnerIds: Array.isArray(partnerIds) ? partnerIds : [], dedupeKey })
    .returning();
  res.status(201).json({ status: "queued", id: row.id, scheduledAt: row.scheduledAt, slides: imageUrls.length });
});

// Saúde da fila (só leitura): quantos dias à frente estão cobertos. O workflow
// "fila-saude" falha quando a cobertura está baixa, para o GitHub avisar por e-mail
// em horas (antes a fila podia secar por dias com tudo "success").
const MIN_DIAS_COBERTOS = 2;
cronRouter.get("/status", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const dia = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
  const hoje = dia(new Date());
  const rows = await db.select().from(instagramQueueTable).orderBy(desc(instagramQueueTable.scheduledAt)).limit(100);
  const futuros = rows.filter((r) => r.status === "aguardando" || r.status === "publicando").filter((r) => r.scheduledAt.getTime() > Date.now() - 3_600_000);
  const dias = [...new Set(futuros.map((r) => dia(r.scheduledAt)).filter((d) => d >= hoje))].sort();
  const limite = Date.now() - 72 * 3_600_000;
  const falhas = rows.filter((r) => r.status === "falhou" && r.updatedAt.getTime() >= limite).map((r) => ({ id: r.id, titulo: r.titulo, erro: r.lastError }));
  const problemas: string[] = [];
  if (dias.length < MIN_DIAS_COBERTOS) problemas.push(`fila cobre só ${dias.length} dia(s) à frente (mínimo ${MIN_DIAS_COBERTOS}). Rode a produção no Mac.`);
  if (falhas.length) problemas.push(`${falhas.length} item(ns) falharam nas últimas 72h.`);
  const ultimoPublicado = rows.filter((r) => r.status === "publicado").sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))[0];
  res.status(problemas.length ? 503 : 200).json({
    ok: problemas.length === 0,
    problemas,
    diasCobertos: dias.length,
    dias,
    proximos: futuros.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()).slice(0, 10).map((r) => ({ id: r.id, titulo: r.titulo, scheduledAt: r.scheduledAt, status: r.status })),
    falhasRecentes: falhas,
    ultimoPublicado: ultimoPublicado ? { titulo: ultimoPublicado.titulo, publishedAt: ultimoPublicado.publishedAt, permalink: ultimoPublicado.permalink } : null,
  });
});

// ─── Relógio externo (cron-job.org) ────────────────────────────────────────
// Modelo do blog UM2TRÊS: o relógio NÃO tem lógica nem segredo, só chama esta URL
// a cada poucos minutos. Ela é pública de propósito: usa os segredos que já estão no
// servidor e só publica o que JÁ VENCEU (a mesma fila e a mesma reserva atômica da
// rota /run), então chamar à toa ou várias vezes é inofensivo. Trava de 45 s no banco
// para não deixar ninguém martelar a Meta. Responde só contagens, nunca texto de itens.
const TICK_MIN_S = 45;
const K_TICK = "instagram_queue_tick_at";
cronRouter.get("/tick", async (_req, res): Promise<void> => {
  try {
    const agora = new Date();
    const limite = new Date(agora.getTime() - TICK_MIN_S * 1000).toISOString();
    // Atualização condicional: só uma chamada por janela leva a vez (valores ISO comparam em ordem).
    const r: any = await db.execute(sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${K_TICK}, ${agora.toISOString()}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        WHERE settings.value < ${limite}
      RETURNING key`);
    if (!(r.rows ?? r).length) {
      res.json({ ok: true, pulado: "chamada recente demais" });
      return;
    }
    const x = await executarFila();
    // 500 quando algum item esgotou as tentativas: o cron-job.org avisa por e-mail.
    res.status(x.falhas.length ? 500 : 200).json({
      ok: x.falhas.length === 0,
      publicados: x.publicados.length,
      recuperados: x.recuperados.length,
      tentarDeNovo: x.tentarDeNovo.length,
      falhas: x.falhas.length,
    });
  } catch (err: any) {
    logger.error({ erro: String(err?.message ?? err) }, "[fila-instagram] Erro no tick");
    res.status(500).json({ ok: false, erro: "falha ao executar a fila" });
  }
});

// ─── Diagnóstico da API do Instagram (só leitura, exige segredo) ───────────
// Responde, com o token REAL do servidor: (1) que tipo de conta/token é; (2) se
// business_discovery lê posts públicos de OUTROS perfis profissionais (os parceiros);
// (3) se /tags devolve as fotos em que parceiros marcam a conta do Refúgio. Nunca
// devolve o token. Serve para decidir se a nuvem consegue ler fotos oficiais dos
// parceiros sem proxy e sem scraping.
cronRouter.get("/diag-instagram", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { token, origem } = await getInstagramToken();
  const igId = process.env.INSTAGRAM_BUSINESS_ID;
  if (!token || !igId) {
    res.status(500).json({ ok: false, erro: "faltam INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID" });
    return;
  }
  const base = "https://graph.instagram.com/v21.0";
  const fazer = (baseUrl: string, tok: string) => async (caminho: string, params: Record<string, string>) => {
    const url = new URL(baseUrl + caminho);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", tok);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const d: any = await r.json().catch(() => null);
      const e = d?.error;
      return { http: r.status, ok: r.ok && !e, erro: e ? { codigo: e.code, subcodigo: e.error_subcode ?? null, tipo: e.type, mensagem: String(e.message || "").slice(0, 220) } : null, dados: r.ok && !e ? d : null };
    } catch (err: any) {
      return { http: 0, ok: false, erro: { codigo: null, subcodigo: null, tipo: "rede", mensagem: String(err?.message ?? err).slice(0, 120) }, dados: null };
    }
  };
  const chamar = fazer(base, token);
  const conta = await chamar(`/${igId}`, { fields: "id,username,account_type,media_count" });
  const tags = await chamar(`/${igId}/tags`, { fields: "id,media_type,media_url,permalink,timestamp,username", limit: "25" });
  const lista: any[] = Array.isArray(tags.dados?.data) ? tags.dados.data : [];

  let handles: string[] = String(req.query.handles || "").split(",").map((h) => h.trim().replace(/^@/, "")).filter(Boolean);
  if (!handles.length) {
    const rows = await db.select({ h: instagramPartnersTable.instagramHandle }).from(instagramPartnersTable).where(isNotNull(instagramPartnersTable.instagramHandle)).limit(4);
    handles = rows.map((r) => String(r.h).replace(/^@/, "")).filter(Boolean);
  }
  const discovery: any[] = [];
  for (const h of handles.slice(0, 5)) {
    if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) continue;
    const r = await chamar(`/${igId}`, { fields: `business_discovery.username(${h}){username,followers_count,media_count,media.limit(5){id,media_type,media_url,permalink,timestamp}}` });
    const bd = r.dados?.business_discovery;
    const media: any[] = Array.isArray(bd?.media?.data) ? bd.media.data : [];
    discovery.push({ handle: h, http: r.http, ok: r.ok, erro: r.erro, posts: media.length, comUrlDaImagem: media.filter((m) => !!m.media_url).length, maisRecente: media[0]?.timestamp ?? null });
  }

  // Login do Facebook (variáveis INSTAGRAM_FB_ACCESS_TOKEN e, opcional, INSTAGRAM_FB_USER_ID): é este tipo
  // de token que habilita business_discovery. Aqui só testamos; nada é guardado nem exibido.
  const fbToken = process.env.INSTAGRAM_FB_ACCESS_TOKEN;
  const fbId = process.env.INSTAGRAM_FB_USER_ID || igId;
  const facebook: Record<string, unknown> = { tokenConfigurado: !!fbToken };
  if (fbToken) {
    const fb = fazer("https://graph.facebook.com/v21.0", fbToken);
    const perms = await fb("/me/permissions", {});
    const lista2: any[] = Array.isArray(perms.dados?.data) ? perms.dados.data : [];
    facebook.permissoesConcedidas = lista2.filter((p) => p.status === "granted").map((p) => p.permission);
    facebook.permissoesErro = perms.erro;
    const contaFb = await fb(`/${fbId}`, { fields: "id,username,account_type" });
    facebook.conta = { ok: contaFb.ok, erro: contaFb.erro, usuario: contaFb.dados?.username ?? null, tipo: contaFb.dados?.account_type ?? null };
    const tagsFb = await fb(`/${fbId}/tags`, { fields: "id,media_type,media_url,permalink,timestamp,username", limit: "25" });
    const lfb: any[] = Array.isArray(tagsFb.dados?.data) ? tagsFb.dados.data : [];
    facebook.tags = { ok: tagsFb.ok, erro: tagsFb.erro, total: lfb.length, comUrlDaImagem: lfb.filter((m) => !!m.media_url).length };
    const disc: any[] = [];
    for (const h of handles.slice(0, 5)) {
      if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) continue;
      const r = await fb(`/${fbId}`, { fields: `business_discovery.username(${h}){username,followers_count,media_count,media.limit(${req.query.detalhe === "1" ? 12 : 5}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}` });
      const bd = r.dados?.business_discovery;
      const media: any[] = Array.isArray(bd?.media?.data) ? bd.media.data : [];
      disc.push({
        handle: h, http: r.http, ok: r.ok, erro: r.erro,
        posts: media.length,
        comUrlDaImagem: media.filter((m) => !!m.media_url).length,
        comLegenda: media.filter((m) => !!m.caption).length,
        tipos: media.reduce((a: Record<string, number>, m) => ((a[m.media_type] = (a[m.media_type] || 0) + 1), a), {}),
        maisRecente: media[0]?.timestamp ?? null,
        // Com ?detalhe=1: os posts PÚBLICOS do parceiro (legenda, data, link, tipo, URL da foto) para a produção ler novidades.
        ...(req.query.detalhe === "1" ? { postsDetalhe: media.map((m) => ({ tipo: m.media_type, quando: m.timestamp, permalink: m.permalink, imagem: m.media_url ?? null, miniatura: m.thumbnail_url ?? null, legenda: String(m.caption || "").slice(0, 900) })) } : {}),
      });
    }
    facebook.businessDiscovery = disc;
  }

  res.json({
    facebook,
    tokenOrigem: origem,
    tokenTipo: token.startsWith("IGAA") ? "Instagram Login (IGAA)" : "outro",
    conta: { ok: conta.ok, erro: conta.erro, tipo: conta.dados?.account_type ?? null, usuario: conta.dados?.username ?? null },
    tags: {
      ok: tags.ok,
      erro: tags.erro,
      total: lista.length,
      comUrlDaImagem: lista.filter((m) => !!m.media_url).length,
      porTipo: lista.reduce((a: Record<string, number>, m) => ((a[m.media_type] = (a[m.media_type] || 0) + 1), a), {}),
      amostra: lista.slice(0, 5).map((m) => ({ usuario: m.username ?? null, tipo: m.media_type, quando: m.timestamp, permalink: m.permalink })),
    },
    businessDiscovery: discovery,
    observacao: "mentioned_media (menções na legenda) só aceita o id de um post específico, que chega por webhook; não dá para listar.",
  });
});

// Para o Mac consultar a fila (e saber quais fundos de capa já foram usados).
cronRouter.get("/list", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const limite = Math.min(Number(req.query.limite) || 60, 200);
  const rows = await db.select().from(instagramQueueTable).orderBy(desc(instagramQueueTable.scheduledAt)).limit(limite);
  res.json({ itens: rows.map((r) => ({ id: r.id, titulo: r.titulo, scheduledAt: r.scheduledAt, status: r.status, attempts: r.attempts, capaFundo: r.capaFundo, permalink: r.permalink, postId: r.postId, pauta: r.pauta, partnerIds: r.partnerIds, blogPublicadoEm: r.blogPublicadoEm, slides: r.imageUrls.length })) });
});

// Acervo de imagens do blog no B2 (capa e fotos das matérias publicadas), para
// o Mac escolher fundos de capa variados. Só lista; classificar é trabalho do Mac.
cronRouter.get("/acervo", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const posts = await db.select({ id: postsTable.id, titulo: postsTable.title, slug: postsTable.slug, capa: postsTable.coverImage, midia: postsTable.mediaItems, conteudo: postsTable.content }).from(postsTable).where(eq(postsTable.status, "published"));
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
      for (const m of JSON.parse(p.midia || "[]")) {
        if (m?.kind === "foto") add(m.urlArquivo, p, "midia");
        else if (m?.poster) add(m.poster, p, "midia"); // quadro de abertura de vídeo
      }
    } catch { /* mídia mal formada: ignora */ }
    // Fotos que estão dentro do texto da matéria (a maior parte do acervo do blog).
    for (const m of (p.conteudo || "").matchAll(/<img[^>]+src="([^"]+)"/g)) add(m[1], p, "midia");
  }
  // Paisagens já avaliadas do acervo de mídia (fotos oficiais guardadas no B2).
  const paisagens = await db
    .select({ url: partnerMediaTable.urlArquivo, partnerId: partnerMediaTable.partnerId, cena: partnerMediaTable.cena })
    .from(partnerMediaTable)
    .where(and(inArray(partnerMediaTable.cena, ["paisagem", "ponto"]), gte(partnerMediaTable.score, 3)));
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
  const ids = [...new Set(rows.flatMap((r) => r.partnerIds))];
  const nomes = new Map<number, string>();
  if (ids.length) {
    const ps = await db.select({ id: instagramPartnersTable.id, nome: instagramPartnersTable.nomeEstabelecimento }).from(instagramPartnersTable).where(inArray(instagramPartnersTable.id, ids));
    for (const p of ps) nomes.set(p.id, p.nome);
  }
  const postIds = [...new Set(rows.map((r) => r.postId).filter((x): x is number => !!x))];
  const materias = new Map<number, { titulo: string; status: string; slug: string }>();
  if (postIds.length) {
    const ps = await db.select({ id: postsTable.id, titulo: postsTable.title, status: postsTable.status, slug: postsTable.slug }).from(postsTable).where(inArray(postsTable.id, postIds));
    for (const p of ps) materias.set(p.id, { titulo: p.titulo, status: p.status, slug: p.slug });
  }
  res.json(rows.map((r) => ({ ...r, parceiros: r.partnerIds.map((i) => nomes.get(i) ?? `#${i}`), materia: r.postId ? materias.get(r.postId) ?? null : null })));
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
