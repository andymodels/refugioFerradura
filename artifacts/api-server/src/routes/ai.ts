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

  // If the input looks like a URL, try to fetch it. Otherwise use it directly as text.
  const isUrl = /^https?:\/\//i.test(url.trim());

  if (isUrl) {
    try {
      const fetchRes = await fetch(url.trim(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "Connection": "keep-alive"
        }
      });
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (fetchRes.ok) {
        const html = await fetchRes.text();
        articleContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      } else {
        req.log.warn({ url, status: fetchRes.status }, "URL fetch returned non-OK status");
      }
    } catch (e) {
      req.log.warn({ url, error: e }, "Failed to fetch URL content");
    }

    if (!articleContent) {
      articleContent = `Gere um artigo de turismo sobre a região da Rota da Ferradura em Guarapari, Espírito Santo. A URL de referência é: ${url}`;
    }
  } else {
    // Raw text mode — use directly as article content
    articleContent = url.trim().slice(0, 8000);
  }

  const openai = new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });

  const VALID_TAGS = ["lugares", "experiencias", "gastronomia", "hospedagem", "natureza", "turismo", "cultura", "aventura"];

  const prompt = `Você é um redator especialista em turismo da região da Rota da Ferradura em Guarapari, Espírito Santo, Brasil. 
  
Com base no seguinte conteúdo extraído de uma página web, reescreva e crie uma matéria jornalística original, envolvente e de alta qualidade para o site "Refúgio da Ferradura". 

IMPORTANTE: 
- Reescreva completamente com suas próprias palavras, não copie o texto original
- Use linguagem sofisticada e editorial, como uma revista de viagens premium
- O conteúdo deve ser em português brasileiro
- Focado em turismo, natureza, gastronomia ou cultura da região
- Inclua detalhes que tornem o artigo rico e informativo
- O HTML do conteúdo deve ter parágrafos com <p>, subtítulos com <h2>, e listas com <ul><li> quando apropriado

Tags disponíveis: lugares, experiencias, gastronomia, hospedagem, natureza, turismo, cultura, aventura

Conteúdo de referência:
${articleContent}

Responda APENAS com JSON válido no formato:
{
  "title": "Título atraente do artigo",
  "excerpt": "Resumo em 1-2 frases para preview (sem HTML)",
  "content": "Conteúdo completo em HTML com parágrafos, subtítulos e formatação rica",
  "tags": ["tag1", "tag2"]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";

  let generated: { title: string; excerpt: string; content: string; tags: string[] };
  try {
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    generated = JSON.parse(jsonMatch[0]);
  } catch (e) {
    req.log.error({ error: e, rawContent }, "Failed to parse AI response");
    res.status(500).json({ error: "Falha ao processar resposta da IA" });
    return;
  }

  // Normalize tags: filter to valid values, fallback to ["turismo"]
  const rawTags = Array.isArray(generated.tags) ? generated.tags : [];
  const validTags = rawTags.filter((t: string) => VALID_TAGS.includes(t));
  const finalTags = validTags.length > 0 ? validTags : ["turismo"];

  res.json(GenerateFromUrlResponse.parse({
    title: generated.title,
    excerpt: generated.excerpt,
    content: generated.content,
    tags: JSON.stringify(finalTags),
  }));
});

export default router;
