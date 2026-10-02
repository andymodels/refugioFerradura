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
export async function avaliarImagens(itens, { cwd, lugar, categoria, cenasNucleo }) {
  const lista = itens.map((i, n) => `${n + 1}. ${i.nomeArquivo}${i.legenda ? ` (legenda do post: "${i.legenda.slice(0, 120).replace(/\n/g, " ")}")` : ""}`).join("\n");
  const prompt = `Você avalia fotos do Instagram oficial de "${lugar}" (categoria: ${categoria}; turismo rural, Rota da Ferradura, Guarapari) para ilustrar e VENDER esse lugar numa matéria de blog.
Abra CADA imagem abaixo com a ferramenta Read e avalie. Imagens (arquivos na pasta atual):
${lista}

Seja EXIGENTE: uma nota alta significa que a foto realmente ajuda a explicar ou vender este tipo de lugar.

cena (escolha UMA): prato, bebida, ambiente (interior ou exterior do estabelecimento com mesas, decoração, clima), fachada (frente/entrada), hospedagem (chalé, quarto, cama, acomodação), area_lazer (piscina, deque, playground, estrutura de lazer), paisagem (vista, natureza), ponto (o próprio atrativo: cachoeira, mirante, trilha), producao (produção, processo, plantação, animais), produto (produtos à venda), atividade (atividade em andamento), pessoas (retrato/close de pessoas), cartaz (arte/flyer/convite), detalhe (objeto ou decoração solta, sem mostrar o lugar), outro.
Para esta categoria as cenas que realmente mostram o lugar são: ${cenasNucleo.join(", ")}.

texto_sobreposto: true se há texto ou gráfico ADICIONADO digitalmente sobre a imagem (legenda de story, "Bom dia!!!", promoção, convite, nome do prato escrito, logotipo digital, selo). Letreiros e placas FÍSICOS que fazem parte da cena NÃO contam. Se texto_sobreposto = true, a nota é NO MÁXIMO 4.

Outras regras de nota:
- REJEITAR (nota até 3): cartaz/flyer/arte de promoção, print de tela, meme, imagem borrada, escura ou de baixa qualidade, foto de outro assunto.
- Pessoas: NÃO penalize só por haver gente (ambiente com pessoas ao fundo, em mesas, passeando ou de costas é ótimo). Mas retrato, selfie ou close de cliente/funcionário em primeiro plano: cena "pessoas", nota NO MÁXIMO 5.
- Objeto ou decoração solta que não mostra o lugar (cena "detalhe"): nota NO MÁXIMO 6.
- Nota 8 a 10: foto nítida, bonita, sem texto, que mostra claramente o lugar (prato apetitoso, chalé ou quarto, fachada, vista do ponto, ambiente completo).
- descricao: UMA frase curta e FACTUAL do que aparece (não invente nomes nem detalhes que não se veem).

Responda SOMENTE com JSON, sem texto extra, um item por imagem na mesma ordem:
[{"arquivo":"<nome>","nota":<0-10>,"cena":"<cena>","texto_sobreposto":true|false,"descricao":"<até 15 palavras>","motivo":"<até 12 palavras>"}]`;
  const texto = await rodarClaude(prompt, { cwd, ferramentas: "Read", maxTurns: itens.length + 4, timeoutMs: 480000 });
  const arr = extrairJson(texto);
  if (!Array.isArray(arr)) throw new Error("avaliação sem lista");
  return arr;
}

// `fotos` = imagens disponíveis para o corpo (a capa já está decidida):
// [{ n, cena, descricao }]. O Claude decide qual foto (se alguma) combina com
// cada seção; nunca força foto onde não combina.
export async function escreverArtigo(topic, { cwd, erros = null, capa, fotos }) {
  const f = topic.fatos;
  const [minSec, maxSec] = topic.regras.secoes;
  const [minPal, maxPal] = topic.regras.palavras;
  const listaFotos = fotos.map((x) => `${x.n}. [${x.cena}] ${x.descricao}`).join("\n");
  const prompt = `Você é redator do blog do Refúgio da Ferradura (Rota da Ferradura, Guarapari-ES). Escreva um DESTAQUE curto e verdadeiro sobre o lugar abaixo, usando SOMENTE os fatos fornecidos.

FATOS (JSON):
${JSON.stringify({ nome: f.nome, categoria: f.categoria, regiao: f.regiao, descricaoCurta: f.descricaoCurta, tags: f.tags, endereco: f.endereco, materia: f.materia, fonteTexto: f.fonteTexto }, null, 1)}

FOTOS (já escolhidas e verificadas; descrição factual do que mostram):
CAPA (já definida, não use em seção): [${capa.cena}] ${capa.descricao}
Fotos para as seções:
${listaFotos}

REGRAS (todas obrigatórias):
- O título COMEÇA com o nome exato "${f.nome}".
- Português do Brasil natural e informativo. MELHOR CURTO E BOM do que encher espaço: escreva de ${minSec} a ${maxSec} seções, SÓ quando houver fatos reais para cada uma (se os fatos sustentam só ${minSec}, escreva ${minSec}). Total entre ${minPal} e ${maxPal} palavras. Cada seção tem um intertítulo curto e específico e um parágrafo.
- O corpo da matéria APRESENTA o lugar e a experiência de estar lá: o que é, onde fica na Rota, o que oferece e como é a vivência, sempre com base nos fatos. NÃO transforme em regulamento: capacidade, diária mínima, regras de aluguel, o que está ou não incluído, taxas e condições são detalhe operacional (ficam no bloco Serviço, que o sistema monta). Se algum desses dados for realmente relevante, cite no máximo UMA frase curta, e nunca dedique uma seção inteira a isso.
- Só afirme o que está nos FATOS. Nada de detalhes inventados (cores, louças, clima, sensações, quantidade de pessoas, preços).
- NÃO use adjetivos de apreciação nem frases de efeito que não estejam nos fatos (nada de "charmoso", "aconchegante", "imperdível", "paraíso", "sossego", "tranquilo", "imponente" etc.). Descreva, não elogie.
- Números (anos, horários, distâncias, capacidades) só se estiverem EXATAMENTE nos fatos.
- NÃO escreva telefone, WhatsApp, e-mail, endereço completo, links nem @ (o bloco de Serviço é montado pelo sistema).
- PROIBIDO travessão (— ou –): use ponto, vírgula ou duas frases.
- NÃO cite avaliações, notas, estrelas, Google, nem relatos de hóspedes ou clientes.
- NÃO mencione fotos nem "veja as imagens".
- FOTO POR SEÇÃO: em cada seção, "imagem" é o NÚMERO da foto (da lista acima) que mostra exatamente o assunto daquela seção, ou null se nenhuma combina. Não force foto onde não combina; não repita foto; use a capa só como capa. Pelo menos ${Math.max(2, 0)} seções precisam ter foto que combine.
- paragraphHtml é texto simples com no máximo <strong> e <em>.
${erros ? `\nSUA VERSÃO ANTERIOR FOI REJEITADA PELOS MOTIVOS ABAIXO. Corrija todos:\n- ${erros.join("\n- ")}\n` : ""}
Responda SOMENTE com JSON, sem texto extra:
{"title":"...","subtitle":"uma frase","excerpt":"1 a 2 frases","metaDescription":"até 155 caracteres","sections":[{"heading":"...","paragraphHtml":"...","imagem":<número ou null>}]}`;
  const texto = await rodarClaude(prompt, { cwd, ferramentas: "", maxTurns: 6, timeoutMs: 300000 });
  return extrairJson(texto);
}
