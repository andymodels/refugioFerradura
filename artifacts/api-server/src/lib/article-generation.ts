import Anthropic from "@anthropic-ai/sdk";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { buildWhatsappHtml, buildMailtoHtml, buildMapsHtml, buildInstagramHtml } from "./contact-links";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?.*)?$/i;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
];

// Extrai meta tags Open Graph/Twitter como fallback para redes sociais
function extractOGMeta(html: string): string {
  try {
    const { document: doc } = parseHTML(html);
    const get = (prop: string) =>
      doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content") ||
      doc.querySelector(`meta[name="${prop}"]`)?.getAttribute("content") ||
      "";
    const title = get("og:title") || get("twitter:title") || doc.title || "";
    const description =
      get("og:description") || get("twitter:description") || get("description") || "";
    const siteName = get("og:site_name") || "";
    const parts = [title, siteName, description].filter(Boolean);
    return parts.join("\n\n").trim();
  } catch {
    return "";
  }
}

// Frases que indicam página de desafio/bloqueio — não são conteúdo real
const BLOCK_PHRASES = [
  "enable javascript and cookies",
  "just a moment",
  "performing security verification",
  "please enable javascript",
  "checking your browser",
  "ddos protection by",
  "cloudflare",
  "access denied",
  "403 forbidden",
  "robot or human",
  "captcha",
  "are you a robot",
  "verify you are human",
  "security check",
];

function isBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  const matches = BLOCK_PHRASES.filter((phrase) => lower.includes(phrase));
  // Se 2 ou mais frases de bloqueio aparecerem, considera bloqueado
  return matches.length >= 2;
}

export interface PageFeaturedMedia {
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  canonicalUrl?: string;
}

// Busca a imagem/vídeo de destaque (og:image/og:video/twitter:image) e uma
// legenda curta (título/descrição) de uma página pública — usado tanto pro
// site oficial de um empreendimento quanto pra checar um post/reel público do
// Instagram (que expõe essas mesmas meta tags pra permitir preview em outras
// redes, sem precisar de login). `og:video`/`og:video:secure_url` só existe
// quando a página é de fato um Reel/vídeo — best-effort: se não vier, quem
// chamar essa função simplesmente não tem vídeo pra essa mídia.
export async function extractFeaturedMedia(url: string): Promise<PageFeaturedMedia> {
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const html = await response.text();
      const { document: doc } = parseHTML(html);
      const get = (prop: string) =>
        doc.querySelector(`meta[property="${prop}"]`)?.getAttribute("content") ||
        doc.querySelector(`meta[name="${prop}"]`)?.getAttribute("content") ||
        "";

      const rawImage = get("og:image:secure_url") || get("og:image") || get("twitter:image");
      const imageUrl = rawImage ? new URL(rawImage, url).toString() : undefined;
      const rawVideo = get("og:video:secure_url") || get("og:video") || get("twitter:player:stream");
      const videoUrl = rawVideo ? new URL(rawVideo, url).toString() : undefined;
      const title = get("og:title") || get("twitter:title") || doc.title || "";
      const description = get("og:description") || get("twitter:description") || "";
      const caption = [title, description].filter(Boolean).join(" — ").trim() || undefined;
      // Instagram aceita /p/CODE/ e /reel/CODE/ como sinônimos pro mesmo
      // post — a URL canônica (og:url) é que revela se é de fato um vídeo,
      // independente de qual caminho a pessoa colou.
      const canonicalUrl = get("og:url") || undefined;

      if ((imageUrl || videoUrl) && !isBlockedContent(caption || "")) {
        return { imageUrl, videoUrl, caption, canonicalUrl };
      }
    } catch {
      continue;
    }
  }
  return {};
}

export async function extractArticleContent(
  url: string,
): Promise<{ text: string; blocked: boolean; isImage: boolean }> {
  // Link direto para imagem
  if (IMAGE_EXTENSIONS.test(url.split("?")[0])) {
    return { text: "", blocked: false, isImage: true };
  }

  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(12000),
      });

      const html = await response.text();

      // HTTP não-ok mas temos HTML — pode ser página de desafio
      if (!response.ok) {
        if (isBlockedContent(html)) {
          return { text: "", blocked: true, isImage: false };
        }
        continue;
      }

      // Tenta Readability primeiro
      const { document: parsedDoc } = parseHTML(html);
      const reader = new Readability(parsedDoc as any);
      const article = reader.parse();
      const text = article?.textContent?.replace(/\s+/g, " ").trim() || "";

      // Verifica se o texto extraído é uma página de bloqueio disfarçada
      if (isBlockedContent(text)) {
        return { text: "", blocked: true, isImage: false };
      }

      if (text.length > 200) {
        return { text: text.slice(0, 12000), blocked: false, isImage: false };
      }

      // Fallback: Open Graph / Twitter meta tags (posts sociais, páginas de foto)
      const ogText = extractOGMeta(html);
      if (ogText.length > 50 && !isBlockedContent(ogText)) {
        return { text: ogText.slice(0, 4000), blocked: false, isImage: false };
      }
    } catch {
      continue;
    }
  }

  return { text: "", blocked: true, isImage: false };
}

