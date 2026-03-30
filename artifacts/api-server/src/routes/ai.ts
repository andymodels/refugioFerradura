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
      return res.status(400).json({ error: "Não foi possível extrair conteúdo" });
    }

    const prompt = `
Reescreva o conteúdo abaixo como um artigo turístico profissional.

Crie:
- Título chamativo
- Subtítulo
- Texto organizado em parágrafos
- Descrição SEO com até 160 caracteres

Conteúdo:
${articleContent}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const result = response.choices[0].message.content;

    return res.json({
      title: "Gerado pela IA",
      content: result,
      excerpt: result.substring(0, 200),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
