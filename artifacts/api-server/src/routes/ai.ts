import { Router } from "express";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const router = Router();

router.post("/generate-from-url", async (req, res) => {
  try {
    const { url } = req.body;

    let articleContent = "";

    const isUrl = /^https?:\/\//i.test(url.trim());

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

      if (!articleContent) {
        articleContent = `Gere um artigo baseado neste link: ${url}`;
      }
    }

    return res.json({
      title: "Artigo gerado",
      content: articleContent,
      excerpt: articleContent.substring(0, 200),
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
