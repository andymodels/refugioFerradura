import { Router, type IRouter } from "express";
import { generateArticle, type ExtractionFailure } from "../lib/article-generation";

const router: IRouter = Router();

router.post("/generate-from-url", async (req, res) => {
  const input: string = (req.body.url || "").trim();
  const extraInstructions: string = (req.body.instructions || "").trim();

  try {
    const article = await generateArticle(input, extraInstructions || undefined);
    res.json(article);
  } catch (e: any) {
    if (typeof e?.blocked === "boolean") {
      const failure = e as ExtractionFailure;
      res.status(422).json({ error: failure.message, blocked: failure.blocked });
      return;
    }
    res.status(500).json({ error: "Erro na geração com IA: " + e.message });
  }
});

export default router;
