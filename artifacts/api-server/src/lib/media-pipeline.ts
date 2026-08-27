import Anthropic from "@anthropic-ai/sdk";
import { extractFeaturedMedia, extractImagesFromSource, isImageUrlValid, type MediaItem } from "./article-generation";
import { probeImageQuality } from "./image-quality";
import { archiveApprovedMedia } from "./media-library";
import { logger } from "./logger";

export type { MediaItem };

// Pipeline único de mídia editorial, usado por toda publicação automática
// (fila de empreendimentos/PDF, busca regional, fontes monitoradas) e pela
// rotina de reconciliação do acervo já publicado. Prioridade: Instagram
// oficial > site oficial > busca de apoio (só pra achar o canal oficial) >
// paisagens institucionais da Rota da Ferradura. O PDF do diagnóstico NUNCA
// entra como mídia — só como dado/texto.

function parseJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
}

function getText(message: Anthropic.Message): string {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error("A IA não retornou texto.");
  return block.text;
}

function lastText(message: Anthropic.Message): string | null {
  const blocks = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
  return blocks.length > 0 ? blocks[blocks.length - 1].text : null;
}

export interface MediaCandidate {
  permalink: string;
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  isReel: boolean;
}

// Não existe API pública pra listar os últimos posts de um perfil de
// terceiro sem o dono autorizar nosso app (Instagram bloqueia scraping de
// perfil alheio) — o melhor esforço possível, sem credenciais/app review, é
// pedir pra IA localizar permalinks indexados publicamente e confirmar um a
// um. Pega até 5, fotos e reels misturados.
export async function searchInstagramPermalinks(handle: string, nome: string): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Pesquise na web por publicações recentes e reais do perfil oficial do Instagram "@${handle}", do estabelecimento "${nome}" (Rota da Ferradura, Guarapari-ES).

Quero até 5 URLs de posts (formato https://www.instagram.com/p/CODIGO/ ou https://www.instagram.com/reel/CODIGO/) desse perfil específico que você realmente encontrou na busca — NUNCA invente uma URL plausível, só inclua links que a ferramenta de busca retornou de fato.

Depois de pesquisar, sua ÚLTIMA mensagem deve conter SOMENTE o objeto JSON abaixo — nenhuma frase antes ou depois, mesmo se você não encontrar nada:
{"permalinks": ["https://www.instagram.com/p/...", ...]}

Se não encontrar nenhum, responda exatamente {"permalinks": []}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    });
    const text = lastText(message);
    if (!text) return [];
    const parsed = parseJson(text);
    const permalinks: string[] = Array.isArray(parsed.permalinks) ? parsed.permalinks : [];
    return [...new Set(permalinks)].filter((url) => /instagram\.com\/(p|reel)\//.test(url)).slice(0, 5);
  } catch (err) {
    logger.warn({ err, handle }, "[media-pipeline] Falha ao buscar posts do Instagram");
    return [];
  }
}

// Confirma cada permalink (og:image/og:video reais, resolução mínima,
// content-type de imagem válido) antes de submeter à vetting visual — nunca
// leva um candidato inventado/quebrado adiante.
export async function buildCandidatesFromPermalinks(permalinks: string[]): Promise<MediaCandidate[]> {
  const candidates: MediaCandidate[] = [];
  for (const permalink of permalinks) {
    const media = await extractFeaturedMedia(permalink);
    if (!media.imageUrl) continue;
    const quality = await probeImageQuality(media.imageUrl);
    if (!quality?.ok) continue;
    if (!(await isImageUrlValid(media.imageUrl))) continue;
    candidates.push({
      permalink,
      imageUrl: media.imageUrl,
      videoUrl: media.videoUrl,
      caption: media.caption,
      isReel: /\/reel\//.test(permalink),
    });
  }
  return candidates;
}

export interface VettingDecision {
  approvedIndex: number;
  motivo: string;
}

export interface VettingResult {
  approved: VettingDecision[];
  rejected: { index: number; motivo: string }[];
}

