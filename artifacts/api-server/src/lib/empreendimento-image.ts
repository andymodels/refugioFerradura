import Anthropic from "@anthropic-ai/sdk";
import { extractFeaturedMedia, isImageUrlValid, renderInstagramEmbed, type InterleaveImage } from "./article-generation";
import { probeImageQuality } from "./image-quality";
import { logger } from "./logger";

// Estratégia de imagem pros posts de empreendimento (fila do Diagnóstico
// Turístico e Econômico da Rota da Ferradura). O PDF é fonte de texto/dados,
// não de mídia — suas fotos já vêm pequenas/comprimidas de um documento
// editorial de 2025, então só entram como último recurso e com filtro de
// qualidade. Prioridade: Instagram oficial > site oficial > busca de apoio
// (só pra achar canal oficial, nunca foto genérica de busca de imagens) > PDF
// (com filtro mínimo, sem upscale) > rascunho pra revisão manual.

export type EmpreendimentoImageOrigin = "instagram_oficial" | "site_oficial" | "pdf" | "licenciada";

export interface EmpreendimentoImageMeta {
  tipo: EmpreendimentoImageOrigin;
  originalUrl: string;
  targetUrl: string | null;
  creditLabel: string;
  verificadoEm: string;
  isEmbed: boolean;
}

export interface ResolvedEmpreendimentoImage {
  coverImageUrl: string;
  meta: EmpreendimentoImageMeta;
  contentImages: InterleaveImage[];
}

export interface EmpreendimentoImageInput {
  nome: string;
  regiao?: string | null;
  endereco?: string | null;
  plusCode?: string | null;
  instagram?: string | null; // já confirmado alcançável, com ou sem @
  site?: string | null; // já confirmado alcançável
  fotosPdf: string[]; // fotos extraídas do PDF do diagnóstico (Cloudinary)
}

// Depois de usar a ferramenta de busca, a IA às vezes responde com uma frase
// em prosa ("Não encontrei nenhuma publicação...") em vez do JSON pedido —
// extrai o maior bloco {...} da resposta em vez de exigir que a mensagem
// inteira seja JSON puro, pra não perder resultado real por causa de texto
// em volta.
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

interface InstagramCandidate {
  permalink: string;
  imageUrl: string;
  caption?: string;
}

// Não existe API pública pra "listar os últimos posts" de um perfil de
// terceiro sem o dono autorizar nosso app (Instagram bloqueia scraping de
// perfis alheios) — o melhor esforço possível, sem exigir credenciais/app
// review, é buscar permalinks indexados publicamente e confirmar um a um.
async function searchInstagramPermalinks(handle: string, nome: string): Promise<string[]> {
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
    logger.warn({ err, handle }, "[empreendimento-image] Falha ao buscar posts do Instagram");
    return [];
  }
}

// Usa visão da IA pra escolher, entre as fotos candidatas realmente
// encontradas, a que melhor representa o estabelecimento — evitando arte
// promocional, preço, evento vencido, excesso de texto ou pessoa sem relação
// direta com o local.
async function pickBestInstagramCandidate(nome: string, candidates: InstagramCandidate[]): Promise<number | null> {
  if (candidates.length === 0) return null;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const content: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `Escolha, entre as fotos abaixo (posts do Instagram do estabelecimento "${nome}"), a que melhor representa o local para ilustrar a capa de um artigo de turismo.

REJEITE uma foto se ela for:
- arte/design promocional (banner com preço, cardápio, tabela, propaganda)
- sobre uma promoção ou lista de preços
- sobre um evento com data/calendário já vencido
- dominada por texto sobreposto em vez de uma foto real do lugar
- um retrato de pessoa sem relação clara e direta com o ambiente do local

Responda APENAS EM JSON, sem markdown ao redor:
{"chosenIndex": <número 0-based da melhor, ou null se nenhuma servir>, "motivo": "..."}

Fotos candidatas:`,
    },
  ];
  candidates.forEach((c, i) => {
    content.push({ type: "text", text: `\n[${i}] contexto/legenda: ${c.caption || "(sem legenda disponível)"}` });
    content.push({ type: "image", source: { type: "url", url: c.imageUrl } });
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{ role: "user", content }],
    });
    const parsed = parseJson(getText(message));
    return typeof parsed.chosenIndex === "number" ? parsed.chosenIndex : null;
  } catch (err) {
    logger.warn({ err, nome }, "[empreendimento-image] Falha ao escolher melhor post do Instagram");
    return null;
  }
}

async function resolveInstagramSource(handle: string, nome: string): Promise<ResolvedEmpreendimentoImage | null> {
  const cleanHandle = handle.replace(/^@/, "");

  const permalinks = await searchInstagramPermalinks(cleanHandle, nome);
  if (permalinks.length === 0) return null;

  const candidates: InstagramCandidate[] = [];
  for (const permalink of permalinks) {
    const media = await extractFeaturedMedia(permalink);
    if (media.imageUrl) {
      candidates.push({ permalink, imageUrl: media.imageUrl, caption: media.caption });
    }
  }
  if (candidates.length === 0) return null;

  const chosenIndex = await pickBestInstagramCandidate(nome, candidates);
  if (chosenIndex === null || !candidates[chosenIndex]) return null;
  const chosen = candidates[chosenIndex];

  return {
    coverImageUrl: chosen.imageUrl,
    meta: {
      tipo: "instagram_oficial",
      originalUrl: chosen.permalink,
      targetUrl: chosen.permalink,
      creditLabel: `Instagram @${cleanHandle}`,
      verificadoEm: new Date().toISOString(),
      isEmbed: true,
    },
    // O embed oficial já mostra o link pro post/perfil original — não precisa
    // de legenda de crédito adicional embaixo.
    contentImages: [{ embedHtml: renderInstagramEmbed(chosen.permalink) }],
  };
}

