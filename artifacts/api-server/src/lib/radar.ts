import Anthropic from "@anthropic-ai/sdk";
import { db, instagramPartnersTable, radarFindingsTable } from "@workspace/db";
import { isNotNull, desc, eq, sql } from "drizzle-orm";
import { extractFeaturedMedia } from "./article-generation";
import { searchInstagramPermalinks } from "./media-pipeline";
import { logger } from "./logger";

function parseJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
}

function lastText(message: Anthropic.Message): string | null {
  const blocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  return blocks.length > 0 ? blocks[blocks.length - 1].text : null;
}

const NEWS_SYSTEM_PROMPT = `Você é um pesquisador que monitora notícias e novidades relevantes sobre a Rota da Ferradura — a região serrana de Guarapari-ES que reúne as comunidades de Buenos Aires, Boa Esperança e Arraial do Jabuti.

REGRAS ABSOLUTAS:
1. Use a ferramenta de busca na web pra encontrar notícias, eventos ou novidades REAIS e RECENTES (idealmente dos últimos 30 dias) sobre essa região específica. NUNCA invente uma notícia, título ou URL — só inclua resultado que a busca realmente retornou.
2. Foque em: turismo, eventos, cultura, gastronomia, novos negócios, obras/infraestrutura relevante, notícias da prefeitura de Guarapari sobre essa região específica. Ignore notícias genéricas de Guarapari que não mencionem Rota da Ferradura, Buenos Aires, Boa Esperança ou Jabuti.`;

const NEWS_PROMPT = (excludeUrls: string[]) => `Pesquise na web por notícias novas e relevantes sobre a Rota da Ferradura, Buenos Aires, Boa Esperança e Arraial do Jabuti (Guarapari-ES).

NÃO repita nenhuma destas URLs, já registradas em varreduras anteriores:
${excludeUrls.length > 0 ? excludeUrls.join("\n") : "(nenhuma ainda)"}

Depois de pesquisar, responda como sua ÚLTIMA mensagem SOMENTE com o JSON abaixo (sem texto antes ou depois, mesmo se não achar nada):
{"noticias": [{"titulo": "...", "url": "...", "fonte": "nome do site/veículo", "publicadoEm": "AAAA-MM-DD ou null se não souber a data"}]}

Se não encontrar nenhuma novidade real, responda {"noticias": []}`;

interface NewsItem {
  titulo: string;
  url: string;
  fonte?: string | null;
  publicadoEm?: string | null;
}