// Coleta as URLs de imagem do corpo de uma página-fonte, filtrando ícones/logos
// e qualquer coisa que não seja de fato um arquivo de imagem (ex: links de
// compartilhamento apontando pra própria página).
export async function extractImagesFromSource(url: string): Promise<string[]> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENTS[0] },
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    const { document } = parseHTML(html);

    const images = (Array.from(document.querySelectorAll("img")) as any[])
      .map((img) => img.getAttribute("src") || img.getAttribute("data-src") || "")
      .map((src) => {
        try {
          return new URL(src, url).toString();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .filter((src) => !/logo|icon|avatar|sprite|placeholder/i.test(src))
      .filter((src) => {
        const pathPart = src.split("?")[0];
        const queryPart = src.split("?")[1] || "";
        return IMAGE_EXTENSIONS.test(pathPart) || IMAGE_EXTENSIONS.test(queryPart);
      });

    return [...new Set(images)];
  } catch {
    return [];
  }
}

// Confere que uma URL de imagem "encontrada" pela IA numa busca realmente
// existe e é mesmo uma imagem, antes de publicar — proteção contra a IA
// citar uma URL plausível mas inválida/inventada.
export async function isImageUrlValid(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENTS[0], Range: "bytes=0-1024" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok && response.status !== 206) return false;
    const contentType = response.headers.get("content-type") || "";
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

// Tipo único de mídia editorial — usado pra intercalar no HTML do artigo E
// pra persistir metadados (coluna `gallery`). `urlArquivo` é sempre um arquivo
// arquivado no Cloudinary do site (nunca a página de origem); `urlOrigem` é
// onde a mídia foi encontrada; `urlDestino` é pra onde o clique leva (quase
// sempre igual a `urlOrigem`, mas mantido separado pra clareza).
export interface MediaItem {
  kind: "foto" | "video";
  urlArquivo: string;
  urlOrigem: string | null;
  urlDestino: string | null;
  tipo: "instagram_oficial" | "site_oficial" | "licenciada" | "institucional";
  verificadoEm: string;
  isReel: boolean;
}

function renderMediaItem(item: MediaItem): string {
  if (item.kind === "video") {
    const badge = item.urlDestino
      ? `<a class="instagram-editorial-video-badge" href="${item.urlDestino}" target="_blank" rel="noopener noreferrer">Instagram oficial ↗</a>`
      : "";
    return `<figure class="instagram-editorial-video"><video controls playsinline preload="metadata" src="${item.urlArquivo}"></video>${badge}</figure>`;
  }
  const img = `<img src="${item.urlArquivo}" alt="" loading="lazy">`;
  const inner = item.urlDestino
    ? `<a href="${item.urlDestino}" target="_blank" rel="noopener noreferrer" aria-label="Ver origem oficial">${img}</a>`
    : img;
  return `<figure class="instagram-editorial-photo">${inner}</figure>`;
}

// Remove mídia editorial já existente no HTML de um post (qualquer
// convenção usada até hoje: <figure class="instagram-editorial-photo">,
// <figure class="instagram-editorial-video">, <figure class="video-embed-wrap">
// e o <img class="rounded-lg"> antigo com o parágrafo de crédito visível
// logo depois) — usada pela rotina de reconciliação antes de reinserir a
// mídia aprovada pelo pipeline atual. Nunca toca em <h2>/<p>/<ul> de texto.
export function stripExistingMedia(contentHtml: string): string {
  return contentHtml
    .replace(/<figure class="instagram-editorial-photo">[\s\S]*?<\/figure>/g, "")
    .replace(/<figure class="instagram-editorial-video">[\s\S]*?<\/figure>/g, "")
    .replace(/<figure class="video-embed-wrap"[\s\S]*?<\/figure>/g, "")
    .replace(/<img class="rounded-lg"[\s\S]*?>\s*(<p><em>Foto:[\s\S]*?<\/em><\/p>)?/g, "")
    .trim();
}

// Calcula em quais "gaps" entre blocos inserir mídia, garantindo que nunca
// haja duas mídias seguidas (pelo menos 1 bloco de texto entre elas) e que a
// última mídia nunca seja o último bloco do artigo. Se o artigo for curto
// demais pra caber todas as mídias aprovadas respeitando essa regra, insere
// menos mídia em vez de violar o espaçamento.
function computeInsertionGaps(blockCount: number, itemCount: number): number[] {
  if (blockCount < 2 || itemCount === 0) return [];
  const maxSlots = Math.max(1, Math.ceil((blockCount - 1) / 2));
  const count = Math.min(itemCount, maxSlots);
  const step = Math.max(2, Math.floor((blockCount - 1) / count));
  const gaps: number[] = [];
  let pos = step;
  for (let i = 0; i < count; i++) {
    gaps.push(Math.min(pos, blockCount - 1));
    pos += step;
  }
  return [...new Set(gaps)];
}

// Intercala mídia (foto ou vídeo) entre os blocos de texto do artigo — nunca
// remove/trunca texto, só insere <figure> nos pontos calculados por
// computeInsertionGaps. Divide em blocos por <h2>/<p>/<ul> pra ter pontos de
// inserção suficientes mesmo em artigos com poucos <h2>.
export function interleaveImages(contentHtml: string, items: MediaItem[]): string {
  if (items.length === 0) return contentHtml;

  // <ul>/<ol> precisam entrar como um único bloco atômico — do contrário o
  // split abaixo (que também corta em <p>) quebraria a lista ao meio, já que
  // seus <li> quase sempre contêm <p> internos, inserindo mídia dentro da
  // lista e corrompendo o HTML.
  const listPlaceholders: string[] = [];
  const withPlaceholders = contentHtml.replace(/<(ul|ol)>[\s\S]*?<\/\1>/gi, (match) => {
    listPlaceholders.push(match);
    return ` LIST${listPlaceholders.length - 1} `;
  });

  const blocks = withPlaceholders
    .split(/(?=<h2>|<p>| LIST)/i)
    .filter((b) => b.trim().length > 0)
    .map((b) => b.replace(/ LIST(\d+) /g, (_m, i) => listPlaceholders[Number(i)]));

  const gaps = computeInsertionGaps(blocks.length, items.length);

  const out: string[] = [];
  let itemIdx = 0;
  for (let b = 0; b < blocks.length; b++) {
    out.push(blocks[b]);
    if (itemIdx < gaps.length && b + 1 === gaps[itemIdx]) {
      out.push(renderMediaItem(items[itemIdx]));
      itemIdx++;
    }
  }
  return out.join("\n");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 90);
}

