#!/usr/bin/env node
// Comando de PRODUÇÃO SEMANAL do Refúgio da Ferradura — roda NO MAC.
//
// Papel: o Mac/Claude produz tudo ANTES; a nuvem (fila + GitHub) só publica.
// Este comando olha os próximos N dias (padrão 7), vê quais ainda não têm item
// na fila e produz SÓ os que faltam. Para cada dia faltante:
//   pauta -> parceiros pelo rodízio -> fontes oficiais recentes (Instagram) ->
//   mídia (avaliada por imagem) -> capa editorial -> (matéria em RASCUNHO se a
//   pauta é destaque) -> carrossel 4:5 no B2 -> legenda -> item na fila.
// No fim, a semana está pronta; o Mac pode ser desligado. Este comando NUNCA
// publica: a publicação é 100% da fila + GitHub.
//
// Uso:
//   node src/semana.mjs                      simulação (padrão): não grava nada no B2, banco nem fila
//   node src/semana.mjs --real               produz de verdade (B2 + rascunho + fila)
//   opções: --dias 7  --forcar-pauta almoco  --so-dia AAAA-MM-DD  --snapshot arquivo.json
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
const { log } = await import("./log.mjs");
const run = await import("./run.mjs"); // reaproveita coleta de mídia e redação do destaque
const { gerarCapa } = await import("./capa.mjs");
const { escolherFundoVariado, baixarFundo, conferirFundo } = await import("./fundos.mjs");
const { tamanho, versaoInstagram, enviarAoB2 } = await import("./media.mjs");
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
const QUANDO_TXT = { 0: "NESTE *DOMINGO*", 6: "NESTE *SÁBADO*", 5: "NESTA *SEXTA*" };
const PAUTAS = {
  destaque: { tipo: "destaque", n: 1, cats: ["restaurante_cafe", "hospedagem", "atracao", "cervejaria", "producao_rural", "comercio_servico"] },
  almoco: { tipo: "lugares", n: 3, cats: ["restaurante_cafe"], titulo: (d) => `ONDE ALMOÇAR ${QUANDO_TXT[d.dow] || "NA *ROTA*"}`, sub: (n) => `${n} casas da Rota da Ferradura`, tema: "mata" },
  cafe: { tipo: "lugares", n: 3, cats: ["restaurante_cafe"], titulo: () => "UMA PAUSA PARA O *CAFÉ*", sub: (n) => `${n} paradas na Rota da Ferradura`, tema: "montanha" },
  ficar: { tipo: "lugares", n: 3, cats: ["hospedagem"], titulo: () => "ONDE *FICAR* NA ROTA DA FERRADURA", sub: (n) => `${n} hospedagens em Guarapari`, tema: "vista" },
  natureza: { tipo: "lugares", n: 3, cats: ["atracao", "producao_rural"], titulo: () => "NATUREZA E *PRODUÇÃO LOCAL*", sub: (n) => `${n} paradas na Rota da Ferradura`, tema: "cachoeira" },
};
// Sequência por dia da semana (0=dom). Não repete a pauta do dia anterior nem das últimas da fila.
const POR_DIA = { 1: "destaque", 2: "cafe", 3: "destaque", 4: "ficar", 5: "almoco", 6: "natureza", 0: "almoco" };
const ORDEM_ALT = ["destaque", "almoco", "cafe", "natureza", "ficar"];

function escolherPauta(dia, itensFila, jaPlanejadas) {
  if (FORCAR && PAUTAS[FORCAR]) return FORCAR;
  const recentes = [...itensFila.filter((i) => i.pauta).slice(0, 2).map((i) => String(i.pauta).split(":")[0]), ...jaPlanejadas.slice(-1)];
  let id = POR_DIA[dia.dow];
  for (let k = 0; recentes.includes(id) && k < ORDEM_ALT.length; k++) id = ORDEM_ALT[(ORDEM_ALT.indexOf(id) + 1) % ORDEM_ALT.length];
  return id;
}

// ─── Utilidades ────────────────────────────────────────────────────────────
const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return pad; } };
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
    .filter((t) => t.file && fs.existsSync(t.file) && t.score >= SCORE_UTIL && t.texto !== "problemático")
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
const temPresencaRecente = (todas) => todas.some((t) => t.takenAt && idadeDias(t.takenAt) <= 90);

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
    fotos: l.fotos.map((f) => ({ data: (f.takenAt || "").slice(0, 10) || null, idade_dias: idadeDias(f.takenAt), descricao: f.descricao, chamada_no_post: f.chamada || null, legenda_do_post: (f.legenda || "").slice(0, 280) })),
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
- Se uma foto tiver "chamada_no_post" útil e atual, pode aproveitá-la como gancho.
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

