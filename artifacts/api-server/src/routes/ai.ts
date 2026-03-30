import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

router.post("/generate-from-url", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: "Chave não encontrada no Render" });
  }

  const genAI = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
  });

  const prompt = `Aja como um redator. Escreva sobre: ${req.body.url}. Responda em JSON: {"title": "...", "subtitle": "...", "excerpt": "...", "content": "...", "metaDescription": "..."}`;

  try {
    const ai = await genAI.chat.completions.create({
      model: "gemini-1.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    res.json(JSON.parse(ai.choices[0].message.content || "{}"));
  } catch (e) {
    res.status(500).json({ error: "Erro na API do Gemini" });
  }
});

export default router;