// Uma única chamada de visão avalia TODOS os candidatos de uma vez e aprova
// de 3 a 5 (a ordem retornada é a ordem de preferência) — nunca escolhe
// automaticamente "o mais recente", sempre analisa o conteúdo visual.
export async function vetCandidates(nome: string, candidates: MediaCandidate[]): Promise<VettingResult> {
  if (candidates.length === 0) return { approved: [], rejected: [] };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `Analise as mídias abaixo (posts/reels do Instagram oficial do estabelecimento "${nome}") e escolha de 3 a 5 que sirvam como mídia editorial de um artigo de turismo — nunca escolha automaticamente pela ordem, avalie o conteúdo visual de cada uma.

REJEITE (não aprove) uma mídia se ela for:
- flyer, card, banner promocional, cardápio, tabela de preço, calendário, aviso, sorteio ou promoção
- dominada por texto sobreposto relevante em vez de uma foto/cena real do lugar
- selfie, retrato ou pessoa em primeiro plano como elemento principal (pessoas podem aparecer NA CENA, sem serem o foco)
- baixa resolução, borrada, esticada, comprimida ou de procedência incerta

APROVE, nesta ordem de prioridade: paisagem/vista, fachada, arquitetura, jardim, piscina, ambiente interno ou externo, estrutura, quartos, áreas de lazer, mesas, pratos e experiência real do local.

Responda APENAS EM JSON, sem markdown ao redor:
{
  "aprovados": [{"index": <0-based>, "motivo": "..."}],
  "rejeitados": [{"index": <0-based>, "motivo": "..."}]
}
Ordene "aprovados" da melhor pra pior (a primeira é a mais forte). Aprove entre 3 e 5 no total (ou menos, se houver menos de 3 candidatos aceitáveis — nunca aprove uma mídia ruim só pra completar o número).

Mídias candidatas:`,
    },
  ];
  candidates.forEach((c, i) => {
    content.push({
      type: "text",
      text: `\n[${i}] ${c.isReel ? "(Reel/vídeo)" : "(foto)"} contexto/legenda: ${c.caption || "(sem legenda disponível)"}`,
    });
    content.push({ type: "image", source: { type: "url", url: c.imageUrl! } });
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    });
    const parsed = parseJson(getText(message));
    const approved: VettingDecision[] = Array.isArray(parsed.aprovados)
      ? parsed.aprovados
          .filter((a: any) => typeof a.index === "number" && candidates[a.index])
          .map((a: any) => ({ approvedIndex: a.index, motivo: a.motivo || "" }))
      : [];
    const rejected = Array.isArray(parsed.rejeitados)
      ? parsed.rejeitados.filter((r: any) => typeof r.index === "number").map((r: any) => ({ index: r.index, motivo: r.motivo || "" }))
      : [];
    return { approved, rejected };
  } catch (err) {
    logger.warn({ err, nome }, "[media-pipeline] Falha na vetting visual");
    return { approved: [], rejected: [] };
  }
}

// Arquiva os candidatos aprovados no Cloudinary do site (nunca hotlink) e
// monta o MediaItem com metadados completos. Se o candidato aprovado for um
// Reel com og:video disponível, arquiva como vídeo real; senão, como foto.
export async function archiveMediaItems(
  candidates: MediaCandidate[],
  decisions: VettingDecision[],
  slug: string,
  tipo: MediaItem["tipo"],
): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const candidate = candidates[decisions[i].approvedIndex];
    if (!candidate) continue;
    const verificadoEm = new Date().toISOString();
    try {
      if (candidate.isReel && candidate.videoUrl) {
        const urlArquivo = await archiveApprovedMedia(candidate.videoUrl, slug, items.length, "video");
        items.push({
          kind: "video",
          urlArquivo,
          urlOrigem: candidate.permalink,
          urlDestino: candidate.permalink,
          tipo,
          verificadoEm,
          isReel: true,
        });
      } else {
        const urlArquivo = await archiveApprovedMedia(candidate.imageUrl!, slug, items.length, "image");
        items.push({
          kind: "foto",
          urlArquivo,
          urlOrigem: candidate.permalink,
          urlDestino: candidate.permalink,
          tipo,
          verificadoEm,
          isReel: candidate.isReel,
        });
      }
    } catch (err) {
      logger.warn({ err, candidate: candidate.permalink }, "[media-pipeline] Falha ao arquivar mídia aprovada, pulando");
    }
  }
  return items;
}

export async function resolveInstagramMedia(handle: string, nome: string, slug: string): Promise<MediaItem[]> {
  const cleanHandle = handle.replace(/^@/, "");
  const permalinks = await searchInstagramPermalinks(cleanHandle, nome);
  if (permalinks.length === 0) return [];

  const candidates = await buildCandidatesFromPermalinks(permalinks);
  if (candidates.length === 0) return [];

  const { approved, rejected } = await vetCandidates(nome, candidates);
  logger.info(
    { nome, handle: cleanHandle, aprovados: approved.length, rejeitados: rejected.map((r) => r.motivo) },
    "[media-pipeline] Vetting Instagram concluída",
  );
  if (approved.length === 0) return [];

  return archiveMediaItems(candidates, approved, slug, "instagram_oficial");
}