const SYSTEM_PROMPT = `Você é um editor de conteúdo especialista em turismo regional do Espírito Santo, com foco exclusivo na Rota da Ferradura, Buenos Aires e Guarapari - ES.

REGRAS ABSOLUTAS — nunca as quebre:
1. Use APENAS informações presentes no conteúdo-fonte fornecido. NUNCA invente fatos, números, nomes de lugares, eventos ou serviços que não estejam na fonte.
2. Se uma informação não estiver na fonte, simplesmente não a inclua no artigo.
3. Reescreva com suas próprias palavras, mas mantendo fidelidade total aos fatos originais.
4. "Refúgio da Ferradura" é um SITE DE TURISMO da Rota da Ferradura, Buenos Aires, Guarapari - ES. NÃO é um hotel, pousada, resort ou estabelecimento físico.
5. Escreva na perspectiva de quem recomenda e apresenta a região ao visitante.
6. Sempre em Português do Brasil, tom editorial sofisticado e acolhedor.
7. VERIFICAÇÃO DE RELEVÂNCIA OBRIGATÓRIA: o conteúdo deve tratar de turismo, natureza, gastronomia, cultura, eventos ou serviços relacionados à Rota da Ferradura, Buenos Aires, Guarapari, região serrana do ES ou ao Espírito Santo em geral. Se for completamente alheio a essa região, retorne APENAS o JSON de erro — nunca invente conteúdo genérico.`;

// Modo FONTE: usuário colou texto longo de um artigo externo — reescrever com fidelidade
const USER_PROMPT_TEXT = (sourceText: string, instructions?: string) => `Analise o conteúdo-fonte abaixo e siga este fluxo obrigatório:

PASSO 1 — VERIFICAÇÃO DE RELEVÂNCIA:
O conteúdo fala sobre turismo, natureza, gastronomia, cultura, eventos ou serviços da Rota da Ferradura, Buenos Aires, Guarapari, ou do Espírito Santo?
- Se NÃO for relevante: retorne SOMENTE este JSON:
  {"error": "fora_de_escopo", "message": "O conteúdo deste link não é relacionado à Rota da Ferradura, Buenos Aires ou Guarapari - ES. Por favor, use fontes sobre a região para gerar artigos relevantes para o site."}
- Se SIM for relevante: siga para o Passo 2.

PASSO 2 — GERAÇÃO DO ARTIGO:
Reescreva como artigo editorial para o site Refúgio da Ferradura, baseando-se EXCLUSIVAMENTE nos fatos do conteúdo-fonte.
NÃO adicione informações, atrações, preços ou detalhes que não estejam no conteúdo original.${instructions ? `\n\nINSTRUÇÕES ESPECÍFICAS DO EDITOR (prioridade máxima, dentro dos limites do conteúdo-fonte):\n${instructions}` : ""}

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título atraente baseado no conteúdo real",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases fiéis ao conteúdo",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li>",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"]
}

CONTEÚDO-FONTE:
${sourceText}`;