async function resolveSiteSource(site: string): Promise<ResolvedEmpreendimentoImage | null> {
  const media = await extractFeaturedMedia(site);
  if (!media.imageUrl) return null;
  if (!(await isImageUrlValid(media.imageUrl))) return null;

  const hostname = new URL(site).hostname.replace(/^www\./, "");
  return {
    coverImageUrl: media.imageUrl,
    meta: {
      tipo: "site_oficial",
      originalUrl: media.imageUrl,
      targetUrl: site,
      creditLabel: hostname,
      verificadoEm: new Date().toISOString(),
      isEmbed: false,
    },
    contentImages: [{ url: media.imageUrl, creditLabel: hostname, creditHref: site }],
  };
}

interface OfficialSearchResult {
  instagram: string | null;
  site: string | null;
  licensedImage: { url: string; pageUrl: string; creditLabel: string } | null;
}

// Pesquisa de apoio: só serve pra localizar o canal oficial do estabelecimento
// (Instagram/site) pelo nome + localidade/GPS, ou — na ausência de qualquer
// canal — uma imagem de fonte claramente oficial/verificável e específica
// desse local (nunca um resultado genérico de busca de imagens).
async function searchOfficialSource(nome: string, locationHint: string): Promise<OfficialSearchResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Pesquise na web SÓ para localizar o canal oficial do estabelecimento "${nome}", localizado em ${locationHint} (Rota da Ferradura, Guarapari-ES).

Procure o perfil oficial do Instagram OU o site oficial desse estabelecimento específico — não um perfil/site de outro lugar parecido.

Só se não encontrar nenhum dos dois: procure uma imagem de fonte claramente oficial e específica desse estabelecimento (ex: página de turismo da prefeitura, matéria de notícia especificamente sobre esse local). NUNCA retorne um resultado genérico de busca de imagens (Google Imagens) como se fosse oficial — se não tiver confiança razoável de que a imagem é realmente desse local e de uma fonte com uso permitido, não retorne nenhuma.

Depois de pesquisar, sua ÚLTIMA mensagem deve conter SOMENTE o objeto JSON abaixo — nenhuma frase antes ou depois, mesmo se você não encontrar nada:
{
  "instagram": "@handle ou null",
  "site": "URL ou null",
  "licensedImage": null ou {"url": "URL direta do arquivo de imagem", "pageUrl": "URL da página de origem", "creditLabel": "nome da fonte pra crédito"}
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    });
    const text = lastText(message);
    if (!text) return { instagram: null, site: null, licensedImage: null };
    const parsed = parseJson(text);
    return {
      instagram: parsed.instagram ?? null,
      site: parsed.site ?? null,
      licensedImage: parsed.licensedImage ?? null,
    };
  } catch (err) {
    logger.warn({ err, nome }, "[empreendimento-image] Falha na busca de apoio por canal oficial");
    return { instagram: null, site: null, licensedImage: null };
  }
}

async function resolveViaSearch(input: EmpreendimentoImageInput): Promise<ResolvedEmpreendimentoImage | null> {
  const locationHint = [input.regiao, input.endereco, input.plusCode].filter(Boolean).join(", ") || "Rota da Ferradura, Guarapari-ES";
  const found = await searchOfficialSource(input.nome, locationHint);

  if (found.instagram) {
    const result = await resolveInstagramSource(found.instagram, input.nome);
    if (result) return result;
  }

  if (found.site) {
    const result = await resolveSiteSource(found.site);
    if (result) return result;
  }

  if (found.licensedImage?.url && (await isImageUrlValid(found.licensedImage.url))) {
    const { url, pageUrl, creditLabel } = found.licensedImage;
    return {
      coverImageUrl: url,
      meta: {
        tipo: "licenciada",
        originalUrl: url,
        targetUrl: pageUrl,
        creditLabel,
        verificadoEm: new Date().toISOString(),
        isEmbed: false,
      },
      contentImages: [{ url, creditLabel, creditHref: pageUrl }],
    };
  }

  return null;
}

const PDF_CREDIT_LABEL = "Diagnóstico Turístico e Econômico da Rota da Ferradura";

// Último recurso: fotos já extraídas do PDF do diagnóstico (Cloudinary), só
// aceitas se passarem no filtro mínimo de resolução — nunca com upscale.
async function resolvePdfSource(fotosPdf: string[]): Promise<ResolvedEmpreendimentoImage | null> {
  const passing: string[] = [];
  for (const url of fotosPdf) {
    const quality = await probeImageQuality(url);
    if (quality?.ok) passing.push(url);
  }
  if (passing.length === 0) return null;

  return {
    coverImageUrl: passing[0],
    meta: {
      tipo: "pdf",
      originalUrl: passing[0],
      targetUrl: null,
      creditLabel: PDF_CREDIT_LABEL,
      verificadoEm: new Date().toISOString(),
      isEmbed: false,
    },
    contentImages: passing.map((url) => ({ url, creditLabel: PDF_CREDIT_LABEL })),
  };
}

export async function resolveEmpreendimentoImage(input: EmpreendimentoImageInput): Promise<ResolvedEmpreendimentoImage | null> {
  if (input.instagram) {
    const result = await resolveInstagramSource(input.instagram, input.nome);
    if (result) return result;
  }

  if (input.site) {
    const result = await resolveSiteSource(input.site);
    if (result) return result;
  }

  // Nem Instagram nem site do cadastro renderam uma capa usável (ou não
  // constavam no cadastro) — pesquisa de apoio só pra achar canal oficial.
  const searchResult = await resolveViaSearch(input);
  if (searchResult) return searchResult;

  return resolvePdfSource(input.fotosPdf);
}
