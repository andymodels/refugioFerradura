import { Router } from "express";

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
            const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch) {
              articleContent = bodyMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
      content: articleContent,
      excerpt: articleContent.substring(0, 200),
      content: articleContent,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
