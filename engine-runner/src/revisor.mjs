// Revisor independente (modelo do blog UM2TRÊS: docs/blog-revisor.md).
//
// Quem escreve a matéria e a legenda NUNCA é quem aprova. Cada rodada é uma chamada
// NOVA do Claude Code, sem o contexto do redator, que recebe só o produto pronto
// (legenda, texto da matéria, slides) e as fontes. Até 3 rodadas: o revisor devolve
// o texto corrigido, o motor aplica e outro revisor novo confere de novo.
//
// Regra de segurança: se o revisor não puder rodar (limite de uso, resposta ilegível),
// NADA entra na fila. Antes era "sem revisão"; agora é "sem revisão, sem publicação".
import fs from "node:fs";
import path from "node:path";
import { rodarClaude, extrairJson } from "./claude.mjs";
import { log } from "./log.mjs";

const MAX_RODADAS = 3;

export class ReprovadoError extends Error {
  constructor(msg, relatorio) { super(msg); this.name = "ReprovadoError"; this.relatorio = relatorio; }
}

const semTags = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ultimoParagrafo = (t) => String(t).trim().split(/\n\s*\n/).pop().trim();

function montarPrompt({ tipo, hoje, nSlides, rodada, anterior }) {
  const ehMateria = tipo === "destaque";
  return `Você é o REVISOR INDEPENDENTE do Instagram e do blog Guia Refúgio Ferradura (turismo rural, Rota da Ferradura, Guarapari, ES). Você NÃO escreveu isto e não vê o raciocínio de quem escreveu: sua função é impedir que algo errado, inventado ou fraco seja publicado. Hoje é ${hoje}. Esta é a rodada ${rodada} de ${MAX_RODADAS}.

ENTRADA (na pasta atual): "revisao-entrada.json" (fontes, legenda${ehMateria ? ", texto da matéria" : ""}) e os slides "slide-1.jpg" a "slide-${nSlides}.jpg". Leia o JSON e ABRA CADA SLIDE com a ferramenta Read.

REGRAS (cada uma já reprovaria um post):
1. NADA ALÉM DAS FONTES. Todo fato (preço, horário, prato, comodidade, promoção, evento, distância, número) precisa estar em "fontes". Fato que não está nas fontes: remova. Nada de causalidade inventada ("por isso"), nem "quase sempre", "geralmente".
2. DATA E VALIDADE. Evento, promoção, cardápio sazonal ou preço que já passou ou que não dá para confirmar: remova ou troque por "confirme direto com o perfil". Prévia ("vai ter") não vira fato ("teve").
3. NÃO use avaliação, comentário ou relato de hóspede, cliente ou seguidor como fonte de fato.
4. A legenda só promete o que os slides entregam. Nome do lugar e @ do perfil exatos como nas fontes.
5. ESTILO: português correto, tom acolhedor e concreto, sem alarmismo, sem clichê ("imperdível", "aconchegante", "experiência inesquecível"), sem travessão, sem estrutura de frase repetida.
6. SLIDES (abra cada um): reprove o que estiver borrado, mal cortado, com texto cortado, com cartaz/promoção/data vencida, com pessoa em primeiro plano, repetido, ou que não mostre o lugar descrito.
${ehMateria ? "7. MATÉRIA: título, subtítulo e cada seção seguem as mesmas regras 1 a 5; o texto não pode repetir parágrafos das matérias anteriores listadas em \"fontes.anteriores\".\n" : ""}
GRAVIDADE: "bloqueante" = erro factual, algo inventado, data vencida, slide ruim, promessa que o slide não cumpre. "sugestao" = gosto/estilo menor. REPROVE (veredito "REPROVADO") SOMENTE se houver ao menos um problema bloqueante. Sugestão sozinha não reprova.
${anterior ? `\nRODADA ANTERIOR (outro revisor): ${JSON.stringify(anterior).slice(0, 1500)}\nConfira se os bloqueantes foram realmente resolvidos; não aceite a palavra do redator.\n` : ""}
CORREÇÕES: quando o problema for só de TEXTO, devolva o texto corrigido (o motor aplica). Mantenha a última linha da legenda (hashtags) e a frase "Link na bio" exatamente como estão. Se o problema for um SLIDE ruim ou o lugar não serve, NÃO tente consertar: liste em "slides_ruins" (números) ou marque "sem_conserto": true.

Responda SOMENTE com JSON:
{"veredito":"APROVADO"|"REPROVADO","problemas":[{"onde":"legenda|titulo|subtitulo|secao N|slide N","gravidade":"bloqueante|sugestao","problema":"...","correcao":"..."}],"caption_corrigida":string|null,"artigo_correcoes":[{"onde":"title"|"subtitle"|"sections.N.heading"|"sections.N.paragraphHtml","para":"texto novo completo desse campo"}],"slides_ruins":[numeros],"sem_conserto":false}`;
}

function aplicarArtigo(artigo, correcoes) {
  const novo = JSON.parse(JSON.stringify({ ...artigo, selecionadas: undefined, topic: undefined }));
  let n = 0;
  for (const c of correcoes || []) {
    const para = typeof c?.para === "string" ? c.para.trim() : "";
    if (!para) continue;
    const m = String(c.onde).match(/^(title|subtitle)$|^sections\.(\d+)\.(heading|paragraphHtml)$/);
    if (!m) continue;
    if (m[1]) { novo[m[1]] = para; n++; }
    else if (novo.sections?.[Number(m[2])]) { novo.sections[Number(m[2])][m[3]] = para; n++; }
  }
  return { novo, n };
}

