// Estado da produção diária (lido pela tarefa agendada do Claude na nuvem).
// Responde, de uma vez: o que já está na fila, em que ponto do CICLO de parceiros estamos e
// quem é o próximo pela regra do João:
//   - ordem por ATUALIDADE: parceiro com post mais recente (feed ou reels) vem primeiro;
//   - desce a lista uma vez; quando todos já saíram no ciclo, o ciclo recomeça no topo;
//   - parceiro sem novidade fica para o fim, e na vez dele sai um post institucional.
// Leitura do Instagram dos parceiros: business_discovery com o token de login do Facebook
// (INSTAGRAM_FB_ACCESS_TOKEN). Só funciona para perfis profissionais; os demais ficam "sem_leitura".
import { db, instagramPartnersTable, instagramQueueTable, postsTable } from "@workspace/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { lerSetting, gravarSetting } from "./instagram-token";

const K_CICLO = "ciclo_inicio";
const K_LEITURA = "leitura_parceiros"; // JSON { [handle]: { em, ultimoPostEm, status } }
const VALIDADE_LEITURA_H = 12;
const POR_CHAMADA = 25;

type Leitura = { em: string; ultimoPostEm: string | null; status: "ok" | "sem_leitura" };

const norm = (h?: string | null) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();

async function lerPerfil(handle: string, token: string, fbId: string): Promise<Leitura> {
  const url = new URL(`https://graph.facebook.com/v21.0/${fbId}`);
  url.searchParams.set("fields", `business_discovery.username(${handle}){media.limit(1){timestamp}}`);
  url.searchParams.set("access_token", token);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const d: any = await r.json().catch(() => null);
    const m = d?.business_discovery?.media?.data;
    if (r.ok && !d?.error) return { em: new Date().toISOString(), ultimoPostEm: m?.[0]?.timestamp ?? null, status: "ok" };
  } catch { /* cai em sem_leitura */ }
  return { em: new Date().toISOString(), ultimoPostEm: null, status: "sem_leitura" };
}

async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += n) out.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  return out;
}

const imagensDoPost = (conteudo: string | null, capa: string | null): string[] => {
  const set = new Set<string>();
  if (capa && /\.(jpe?g)(\?|$)/i.test(capa)) set.add(capa);
  for (const m of String(conteudo || "").matchAll(/<img[^>]+src="([^"]+)"/g)) if (/media\.refugioferradura\.com\.br/.test(m[1]) && /\.(jpe?g)(\?|$)/i.test(m[1])) set.add(m[1]);
  return [...set];
};

