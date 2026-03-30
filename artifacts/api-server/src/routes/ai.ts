import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const router: IRouter = Router();

async function extractArticleContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent?.replace(/\s+/g, " ").trim().slice(0, 8000) || "";
  } catch (e) { return url; }
}

router.post("/generate-from-url", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const content = req.body.url.startsWith("http") ? await extractArticleContent(req.body.url) : req.body.url;

  const genAI = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  const prompt = `Você é um redator de turismo de luxo para o site "Refúgio da Ferradura".
  Com base no conteúdo abaixo, crie um artigo sofisticado.
  RESPONDA APENAS EM JSON:
  {
    "title": "Título impactante",
    "subtitle": "Frase poética curta",
    "excerpt": "Resumo para a Home",
    "content": "Conteúdo completo em HTML",
    "metaDescription": "Descrição SEO"
  }
  CONTEÚDO: ${content}`;

  try {
    const ai = await genAI.chat.completions.create({
      model: "gemini-1.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    res.json(JSON.parse(ai.choices[0].message.content || "{}"));
  } catch (e) { res.status(500).json({ error: "Erro no Gemini" }); }
});

export default router;
