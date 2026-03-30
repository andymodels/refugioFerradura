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
  } catch (e) {
    return "";
  }
}

router.post("/generate-from-url", async (req, res) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const content = req.body.url.startsWith("http") ? await extractArticleContent(req.body.url) : req.body.url;

  const prompt = `Você é um redator de turismo. Com base no conteúdo abaixo, crie um artigo sofisticado para o site "Refúgio da Ferradura".
  RESPONDA APENAS EM JSON:
  {
    "title": "Título",
    "subtitle": "Subtítulo",
    "excerpt": "Resumo",
    "content": "Conteúdo em HTML",
    "metaDescription": "SEO",
    "tags": ["turismo"]
  }
  CONTEÚDO: ${content}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (e) {
    res.status(500).json({ error: "Erro na geração" });
  }
});

export default router;
