import { spawn } from "node:child_process";
import { findClaudeBin } from "./config.mjs";

// Chama o Claude Code local (usa a assinatura atual: sem API paga).
export function rodarClaude(prompt, { cwd, ferramentas = "", maxTurns = 3, timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "json", "--max-turns", String(maxTurns)];
    if (ferramentas) args.push("--allowed-tools", ferramentas);
    const p = spawn(findClaudeBin(), args, { cwd, env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("Claude Code: tempo esgotado")); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out) return reject(new Error(`Claude Code saiu com ${code}: ${err.slice(0, 300)}`));
      try {
        const env = JSON.parse(out);
        if (env.is_error || env.result === undefined) {
          const det = env.result ?? env.error ?? (Array.isArray(env.errors) ? env.errors.join("; ") : "");
          return reject(new Error(`Claude Code (${env.subtype || "sem subtipo"}): ${String(det).slice(0, 300)}`));
        }
        resolve(String(env.result));
      } catch {
        reject(new Error(`Resposta do Claude Code ilegível: ${out.slice(0, 200)}`));
      }
    });
  });
}

export function extrairJson(texto) {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const m = limpo.match(/[\[{][\s\S]*[\]}]/);
  return JSON.parse(m ? m[0] : limpo);
}

// Avaliação visual: o Claude olha cada imagem (ferramenta Read) e dá nota.
// `itens` = [{ nomeArquivo (relativo a cwd), legenda }]
export async function avaliarImagens(itens, { cwd, lugar }) {
  const lista = itens.map((i, n) => `${n + 1}. ${i.nomeArquivo}${i.legenda ? ` (legenda do post: "${i.legenda.slice(0, 120).replace(/\n/g, " ")}")` : ""}`).join("\n");
  const prompt = `Você avalia fotos do Instagram oficial de "${lugar}" (turismo rural, Rota da Ferradura, Guarapari) para ilustrar uma matéria de blog.
Abra CADA imagem abaixo com a ferramenta Read e avalie. Imagens (arquivos na pasta atual):
${lista}

Critérios:
- ACEITAR fotos reais do lugar: pratos e bebidas, ambiente (com ou sem pessoas ao fundo ou em cena), fachada, quartos, área de lazer, paisagem e vista.
- REJEITAR: cartaz, flyer, arte de promoção ou convite em que o TEXTO domina a imagem; print de tela; meme; imagem borrada, escura ou de baixa qualidade; foto de outro assunto (que não é o lugar).
- Pessoas: NÃO rejeite só por ter gente (ambiente com pessoas ao fundo, em mesas, passeando ou de costas é ÓTIMO para turismo). Mas se uma ou duas pessoas ocupam boa parte do quadro, ou o rosto é o assunto da foto (retrato, selfie, cliente ou funcionário posando ou em close), a cena é "pessoas" e a nota é NO MÁXIMO 5, salvo se a pessoa for essencial ao que o lugar oferece e o ambiente também aparecer bem.
- Texto discreto sobreposto (ex.: nome do prato) é aceitável, mas desconte 1 a 2 pontos.
- nota: 1 a 10 (10 = foto excelente, nítida, bonita e útil para turismo). cena: uma de prato, ambiente, fachada, hospedagem, paisagem, atividade, pessoas, cartaz, outro.

Responda SOMENTE com JSON, sem texto extra, um item por imagem na mesma ordem:
[{"arquivo":"<nome>","ok":true|false,"nota":<1-10>,"cena":"<cena>","motivo":"<até 12 palavras>"}]`;
  const texto = await rodarClaude(prompt, { cwd, ferramentas: "Read", maxTurns: itens.length + 4, timeoutMs: 420000 });
  const arr = extrairJson(texto);
  if (!Array.isArray(arr)) throw new Error("avaliação sem lista");
  return arr;
}

export async function escreverArtigo(topic, { cwd, erros = null, anterior = null }) {
  const f = topic.fatos;
  const prompt = `Você é redator do blog do Refúgio da Ferradura (Rota da Ferradura, Guarapari-ES). Escreva um DESTAQUE curto e verdadeiro sobre o lugar abaixo, usando SOMENTE os fatos fornecidos.

FATOS (JSON):
${JSON.stringify({ nome: f.nome, categoria: f.categoria, regiao: f.regiao, descricaoCurta: f.descricaoCurta, tags: f.tags, endereco: f.endereco, materia: f.materia, fonteTexto: f.fonteTexto }, null, 1)}

REGRAS (todas obrigatórias):
- O título COMEÇA com o nome exato "${f.nome}".
- Português do Brasil natural, tom informativo e acolhedor, sem exagero publicitário. 4 a 5 seções, cada uma com um intertítulo curto e específico e um parágrafo. Total entre 180 e 350 palavras.
- Só afirme o que está nos FATOS. Nada de detalhes inventados (cores, louças, clima, sensações, quantidade de pessoas, preços). Se um dado não está nos fatos, não escreva.
- Números (anos, horários, distâncias, capacidades) só se estiverem EXATAMENTE nos fatos.
- NÃO escreva telefone, WhatsApp, e-mail, endereço completo, links nem @ (o bloco de Serviço é montado pelo sistema).
- PROIBIDO travessão (— ou –): use ponto, vírgula ou duas frases.
- NÃO cite avaliações, notas, estrelas, Google, nem relatos de hóspedes ou clientes.
- NÃO mencione fotos nem "veja as imagens".
- paragraphHtml é texto simples com no máximo <strong> e <em>.
${erros ? `\nSUA VERSÃO ANTERIOR FOI REJEITADA PELOS MOTIVOS ABAIXO. Corrija todos:\n- ${erros.join("\n- ")}\n` : ""}
Responda SOMENTE com JSON, sem texto extra:
{"title":"...","subtitle":"uma frase","excerpt":"1 a 2 frases","metaDescription":"até 155 caracteres","sections":[{"heading":"...","paragraphHtml":"..."}]}`;
  const texto = await rodarClaude(prompt, { cwd, ferramentas: "", maxTurns: 6, timeoutMs: 300000 });
  return extrairJson(texto);
}
