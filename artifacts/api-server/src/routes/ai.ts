import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const router: IRouter = Router();

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

async function extractArticleContent(
  url: string
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

function parseArticleJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}

router.post("/generate-from-url", async (req, res) => {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const input: string = (req.body.url || "").trim();
  const extraInstructions: string = (req.body.instructions || "").trim();

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
      res.status(422).json({
        error: result.blocked
          ? "Este site usa proteção contra leitura automática (como Cloudflare). Não é possível ler o conteúdo pelo servidor.\n\nO que fazer: abra o artigo normalmente no seu navegador, selecione todo o texto com Ctrl+A, copie com Ctrl+C e cole diretamente no campo de geração."
          : "Não foi possível extrair conteúdo suficiente do link. Tente colar o texto do artigo diretamente no campo.",
        blocked: result.blocked,
      });
      return;
    }
  }

  try {
    let userContent: Anthropic.MessageParam["content"];

    if (isImage) {
      // Modo imagem: visão do Claude para analisar a foto
      userContent = [
        { type: "text", text: USER_PROMPT_IMAGE(input, extraInstructions || undefined) },
        { type: "image", source: { type: "url", url: input } },
      ];
    } else if (isTopicMode) {
      // Modo tema: usuário digitou um tópico curto — gerar artigo com conhecimento da IA
      userContent = USER_PROMPT_TOPIC(sourceText, extraInstructions || undefined);
    } else {
      // Modo fonte: texto longo colado pelo usuário ou extraído de URL — reescrever
      userContent = USER_PROMPT_TEXT(sourceText, extraInstructions || undefined);
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );

    if (!textBlock) {
      res.status(500).json({ error: "A IA não retornou um artigo." });
      return;
    }

    res.json(parseArticleJson(textBlock.text));
  } catch (e: any) {
    res.status(500).json({ error: "Erro na geração com IA: " + e.message });
  }
});

export default router;