// Modo TEMA: usuário digitou um tema/tópico curto — gerar artigo com o conhecimento da IA
const USER_PROMPT_TOPIC = (topic: string, instructions?: string) => `Você vai criar um artigo editorial para o site Refúgio da Ferradura com base no tema abaixo.

TEMA SOLICITADO: ${topic}

PASSO 1 — VERIFICAÇÃO DE RELEVÂNCIA:
O tema acima é relacionado a turismo, gastronomia, natureza, cultura, eventos ou serviços da Rota da Ferradura, Buenos Aires, Guarapari, região serrana do ES ou ao Espírito Santo em geral?
- Se NÃO for relevante: retorne SOMENTE este JSON:
  {"error": "fora_de_escopo", "message": "Este tema não está relacionado à Rota da Ferradura, Buenos Aires ou Guarapari - ES. Por favor, informe um tema sobre a região para gerar artigos relevantes para o site."}
- Se SIM for relevante: siga para o Passo 2.

PASSO 2 — GERAÇÃO DO ARTIGO:
Crie um artigo editorial completo, informativo e envolvente sobre o tema. Use seu conhecimento sobre a região da Rota da Ferradura, Guarapari e o Espírito Santo.
Escreva com tom acolhedor e sofisticado, adequado a um guia de turismo premium.${instructions ? `\n\nINSTRUÇÕES ESPECÍFICAS DO EDITOR (prioridade máxima):\n${instructions}` : ""}

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título atraente sobre o tema",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases que capturam a essência do artigo",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li> — rico em detalhes e informações úteis para o visitante",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"]
}`;

const USER_PROMPT_IMAGE = (imageUrl: string, instructions?: string) => `Analise a imagem abaixo e siga este fluxo obrigatório:

PASSO 1 — VERIFICAÇÃO DE RELEVÂNCIA:
A imagem mostra paisagens, lugares, gastronomia, eventos ou serviços da Rota da Ferradura, Buenos Aires, Guarapari, ou do Espírito Santo?
- Se NÃO for relevante: retorne SOMENTE este JSON:
  {"error": "fora_de_escopo", "message": "Esta imagem não parece ser relacionada à Rota da Ferradura, Buenos Aires ou Guarapari - ES. Por favor, use imagens da região para gerar artigos relevantes."}
- Se SIM for relevante: siga para o Passo 2.

PASSO 2 — GERAÇÃO DO ARTIGO:
Descreva o que você vê na imagem com detalhes — elementos visuais, cores, ambiente, sensações transmitidas — e use isso para criar um artigo editorial rico e envolvente para o site Refúgio da Ferradura.
NÃO invente locais ou nomes específicos que não sejam claramente identificáveis na imagem.${instructions ? `\n\nINSTRUÇÕES ESPECÍFICAS DO EDITOR (prioridade máxima):\n${instructions}` : ""}

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título atraente inspirado na imagem",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases que capturam a essência da imagem",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li> — baseado no que é visível na imagem",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"]
}`;

function parseJsonResponse(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

function getTextBlock(message: Anthropic.Message): string {
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) throw new Error("A IA não retornou texto.");
  return textBlock.text;
}

export interface GeneratedArticle {
  error?: string;
  message?: string;
  title?: string;
  subtitle?: string;
  excerpt?: string;
  content?: string;
  metaDescription?: string;
  tags?: string[];
}

export interface ExtractionFailure {
  blocked: boolean;
  message: string;
}

