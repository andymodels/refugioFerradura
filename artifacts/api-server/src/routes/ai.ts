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

  const systemPrompt = `Você é um redator especialista em turismo regional brasileiro.

CONTEXTO OBRIGATÓRIO — leia com atenção antes de escrever qualquer coisa:
- "Refúgio da Ferradura" é um SITE DE TURISMO da Rota da Ferradura, em Guarapari, ES, Brasil.
- NÃO é um hotel, pousada, resort, chalé, local de hospedagem ou estabelecimento físico de qualquer tipo.
- O site funciona como um guia editorial da região: divulga atrações naturais, praias, trilhas, gastronomia local, experiências culturais, eventos e serviços turísticos da Rota da Ferradura.
- Todo conteúdo deve ser escrito na perspectiva de quem RECOMENDA e APRESENTA a região ao visitante, nunca como se o próprio Refúgio da Ferradura oferecesse hospedagem ou serviços físicos.
- Sempre escreva em Português do Brasil, tom editorial sofisticado e acolhedor.`;

  const userPrompt = `Com base no conteúdo abaixo, crie um artigo para o site Refúgio da Ferradura.
Lembre-se: o Refúgio da Ferradura é um site de turismo da região — não um hotel nem estabelecimento físico.
O artigo deve falar sobre a REGIÃO (atrações, natureza, gastronomia, cultura, experiências) como um guia editorial.

RESPONDA APENAS EM JSON válido, sem nenhum texto fora do JSON:
{
  "title": "Título do artigo",
  "subtitle": "Subtítulo ou chamada",
  "excerpt": "Resumo de 2 a 3 frases para listagem",
  "content": "Conteúdo completo em HTML (use <h2>, <p>, <ul>, <li>)",
  "metaDescription": "Até 160 caracteres para SEO",
  "tags": ["turismo"]
}

CONTEÚDO DE REFERÊNCIA:
${content}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });
    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (e) {
    res.status(500).json({ error: "Erro na geração" });
  }
});

export default router;
