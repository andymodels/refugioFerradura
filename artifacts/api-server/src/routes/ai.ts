import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { GenerateFromUrlBody, GenerateFromUrlResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/ai/generate-from-url", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = GenerateFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  let articleContent = "";
  try {
    const fetchRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RefugioDaFerradura/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (fetchRes.ok) {
      const html = await fetchRes.text();
      articleContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
    }
  } catch (e) {
    req.log.warn({ url, error: e }, "Failed to fetch URL content");
  }

  if (!articleContent) {
    articleContent = `Artigo sobre turismo referente à URL: ${url}`;
  }

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const prompt = `Você é um redator especialista em turismo da região da Rota da Ferradura em Guarapari, Espírito Santo, Brasil. 
  
Com base no seguinte conteúdo extraído de uma página web, reescreva e crie uma matéria jornalística original, envolvente e de alta qualidade para o site "Refúgio da Ferradura". 

IMPORTANTE: 
- Reescreva completamente com suas próprias palavras, não copie o texto original
- Use linguagem sofisticada e editorial, como uma revista de viagens premium
- O conteúdo deve ser em português brasileiro
- Focado em turismo, natureza, gastronomia ou cultura da região
- Inclua detalhes que tornem o artigo rico e informativo
- O HTML do conteúdo deve ter parágrafos com <p>, subtítulos com <h2>, e listas com <ul><li> quando apropriado

Conteúdo de referência:
${articleContent}

Responda APENAS com JSON válido no formato:
{
  "title": "Título atraente do artigo",
  "excerpt": "Resumo em 1-2 frases para preview (sem HTML)",
  "content": "Conteúdo completo em HTML com parágrafos, subtítulos e formatação rica",
  "category": "Uma categoria de: Turismo, Gastronomia, Natureza, Cultura, Aventura"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";

  let generated: { title: string; excerpt: string; content: string; category: string };
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    generated = JSON.parse(jsonMatch[0]);
  } catch (e) {
    req.log.error({ error: e, rawContent }, "Failed to parse AI response");
    res.status(500).json({ error: "Falha ao processar resposta da IA" });
    return;
  }

  res.json(GenerateFromUrlResponse.parse(generated));
});

export default router;
