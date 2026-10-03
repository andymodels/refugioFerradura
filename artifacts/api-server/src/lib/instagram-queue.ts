import { and, eq, lt, sql } from "drizzle-orm";
import { db, instagramQueueTable, postsTable, type InstagramQueueItem } from "@workspace/db";
import { publishCarouselToInstagram } from "./instagram";
import { getInstagramToken } from "./instagram-token";
import { logger } from "./logger";

// Publicador da fila do Instagram. NÃO cria, reescreve nem escolhe nada: só
// pega o que está pronto e vencido e chama a publicação do carrossel.
//
// Garantias contra publicar duas vezes:
//  1. Reserva atômica (UPDATE ... FOR UPDATE SKIP LOCKED): duas execuções
//     simultâneas nunca pegam o mesmo item.
//  2. Antes de qualquer nova tentativa (e ao recuperar um item preso em
//     "publicando"), confere no próprio Instagram se aquela legenda já foi
//     publicada depois da reserva. Se foi, só registra e não publica de novo.
const MAX_TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MIN = 10;
const PRESO_APOS_MIN = 15;
const ATRASO_MAXIMO_H = 24;
const MAX_POR_EXECUCAO = 2;

export interface ResultadoFila {
  publicados: { id: number; permalink: string | null }[];
  tentarDeNovo: { id: number; erro: string }[];
  falhas: { id: number; erro: string }[];
  recuperados: { id: number; permalink: string | null }[];
}

const prefixo = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

// Procura, entre as últimas publicações do perfil, uma com a mesma legenda
// publicada depois de `desde`. Devolve null se não achar (ou se não der para
// consultar: nesse caso a chamada retorna "desconhecido" e NÃO se republica).
async function acharPublicada(caption: string, desde: Date): Promise<{ id: string; permalink: string | null } | null | "desconhecido"> {
  const token = (await getInstagramToken()).token;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;
  if (!token || !igUserId) return "desconhecido";
  try {
    const url = new URL(`https://graph.instagram.com/v21.0/${igUserId}/media`);
    url.searchParams.set("fields", "id,caption,timestamp,permalink");
    url.searchParams.set("limit", "10");
    url.searchParams.set("access_token", token);
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d: any = await r.json();
    if (!r.ok || !Array.isArray(d?.data)) return "desconhecido";
    const alvo = prefixo(caption);
    const margem = desde.getTime() - 60_000;
    const achou = d.data.find((m: any) => prefixo(m.caption || "") === alvo && new Date(m.timestamp).getTime() >= margem);
    return achou ? { id: String(achou.id), permalink: achou.permalink ?? null } : null;
  } catch {
    return "desconhecido";
  }
}

async function marcarPublicado(item: InstagramQueueItem, mediaId: string, permalink: string | null) {
  await db
    .update(instagramQueueTable)
    .set({ status: "publicado", igMediaId: mediaId, permalink, publishedAt: new Date(), lastError: null, updatedAt: new Date() })
    .where(eq(instagramQueueTable.id, item.id));
  if (item.postId) {
    // Evita que o agendamento antigo (7h/19h) poste a mesma matéria de novo.
    await db.update(postsTable).set({ instagramPostedAt: new Date(), instagramMediaId: mediaId }).where(eq(postsTable.id, item.postId));
  }
}

async function reservarProximo(): Promise<InstagramQueueItem | null> {
  const r: any = await db.execute(sql`
    UPDATE instagram_queue
       SET status = 'publicando', claimed_at = now(), attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM instagram_queue
        WHERE status = 'aguardando'
          AND scheduled_at <= now()
          AND coalesce(next_attempt_at, scheduled_at) <= now()
        ORDER BY scheduled_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED)
    RETURNING *`);
  const row = (r.rows ?? r)[0];
  if (!row) return null;
  const [item] = await db.select().from(instagramQueueTable).where(eq(instagramQueueTable.id, row.id));
  return item ?? null;
}