// Lança um ExtractionFailure quando não há conteúdo suficiente pra gerar o artigo.
export async function generateArticle(
  input: string,
  instructions?: string,
): Promise<GeneratedArticle> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const isUrl = input.startsWith("http");
  // Texto curto (< 400 chars, sem URL) = tema/tópico; texto longo = fonte a reescrever
  const isTopicMode = !isUrl && input.length < 400;

  let sourceText = input;
  let isImage = false;

  if (isUrl) {
    const result = await extractArticleContent(input);
    sourceText = result.text;
    isImage = result.isImage;

    if (!isImage && sourceText.length < 50) {
      const failure: ExtractionFailure = {
        blocked: result.blocked,
        message: result.blocked
          ? "Este site usa proteção contra leitura automática (como Cloudflare). Não é possível ler o conteúdo pelo servidor.\n\nO que fazer: abra o artigo normalmente no seu navegador, selecione todo o texto com Ctrl+A, copie com Ctrl+C e cole diretamente no campo de geração."
          : "Não foi possível extrair conteúdo suficiente do link. Tente colar o texto do artigo diretamente no campo.",
      };
      throw Object.assign(new Error(failure.message), failure);
    }
  }

  let userContent: Anthropic.MessageParam["content"];

  if (isImage) {
    // Modo imagem: visão do Claude para analisar a foto
    userContent = [
      { type: "text", text: USER_PROMPT_IMAGE(input, instructions || undefined) },
      { type: "image", source: { type: "url", url: input } },
    ];
  } else if (isTopicMode) {
    // Modo tema: usuário digitou um tópico curto — gerar artigo com conhecimento da IA
    userContent = USER_PROMPT_TOPIC(sourceText, instructions || undefined);
  } else {
    // Modo fonte: texto longo colado pelo usuário ou extraído de URL — reescrever
    userContent = USER_PROMPT_TEXT(sourceText, instructions || undefined);
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  return parseJsonResponse(getTextBlock(message));
}

// Gera o artigo a partir de um texto-fonte já extraído (usado pelo pipeline
// automático, que precisa do texto-fonte também pra rodar a verificação
// comparativa depois — evita buscar a página de novo).
export async function generateFromText(
  sourceText: string,
  instructions?: string,
): Promise<GeneratedArticle> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: USER_PROMPT_TEXT(sourceText, instructions) }],
  });
  return parseJsonResponse(getTextBlock(message));
}

export interface VerificationResult {
  ok: boolean;
  problemas: string[];
}

const VERIFY_SYSTEM_PROMPT = `Você é um verificador factual rigoroso. Sua única tarefa é comparar um artigo gerado com o texto-fonte original e apontar qualquer coisa que tenha sido inventada.`;

const VERIFY_PROMPT = (sourceText: string, article: GeneratedArticle) => `TEXTO-FONTE ORIGINAL:
${sourceText}

ARTIGO GERADO (título, subtítulo, resumo e conteúdo):
Título: ${article.title ?? ""}
Subtítulo: ${article.subtitle ?? ""}
Resumo: ${article.excerpt ?? ""}
Conteúdo: ${article.content ?? ""}

Compare o ARTIGO GERADO com o TEXTO-FONTE ORIGINAL. Liste QUALQUER nome próprio, número, preço, horário, endereço ou fato específico que apareça no artigo gerado e NÃO esteja presente (nem implícito) no texto-fonte. Ignore diferenças de estilo ou de reescrita — o que importa é só fato inventado ou alterado.

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "ok": true ou false,
  "problemas": ["lista de itens inventados/incorretos, vazia se não houver nenhum"]
}`;

export async function verifyArticleAgainstSource(
  sourceText: string,
  article: GeneratedArticle,
): Promise<VerificationResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: VERIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: VERIFY_PROMPT(sourceText, article) }],
  });
  return parseJsonResponse(getTextBlock(message)) as VerificationResult;
}

export interface EmpreendimentoData {
  nome: string;
  regiao?: string | null;
  proprietario?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  plusCode?: string | null;
  instagram?: string | null;
  site?: string | null;
  caracteristicas: string[];
}

const EMPREENDIMENTO_SYSTEM_PROMPT = `Você é um editor de conteúdo especialista em turismo regional do Espírito Santo, com foco exclusivo na Rota da Ferradura, Buenos Aires e Guarapari - ES.

REGRAS ABSOLUTAS:
1. Use APENAS as informações fornecidas sobre o empreendimento. NUNCA invente características, preços, horários ou serviços que não estejam na lista fornecida.
2. Escreva um texto editorial e convidativo, na perspectiva de quem apresenta o local ao visitante da Rota da Ferradura.
3. Sempre em Português do Brasil, tom acolhedor e profissional.
4. O conteúdo é baseado num levantamento oficial (Diagnóstico Turístico e Econômico da Rota da Ferradura), não invente nada além do que foi listado.`;

