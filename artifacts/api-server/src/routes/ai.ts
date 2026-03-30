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
    const text = article.textContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    return text;
  }

  // Fallback: remove scripts/styles and return body text
  const body = dom.window.document.body;
  if (body) {
    body.querySelectorAll("script, style, nav, footer, header, aside, [role='advertisement']").forEach(el => el.remove());
    const text = (body.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 8000);
    if (text.length > 100) return text;
  }

  throw new Error("Não foi possível extrair conteúdo da página");
}

router.post("/ai/generate-from-url", async (req, res): Promise<void> => {
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
      articleContent = `Gere um artigo de turismo sobre a região da Rota da Ferradura em Guarapari, Espírito Santo. A URL de referência é: ${url}`;
    }
  } else {
    articleContent = url.trim().slice(0, 8000);
  }

  const openai = new OpenAI({
    ...(baseURL ? { baseURL } : {}),
    apiKey,
  });

  const VALID_TAGS = ["lugares", "experiencias", "gastronomia", "hospedagem", "natureza", "turismo", "cultura", "aventura"];

  const prompt = `Você é um redator especialista em turismo da região da Rota da Ferradura em Guarapari, Espírito Santo, Brasil.

Com base no seguinte conteúdo extraído de uma página web, reescreva e crie uma matéria jornalística original, envolvente e de alta qualidade para o site "Refúgio da Ferradura".

IMPORTANTE:
- Reescreva completamente com suas próprias palavras, não copie o texto original
- Use linguagem sofisticada e editorial, como uma revista de viagens premium
- O conteúdo deve ser em português brasileiro
- Focado em turismo, natureza, gastronomia ou cultura da região
- Inclua detalhes que tornem o artigo rico e informativo
- O HTML do conteúdo deve ter parágrafos com <p>, subtítulos com <h2>, e listas com <ul><li> quando apropriado

Tags disponíveis: lugares, experiencias, gastronomia, hospedagem, natureza, turismo, cultura, aventura

Conteúdo de referência:
${articleContent}

Responda APENAS com JSON válido no formato:
{
  "title": "Título atraente do artigo",
  "excerpt": "Resumo em 1-2 frases para preview (sem HTML)",
  "content": "Conteúdo completo em HTML com parágrafos, subtítulos e formatação rica",
  "tags": ["tag1", "tag2"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawContent = completion.choices[0]?.message?.content ?? "";

    let generated: { title: string; excerpt: string; content: string; tags: string[] };
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
      title: generated.title,
      excerpt: generated.excerpt,
      content: generated.content,
      tags: JSON.stringify(finalTags),
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