export async function estadoProducao(opts: { ler: boolean }) {
  const agora = new Date();
  // ── fila ──
  const fila = await db.select().from(instagramQueueTable).where(ne(instagramQueueTable.status, "cancelado"));
  const ativos = fila.filter((f) => f.status === "aguardando" || f.status === "publicando").sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const dia = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
  const usoPorParceiro = new Map<number, number>();
  for (const f of fila) for (const id of f.partnerIds || []) usoPorParceiro.set(id, Math.max(usoPorParceiro.get(id) || 0, f.scheduledAt.getTime()));

  // ── parceiros elegíveis (mesma regra do motor: ativo, com Instagram, categoria válida, matéria publicada) ──
  const rows = await db.select().from(instagramPartnersTable);
  const postIds = [...new Set(rows.map((r) => r.materiaPrincipalPostId ?? r.postId).filter((x): x is number => !!x))];
  const posts = postIds.length ? await db.select().from(postsTable).where(inArray(postsTable.id, postIds)) : [];
  const postPorId = new Map(posts.map((p) => [p.id, p]));

  const porHandle = new Map<string, any>(); // um por Instagram (os repetidos contam como um)
  for (const r of rows) {
    const h = norm(r.instagramHandle);
    if (!h || r.pausado || !r.categoria || r.categoria === "outra" || r.categoria === "eventos") continue;
    const post = postPorId.get((r.materiaPrincipalPostId ?? r.postId) as number);
    if (!post || post.status !== "published") continue;
    const ultimoUso = Math.max(usoPorParceiro.get(r.id) || 0, r.ultimoUsoInstagramEm ? new Date(r.ultimoUsoInstagramEm).getTime() : 0);
    const atual = porHandle.get(h);
    if (atual && atual.ultimoUso >= ultimoUso) continue;
    porHandle.set(h, {
      id: r.id, nome: r.nomeEstabelecimento, handle: h, categoria: r.categoria, regiao: r.regiao, ultimoUso,
      materia: { id: post.id, slug: post.slug, titulo: post.title, imagens: imagensDoPost(post.content, post.coverImage) },
    });
  }
  let parceiros = [...porHandle.values()];

  // ── leitura do Instagram (cache de 12 h; lê até POR_CHAMADA ainda não lidos) ──
  let cache: Record<string, Leitura> = {};
  try { cache = JSON.parse((await lerSetting(K_LEITURA)) || "{}"); } catch { cache = {}; }
  const fbToken = process.env.INSTAGRAM_FB_ACCESS_TOKEN;
  const fbId = process.env.INSTAGRAM_FB_USER_ID || process.env.INSTAGRAM_BUSINESS_ID;
  const vencido = (l?: Leitura) => !l || agora.getTime() - new Date(l.em).getTime() > VALIDADE_LEITURA_H * 3_600_000;
  if (opts.ler && fbToken && fbId) {
    const pend = parceiros.filter((p) => vencido(cache[p.handle])).slice(0, POR_CHAMADA);
    const lidos = await emLotes(pend, 6, (p) => lerPerfil(p.handle, fbToken, fbId));
    pend.forEach((p, i) => (cache[p.handle] = lidos[i]));
    if (pend.length) await gravarSetting(K_LEITURA, JSON.stringify(cache));
  }
  const pendentesDeLeitura = parceiros.filter((p) => vencido(cache[p.handle])).length;
  parceiros = parceiros.map((p) => ({ ...p, leitura: cache[p.handle] ? { status: cache[p.handle].status, ultimoPostEm: cache[p.handle].ultimoPostEm } : { status: "pendente", ultimoPostEm: null } }));

  // ── ciclo: desce a lista por atualidade; quando todos já saíram, recomeça no topo ──
  let inicio = (await lerSetting(K_CICLO)) || "";
  if (!inicio) { inicio = agora.toISOString(); await gravarSetting(K_CICLO, inicio); }
  let restantes = parceiros.filter((p) => p.ultimoUso < new Date(inicio).getTime());
  if (!restantes.length && parceiros.length) {
    inicio = agora.toISOString();
    await gravarSetting(K_CICLO, inicio);
    restantes = parceiros;
  }
  const ts = (p: any) => (p.leitura.ultimoPostEm ? new Date(p.leitura.ultimoPostEm).getTime() : 0);
  restantes.sort((a, b) => ts(b) - ts(a) || a.ultimoUso - b.ultimoUso);
  const dias = (p: any) => (p.leitura.ultimoPostEm ? Math.floor((agora.getTime() - ts(p)) / 86_400_000) : null);

  return {
    agora: agora.toISOString(),
    fila: {
      diasCobertos: [...new Set(ativos.map((f) => dia(f.scheduledAt)))].length,
      proximos: ativos.slice(0, 15).map((f) => ({ id: f.id, quando: f.scheduledAt, titulo: f.titulo, status: f.status, parceiros: f.partnerIds, qtdMidia: f.imageUrls.length })),
    },
    ciclo: { inicio, totalParceiros: parceiros.length, jaSairamNoCiclo: parceiros.length - restantes.length, restantes: restantes.length, pendentesDeLeitura },
    // quem sai agora: primeiro da lista = parceiro com post mais recente que ainda não saiu neste ciclo
    proximos: restantes.slice(0, 12).map((p) => ({
      id: p.id, nome: p.nome, handle: p.handle, categoria: p.categoria, regiao: p.regiao,
      leitura: p.leitura.status, ultimoPostEm: p.leitura.ultimoPostEm, diasDesdeUltimoPost: dias(p),
      tipoSugerido: p.leitura.ultimoPostEm && (dias(p) as number) <= 14 ? "atualidade (conferir a legenda)" : "institucional",
      materia: p.materia,
    })),
  };
}