const EMPREENDIMENTO_PROMPT = (data: EmpreendimentoData) => {
  const phoneHtml = buildWhatsappHtml(data.telefone);
  const emailHtml = buildMailtoHtml(data.email);
  const instagramHtml = buildInstagramHtml(data.instagram);
  const siteHtml = data.site && data.site.startsWith("http")
    ? `<a href="${data.site}" target="_blank" rel="noopener noreferrer">${data.site}</a>`
    : null;
  const mapsHtml = buildMapsHtml(data.endereco, data.plusCode);

  return `Escreva um artigo editorial apresentando o seguinte empreendimento da Rota da Ferradura para o site Refúgio da Ferradura:

Nome: ${data.nome}
Região: ${data.regiao || "não informado"}
Proprietário/Responsável: ${data.proprietario || "não informado"}
Endereço: ${data.endereco || "não informado"}
Telefone / WhatsApp (HTML já pronto, use exatamente como está, não reescreva): ${phoneHtml || data.telefone || "não informado"}
E-mail (HTML já pronto, use exatamente como está, não reescreva): ${emailHtml || data.email || "não informado"}
Localização (Plus Code): ${data.plusCode || "não informado"}
Instagram (HTML já pronto, use exatamente como está, não reescreva): ${instagramHtml || "não informado"}
Site (HTML já pronto, use exatamente como está, não reescreva): ${siteHtml || "não informado"}
Google Maps (HTML já pronto, use exatamente como está, não reescreva): ${mapsHtml || "não informado"}
Características/serviços oferecidos:
${data.caracteristicas.map((c) => `- ${c}`).join("\n")}

Estruture o artigo em HTML com <h2>, <p>, <ul>, <li>:
1. Comece apresentando o empreendimento e a região onde fica.
2. Descreva as características/serviços de forma fluida e convidativa (pode agrupar em parágrafos ou lista).
3. Termine SEMPRE com uma seção "<h2>Serviços</h2>" contendo, em uma lista, TODOS os dados acima que estiverem marcados como "não informado" e forem informados de fato (endereço, telefone/WhatsApp, e-mail, site, Instagram, proprietário e Google Maps) — inclua exatamente como foram fornecidos acima, sem alterar números/textos. Para Telefone/WhatsApp, E-mail, Instagram, Site e Google Maps, copie o HTML de link fornecido acima exatamente como está, sem modificar a URL. Omita da lista só os que estiverem como "não informado". Nunca invente nenhum dado que não esteja listado acima.

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título atraente com o nome do empreendimento",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases",
  "content": "Artigo completo em HTML, terminando com a seção Serviços",
  "metaDescription": "Até 160 caracteres para SEO"
}`;
};

export async function generateEmpreendimentoArticle(
  data: EmpreendimentoData,
): Promise<GeneratedArticle> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: EMPREENDIMENTO_SYSTEM_PROMPT,
    messages: [{ role: "user", content: EMPREENDIMENTO_PROMPT(data) }],
  });
  return parseJsonResponse(getTextBlock(message));
}

export interface ChannelUpdateInput {
  nome: string;
  caption: string;
  tags?: string[];
}

export interface ChannelUpdateArticle {
  insuficiente?: boolean;
  motivo?: string;
  title?: string;
  subtitle?: string;
  excerpt?: string;
  content?: string;
  metaDescription?: string;
}

const CHANNEL_UPDATE_SYSTEM_PROMPT = `Você é um editor de conteúdo especialista em turismo regional do Espírito Santo, com foco exclusivo na Rota da Ferradura, Buenos Aires e Guarapari - ES.

REGRAS ABSOLUTAS:
1. Baseie-se SOMENTE na legenda da publicação oficial fornecida e no nome do estabelecimento. NUNCA invente serviços, preços, datas, horários, estrutura ou características que não estejam na legenda.
2. Não copie a legenda literalmente — escreva uma atualização jornalística curta com suas próprias palavras, explicando o que é mostrado, a experiência oferecida e para quem pode interessar.
3. NÃO repita frases ou informações só pra preencher espaço.
4. Sempre em Português do Brasil, tom editorial e factual, 2 a 4 parágrafos (nada de <h2>, só <p>).
5. Se a legenda não trouxer informação suficiente pra escrever algo factual e útil (por exemplo, é só uma frase genérica ou hashtags), NÃO invente conteúdo — responda com o JSON de insuficiente.`;

const CHANNEL_UPDATE_PROMPT = (input: ChannelUpdateInput) => `Publicação nova do perfil oficial de "${input.nome}" (Rota da Ferradura, Guarapari-ES):

Legenda: "${input.caption}"

Escreva uma atualização jornalística curta (2 a 4 parágrafos, só <p>, sem <h2>) sobre essa publicação pro blog do site Refúgio da Ferradura — indo além da legenda com suas próprias palavras, mas sem inventar nenhum fato que não esteja nela.

Se a legenda não tiver informação suficiente pra isso, responda SOMENTE:
{"insuficiente": true, "motivo": "..."}

Caso contrário, responda APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título curto baseado no que a publicação mostra",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 1 a 2 frases",
  "content": "2 a 4 parágrafos em HTML, só <p>",
  "metaDescription": "Até 160 caracteres para SEO"
}`;