async function searchRegionalNews(excludeUrls: string[]): Promise<NewsItem[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: NEWS_SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages: [{ role: "user", content: NEWS_PROMPT(excludeUrls) }],
    });
    const text = lastText(message);
    if (!text) return [];
    const parsed = parseJson(text);
    const items: NewsItem[] = Array.isArray(parsed.noticias) ? parsed.noticias : [];
    return items.filter((i) => i?.titulo && /^https?:\/\//.test(i?.url || ""));
  } catch (err) {
    logger.warn({ err }, "[radar] Falha ao buscar notícias regionais");
    return [];
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export interface RadarScanResult {
  noticiasEncontradas: number;
  postsEncontrados: number;
  parceirosVarridos: number;
  totalParceiros: number;
  completo: boolean;
}

// Cloudflare corta a resposta em ~100s (erro 524) se o servidor demorar mais
// que isso — varrer todos os parceiros numa só chamada, um por um com busca
// na web, estoura esse limite facilmente. Por isso cada chamada processa só
// o que couber dentro desse orçamento de tempo, e devolve `completo: false`
// pra quem chamou saber que precisa chamar de novo (o botão e o cron fazem
// isso em loop, até `completo: true`).
const BATCH_TIME_BUDGET_MS = 45_000;

// Varre notícias regionais + posts públicos recentes dos parceiros
// cadastrados no painel — só descobre e registra achados novos (dedupe por
// URL), nunca cria rascunho de post, nunca chama a API de publicação do
// Instagram. Usada tanto pelo botão "Atualizar agora" (painel, sessão admin)
// quanto pela rotina diária às 11h de Brasília (cron, CRON_SECRET) — ambos
// chamam repetidamente até a varredura ficar completa.
export async function runRadarScan(options?: { incluirNoticias?: boolean }): Promise<RadarScanResult> {
  const startedAt = Date.now();
  const incluirNoticias = options?.incluirNoticias ?? true;

  const existing = await db
    .select({ url: radarFindingsTable.url, tipo: radarFindingsTable.tipo })
    .from(radarFindingsTable)
    .orderBy(desc(radarFindingsTable.id));
  const seen = new Set(existing.map((r) => r.url));

  let noticiasEncontradas = 0;
  if (incluirNoticias) {
    const recentNewsUrls = existing.filter((r) => r.tipo === "noticia").slice(0, 150).map((r) => r.url);
    const noticias = await searchRegionalNews(recentNewsUrls);
    for (const item of noticias) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      const publicadoEm = item.publicadoEm && !isNaN(Date.parse(item.publicadoEm)) ? new Date(item.publicadoEm) : null;
      try {
        await db.insert(radarFindingsTable).values({
          tipo: "noticia",
          titulo: item.titulo.slice(0, 300),
          url: item.url,
          fonte: item.fonte || new URL(item.url).hostname.replace(/^www\./, ""),
          publicadoEm,
        });
        noticiasEncontradas++;
      } catch (err) {
        if (!isDuplicateKeyError(err)) logger.warn({ err, url: item.url }, "[radar] Falha ao gravar notícia");
      }
    }
  }

  // Parceiros menos recentemente varridos primeiro, pra cada lote avançar
  // por gente diferente em vez de sempre bater nos mesmos primeiros nomes.
  const partners = await db
    .select()
    .from(instagramPartnersTable)
    .where(isNotNull(instagramPartnersTable.instagramHandle))
    .orderBy(sql`${instagramPartnersTable.ultimoPollEm} asc nulls first`);

  let postsEncontrados = 0;
  let parceirosVarridos = 0;
  for (const partner of partners) {
    if (Date.now() - startedAt > BATCH_TIME_BUDGET_MS) break;
    if (!partner.instagramHandle) continue;
    try {
      const permalinks = await searchInstagramPermalinks(partner.instagramHandle, partner.nomeEstabelecimento);
      for (const link of permalinks) {
        if (seen.has(link)) continue;
        seen.add(link);
        const media = await extractFeaturedMedia(link).catch(() => null);
        try {
          await db.insert(radarFindingsTable).values({
            tipo: "parceiro_post",
            titulo: media?.caption?.slice(0, 300) || `Nova publicação de @${partner.instagramHandle}`,
            url: link,
            fonte: partner.nomeEstabelecimento,
            parceiroId: partner.id,
            publicadoEm: null,
          });
          postsEncontrados++;
        } catch (err) {
          if (!isDuplicateKeyError(err)) logger.warn({ err, link }, "[radar] Falha ao gravar post de parceiro");
        }
      }
    } catch (err) {
      logger.warn({ err, partnerId: partner.id }, "[radar] Falha ao varrer parceiro");
    } finally {
      await db
        .update(instagramPartnersTable)
        .set({ ultimoPollEm: new Date() })
        .where(eq(instagramPartnersTable.id, partner.id));
      parceirosVarridos++;
    }
  }

  const totalParceiros = partners.length;
  const completo = parceirosVarridos >= totalParceiros;
  logger.info(
    { noticiasEncontradas, postsEncontrados, parceirosVarridos, totalParceiros, completo },
    "[radar] Lote de varredura concluído",
  );
  return { noticiasEncontradas, postsEncontrados, parceirosVarridos, totalParceiros, completo };
}
