import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const router: IRouter = Router();

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
];

async function extractArticleContent(url: string): Promise<{ text: string; blocked: boolean }> {
  for (const userAgent of USER_AGENTS) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) continue;

      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      const text = article?.textContent?.replace(/\s+/g, " ").trim() || "";

      if (text.length > 200) {
        return { text: text.slice(0, 12000), blocked: false };
      }
    } catch {
      continue;
    }
  }

  return { text: "", blocked: true };
}

router.post("/generate-from-url", async (req, res) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const input: string = req.body.url || "";
  const isUrl = input.startsWith("http");

  let sourceText = input;
  let blocked = false;

  if (isUrl) {
    const result = await extractArticleContent(input);
    sourceText = result.text;
    blocked = result.blocked;
  }

  // Se for URL mas não extraiu conteúdo suficiente, retorna aviso claro
  if (isUrl && sourceText.length < 200) {
    res.status(422).json({
      error: blocked
        ? "O site bloqueou a leitura automática. Abra o artigo no navegador, selecione todo o texto (Ctrl+A), copie e cole diretamente no campo de geração."
        : "Não foi possível extrair conteúdo suficiente do link. Tente colar o texto do artigo diretamente no campo.",
      blocked,
    });
    return;
  }

  const systemPrompt = `Você é um editor de conteúdo especialista em turismo regional brasileiro.

REGRAS ABSOLUTAS — nunca as quebre:
1. Use APENAS informações presentes no texto-fonte fornecido. NUNCA invente fatos, números, nomes de lugares, eventos ou serviços que não estejam no texto original.
2. Se uma informação não estiver no texto-fonte, simplesmente não a inclua no artigo.
3. Reescreva com suas próprias palavras, mas mantendo fidelidade total aos fatos do texto original.
4. "Refúgio da Ferradura" é um SITE DE TURISMO da Rota da Ferradura, Guarapari - ES. NÃO é um hotel, pousada, resort ou estabelecimento físico.
5. Escreva na perspectiva de quem recomenda e apresenta a região ao visitante.
6. Sempre em Português do Brasil, tom editorial sofisticado e acolhedor.`;

  const userPrompt = `Reescreva o conteúdo abaixo como um artigo editorial para o site Refúgio da Ferradura.

ATENÇÃO CRÍTICA:
- Baseie-se EXCLUSIVAMENTE nos fatos, lugares, serviços e informações presentes no texto-fonte abaixo.
- NÃO adicione informações que não existam no texto original.
- NÃO invente atrações, preços, horários ou detalhes não mencionados.
- Se o texto mencionar locais específicos, use-os. Se não mencionar, não invente.

RESPONDA APENAS EM JSON válido:
{
  "title": "Título atraente baseado no conteúdo real do texto",
  "subtitle": "Subtítulo complementar ao título",
  "excerpt": "Resumo de 2 a 3 frases fiéis ao conteúdo",
  "content": "Artigo completo em HTML usando <h2>, <p>, <ul>, <li> — baseado exclusivamente no texto-fonte",
  "metaDescription": "Até 160 caracteres para SEO, fiel ao conteúdo",
  "tags": ["turismo"]
}

TEXTO-FONTE ORIGINAL:
${sourceText}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    res.json(JSON.parse(completion.choices[0].message.content || "{}"));
  } catch (e: any) {
    res.status(500).json({ error: "Erro na geração com IA: " + e.message });
  }
});

export default router;