// ─── Fundo da capa: acervo do blog e paisagens oficiais do próprio dia ─────
async function escolherFundo({ tema, locais, usados, dir }) {
  // 1) acervo do blog/B2 (catálogo já classificado), conferido uma a uma
  const recusados = new Set();
  for (let i = 0; i < 4; i++) {
    let f;
    try { f = await escolherFundoVariado({ tema, excluir: recusados }); } catch { break; }
    const saida = path.join(dir, "fundo.jpg");
    await baixarFundo(f.url, saida);
    const mini = path.join(dir, "fundo-mini.jpg");
    await exec("sips", ["-s", "format", "jpeg", "--resampleHeightWidthMax", "700", saida, "--out", mini]);
    const c = await conferirFundo(mini);
    if (c.serve) return { arquivo: saida, origem: f.url, descricao: c.descricao };
    recusados.add(f.url);
  }
  // 2) paisagens dos posts oficiais avaliados hoje (origem conhecida, nunca repetida)
  const cand = locais.filter((t) => ["paisagem", "ponto"].includes(t.cena) && t.file && fs.existsSync(t.file) && t.texto !== "problemático" && !usados.has(t.origemUrl));
  for (const t of cand.slice(0, 3)) {
    const mini = path.join(dir, "fundo-mini.jpg");
    await exec("sips", ["-s", "format", "jpeg", "--resampleHeightWidthMax", "700", t.file, "--out", mini]);
    const c = await conferirFundo(mini);
    if (c.serve) return { arquivo: t.file, origem: t.origemUrl, descricao: c.descricao };
  }
  return null;
}

