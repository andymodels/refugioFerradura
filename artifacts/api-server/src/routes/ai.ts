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
    return article?.textContent?.replace(/\s+/g, " ").trim().slice(0, 6000) || "";
  } catch (e) { return ""; }
}

router.post("/generate-from-url", async (req, res) => {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API Key faltando" });

  const { url } = req.body;
  let content = url;
  if (url.startsWith("http")) content = await extractArticleContent(url);

  const openai = new OpenAI({ apiKey });
  const prompt = `Crie um artigo de turismo premium sobre a Rota da Ferradura (Guarapari/ES). 
  Responda APENAS JSON:
  {
    "title": "Título",
    "subtitle": "Frase poética",
    "excerpt": "Resumo curto",
    "content": "HTML com <h2> e <p>",
    "metaDescription": "Descrição SEO",
    "tags": "[\"turismo\", \"natureza\"]"
  }
  Ref: ${content}`;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    const data = JSON.parse(ai.choices[0].message.content || "{}");
    res.json(data);
  } catch (e) { res.status(500).json({ error: "Erro na IA" }); }
});

export default router;