// Itens presos em "publicando" (execução interrompida): confere no Instagram
// antes de decidir. Só volta para "aguardando" se tem certeza de que não saiu.
async function recuperarPresos(res: ResultadoFila) {
  const corte = new Date(Date.now() - PRESO_APOS_MIN * 60_000);
  const presos = await db.select().from(instagramQueueTable).where(and(eq(instagramQueueTable.status, "publicando"), lt(instagramQueueTable.claimedAt, corte)));
  for (const item of presos) {
    const achou = await acharPublicada(item.caption, item.claimedAt ?? item.scheduledAt);
    if (achou === "desconhecido") continue; // sem certeza: deixa como está e tenta na próxima execução
    if (achou) {
      await marcarPublicado(item, achou.id, achou.permalink);
      res.recuperados.push({ id: item.id, permalink: achou.permalink });
      continue;
    }
    if (item.attempts >= MAX_TENTATIVAS) {
      await db.update(instagramQueueTable).set({ status: "falhou", lastError: "Execução interrompida e tentativas esgotadas.", updatedAt: new Date() }).where(eq(instagramQueueTable.id, item.id));
      res.falhas.push({ id: item.id, erro: "Execução interrompida e tentativas esgotadas." });
    } else {
      await db.update(instagramQueueTable).set({ status: "aguardando", lastError: "Execução interrompida; nova tentativa.", updatedAt: new Date() }).where(eq(instagramQueueTable.id, item.id));
    }
  }
}

export async function executarFila(): Promise<ResultadoFila> {
  const res: ResultadoFila = { publicados: [], tentarDeNovo: [], falhas: [], recuperados: [] };
  await recuperarPresos(res);

  for (let i = 0; i < MAX_POR_EXECUCAO; i++) {
    const item = await reservarProximo();
    if (!item) break;

    const atrasoH = (Date.now() - item.scheduledAt.getTime()) / 3_600_000;
    if (atrasoH > ATRASO_MAXIMO_H) {
      const erro = `Atrasado ${Math.round(atrasoH)}h além do horário; não publicado automaticamente.`;
      await db.update(instagramQueueTable).set({ status: "falhou", lastError: erro, updatedAt: new Date() }).where(eq(instagramQueueTable.id, item.id));
      res.falhas.push({ id: item.id, erro });
      continue;
    }

    // Tentativa anterior pode ter publicado sem avisar: confere antes de repetir.
    if (item.attempts > 1) {
      const achou = await acharPublicada(item.caption, item.scheduledAt);
      if (achou === "desconhecido") {
        await db.update(instagramQueueTable).set({ status: "aguardando", lastError: "Não foi possível conferir o Instagram; aguardando.", nextAttemptAt: new Date(Date.now() + ESPERA_ENTRE_TENTATIVAS_MIN * 60_000), updatedAt: new Date() }).where(eq(instagramQueueTable.id, item.id));
        continue;
      }
      if (achou) {
        await marcarPublicado(item, achou.id, achou.permalink);
        res.recuperados.push({ id: item.id, permalink: achou.permalink });
        continue;
      }
    }

    try {
      const r = await publishCarouselToInstagram(item.imageUrls, item.caption);
      await marcarPublicado(item, r.mediaId, r.permalink ?? null);
      logger.info({ id: item.id, mediaId: r.mediaId }, "[fila-instagram] Publicado");
      res.publicados.push({ id: item.id, permalink: r.permalink ?? null });
    } catch (err: any) {
      const erro = String(err?.message ?? err).slice(0, 300);
      logger.error({ id: item.id, erro }, "[fila-instagram] Falha ao publicar");
      // A falha pode ter acontecido depois de o Instagram aceitar a publicação.
      const achou = await acharPublicada(item.caption, item.claimedAt ?? new Date(Date.now() - 10 * 60_000));
      if (achou && achou !== "desconhecido") {
        await marcarPublicado(item, achou.id, achou.permalink);
        res.recuperados.push({ id: item.id, permalink: achou.permalink });
        continue;
      }
      if (item.attempts >= MAX_TENTATIVAS) {
        await db.update(instagramQueueTable).set({ status: "falhou", lastError: erro, updatedAt: new Date() }).where(eq(instagramQueueTable.id, item.id));
        res.falhas.push({ id: item.id, erro });
      } else {
        await db
          .update(instagramQueueTable)
          .set({ status: "aguardando", lastError: erro, nextAttemptAt: new Date(Date.now() + ESPERA_ENTRE_TENTATIVAS_MIN * item.attempts * 60_000), updatedAt: new Date() })
          .where(eq(instagramQueueTable.id, item.id));
        res.tentarDeNovo.push({ id: item.id, erro });
      }
    }
  }
  return res;
}
