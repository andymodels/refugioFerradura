#!/usr/bin/env node
// Comando de PRODUÇÃO SEMANAL do Refúgio da Ferradura — roda NO MAC.
//
// Papel: o Mac/Claude produz tudo ANTES; a nuvem (fila + GitHub) só publica.
// Este comando olha os próximos N dias (padrão 7), vê quais ainda não têm item
// na fila e produz SÓ os que faltam. Para cada dia faltante:
//   pauta -> parceiros pelo rodízio -> fontes oficiais recentes (Instagram) ->
//   mídia (avaliada por imagem) -> capa com a foto do lugar -> (matéria em RASCUNHO se a
//   pauta é destaque) -> carrossel 4:5 no B2 -> legenda -> item na fila.
// No fim, a semana está pronta; o Mac pode ser desligado. Este comando NUNCA
// publica: a publicação é 100% da fila + GitHub.
//
// Uso:
//   node src/semana.mjs                      simulação (padrão): não grava nada no B2, banco nem fila
//   node src/semana.mjs --real               produz de verdade (B2 + rascunho + fila)
//   opções: --dias 7  --forcar-pauta almoco|blog  --so-dia AAAA-MM-DD  --snapshot arquivo.json
//   Se nenhuma pauta der certo num dia, entra a reserva: carrossel de uma matéria já publicada no blog.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ARGS = process.argv.slice(2);
const REAL = ARGS.includes("--real");
// O motor de mídia (run.mjs) decide gravar ou não pelo "--dry-run": na simulação, ligado.
if (!REAL && !ARGS.includes("--dry-run")) process.argv.push("--dry-run");
const val = (n) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : null; };
const DIAS = Number(val("--dias")) || 7;
const FORCAR = val("--forcar-pauta");
const SO_DIA = val("--so-dia");
const SNAPSHOT = val("--snapshot");

const exec = promisify(execFile);
const { CACHE_DIR, ensureDirs } = await import("./config.mjs");
const { api, apiFila } = await import("./api.mjs");
const { log, notify } = await import("./log.mjs");
const run = await import("./run.mjs"); // reaproveita coleta de mídia e redação do destaque
const { gerarCapaV2 } = await import("./capa-v2.mjs");
const { tamanho, versaoInstagram, enviarAoB2, baixar } = await import("./media.mjs");
const { rodarClaude, extrairJson } = await import("./claude.mjs");
const { enfileirar, listarFila } = await import("./fila.mjs");
const { montarHistorico, ordenar } = await import("./rodizio.mjs");

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.resolve(AQUI, "..", "..", "output", REAL ? "semana" : "semana-simulacao");
const SEM_MIDIA = path.join(CACHE_DIR, "semana-sem-midia.json");
const TZ = "America/Sao_Paulo";
const SCORE_UTIL = 7;
const DIA_MS = 86400000;

// ─── Calendário: um conteúdo por dia ────────────────────────────────────────
const HORARIO = { 0: "11:00", 6: "11:00" }; // fim de semana de manhã; demais dias 19:00
const horarioDe = (dow) => HORARIO[dow] || "19:00";
// O horário final depende da pauta: almoço de manhã, café à tarde, hospedagem à noite.
const HORA_PAUTA = { almoco: "10:00", cafe: "14:00", destaque: "12:00", natureza: "09:00", ficar: "19:00" };
const dataBRT = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const dowBRT = (d) => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d)];

function proximosDias(n, agora = new Date()) {
  const out = [];
  for (let i = 0; out.length < n && i < n + 3; i++) {
    const d = new Date(agora.getTime() + i * DIA_MS);
    const data = dataBRT(d), dow = dowBRT(d);
    const quando = `${data}T${horarioDe(dow)}:00-03:00`;
    if (new Date(quando).getTime() < agora.getTime() + 3 * 3600000) continue; // já passou ou é daqui a pouco
    out.push({ data, dow, quando });
  }
  return out;
}

// ─── Pautas ────────────────────────────────────────────────────────────────
// Títulos NEUTROS: nada de "neste domingo" etc. sem confirmar o funcionamento naquele dia nos perfis.
const PAUTAS = {
// titulo: nome da pauta (legenda e fila). reserva: título da capa se a IA não entregar um válido.
  destaque: { tipo: "destaque", n: 1, cats: ["restaurante_cafe", "hospedagem", "atracao", "cervejaria", "producao_rural", "comercio_servico"] },
  almoco: { tipo: "lugares", n: 3, cats: ["restaurante_cafe"], titulo: () => "Onde almoçar na Rota da Ferradura", rotulo: "ONDE ALMOÇAR", reserva: (n) => `${n} mesas para o *almoço*` },
  cafe: { tipo: "lugares", n: 3, cats: ["restaurante_cafe"], titulo: () => "Uma pausa para o café", rotulo: "CAFÉ", reserva: () => "Uma pausa para o *café*" },
  ficar: { tipo: "lugares", n: 3, cats: ["hospedagem"], titulo: () => "Onde ficar na Rota da Ferradura", rotulo: "ONDE FICAR", reserva: (n) => `${n} lugares para dormir no *verde*` },
  natureza: { tipo: "lugares", n: 3, cats: ["atracao", "producao_rural"], titulo: () => "Natureza e produção local", rotulo: "NATUREZA E PRODUÇÃO LOCAL", reserva: () => "O que sai da *terra* por aqui" },
};
// Sequência por dia da semana (0=dom). Não repete a pauta do dia anterior nem das últimas da fila.
// Desde 2026-10-24 todo dia é DESTAQUE de um parceiro só (pedido do usuário: nada de misturar parceiros).
// As pautas de vários lugares ficam só para uso manual com --forcar-pauta.
const POR_DIA = { 1: "destaque", 2: "destaque", 3: "destaque", 4: "destaque", 5: "destaque", 6: "destaque", 0: "destaque" };

function escolherPauta(dia) {
  if (FORCAR && PAUTAS[FORCAR]) return FORCAR;
  return POR_DIA[dia.dow];
}

