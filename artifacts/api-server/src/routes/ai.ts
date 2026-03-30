import { Router } from "express";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post("/generate-from-url", async (req, res) => {
  try {
    const { url } = req.body;

    let articleContent = "";

    const isUrl = /^https?:\/\/ /i.test(url.trim());

    if (isUrl) {
      try {
        const fetchRes = await fetch(url.trim(), {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "text/html",
            "Accept-Language": "pt-BR",
          },
        });

        if (fetchRes.ok) {
          const html = await fetchRes.text();

          const dom = new JSDOM(html, { url });
          const reader = new Readability(dom.window.document);
          const article = reader.parse();

          if (article && article.textContent) {
            articleContent = article.textContent.trim();
          }
        }
      } catch (e) {
        console.log("Erro ao buscar URL");
      }
    }

    if (!articleContent) {
      articleContent = `Gere um artigo turístico profissional com base neste link: ${url}`;
    }


    const prompt = `
Responda APENAS em JSON válido no formato:

{
  "title": "...",
  "subtitle": "...",
  "content": "...",
  "seo": "..."
}

Regras:
- Use texto simples com parágrafos separados por linha em branco
- Estruture o texto em seções

- Não use markdown
- Não use **asteriscos**
- Não explique nada
- Apenas JSON puro

Formate o conteúdo em HTML usando <h2>, <p> e <strong>.

Conteúdo base:
${articleContent}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
    });

    let parsed;

    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (e) {
      return res.status(500).json({ error: "Erro ao interpretar resposta da IA" });
    }

    return res.json({
      title: parsed.title,
      subtitle: parsed.subtitle,
      content: parsed.subtitle + "\n\n" + parsed.content,
      excerpt: parsed.content.substring(0, 200),
      description: parsed.seo,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