// `fontes`: objeto livre com tudo o que o redator tinha (fatos do lugar, novidades do perfil, matérias anteriores).
// `validarArtigo(artigo)`: callback que roda a validação do servidor (dry-run) e devolve true/false.
export async function revisarProducao({ dir, tipo, fontes, caption, artigo = null, nSlides, hoje, validarArtigo = null }) {
  let capAtual = caption;
  let artAtual = artigo; // objeto completo (com selecionadas/topic) ou null
  const rodadas = [];
  let anterior = null;
  for (let r = 1; r <= MAX_RODADAS; r++) {
    fs.writeFileSync(path.join(dir, "revisao-entrada.json"), JSON.stringify({
      tipo,
      fontes,
      legenda: capAtual,
      materia: artAtual ? { title: artAtual.title, subtitle: artAtual.subtitle, sections: (artAtual.sections || []).map((s, i) => ({ n: i, heading: s.heading, paragraphHtml: s.paragraphHtml, texto: semTags(s.paragraphHtml) })) } : null,
    }, null, 1));
    let res;
    try {
      res = extrairJson(await rodarClaude(montarPrompt({ tipo, hoje, nSlides, rodada: r, anterior }), { cwd: dir, ferramentas: "Read", maxTurns: nSlides + 6, timeoutMs: 420000 }));
    } catch (e) {
      if (e.name === "LimiteClaudeError") throw e;
      throw new Error(`revisor indisponível (nada será enfileirado): ${String(e.message).slice(0, 160)}`);
    }
    if (res.veredito !== "APROVADO" && res.veredito !== "REPROVADO") throw new Error("revisor devolveu veredito inválido (nada será enfileirado)");
    const problemas = Array.isArray(res.problemas) ? res.problemas : [];
    const bloqueantes = problemas.filter((p) => p?.gravidade === "bloqueante");
    // Coerência: aprovação com bloqueante, ou reprovação sem bloqueante, conta como reprovação cautelosa só no primeiro caso.
    const aprovado = res.veredito === "APROVADO" && bloqueantes.length === 0;
    rodadas.push({ rodada: r, veredito: aprovado ? "APROVADO" : "REPROVADO", problemas });
    log("revisor_rodada", { rodada: r, veredito: aprovado ? "APROVADO" : "REPROVADO", bloqueantes: bloqueantes.length, problemas: problemas.map((p) => `${p.onde}: ${String(p.problema).slice(0, 80)}`).slice(0, 6) });
    console.log(`  revisor, rodada ${r}: ${aprovado ? "APROVADO" : "REPROVADO"}${problemas.length ? ` (${bloqueantes.length} bloqueante(s), ${problemas.length - bloqueantes.length} sugestão(ões))` : ""}`);
    if (aprovado) {
      const relatorio = { rodadas: r, resumo: rodadas };
      fs.writeFileSync(path.join(dir, "revisao.json"), JSON.stringify(relatorio, null, 1));
      return { caption: capAtual, artigo: artAtual, relatorio };
    }
    const relatorioFalha = { rodadas: r, resumo: rodadas };
    if ((res.slides_ruins || []).length || res.sem_conserto) {
      fs.writeFileSync(path.join(dir, "revisao.json"), JSON.stringify(relatorioFalha, null, 1));
      throw new ReprovadoError(`revisor reprovou sem conserto: ${bloqueantes.map((p) => `${p.onde}: ${String(p.problema).slice(0, 90)}`).join(" | ").slice(0, 300) || "slides ruins " + (res.slides_ruins || []).join(",")}`, relatorioFalha);
    }
    // Aplica as correções de texto e deixa OUTRO revisor novo conferir.
    let mudou = false;
    if (typeof res.caption_corrigida === "string" && res.caption_corrigida.trim() && res.caption_corrigida.trim() !== capAtual.trim()) {
      const c = res.caption_corrigida.trim();
      const okFecho = ultimoParagrafo(c) === ultimoParagrafo(capAtual) && /Link na bio/.test(c) && c.length >= 10 && c.length <= 2200;
      if (okFecho) { capAtual = c; mudou = true; } else console.log("    correção de legenda ignorada (mexeu no fechamento ou no tamanho)");
    }
    if (artAtual && Array.isArray(res.artigo_correcoes) && res.artigo_correcoes.length) {
      const { novo, n } = aplicarArtigo(artAtual, res.artigo_correcoes);
      if (n) {
        const valido = validarArtigo ? await validarArtigo(novo) : true;
        if (valido) { artAtual = { ...artAtual, ...novo, selecionadas: artAtual.selecionadas, topic: artAtual.topic }; mudou = true; }
        else console.log("    correção da matéria recusada pela validação do servidor");
      }
    }
    if (!mudou) {
      fs.writeFileSync(path.join(dir, "revisao.json"), JSON.stringify(relatorioFalha, null, 1));
      throw new ReprovadoError(`revisor reprovou e não houve correção aplicável: ${bloqueantes.map((p) => `${p.onde}: ${String(p.problema).slice(0, 90)}`).join(" | ").slice(0, 300)}`, relatorioFalha);
    }
    anterior = { rodada: r, bloqueantes: bloqueantes.map((p) => ({ onde: p.onde, problema: p.problema })) };
  }
  const relatorio = { rodadas: MAX_RODADAS, resumo: rodadas };
  fs.writeFileSync(path.join(dir, "revisao.json"), JSON.stringify(relatorio, null, 1));
  throw new ReprovadoError(`revisor reprovou nas ${MAX_RODADAS} rodadas`, relatorio);
}