// ─── Levantamento global de mídia (diagnóstico, só leitura) ───────────────────────────────
// Para decidir a estratégia de foto/vídeo com DADOS de todos os parceiros, não de um caso:
// lê os últimos posts públicos de cada perfil e MEDE o tamanho real de cada foto (fotos soltas e
// fotos dentro de carrossel); conta vídeos com arquivo disponível x só capa.
async function dimensoesJpeg(url: string): Promise<{ w: number; h: number } | null> {
  try {
    const r = await fetch(url, { headers: { Range: "bytes=0-65535" }, signal: AbortSignal.timeout(10000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch { /* sem medida */ }
  return null;
}

export async function levantamentoMidia(de: number, n: number) {
  const fbToken = process.env.INSTAGRAM_FB_ACCESS_TOKEN;
  const fbId = process.env.INSTAGRAM_FB_USER_ID || process.env.INSTAGRAM_BUSINESS_ID;
  if (!fbToken || !fbId) throw new Error("faltam INSTAGRAM_FB_ACCESS_TOKEN / INSTAGRAM_FB_USER_ID");
  const rows = await db.select().from(instagramPartnersTable);
  const handles = new Map<string, string>();
  for (const r of rows) {
    const h = norm(r.instagramHandle);
    if (!h || r.pausado || !r.categoria || r.categoria === "outra" || r.categoria === "eventos") continue;
    if (!handles.has(h)) handles.set(h, r.nomeEstabelecimento);
  }
  const todos = [...handles.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const fatia = todos.slice(de, de + n);
  const lidos = await emLotes(fatia, 4, async ([h, nome]) => {
    const url = new URL(`https://graph.facebook.com/v21.0/${fbId}`);
    url.searchParams.set("fields", `business_discovery.username(${h}){media.limit(12){media_type,media_url,thumbnail_url,timestamp,children{media_type,media_url}}}`);
    url.searchParams.set("access_token", fbToken);
    let leitura: "ok" | "sem_leitura" = "sem_leitura";
    const fotos: string[] = [];
    let videoComArquivo = 0, videoSoCapa = 0, ultimo: string | null = null;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const d: any = await r.json().catch(() => null);
      const media: any[] = d?.business_discovery?.media?.data;
      if (r.ok && !d?.error && Array.isArray(media)) {
        leitura = "ok";
        ultimo = media[0]?.timestamp ?? null;
        const alvos: { u: string; q: string }[] = [];
        for (const m of media) {
          const q = String(m.timestamp || "").slice(0, 10);
          if (m.media_type === "IMAGE" && m.media_url) alvos.push({ u: m.media_url, q });
          else if (m.media_type === "CAROUSEL_ALBUM") for (const c of m.children?.data || []) if (c.media_type === "IMAGE" && c.media_url) alvos.push({ u: c.media_url, q });
          else if (m.media_type === "VIDEO") (m.media_url ? videoComArquivo++ : videoSoCapa++);
        }
        const med = await emLotes(alvos, 6, (a) => dimensoesJpeg(a.u));
        med.forEach((d2, i) => fotos.push(d2 ? `${d2.w}x${d2.h}@${alvos[i].q}` : `?@${alvos[i].q}`));
      }
    } catch { /* fica sem_leitura */ }
    return { handle: h, nome: nome.slice(0, 40), leitura, ultimoPostEm: ultimo, fotos, videoComArquivo, videoSoCapa };
  });
  return { total: todos.length, de, n: fatia.length, parceiros: lidos };
}
