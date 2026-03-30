import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { GenerateFromUrlBody, GenerateFromUrlResponse } from "@workspace/api-zod";

const router: IRouter = Router();

async function extractArticleContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao buscar URL`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (article?.textContent && article.textContent.trim().length > 100) {
    return article.textContent.replace(/\s+/g, " ").trim().slice(0, 8000);
  }

  const body = dom.window.document.body;
  if (body) {
    body.querySelectorAll("script, style, nav, footer, header, aside, [role='advertisement']").forEach(el => el.remove());
    const text = (body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
    if (text.length > 100) return text;
  }

  throw new Error("Não foi possível extrair conteúdo da página");
}

const VALID_TAGS = ["lugares", "experiencias", "gastronomia", "hospedagem", "natureza", "turismo", "cultura", "aventura"];

router.post("/generate-from-url", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY;

  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  if (!apiKey) {
    res.status(503).json({ error: "Chave da OpenAI não configurada. Adicione OPENAI_API_KEY nas variáveis de ambiente." });
    return;
  }

  const parsed = GenerateFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  let articleContent = "";
  const isUrl = /^https?:\/\//i.test(url.trim());

  if (isUrl) {
    try {
      articleContent = await extractArticleContent(url.trim());
    } catch (e) {
      req.log.warn({ url, error: e }, "Content extraction failed, using fallback prompt");
      articleContent = `Crie um artigo de turismo sobre a região da Rota da Ferradura em Guarapari, Espírito Santo. URL de referência: ${url}`;
    }
  } else {
    articleContent = url.trim().slice(0, 8000);
  }

  const openai = new OpenAI({
    ...(baseURL ? { baseURL } : {}),
    apiKey,
  });

  const prompt = `Você é um redator especialista em turismo premium da Rota da Ferradura, Guarapari, ES, Brasil.

Com base no conteúdo abaixo, crie um artigo jornalístico original e sofisticado para o site "Refúgio da Ferradura".

REGRAS ESTRITAS:
- Reescreva com suas próprias palavras. Nunca copie o original.
- Linguagem editorial premium, como uma revista de viagens de luxo.
- Tudo em português brasileiro.
- O campo "title" deve ter no MÁXIMO 70 caracteres.
- O campo "subtitle" deve ser UMA frase poética e complementar, máximo 120 caracteres, sem HTML.
- O campo "excerpt" deve ser UM parágrafo de 2-3 frases descrevendo o artigo, sem HTML, máximo 200 caracteres.
- O campo "metaDescription" deve ser UMA frase para SEO, máximo 155 caracteres, sem HTML.
- O campo "content" deve ser HTML completo com: pelo menos 3 parágrafos <p>, 2 subtítulos <h2>, e pelo menos uma lista <ul><li>.
- O campo "tags" deve ser um array JSON com 2-3 tags da lista: lugares, experiencias, gastronomia, hospedagem, natureza, turismo, cultura, aventura.

CONTEÚDO DE REFERÊNCIA:
${articleContent}

Responda APENAS com este JSON (sem markdown, sem bloco de código, sem texto antes ou depois):
{
  "title": "Título do artigo (máx 70 chars)",
  "subtitle": "Frase poética complementar (máx 120 chars, sem HTML)",
  "excerpt": "Resumo de 2-3 frases para preview (máx 200 chars, sem HTML)",
  "content": "<h2>Subtítulo 1</h2><p>Parágrafo...</p><h2>Subtítulo 2</h2><p>...</p><ul><li>...</li></ul>",
  "tags": ["turismo", "natureza"],
  "metaDescription": "Descrição SEO de 1 frase (máx 155 chars, sem HTML)"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";

    let generated: {
      title: string;
      subtitle: string;
      excerpt: string;
      content: string;
      tags: string[];
      metaDescription: string;
    };

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      generated = JSON.parse(jsonMatch[0]);
    } catch (e) {
      req.log.error({ error: e, rawContent }, "Failed to parse AI response");
      res.status(500).json({ error: "Falha ao processar resposta da IA" });
      return;
    }

    const rawTags = Array.isArray(generated.tags) ? generated.tags : [];
    const validTags = rawTags.filter((t: string) => VALID_TAGS.includes(t));
    const finalTags = validTags.length > 0 ? validTags : ["turismo"];

    res.json(GenerateFromUrlResponse.parse({
      title: generated.title ?? "",
      subtitle: generated.subtitle ?? "",
      excerpt: generated.excerpt ?? "",
      content: generated.content ?? "",
      tags: JSON.stringify(finalTags),
      metaDescription: generated.metaDescription ?? "",
    }));
  } catch (e: any) {
    req.log.error({ error: e }, "OpenAI API error");
    const isAuthError = e?.status === 401;
    res.status(500).json({
      error: isAuthError
        ? "Chave da OpenAI inválida ou sem permissão."
        : "Erro ao chamar a IA. Tente novamente.",
    });
  }
});

export default router;