export async function generateChannelUpdateArticle(input: ChannelUpdateInput): Promise<ChannelUpdateArticle> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: CHANNEL_UPDATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: CHANNEL_UPDATE_PROMPT(input) }],
  });
  return parseJsonResponse(getTextBlock(message));
}

// Localidades oficiais que compõem a Rota da Ferradura, segundo o próprio
// Diagnóstico Turístico e Econômico do Governo do ES (página "Localização
// das Propriedades Visitadas").
export const ROTA_DA_FERRADURA_LOCALITIES = [
  "Rota da Ferradura",
  "Guarapari",
  "Oratório",
  "Buenos Aires",
  "Barra do Limão",
  "Boa Esperança",
  "Arraial do Jabuti",
  "Jabuti",
  "São João do Jabuti",
  "Cachoeirinha",
];

export interface RegionalSearchImage {
  url: string;
  pageUrl: string;
  creditLabel: string;
}

export interface RegionalSearchArticle extends GeneratedArticle {
  sourceUrl?: string | null;
  images?: RegionalSearchImage[];
}

const REGIONAL_SEARCH_SYSTEM_PROMPT = `Você é um editor de conteúdo especialista em turismo regional do Espírito Santo, com foco exclusivo na Rota da Ferradura, uma região de MONTANHAS/SERRA dentro do município de Guarapari - ES, e as localidades que a compõem.

REGRAS ABSOLUTAS:
1. IMPORTANTE — Rota da Ferradura ≠ Guarapari cidade/praia. "Guarapari" sozinho geralmente remete às praias e ao centro urbano litorâneo, que é OUTRA coisa. A Rota da Ferradura é especificamente a região serrana/rural do município: Oratório, Buenos Aires, Barra do Limão, Boa Esperança, Arraial do Jabuti, Jabuti, São João do Jabuti, Cachoeirinha. O conteúdo tem que ser genuinamente SOBRE essa região de montanha — não um evento qualquer da cidade/praia de Guarapari só porque acontece no mesmo município. Se o evento/notícia for só do centro/praia de Guarapari e não tiver conexão real com a região serrana, não é um bom tema — procure outro.
2. Use a ferramenta de busca na web pra encontrar conteúdo REAL e ATUAL sobre a região. NUNCA invente uma fonte ou escreva sem antes ter pesquisado de verdade.
3. Baseie o artigo EXCLUSIVAMENTE no que a pesquisa retornou. Não invente fatos, números, nomes, datas ou eventos que não estejam nos resultados da busca.
4. Priorize conteúdo verdadeiramente atual: eventos futuros/próximos, notícias recentes. Evite reescrever algo genérico ou datado se encontrar algo mais atual.
5. Sempre em Português do Brasil, tom editorial sofisticado e acolhedor, escrevendo com suas próprias palavras (nunca copie frases literais da fonte).
6. "Refúgio da Ferradura" é um SITE DE TURISMO da região, não um estabelecimento físico.
7. O campo "content" deve ser HTML LIMPO, só com <h2>, <p>, <ul>, <li>, <strong>, <em> preenchidos com texto de verdade. NUNCA inclua tags vazias (ex: <span></span>), marcadores de citação, referências tipo "[1]" ou qualquer resíduo da ferramenta de busca — escreva prosa corrida normal, sem indicar de onde tirou cada frase dentro do próprio texto.`;

