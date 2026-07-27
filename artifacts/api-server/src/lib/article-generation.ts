import Anthropic from "@anthropic-ai/sdk";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

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

export interface InterleaveImage {
  url: string;
  // Se ausente, a imagem entra sem legenda de crédito (ex: foto enviada pelo próprio usuário).
  creditLabel?: string;
  creditHref?: string;
}

// Intercala fotos entre os blocos <h2> do artigo, com crédito quando informado.
export function interleaveImages(contentHtml: string, images: InterleaveImage[]): string {
  if (images.length === 0) return contentHtml;
  const parts = contentHtml.split(/(?=<h2>)/i).filter((p) => p.trim().length > 0);
  const out: string[] = [];
  let imgIdx = 0;
  for (const part of parts) {
    out.push(part);
    if (imgIdx < images.length) {
      const img = images[imgIdx];
      const credit = img.creditLabel
        ? `\n<p><em>Foto: <a href="${img.creditHref}" target="_blank" rel="noopener noreferrer">${img.creditLabel}</a></em></p>\n`
        : "\n";
      out.push(`\n<img class="rounded-lg" src="${img.url}" alt="" style="width: 100%; max-width: 100%;">${credit}`);
      imgIdx++;
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

const EMPREENDIMENTO_PROMPT = (data: EmpreendimentoData) => `Escreva um artigo editorial apresentando o seguinte empreendimento da Rota da Ferradura para o site Refúgio da Ferradura:

Nome: ${data.nome}
Região: ${data.regiao || "não informado"}
Características/serviços oferecidos:
${data.caracteristicas.map((c) => `- ${c}`).join("\n")}

Estruture o artigo em HTML com <h2>, <p>, <ul>, <li>:
1. Comece apresentando o empreendimento e a região onde fica.
2. Descreva as características/serviços de forma fluida e convidativa (pode agrupar em parágrafos ou lista).
3. Termine SEMPRE com uma seção "<h2>Serviços</h2>" contendo, em uma lista, os dados de contato/acesso que existirem entre estes (omita os que não existirem, não invente nenhum): endereço, telefone, e-mail, site, Instagram.

RESPONDA APENAS EM JSON válido, sem markdown ao redor:
{
  "title": "Título atraente com o nome do empreendimento",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases",
  "content": "Artigo completo em HTML, terminando com a seção Serviços",
  "metaDescription": "Até 160 caracteres para SEO"
}`;

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