// ─── Utilidades ────────────────────────────────────────────────────────────
const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return pad; } };
// takenAt pode vir como texto ISO ou como Date (fotos lidas agora do Instagram)
const dataIso = (d) => { if (!d) return null; const t = new Date(d); return isNaN(t) ? null : t.toISOString().slice(0, 10); };
const idadeDias = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / DIA_MS) : null);
const CATEGORIA_LABEL = { restaurante_cafe: "restaurante ou café", hospedagem: "hospedagem", atracao: "atração", cervejaria: "cervejaria", producao_rural: "produção rural", comercio_servico: "comércio ou serviço" };

async function carregarCandidatos() {
  if (SNAPSHOT) return lerJson(SNAPSHOT, []);
  const r = await api("/candidatos");
  if (r.status !== "ok") throw new Error(`lista de candidatos indisponível (${r.status || r.http}); use --snapshot`);
  return r.candidatos;
}

// 4:5 JPEG de até 1080 px; devolve o caminho do arquivo pronto para o Instagram.
async function prepararSlide(arquivo) {
  const o = arquivo.replace(/\.jpg$/i, "-sl.jpg");
  await exec("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "88", arquivo, "--out", o]);
  const d = await tamanho(o);
  const v = await versaoInstagram(o, d);
  if (v) return v;
  if (d.width > 1080) { const b = o.replace("-sl", "-slb"); await exec("sips", ["--resampleWidth", "1080", o, "--out", b]); return b; }
  return o;
}

// ─── Mídia por lugar ────────────────────────────────────────────────────────
// Escolhe 1 ou 2 fotos para o carrossel a partir do que o motor de mídia avaliou.
function fotosDoLugar(todas, regras) {
  const nucleo = new Set(regras.cenasNucleo || []);
  const boas = todas
    .filter((t) => ((t.file && fs.existsSync(t.file)) || t.urlInstagram || t.url) && t.score >= SCORE_UTIL && t.texto !== "problemático" && !t.textoProblematico)
    .sort((a, b) => (nucleo.has(b.cena) - nucleo.has(a.cena)) || b.score - a.score || String(b.takenAt || "").localeCompare(String(a.takenAt || "")));
  const out = [];
  const posts = new Set();
  for (const t of boas) {
    const post = String(t.sourceId).split(":")[0];
    if (posts.has(post)) continue; // 1 foto por post (variedade)
    posts.add(post); out.push(t);
    if (out.length >= 2) break;
  }
  return out;
}
// Presença recente = post do perfil nos últimos 90 dias (data lida do perfil; as fotos já avaliadas antes não contam de novo).
const temPresencaRecente = (midia) => (midia.resumo?.instagram?.ultimoPost && idadeDias(midia.resumo.instagram.ultimoPost) <= 90) || midia.todas.some((t) => t.takenAt && idadeDias(t.takenAt) <= 90);

// ─── Legenda (Claude local escreve; o código valida) ───────────────────────
const PROIBIDAS = /experi[eê]ncia inesquec[ií]vel|para[ií]so escondido|destino imperd[ií]vel|encanto em cada detalhe|criar mem[oó]rias|imperd[ií]vel|aconchegante|charmos[oa]/i;
const HASHTAGS = "#RotaDaFerradura #BuenosAiresGuarapari #GuarapariES #TurismoCapixaba #EspiritoSanto";

function validarLegenda(corpo, lugares, fatosTexto) {
  const erros = [];
  if (/[—–]/.test(corpo)) erros.push("não use travessão");
  if (PROIBIDAS.test(corpo)) erros.push("há expressão proibida (clichê ou adjetivo de apreciação)");
  if (/avalia[cç][aã]o|estrelas|nota \d/i.test(corpo)) erros.push("não cite avaliações");
  for (const l of lugares) if (!corpo.toLowerCase().includes(`@${l.handle.toLowerCase()}`)) erros.push(`falta marcar @${l.handle}`);
  const nums = corpo.match(/\d[\d.,:h]*/g) || [];
  const ordem = corpo.match(/^\s*\d+\./gm) || [];
  const restantes = nums.filter((n) => !ordem.some((o) => o.trim().startsWith(n.replace(/\.$/, ""))) && !fatosTexto.includes(n));
  if (restantes.length) erros.push(`número que não está nos fatos: ${[...new Set(restantes)].join(", ")}`);
  if (lugares.length === 1 && ordem.length) erros.push("legenda de um único lugar não deve ser numerada");
  if (lugares.length > 1 && ordem.length !== lugares.length) erros.push(`numere exatamente ${lugares.length} blocos, um por lugar, na ordem dos slides`);
  if (corpo.length > 1500) erros.push("legenda longa demais");
  return erros;
}

async function escreverLegenda({ pauta, lugares, dia, dir }) {
  const fatos = lugares.map((l, i) => ({
    ordem: i + 1, nome: l.nome, handle: l.handle, categoria: CATEGORIA_LABEL[l.categoria] || l.categoria, regiao: l.regiao ?? null,
    contexto_antigo_so_para_localizacao_e_caracteristicas: l.descricaoCurta ?? l.resumo ?? null,
    fotos: l.fotos.map((f) => ({ data: dataIso(f.takenAt), idade_dias: idadeDias(f.takenAt) ?? "desconhecida", vale_como_atual: idadeDias(f.takenAt) !== null && idadeDias(f.takenAt) <= 60, descricao: f.descricao, chamada_no_post: f.chamada || null, legenda_do_post: (f.legenda || "").slice(0, 280) })),
  }));
  const fatosTexto = JSON.stringify(fatos);
  const varios = lugares.length > 1;
  let erros = null;
  for (let t = 0; t < 3; t++) {
    const prompt = `Você é o editor do Instagram do Refúgio da Ferradura (Rota da Ferradura, Guarapari, ES). Escreva o CORPO da legenda de um carrossel. O sistema acrescenta depois a frase final e as hashtags: NÃO as escreva.

PAUTA: ${pauta.titulo}. Dia de publicação: ${dia.data}.
${varios ? `São ${lugares.length} LUGARES DIFERENTES. Formato: uma frase de abertura e depois exatamente ${lugares.length} linhas numeradas ("1. @handle: ..."), UMA por lugar, na MESMA ordem dos slides. Cada linha é uma frase curta e concreta. Não numere fotos, só lugares.` : `É UM ÚNICO LUGAR. Escreva uma legenda corrida e natural, de 2 a 4 frases, SEM numerar nada.`}

LUGARES NA ORDEM DOS SLIDES (JSON):
${fatosTexto}

REGRAS (todas obrigatórias):
- Marque cada lugar com @handle exatamente como no JSON.
- Use SOMENTE o que está no JSON. O campo de contexto antigo vale só para localização e características estruturais; NUNCA como novidade atual.
- Informação que muda com o tempo (cardápio, horário, dias de funcionamento, preço, evento, promoção, disponibilidade) só pode aparecer se constar numa foto/post de até 45 dias, e então diga que é o que o perfil mostra. Na dúvida, não cite.
- Foto com "vale_como_atual": false (sem data ou com mais de 60 dias) NÃO sustenta nenhuma afirmação atual sobre o lugar: dela use apenas a categoria e a localização. Só descreva o que o perfil mostra quando a foto vale como atual.
- Se uma foto tiver "chamada_no_post" útil e atual, pode aproveitá-la como gancho.
- A abertura é direta e não atribui ações à Rota (nada de "a Rota separou..."): apresente os lugares e o tema.
- Não afirme que abre em dia ou horário específico.
- Escreva "em Buenos Aires" e "em Boa Esperança" (nunca "no/na" antes do bairro).
- Português do Brasil simples, jornalístico e concreto. Sem clichês ("experiência inesquecível", "paraíso escondido", "destino imperdível", "encanto em cada detalhe", "perfeito para criar memórias"), sem adjetivos de apreciação, sem enchimento.
- PROIBIDO travessão (— ou –). Não cite avaliações, notas, estrelas.
- NUNCA descreva de forma improvisada elementos que podem ter nome próprio (pedras, morros, cachoeiras, mirantes). Se o JSON não traz o nome, não nomeie nem descreva.
- Não use telefone, e-mail ou link. Não escreva "página 1/2".
${erros ? `\nSUA VERSÃO ANTERIOR FOI REJEITADA. Corrija:\n- ${erros.join("\n- ")}\n` : ""}
Responda SOMENTE com JSON: {"corpo":"..."}`;
    const r = extrairJson(await rodarClaude(prompt, { cwd: dir, ferramentas: "", maxTurns: 4, timeoutMs: 240000 }));
    const corpo = String(r.corpo || "").trim();
    erros = validarLegenda(corpo, lugares, fatosTexto);
    if (!erros.length) return corpo;
    log("legenda_rejeitada", { tentativa: t + 1, erros });
  }
  throw new Error(`legenda reprovada: ${erros.join(" | ")}`);
}

// ─── Capa: foto do lugar, título com gancho, conferência visual ─────────────
// Fotos candidatas à capa, da melhor para a pior: do primeiro lugar, nota alta, grande. Texto na foto
// não elimina (a conferência visual julga se combina); só pesa um pouco quando há opção sem texto.
function fotosParaCapa(escolhidos) {
  const todas = escolhidos.flatMap((e, i) => e.fotos.map((f) => ({ f, i })));
  const nota = ({ f, i }) => (f.texto || f.textoSobreposto ? 0 : 0.5) + (i === 0 ? 2 : 0) + (f.score ?? 0) / 10 + Math.min(f.width || 1080, f.height || 1080) / 5000;
  return todas.sort((a, b) => nota(b) - nota(a)).map((x) => x.f);
}

// Título da capa: curto, concreto, com gancho; nunca "Rota da Ferradura" (o perfil já diz).
function validarTitulo(t, fatosTexto) {
  const erros = [];
  const limpo = t.replace(/\*/g, "");
  if (limpo.length < 12 || limpo.length > 46) erros.push("de 12 a 46 caracteres");
  if (/rota da ferradura/i.test(limpo)) erros.push("não escreva 'Rota da Ferradura' (pode 'da Rota')");
  if (/[—–]/.test(limpo)) erros.push("sem travessão");
  if (PROIBIDAS.test(limpo)) erros.push("sem clichê nem adjetivo de apreciação");
  if ((t.match(/\*/g) || []).length !== 2) erros.push("marque exatamente UMA palavra ou expressão curta entre *asteriscos*");
  const nums = (limpo.match(/\d+/g) || []).filter((n) => !fatosTexto.includes(n) && !["2", "3"].includes(n));
  if (nums.length) erros.push(`número que não está nos fatos: ${nums.join(", ")}`);
  return erros;
}
async function escreverTituloCapa({ P, lugares, dir, capaDescricao = null }) {
  const fatos = lugares.map((l) => ({ nome: l.nome, categoria: CATEGORIA_LABEL[l.categoria] || l.categoria, regiao: l.regiao ?? null, descricao: l.descricaoCurta ?? null, fotos: l.fotos.map((f) => f.descricao).filter(Boolean).slice(0, 4) }));
  const fatosTexto = JSON.stringify(fatos);
  let erros = null;
  for (let t = 0; t < 2; t++) {
    const prompt = `Escreva o TÍTULO da capa de um carrossel do Instagram do Refúgio da Ferradura (turismo rural em Guarapari, ES). ${lugares.length > 1 ? `O carrossel reúne ${lugares.length} lugares (pauta: ${P.titulo()}); os nomes aparecem numa lista abaixo do título, então NÃO repita nomes no título.` : "É sobre UM lugar; o nome dele aparece abaixo do título, então o título NÃO precisa ter o nome."}

FATOS (JSON): ${fatosTexto}
${capaDescricao ? `\nA FOTO DA CAPA mostra: ${capaDescricao}. O título fica em cima dessa foto, então precisa combinar com ela (não fale de algo que não aparece nela).\n` : ""}
REGRAS: de 3 a 7 palavras, até 46 caracteres; concreto e com gancho, a partir do que as fotos e os fatos mostram (ex.: "Siriemas na beira da *piscina*", "Hidromassagem de frente para as *montanhas*", "Chope feito *ali mesmo*"); marque UMA palavra ou expressão curta entre *asteriscos* (vira destaque); nada que mude com o tempo (horário, preço, evento); sem "Rota da Ferradura" por extenso (o perfil já diz; "da Rota" pode); sem travessão; sem clichê ("imperdível", "aconchegante", "charmoso", "paraíso"); só maiúscula na primeira letra e em nomes próprios.
${erros ? `SUA VERSÃO ANTERIOR FOI REJEITADA: ${erros.join("; ")}\n` : ""}Responda SOMENTE com JSON: {"titulo":"..."}`;
    try {
      const r = extrairJson(await rodarClaude(prompt, { cwd: dir, ferramentas: "", maxTurns: 3, timeoutMs: 150000 }));
      const titulo = String(r.titulo || "").trim();
      erros = validarTitulo(titulo, fatosTexto);
      if (!erros.length) return titulo;
      log("titulo_capa_rejeitado", { tentativa: t + 1, titulo, erros });
    } catch (e) { log("titulo_capa_erro", { erro: String(e.message).slice(0, 160) }); break; }
  }
  return P.tipo === "destaque" ? "Destaque da *semana*" : P.reserva(lugares.length);
}

// A IA olha a capa pronta, como uma pessoa olharia. Se reprovar, refaz com outro modelo.
async function conferirCapa(arquivo) {
  const mini = arquivo.replace(/\.jpg$/i, "-conf.jpg");
  await exec("sips", ["-s", "format", "jpeg", "--resampleHeightWidthMax", "900", arquivo, "--out", mini]);
  const prompt = `Abra a imagem ${path.basename(mini)} com a ferramenta Read. É a capa de um carrossel do Instagram de turismo. Reprove SÓ se houver problema real: o título ou a lista da capa difícil de ler, embaçado, cortado ou saindo da imagem; título em cima do assunto principal da foto (rosto, prato, construção principal); foto sem sentido, distorcida ou de baixa qualidade.
TEXTO QUE JÁ VEM ESCRITO NA FOTO (os perfis da região escrevem muito nas próprias fotos) NÃO é motivo de reprovação por si só: leia esse texto e aprove se ele combina com o assunto da capa e não atrapalha a leitura do título (ex.: "Cantinhos aconchegantes e instagramáveis!" numa capa de almoço combina). Reprove por ele só se for preço, promoção, data ou evento, telefone, nome de outro estabelecimento, algo que contradiz a capa, ou se ficar encavalado com o título.
Responda SOMENTE com JSON: {"aprova":true|false,"motivo":"até 12 palavras"}`;
  const r = extrairJson(await rodarClaude(prompt, { cwd: path.dirname(mini), ferramentas: "Read", maxTurns: 4, timeoutMs: 150000 }));
  return { aprova: r.aprova === true, motivo: String(r.motivo || "") };
}
// Reprovou: tenta a próxima foto (o modelo é decidido de novo pela medição de contraste).
async function montarCapa({ fotos, ...dados }) {
  let ultima = null;
  for (const f of fotos.slice(0, 4)) {
    let capa;
    try { capa = await gerarCapaV2({ ...dados, foto: f.file }); } catch (e) { log("capa_erro", { erro: String(e.message).slice(0, 160) }); continue; }
    ultima = { ...capa, fotoUsada: f };
    let c;
    try { c = await conferirCapa(capa.saida); } catch (e) {
      // o contraste já foi aprovado pela medição; sem a conferência visual, segue com a capa
      log("capa_conferencia_indisponivel", { erro: String(e.message).slice(0, 160) });
      return { ...ultima, conferencia: "indisponível (contraste aprovado)" };
    }
    if (c.aprova) return { ...ultima, conferencia: "aprovada" };
    log("capa_reprovada", { modelo: capa.modelo, motivo: c.motivo });
  }
  if (!ultima) throw new Error("nenhuma foto serviu para a capa");
  // nenhuma passou na conferência visual: não arrisca publicar capa ruim
  throw new Error(`capa reprovada na conferência visual em ${Math.min(fotos.length, 4)} foto(s)`);
}

// ─── Curadoria das fotos do destaque ───────────────────────────────────────
// Fotos que vieram do acervo (B2) não têm arquivo local: baixa.
async function garantirArquivos(fotos, dir) {
  let n = 0;
  for (const f of fotos) {
    if (f.file && fs.existsSync(f.file)) continue;
    const url = f.urlInstagram || f.url;
    if (!url || url.startsWith("file://")) { f.file = null; continue; }
    f.file = path.join(dir, `acv-${++n}.jpg`);
    try { await baixar(url, f.file); } catch { f.file = null; }
  }
  return fotos.filter((f) => f.file);
}

// A IA olha cada slide JÁ CORTADO em 4:5, como vai aparecer no Instagram, com a data de hoje,
// e tira o que não serve. Devolve as fotos aprovadas (mesma ordem), cada uma com .slide pronto.
async function curarSlides(fotos, dir, dia) {
  const com = fotos.filter((f) => f.file && fs.existsSync(f.file));
  const pasta = path.join(dir, "curadoria");
  fs.mkdirSync(pasta, { recursive: true });
  const itens = [];
  for (const f of com) {
    try {
      f.slide = await prepararSlide(f.file);
      const nome = `s${itens.length + 1}.jpg`;
      await exec("sips", ["-s", "format", "jpeg", "--resampleHeightWidthMax", "700", f.slide, "--out", path.join(pasta, nome)]);
      itens.push({ f, nome });
    } catch { /* foto ilegível: fica fora */ }
  }
  if (!itens.length) return [];
  const prompt = `Abra com a ferramenta Read, uma por uma, as imagens ${itens.map((i) => i.nome).join(", ")}. São os slides de um carrossel do Instagram de turismo, JÁ CORTADOS no formato final. Hoje é ${dia.data}.
Para cada slide decida se ele entra. REPROVE se:
- a foto está desfocada, borrada, granulada, esticada ou com cara de print ampliado;
- o corte ficou ruim: pessoa, prato, placa, logotipo ou texto cortado pela borda;
- tem texto ou arte com data, dia da semana, horário, "hoje", preço, promoção, sorteio, aniversariante, evento ou aviso (pode estar vencido);
- é cartaz, flyer, cardápio ou arte gráfica em vez de foto do lugar;
- é quase igual a outro slide da lista (mantenha só o melhor dos parecidos).
Texto escrito na foto que é só uma chamada atemporal e combina com o lugar ("Cantinhos aconchegantes") NÃO reprova.
Responda SOMENTE com JSON: {"slides":[{"arquivo":"s1.jpg","entra":true|false,"motivo":"até 10 palavras"}]}`;
  let resp;
  try {
    resp = extrairJson(await rodarClaude(prompt, { cwd: pasta, ferramentas: "Read", maxTurns: itens.length + 4, timeoutMs: 300000 }));
  } catch (e) {
    // sem a conferência não dá para garantir a qualidade: o lugar fica para outro dia
    log("curadoria_indisponivel", { erro: String(e.message).slice(0, 160) });
    return [];
  }
  const aprovadas = [];
  for (const it of itens) {
    const r = (resp.slides || []).find((s) => s.arquivo === it.nome);
    if (r?.entra === true) aprovadas.push(it.f);
    else log("slide_reprovado", { arquivo: it.nome, origem: it.f.origemUrl || it.f.url, motivo: r?.motivo || "sem resposta" });
  }
  console.log(`    curadoria: ${aprovadas.length} de ${itens.length} foto(s) aprovadas`);
  return aprovadas;
}

// Matérias já publicadas sobre o lugar (para a nova trazer outro ângulo).
async function materiasAnteriores(topic, ctx) {
  if (!ctx.posts) {
    try { const r = await fetch(`${SITE}/api/posts?limit=200`, { signal: AbortSignal.timeout(30000) }); ctx.posts = r.ok ? (await r.json()).posts || [] : []; } catch { ctx.posts = []; }
  }
  const nome = String(topic.fatos.nome || "").toLowerCase();
  const handle = String(topic.fontes.instagram || "").toLowerCase();
  return ctx.posts
    .filter((p) => String(p.title || "").toLowerCase().includes(nome) || (handle && String(p.content || "").toLowerCase().includes(`instagram.com/${handle}/`)))
    .slice(0, 5)
    .map((p) => ({ data: String(p.createdAt).slice(0, 10), titulo: p.title, resumo: String(p.excerpt || p.subtitle || "").slice(0, 200) }));
}

// Legendas recentes (até 45 dias) do perfil oficial: contexto atual para a matéria.
function novidadesDoPerfil(todas) {
  const vistas = new Set();
  return todas
    .filter((t) => t.origem === "instagram_oficial" && t.legenda && t.takenAt && idadeDias(t.takenAt) <= 45)
    .sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt))
    .filter((t) => { const k = t.legenda.slice(0, 80); if (vistas.has(k)) return false; vistas.add(k); return true; })
    .slice(0, 6)
    .map((t) => ({ data: dataIso(t.takenAt), texto: t.legenda.replace(/\s+/g, " ").slice(0, 300) }));
}