const REGIONAL_SEARCH_PROMPT = (excludeUrls: string[], recentTopics: string[]) => `Pesquise na internet conteúdo atual e real sobre a Rota da Ferradura — a região de MONTANHA/SERRA dentro do município de Guarapari-ES, formada pelas localidades: ${ROTA_DA_FERRADURA_LOCALITIES.join(", ")}.

Lembre-se: isso NÃO é a cidade/praia de Guarapari em geral (centro urbano, litoral, Praia do Morro etc.) — é especificamente essa região serrana. Um evento no centro ou na praia de Guarapari só serve de tema se tiver conexão real e direta com a região da Rota da Ferradura.

Pode ser sobre: um lugar/atrativo, uma curiosidade, uma paisagem, um restaurante, uma pousada, ou (com prioridade especial) um evento atualizado/próximo NA PRÓPRIA região serrana.

IMPORTANTE — VARIE O TIPO DE CONTEÚDO, nunca repita o mesmo ângulo/categoria do post mais recente. Os últimos posts publicados por este pipeline foram:
${recentTopics.length > 0 ? recentTopics.map((t) => `- ${t}`).join("\n") : "(nenhum ainda — é o primeiro)"}
Escolha hoje um tipo de conteúdo DIFERENTE dos listados acima (se o último foi sobre um evento, hoje prefira um lugar/restaurante/curiosidade, e vice-versa).

NÃO escreva sobre nenhuma destas fontes, já usadas em posts anteriores:
${excludeUrls.length > 0 ? excludeUrls.join("\n") : "(nenhuma ainda)"}

Depois de pesquisar e encontrar uma fonte real, confiável e relevante, escreva um artigo editorial para o site Refúgio da Ferradura baseado exclusivamente no que você encontrou.

Além do texto, procure também 1 a 3 FOTOS reais e livres da região (paisagens, o lugar/evento em si) — podem vir de posts públicos em redes sociais (Instagram, Facebook), sites de notícia, sites da prefeitura, blogs de turismo etc. Pra cada foto, você precisa ter a URL direta do ARQUIVO de imagem (terminando em .jpg/.jpeg/.png/.webp, não o link da página/post) e a URL da página onde a encontrou, pra dar o crédito. Se não encontrar nenhuma foto com URL de arquivo direta e confiável, é melhor não incluir nenhuma do que inventar uma.

RESPONDA, como sua ÚLTIMA mensagem (depois de concluir a pesquisa), APENAS EM JSON válido, sem markdown ao redor:
{
  "sourceUrl": "URL exata da página que você usou como fonte principal do texto",
  "title": "Título atraente baseado no conteúdo real encontrado",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases fiéis ao conteúdo",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li>",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"],
  "images": [
    { "url": "URL direta do arquivo de imagem", "pageUrl": "URL da página/post onde encontrou", "creditLabel": "nome da fonte/perfil pra dar crédito" }
  ]
}

Se, mesmo pesquisando, você não encontrar nada real e atual sobre a região, responda apenas: {"error": "nada_encontrado"}`;

export async function searchAndGenerateRegionalArticle(
  excludeUrls: string[],
  recentTopics: string[] = [],
): Promise<RegionalSearchArticle> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8192,
    system: REGIONAL_SEARCH_SYSTEM_PROMPT,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: REGIONAL_SEARCH_PROMPT(excludeUrls, recentTopics) }],
  });

  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  const lastTextBlock = textBlocks[textBlocks.length - 1];
  if (!lastTextBlock) throw new Error("A IA não retornou texto após a pesquisa.");

  return parseJsonResponse(lastTextBlock.text);
}

// Busca de reforço só pra achar fotos ilustrativas quando a geração principal
// não trouxe nenhuma — a região tem fotos de sobra na internet (paisagens,
// perfis de turismo, prefeitura etc.), então isso raramente deveria falhar.
// Não precisam ser do lugar/evento exato do artigo, só da região.
export async function searchIllustrativePhotos(topic: string): Promise<RegionalSearchImage[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Busque na internet 3 a 4 FOTOS reais e bonitas para ilustrar um artigo sobre "${topic}".

IMPORTANTE: as fotos precisam ser da REGIÃO SERRANA/MONTANHA da Rota da Ferradura especificamente (${ROTA_DA_FERRADURA_LOCALITIES.join(", ")}) — trilhas, cachoeiras, montanhas, sítios, roça, natureza rural. NÃO use fotos de praia, orla ou do centro urbano/litorâneo de Guarapari (isso é outra região, não serve pra ilustrar conteúdo da Rota da Ferradura). Se não achar foto específica da serra, prefira não incluir a não colocar foto de praia/cidade por engano.

Não precisam ser do lugar/evento exato do artigo — podem ser fotos de paisagem/natureza da região em geral, de perfis de turismo, prefeitura, sites de notícia ou redes sociais.

Você PRECISA ter a URL direta do ARQUIVO de imagem (terminando em .jpg/.jpeg/.png/.webp — não o link da página/post) e a URL da página de origem, pra dar crédito.

RESPONDA APENAS EM JSON, sem markdown ao redor:
{"images": [{"url": "...", "pageUrl": "...", "creditLabel": "..."}]}

Se não encontrar nenhuma foto com URL de arquivo direta e confiável, responda {"images": []}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: prompt }],
  });

  const textBlocks = message.content.filter(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  const lastTextBlock = textBlocks[textBlocks.length - 1];
  if (!lastTextBlock) return [];

  try {
    const parsed = parseJsonResponse(lastTextBlock.text);
    return parsed.images ?? [];
  } catch {
    return [];
  }
}