export async function resolveSiteMedia(site: string, nome: string, slug: string): Promise<MediaItem[]> {
  const imageUrls = await extractImagesFromSource(site);
  if (imageUrls.length === 0) return [];

  const candidates: MediaCandidate[] = [];
  for (const imageUrl of imageUrls.slice(0, 5)) {
    const quality = await probeImageQuality(imageUrl);
    if (!quality?.ok) continue;
    if (!(await isImageUrlValid(imageUrl))) continue;
    candidates.push({ permalink: site, imageUrl, isReel: false });
  }
  if (candidates.length === 0) return [];

  const { approved, rejected } = await vetCandidates(nome, candidates);
  logger.info(
    { nome, site, aprovados: approved.length, rejeitados: rejected.map((r) => r.motivo) },
    "[media-pipeline] Vetting site oficial concluída",
  );
  if (approved.length === 0) return [];

  return archiveMediaItems(candidates, approved, slug, "site_oficial");
}

export interface OfficialChannelResult {
  instagram: string | null;
  site: string | null;
}

// Busca de apoio: só serve pra localizar o canal oficial (Instagram/site) do
// estabelecimento pelo nome + localidade — nunca pra achar uma imagem
// genérica de busca de imagens.
export async function searchOfficialChannel(nome: string, locationHint: string): Promise<OfficialChannelResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Pesquise na web SÓ para localizar o canal oficial do estabelecimento "${nome}", localizado em ${locationHint} (Rota da Ferradura, Guarapari-ES).

Procure o perfil oficial do Instagram OU o site oficial desse estabelecimento específico — não um perfil/site de outro lugar parecido.

Depois de pesquisar, sua ÚLTIMA mensagem deve conter SOMENTE o objeto JSON abaixo — nenhuma frase antes ou depois, mesmo se você não encontrar nada:
{"instagram": "@handle ou null", "site": "URL ou null"}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    });
    const text = lastText(message);
    if (!text) return { instagram: null, site: null };
    const parsed = parseJson(text);
    return { instagram: parsed.instagram ?? null, site: parsed.site ?? null };
  } catch (err) {
    logger.warn({ err, nome }, "[media-pipeline] Falha na busca de apoio por canal oficial");
    return { instagram: null, site: null };
  }
}

// Paisagens institucionais da Rota da Ferradura já aprovadas e hospedadas no
// Cloudinary do site — usadas somente quando nenhuma mídia oficial passou na
// vetting, pra nunca publicar um post sem mídia nenhuma. Reaproveita as
// melhores fotos já usadas nos artigos institucionais gerais da região
// (posts "Descubra a Rota da Ferradura" / "paisagens, sabores e aventura").
const INSTITUTIONAL_FALLBACK_IMAGES: { url: string; label: string }[] = [
  {
    url: "https://s3.us-east-005.backblazeb2.com/refugio-media/refugio-da-ferradura/migrated/3af91256f4b219ae0a715a77.jpg",
    label: "Paisagem da Rota da Ferradura",
  },
  {
    url: "https://s3.us-east-005.backblazeb2.com/refugio-media/refugio-da-ferradura/migrated/220aeb76d5147f47e66df49a.jpg",
    label: "Cachoeira de Pernambuco, Guarapari",
  },
  {
    url: "https://s3.us-east-005.backblazeb2.com/refugio-media/refugio-da-ferradura/migrated/a6e7b4ba7e5374d4d6d7d362.jpg",
    label: "Pedra do Elefante, Rota da Ferradura",
  },
  {
    url: "https://s3.us-east-005.backblazeb2.com/refugio-media/refugio-da-ferradura/migrated/276b835834bbb91ffb7cd206.jpg",
    label: "Cachoeira de Buenos Aires, Guarapari",
  },
];

// Usado pelos pipelines sem "estabelecimento específico" (fontes monitoradas,
// busca regional, upload manual do admin): recebe URLs de imagem já
// encontradas/validadas (isImageUrlValid), roda a mesma vetting visual e
// arquiva as aprovadas — nunca hotlink, sempre com o mesmo filtro de
// flyer/logo/texto-sobreposto/selfie das demais fontes.
export async function vetAndArchiveFoundImages(
  nome: string,
  imageUrls: string[],
  slug: string,
): Promise<MediaItem[]> {
  if (imageUrls.length === 0) return [];
  const candidates: MediaCandidate[] = imageUrls.slice(0, 5).map((imageUrl) => ({
    permalink: imageUrl,
    imageUrl,
    isReel: false,
  }));

  const { approved, rejected } = await vetCandidates(nome, candidates);
  logger.info(
    { nome, aprovados: approved.length, rejeitados: rejected.map((r) => r.motivo) },
    "[media-pipeline] Vetting de imagens encontradas concluída",
  );
  if (approved.length === 0) return [];

  return archiveMediaItems(candidates, approved, slug, "licenciada");
}

export function getInstitutionalFallback(count: number): MediaItem[] {
  const verificadoEm = new Date().toISOString();
  return INSTITUTIONAL_FALLBACK_IMAGES.slice(0, count).map((img) => ({
    kind: "foto" as const,
    urlArquivo: img.url,
    urlOrigem: null,
    urlDestino: null,
    tipo: "institucional" as const,
    verificadoEm,
    isReel: false,
  }));
}