// ─── Produção de um dia ────────────────────────────────────────────────────
async function produzirDia(dia, ctx, pautaForcada = null) {
  const pautaId = pautaForcada || escolherPauta(dia);
  const P = PAUTAS[pautaId];
  dia.quando = `${dia.data}T${HORA_PAUTA[pautaId] || horarioDe(dia.dow)}:00-03:00`;
  const dir = path.join(SAIDA, `${dia.data}-${pautaId}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rel = { dia: dia.data, quando: dia.quando, pauta: pautaId, lugares: [], descartados: [] };
  console.log(`\n=== ${dia.data} (${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dia.dow]}) ${HORA_PAUTA[pautaId] || horarioDe(dia.dow)}  pauta: ${pautaId}`);

  const recentes = new Set(ctx.fila.slice(0, 4).flatMap((i) => i.partnerIds || []));
  const ordenados = ordenar({ candidatos: ctx.candidatos, historico: ctx.historico, categorias: P.cats, recentes, bloqueados: ctx.usadosNaSemana, semMidia: ctx.semMidia });
  const escolhidos = [];
  let locais = [];
  let artigo = null;
  for (const c of ordenados.slice(0, P.tipo === "destaque" ? 10 : P.n * 4)) {
    if (escolhidos.length >= P.n) break;
    console.log(`  - tentando ${c.nome} (id ${c.id})`);
    try {
      const topic = await api("/next-topic", { only: c.id });
      if (topic.status !== "ok") { rel.descartados.push({ id: c.id, nome: c.nome, motivo: `sem pauta: ${topic.status}` }); continue; }
      const sub = path.join(dir, `p${c.id}`);
      fs.mkdirSync(sub, { recursive: true });
      const midia = await run.prepararMidia(topic, sub, { carrossel: P.tipo !== "destaque" });
      locais.push(...midia.todas);
      if (!temPresencaRecente(midia)) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: "sem post oficial nos últimos 90 dias" }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
      let fotos;
      if (P.tipo === "destaque") {
        if (!midia.ok) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: midia.motivo }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
        // Curadoria final: cada foto vira slide 4:5 e a IA olha o slide PRONTO (corte, foco, texto cortado,
        // cartaz vencido, repetida). A matéria do blog e o carrossel usam só as aprovadas.
        const candidatas = midia.selecionadas.map((s) => { const t = midia.todas.find((x) => x.sourceId === s.sourceId) || {}; return { ...t, ...s, file: s.file || t.file }; });
        await garantirArquivos(candidatas, sub);
        const aprovadas = await curarSlides(candidatas, sub, dia);
        if (aprovadas.length < 3) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: `curadoria: só ${aprovadas.length} foto(s) boa(s)` }); continue; }
        topic.anteriores = await materiasAnteriores(topic, ctx);
        topic.novidades = novidadesDoPerfil(midia.todas);
        const red = await run.redigir(topic, aprovadas, sub);
        if (!red.ok) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: red.motivo }); continue; }
        artigo = { ...red.artigo, selecionadas: aprovadas, topic };
        fotos = aprovadas;
      } else {
        // as do acervo do site (B2) não entram em "todas" quando não são reavaliadas: somar as selecionadas
        const doAcervo = (midia.selecionadas || []).filter((s) => !midia.todas.some((t) => t.sourceId && t.sourceId === s.sourceId));
        fotos = fotosDoLugar([...midia.todas, ...doAcervo], topic.regras);
        if (!fotos.length) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: "nenhuma foto útil depois de esgotar as fontes" }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
      }
      escolhidos.push({ id: c.id, nome: topic.fatos.nome, handle: topic.fontes.instagram, categoria: c.categoria, regiao: topic.fatos.regiao, descricaoCurta: topic.fatos.descricaoCurta, fotos });
      ctx.usadosNaSemana.add(c.id);
      console.log(`    ok: ${fotos.length} foto(s), ${fotos.map((f) => `${f.cena}/${f.score}/${dataIso(f.takenAt) || "sem data"}`).join(" ")}`);
    } catch (e) {
      rel.descartados.push({ id: c.id, nome: c.nome, motivo: `erro: ${String(e.message).slice(0, 120)}` });
      console.log(`    erro: ${String(e.message).slice(0, 100)}`);
    }
  }
  fs.writeFileSync(SEM_MIDIA, JSON.stringify(ctx.semMidia));
  if (escolhidos.length < (P.tipo === "destaque" ? 1 : 2)) throw new Error(`poucos lugares viáveis (${escolhidos.length}); descartados: ${rel.descartados.map((d) => `${d.nome}: ${d.motivo}`).join(" | ").slice(0, 400)}`);
  rel.lugares = escolhidos.map((e) => ({ id: e.id, nome: e.nome, handle: e.handle, categoria: e.categoria, fotos: e.fotos.length }));

  // Fotos que já estavam no B2 (acervo/matéria) não têm arquivo local: baixa para montar o slide.
  let nDl = 0;
  for (const e of escolhidos) for (const f of e.fotos) {
    if (f.file && fs.existsSync(f.file)) continue;
    const url = f.urlInstagram || f.url;
    if (!url) throw new Error(`foto sem arquivo nem URL (${f.sourceId})`);
    f.file = path.join(dir, `dl-${++nDl}.jpg`);
    await baixar(url, f.file);
  }

  // Capa: a foto do próprio lugar; modelo escolhido pela foto e conferido (contraste + olhar da IA)
  const lista = P.tipo === "destaque" ? null : escolhidos.map((e) => e.nome);
  const rotulo = P.tipo === "destaque" ? [CATEGORIA_LABEL[escolhidos[0].categoria], escolhidos[0].regiao].filter(Boolean).join(" · ").toUpperCase() : P.rotulo;
  const candidatasCapa = fotosParaCapa(escolhidos);
  const titulo = await escreverTituloCapa({ P, lugares: escolhidos, dir, capaDescricao: candidatasCapa[0]?.descricao || null });
  const capa = await montarCapa({ fotos: candidatasCapa, titulo, nome: escolhidos[0].nome, rotulo, lista, saida: path.join(dir, "capa.jpg") });
  const fotoCapa = capa.fotoUsada;
  rel.capa = { modelo: capa.modelo, foto: fotoCapa.origemUrl || fotoCapa.url || fotoCapa.sourceId, titulo, contraste: capa.contraste, conferencia: capa.conferencia };

  // Legenda
  const pautaTxt = { titulo: P.tipo === "destaque" ? `Destaque: ${escolhidos[0].nome}` : P.titulo() };
  const corpo = await escreverLegenda({ pauta: pautaTxt, lugares: escolhidos, dia, dir });
  const fechamento = P.tipo === "destaque" ? "Horário e cardápio mudam: confirme direto com o perfil antes de ir.\n\nMatéria completa no site Guia Refúgio Ferradura. Link na bio." : "Cardápio e horário mudam, então confirme direto com cada casa antes de ir.\n\nVeja tudo sobre a Rota da Ferradura no site Guia Refúgio Ferradura. Link na bio.";
  const caption = `${corpo}\n\n${fechamento}\n\n${HASHTAGS}`;
  fs.writeFileSync(path.join(dir, "legenda.txt"), caption);

  // Slides (capa + fotos na ordem dos lugares). A foto usada na capa não se repete logo em seguida.
  const restantes = escolhidos.flatMap((e) => e.fotos).filter((f) => f.file !== fotoCapa.file);
  const prontos = [path.join(dir, "capa.jpg")];
  for (const f of restantes) prontos.push(f.slide || (await prepararSlide(f.file)));
  prontos.forEach((a, i) => fs.copyFileSync(a, path.join(dir, `slide-${i + 1}.jpg`)));
  rel.slides = prontos.length;
  rel.caption = caption;

  if (!REAL) {
    fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
    console.log(`  simulação ok: ${prontos.length} slides, capa ${capa.modelo} (${capa.conferencia}), título "${titulo}", pasta ${dir}`);
    return rel;
  }

  // ── Modo real: B2, rascunho da matéria e fila ──
  const urls = [];
  const primeiro = escolhidos[0].id;
  for (let i = 0; i < prontos.length; i++) {
    const up = await enviarAoB2(api, { partnerId: primeiro, source: i === 0 ? "capa_editorial" : "instagram_oficial", sourceId: i === 0 ? `capa-${dia.data}-${pautaId}` : `${dia.data}-${pautaId}-s${i}`, arquivo: prontos[i], role: "ig" });
    urls.push(up.url);
  }
  let postId = null;
  if (P.tipo === "destaque") {
    const sel = artigo.selecionadas;
    const pub = await api("/publish", { rascunho: true, partnerId: artigo.topic.partnerId, article: { ...artigo, selecionadas: undefined, topic: undefined }, imagens: sel.map((x) => x.id) });
    if (pub.status !== "draft") throw new Error(`matéria em rascunho não foi criada: ${pub.status || pub.http} ${(pub.erros || [pub.error]).join(" | ")}`);
    postId = pub.postId;
  }
  const q = await enfileirar({ titulo: pautaTxt.titulo, quando: dia.quando, caption, imageUrls: urls, postId, capaFundo: rel.capa.foto, pauta: P.tipo === "destaque" ? `${pautaId}: ${escolhidos[0].nome}` : `${pautaId}: ${pautaTxt.titulo}`, partnerIds: escolhidos.map((e) => e.id) });
  if (q.status !== "queued") throw new Error(`fila recusou: ${q.status || q.http} ${JSON.stringify(q.erros || q.erro || "")}`);
  rel.fila = { id: q.id, postId };
  fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
  console.log(`  NA FILA: item ${q.id}${postId ? `, matéria em rascunho ${postId}` : ""}`);
  return rel;
}

// ─── Reserva: carrossel a partir de uma matéria já publicada no blog ────────
// Garante que nenhum dia fique vazio quando nenhuma pauta acha lugares viáveis.
// Prefere matéria que nunca foi ao Instagram e que não está na fila; a IA confere se é atemporal.
const SITE = "https://refugioferradura.com.br";
const semTags = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
async function produzirDoBlog(dia, ctx) {
  const dir = path.join(SAIDA, `${dia.data}-blog`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  dia.quando = `${dia.data}T${horarioDe(dia.dow)}:00-03:00`;
  console.log(`\n=== ${dia.data} RESERVA: matéria do blog`);
  const r = await fetch(`${SITE}/api/posts?limit=200`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`lista de matérias indisponível (HTTP ${r.status})`);
  const usados = new Set([...ctx.fila.map((i) => i.postId), ...ctx.blogUsados].filter(Boolean));
  const posts = ((await r.json()).posts || [])
    .filter((p) => p.status === "published" && !usados.has(p.id))
    .map((p) => ({ ...p, imgs: [...new Set([p.coverImage, ...[...String(p.content || "").matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])].filter((u) => u && /^https:\/\/media\.refugioferradura\.com\.br\//.test(u)))] }))
    .filter((p) => p.imgs.length >= 3)
    .sort((a, b) => (!!a.instagramPostedAt - !!b.instagramPostedAt) || String(a.instagramPostedAt || a.createdAt).localeCompare(String(b.instagramPostedAt || b.createdAt)));
  for (const post of posts.slice(0, 6)) {
    ctx.blogUsados.add(post.id);
    const handles = [...new Set([...String(post.content || "").matchAll(/instagram\.com\/([A-Za-z0-9._]+)\//g)].map((m) => m[1]).filter((h) => !["p", "reel", "reels", "stories", "explore"].includes(h)))].slice(0, 3);
    const texto = semTags(post.content).slice(0, 2500);
    // legenda + conferência de atualidade numa chamada só
    let corpo = null, erros = null;
    for (let t = 0; t < 2 && !corpo; t++) {
      const prompt = `Você é o editor do Instagram do Refúgio da Ferradura (Guarapari, ES). Vamos repostar no Instagram uma matéria JÁ PUBLICADA no blog.
MATÉRIA: título "${post.title}". Publicada em ${String(post.createdAt).slice(0, 10)}. Hoje é ${dia.data}.
TEXTO: ${texto}
PERFIS A MARCAR: ${handles.length ? handles.map((h) => "@" + h).join(" ") : "(nenhum)"}

1) Diga se a matéria ainda serve hoje: "serve": false se for sobre evento, data, promoção, notícia passada ou algo que perdeu a validade.
2) Se servir, escreva o CORPO da legenda: 2 a 4 frases corridas, concretas, só com o que está no texto; marque cada perfil listado com o @ exatamente como acima; não afirme horário, preço nem dia de funcionamento; sem travessão; sem clichê ("imperdível", "aconchegante", "charmoso", "experiência inesquecível"); não escreva a frase final nem hashtags.
${erros ? `SUA VERSÃO ANTERIOR FOI REJEITADA: ${erros.join("; ")}\n` : ""}Responda SOMENTE com JSON: {"serve":true|false,"motivo":"até 10 palavras","corpo":"..."}`;
      let res;
      try { res = extrairJson(await rodarClaude(prompt, { cwd: dir, ferramentas: "", maxTurns: 3, timeoutMs: 200000 })); } catch (e) { log("blog_reserva_erro", { postId: post.id, erro: String(e.message).slice(0, 120) }); break; }
      if (res.serve !== true) { log("blog_reserva_descartada", { postId: post.id, motivo: res.motivo }); break; }
      const c = String(res.corpo || "").trim();
      erros = [];
      if (/[—–]/.test(c)) erros.push("não use travessão");
      if (PROIBIDAS.test(c)) erros.push("há clichê ou adjetivo de apreciação");
      for (const h of handles) if (!c.toLowerCase().includes(`@${h.toLowerCase()}`)) erros.push(`falta marcar @${h}`);
      if (c.length < 40 || c.length > 1200) erros.push("tamanho fora de 40 a 1200 caracteres");
      if (!erros.length) corpo = c;
    }
    if (!corpo) continue;

    // fotos da matéria (já estão no nosso B2)
    const fotos = [];
    for (const [i, u] of post.imgs.slice(0, 6).entries()) {
      const f = path.join(dir, `m-${i + 1}.jpg`);
      try { await baixar(u, f); fotos.push({ file: f, url: u }); } catch { /* segue com as outras */ }
    }
    const boas = await curarSlides(fotos, dir, dia);
    if (boas.length < 3) continue;
    fotos.splice(0, fotos.length, ...boas);
    const lugar = [{ nome: post.title, categoria: null, regiao: null, descricaoCurta: post.excerpt || post.subtitle || null, fotos: [] }];
    const titulo = await escreverTituloCapa({ P: { tipo: "destaque", titulo: () => post.title }, lugares: lugar, dir });
    let capa;
    try { capa = await montarCapa({ fotos, titulo, nome: post.subtitle || post.title, rotulo: "DO BLOG", lista: null, saida: path.join(dir, "capa.jpg") }); } catch (e) { log("blog_reserva_capa", { postId: post.id, erro: String(e.message).slice(0, 120) }); continue; }
    const caption = `${corpo}\n\nMatéria completa no site Guia Refúgio Ferradura. Link na bio.\n\n${HASHTAGS}`;
    fs.writeFileSync(path.join(dir, "legenda.txt"), caption);
    const prontos = [path.join(dir, "capa.jpg")];
    for (const f of fotos.filter((f) => f !== capa.fotoUsada).slice(0, 5)) prontos.push(f.slide || (await prepararSlide(f.file)));
    prontos.forEach((a, i) => fs.copyFileSync(a, path.join(dir, `slide-${i + 1}.jpg`)));
    const rel = { dia: dia.data, quando: dia.quando, pauta: "blog", postId: post.id, materia: post.title, lugares: [], capa: { modelo: capa.modelo, foto: capa.fotoUsada.url, titulo, conferencia: capa.conferencia }, slides: prontos.length, caption };
    if (!REAL) {
      fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
      console.log(`  simulação ok (reserva do blog): "${post.title}", ${prontos.length} slides, capa ${capa.modelo}, título "${titulo}"`);
      return rel;
    }
    const parceiro = Number((post.imgs[0].match(/\/engine\/(\d+)\//) || [])[1]) || null;
    if (!parceiro) { log("blog_reserva_sem_parceiro", { postId: post.id }); continue; }
    const urls = [];
    for (let i = 0; i < prontos.length; i++) {
      const up = await enviarAoB2(api, { partnerId: parceiro, source: i === 0 ? "capa_editorial" : "instagram_oficial", sourceId: i === 0 ? `capa-${dia.data}-blog-${post.id}` : `${dia.data}-blog-${post.id}-s${i}`, arquivo: prontos[i], role: "ig" });
      urls.push(up.url);
    }
    const q = await enfileirar({ titulo: `Do blog: ${post.title}`, quando: dia.quando, caption, imageUrls: urls, postId: post.id, capaFundo: rel.capa.foto, pauta: `blog: ${post.title}`, partnerIds: [parceiro] });
    if (q.status !== "queued") { log("blog_reserva_fila_recusou", { postId: post.id, status: q.status || q.http }); continue; }
    rel.fila = { id: q.id, postId: post.id };
    fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
    console.log(`  NA FILA (reserva do blog): item ${q.id}, matéria ${post.id}`);
    return rel;
  }
  throw new Error("reserva do blog: nenhuma matéria publicada serviu");
}

// ─── Principal ────────────────────────────────────────────────────────────
async function main() {
  ensureDirs();
  fs.mkdirSync(SAIDA, { recursive: true });
  console.log(`Produção semanal (${REAL ? "REAL: grava B2, rascunho e fila" : "SIMULAÇÃO: não grava nada"}) | próximos ${DIAS} dias`);
  const f = await listarFila(200);
  if (!f.itens) throw new Error(`fila indisponível (${f.http})`);
  const fila = f.itens; // mais recentes primeiro
  const ocupados = new Set(fila.filter((i) => ["aguardando", "publicando", "publicado", "falhou"].includes(i.status)).map((i) => dataBRT(new Date(i.scheduledAt))));
  let dias = proximosDias(DIAS);
  if (SO_DIA) dias = dias.filter((d) => d.data === SO_DIA);
  const faltantes = dias.filter((d) => !ocupados.has(d.data));
  console.log(`dias: ${dias.map((d) => d.data).join(", ")}\nprontos na fila: ${dias.length - faltantes.length} | a produzir: ${faltantes.length}${faltantes.length ? ` (${faltantes.map((d) => d.data).join(", ")})` : ""}`);
  if (!faltantes.length) { console.log("Semana completa. Nada a fazer."); return; }

  const candidatos = await carregarCandidatos();
  // Publicações anteriores à fila (feitas à mão) que também contam para o rodízio.
  const extra = lerJson(path.join(CACHE_DIR, "historico-manual.json"), []);
  const ctx = { fila, extra, candidatos, historico: montarHistorico(candidatos, [...fila, ...extra]), usadosNaSemana: new Set(), semMidia: lerJson(SEM_MIDIA, {}), planejadas: [], blogUsados: new Set() };
  const resumo = [];
  for (const dia of faltantes) {
    try {
      // Se a pauta do dia não achar lugares viáveis, tenta outras antes de desistir do dia.
      let r = null, ultimoErro = null;
      const primeira = escolherPauta(dia);
      // destaque tenta até 10 parceiros por dia; as pautas de vários lugares só entram se forçadas
      const tentativas = FORCAR === "blog" ? [] : [primeira];
      for (const pid of tentativas) {
        try { r = await produzirDia(dia, ctx, pid); break; } catch (e) { ultimoErro = e; console.log(`  pauta ${pid} não deu certo (${String(e.message).slice(0, 90)}); tentando outra`); }
      }
      // Nenhuma pauta deu certo: o dia não pode ficar vazio, usa uma matéria já publicada no blog.
      if (!r) {
        try { r = await produzirDoBlog(dia, ctx); } catch (e) { throw new Error(`${String(ultimoErro?.message || ultimoErro).slice(0, 200)} | ${e.message}`); }
      }
      ctx.planejadas.push(r.pauta);
      // o histórico passa a contar o que acabou de ser produzido (rodízio dentro da própria semana)
      fila.unshift({ status: "aguardando", scheduledAt: dia.quando, partnerIds: r.lugares.map((l) => l.id), pauta: `${r.pauta}:`, capaFundo: r.capa.foto });
      ctx.historico = montarHistorico(candidatos, [...fila, ...ctx.extra]);
      resumo.push({ dia: dia.data, ok: true, pauta: r.pauta, lugares: r.lugares.map((l) => l.nome), slides: r.slides });
    } catch (e) {
      console.log(`  FALHOU ${dia.data}: ${String(e.message).slice(0, 300)}`);
      resumo.push({ dia: dia.data, ok: false, erro: String(e.message).slice(0, 300) });
    }
  }
  console.log("\n=== RESUMO ===");
  for (const r of resumo) console.log(r.ok ? `${r.dia}  OK   ${r.pauta}: ${r.lugares.join(" | ")} (${r.slides} slides)` : `${r.dia}  FALTA ${r.erro}`);
  fs.writeFileSync(path.join(SAIDA, "resumo.json"), JSON.stringify(resumo, null, 1));
  const faltam = resumo.filter((r) => !r.ok).map((r) => r.dia.slice(8, 10) + "/" + r.dia.slice(5, 7));
  if (REAL && faltam.length) notify("Refúgio: fila do Instagram incompleta", `Sem post para ${faltam.join(", ")}. A próxima produção tenta de novo.`);
  process.exitCode = resumo.every((r) => r.ok) ? 0 : 2;
}

try { await main(); } catch (e) { console.error("ERRO:", e.message); process.exitCode = 1; } finally { await run.fecharNavegador(); }
