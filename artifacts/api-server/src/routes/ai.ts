import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const router: IRouter = Router();

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?)(\?.*)?$/i;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
];

// Extrai meta tags Open Graph/Twitter como fallback para redes sociais
function extractOGMeta(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
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

      if (!response.ok) continue;

      const html = await response.text();

      // Tenta Readability primeiro
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const text = article?.textContent?.replace(/\s+/g, " ").trim() || "";

      if (text.length > 200) {
        return { text: text.slice(0, 12000), blocked: false, isImage: false };
      }

      // Fallback: Open Graph / Twitter meta tags (posts sociais, páginas de foto)
      const ogText = extractOGMeta(html, url);
      if (ogText.length > 50) {
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

const USER_PROMPT_TEXT = (sourceText: string) => `Analise o texto-fonte abaixo e siga este fluxo obrigatório:

PASSO 1 — VERIFICAÇÃO DE RELEVÂNCIA:
O conteúdo fala sobre turismo, natureza, gastronomia, cultura, eventos ou serviços da Rota da Ferradura, Buenos Aires, Guarapari, ou do Espírito Santo?
- Se NÃO for relevante: retorne SOMENTE este JSON:
  {"error": "fora_de_escopo", "message": "O conteúdo deste link não é relacionado à Rota da Ferradura, Buenos Aires ou Guarapari - ES. Por favor, use fontes sobre a região para gerar artigos relevantes para o site."}
- Se SIM for relevante: siga para o Passo 2.

PASSO 2 — GERAÇÃO DO ARTIGO:
Reescreva como artigo editorial para o site Refúgio da Ferradura, baseando-se EXCLUSIVAMENTE nos fatos do conteúdo-fonte.
NÃO adicione informações, atrações, preços ou detalhes que não estejam no conteúdo original.

RESPONDA APENAS EM JSON válido:
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

const USER_PROMPT_IMAGE = (imageUrl: string) => `Analise a imagem abaixo e siga este fluxo obrigatório:

PASSO 1 — VERIFICAÇÃO DE RELEVÂNCIA:
A imagem mostra paisagens, lugares, gastronomia, eventos ou serviços da Rota da Ferradura, Buenos Aires, Guarapari, ou do Espírito Santo?
- Se NÃO for relevante: retorne SOMENTE este JSON:
  {"error": "fora_de_escopo", "message": "Esta imagem não parece ser relacionada à Rota da Ferradura, Buenos Aires ou Guarapari - ES. Por favor, use imagens da região para gerar artigos relevantes."}
- Se SIM for relevante: siga para o Passo 2.

PASSO 2 — GERAÇÃO DO ARTIGO:
Descreva o que você vê na imagem com detalhes — elementos visuais, cores, ambiente, sensações transmitidas — e use isso para criar um artigo editorial rico e envolvente para o site Refúgio da Ferradura.
NÃO invente locais ou nomes específicos que não sejam claramente identificáveis na imagem.

RESPONDA APENAS EM JSON válido:
{
  "title": "Título atraente inspirado na imagem",
  "subtitle": "Subtítulo complementar",
  "excerpt": "Resumo de 2 a 3 frases que capturam a essência da imagem",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li> — baseado no que é visível na imagem",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"]
}`;

router.post("/generate-from-url", async (req, res) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const input: string = (req.body.url || "").trim();
  const isUrl = input.startsWith("http");

  let sourceText = input;
  let isImage = false;

  if (isUrl) {
    const result = await extractArticleContent(input);
    sourceText = result.text;
    isImage = result.isImage;

    if (!isImage && sourceText.length < 50) {
      res.status(422).json({
        error: result.blocked
          ? "O site bloqueou a leitura automática. Abra o artigo no navegador, selecione todo o texto (Ctrl+A), copie e cole diretamente no campo de geração."
          : "Não foi possível extrair conteúdo suficiente do link. Tente colar o texto do artigo diretamente no campo.",
        blocked: result.blocked,
      });
      return;
    }
  }

  try {
    let completion;

    if (isImage) {
      // Usa visão do GPT-4o para analisar a foto
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT_IMAGE(input) },
              { type: "image_url", image_url: { url: input, detail: "high" } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });
    } else {
      // Usa texto extraído ou colado pelo usuário
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT_TEXT(sourceText) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });
    }

    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (e: any) {
    res.status(500).json({ error: "Erro na geração com IA: " + e.message });
  }
});

export default router;