// ─── Produção de um dia ────────────────────────────────────────────────────
async function produzirDia(dia, ctx) {
  const pautaId = escolherPauta(dia, ctx.fila, ctx.planejadas);
  const P = PAUTAS[pautaId];
  const dir = path.join(SAIDA, `${dia.data}-${pautaId}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const rel = { dia: dia.data, quando: dia.quando, pauta: pautaId, lugares: [], descartados: [] };
  console.log(`\n=== ${dia.data} (${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dia.dow]}) ${horarioDe(dia.dow)}  pauta: ${pautaId}`);

  const recentes = new Set(ctx.fila.slice(0, 4).flatMap((i) => i.partnerIds || []));
  const ordenados = ordenar({ candidatos: ctx.candidatos, historico: ctx.historico, categorias: P.cats, recentes, bloqueados: ctx.usadosNaSemana, semMidia: ctx.semMidia });
  const escolhidos = [];
  let locais = [];
  let artigo = null;
  for (const c of ordenados.slice(0, P.n * 4)) {
    if (escolhidos.length >= P.n) break;
    console.log(`  - tentando ${c.nome} (id ${c.id})`);
    try {
      const topic = await api("/next-topic", { only: c.id });
      if (topic.status !== "ok") { rel.descartados.push({ id: c.id, nome: c.nome, motivo: `sem pauta: ${topic.status}` }); continue; }
      const sub = path.join(dir, `p${c.id}`);
      fs.mkdirSync(sub, { recursive: true });
      const midia = await run.prepararMidia(topic, sub, { carrossel: P.tipo !== "destaque" });
      locais.push(...midia.todas);
      if (!temPresencaRecente(midia.todas)) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: "sem post oficial nos últimos 90 dias" }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
      let fotos;
      if (P.tipo === "destaque") {
        if (!midia.ok) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: midia.motivo }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
        const red = await run.redigir(topic, midia.selecionadas, sub);
        if (!red.ok) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: red.motivo }); continue; }
        artigo = { ...red.artigo, selecionadas: midia.selecionadas, topic };
        fotos = midia.selecionadas.slice(0, 5).map((s) => ({ ...(midia.todas.find((t) => t.sourceId === s.sourceId) || {}), ...s, file: s.file || midia.todas.find((t) => t.sourceId === s.sourceId)?.file }));
      } else {
        fotos = fotosDoLugar(midia.todas, topic.regras);
        if (!fotos.length) { rel.descartados.push({ id: c.id, nome: c.nome, motivo: "nenhuma foto útil depois de esgotar as fontes" }); ctx.semMidia[c.id] = new Date().toISOString(); continue; }
      }
      escolhidos.push({ id: c.id, nome: topic.fatos.nome, handle: topic.fontes.instagram, categoria: c.categoria, regiao: topic.fatos.regiao, descricaoCurta: topic.fatos.descricaoCurta, fotos });
      ctx.usadosNaSemana.add(c.id);
      console.log(`    ok: ${fotos.length} foto(s), ${fotos.map((f) => `${f.cena}/${f.score}/${(f.takenAt || "").slice(0, 10)}`).join(" ")}`);
    } catch (e) {
      rel.descartados.push({ id: c.id, nome: c.nome, motivo: `erro: ${String(e.message).slice(0, 120)}` });
      console.log(`    erro: ${String(e.message).slice(0, 100)}`);
    }
  }
  fs.writeFileSync(SEM_MIDIA, JSON.stringify(ctx.semMidia));
  if (escolhidos.length < (P.tipo === "destaque" ? 1 : 2)) throw new Error(`poucos lugares viáveis (${escolhidos.length}); descartados: ${rel.descartados.map((d) => `${d.nome}: ${d.motivo}`).join(" | ").slice(0, 400)}`);
  rel.lugares = escolhidos.map((e) => ({ id: e.id, nome: e.nome, handle: e.handle, categoria: e.categoria, fotos: e.fotos.length }));

  // Capa
  const usadosFundo = new Set(ctx.fila.map((i) => i.capaFundo).filter(Boolean));
  const fundo = await escolherFundo({ tema: P.tema || "paisagem", locais, usados: usadosFundo, dir });
  if (!fundo) throw new Error("sem fundo de natureza livre e conferido (acervo esgotado)");
  const titulo = P.tipo === "destaque" ? `*${escolhidos[0].nome.toUpperCase()}* NA ROTA DA FERRADURA` : P.titulo(dia);
  const subtitulo = P.tipo === "destaque" ? (CATEGORIA_LABEL[escolhidos[0].categoria] ? `Destaque da Rota: ${CATEGORIA_LABEL[escolhidos[0].categoria]}` : null) : P.sub(escolhidos.length);
  const capa = await gerarCapa({ titulo, subtitulo, fundo: fundo.arquivo, saida: path.join(dir, "capa.jpg") });
  rel.capa = { layout: capa.layout, fundo: fundo.origem, fundoDescricao: fundo.descricao, titulo, subtitulo };

  // Legenda
  const pautaTxt = { titulo: P.tipo === "destaque" ? `Destaque: ${escolhidos[0].nome}` : titulo.replace(/\*/g, "") };
  const corpo = await escreverLegenda({ pauta: pautaTxt, lugares: escolhidos, dia, dir });
  const fechamento = P.tipo === "destaque" ? "Horário e cardápio mudam: confirme direto com o perfil antes de ir.\n\nMatéria completa no site Guia Refúgio Ferradura. Link na bio." : "Cardápio e horário mudam, então confirme direto com cada casa antes de ir.\n\nVeja tudo sobre a Rota da Ferradura no site Guia Refúgio Ferradura. Link na bio.";
  const caption = `${corpo}\n\n${fechamento}\n\n${HASHTAGS}`;
  fs.writeFileSync(path.join(dir, "legenda.txt"), caption);

  // Slides (capa + fotos na ordem dos lugares)
  const arquivos = [path.join(dir, "capa.jpg"), ...escolhidos.flatMap((e) => e.fotos.map((f) => f.file))];
  const prontos = [];
  for (const a of arquivos) prontos.push(a.endsWith("capa.jpg") ? a : await prepararSlide(a));
  prontos.forEach((a, i) => fs.copyFileSync(a, path.join(dir, `slide-${i + 1}.jpg`)));
  rel.slides = prontos.length;
  rel.caption = caption;

  if (!REAL) {
    fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
    console.log(`  simulação ok: ${prontos.length} slides, capa ${capa.layout}, pasta ${dir}`);
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
  const q = await enfileirar({ titulo: pautaTxt.titulo, quando: dia.quando, caption, imageUrls: urls, postId, capaFundo: fundo.origem, pauta: `${pautaId}: ${pautaTxt.titulo}`, partnerIds: escolhidos.map((e) => e.id) });
  if (q.status !== "queued") throw new Error(`fila recusou: ${q.status || q.http} ${JSON.stringify(q.erros || q.erro || "")}`);
  rel.fila = { id: q.id, postId };
  fs.writeFileSync(path.join(dir, "plano.json"), JSON.stringify(rel, null, 1));
  console.log(`  NA FILA: item ${q.id}${postId ? `, matéria em rascunho ${postId}` : ""}`);
  return rel;
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
  const ctx = { fila, extra, candidatos, historico: montarHistorico(candidatos, [...fila, ...extra]), usadosNaSemana: new Set(), semMidia: lerJson(SEM_MIDIA, {}), planejadas: [] };
  const resumo = [];
  for (const dia of faltantes) {
    try {
      const r = await produzirDia(dia, ctx);
      ctx.planejadas.push(r.pauta);
      // o histórico passa a contar o que acabou de ser produzido (rodízio dentro da própria semana)
      fila.unshift({ status: "aguardando", scheduledAt: dia.quando, partnerIds: r.lugares.map((l) => l.id), pauta: `${r.pauta}:`, capaFundo: r.capa.fundo });
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
  process.exitCode = resumo.every((r) => r.ok) ? 0 : 2;
}

try { await main(); } catch (e) { console.error("ERRO:", e.message); process.exitCode = 1; } finally { await run.fecharNavegador(); }
