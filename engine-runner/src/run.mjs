#!/usr/bin/env node
// Motor de conteúdo diário do Refúgio da Ferradura — roda NO MAC.
//
// Fluxo: (1) pergunta ao servidor se já publicou hoje; (2) reserva o dia;
// (3) pede uma pauta (destaque individual); (4) junta mídia REAL do lugar, nesta
// ordem de fontes: Instagram oficial (Playwright, sem login) > fotos já na
// matéria/B2 > site oficial; (5) o Claude Code local avalia TODAS as fotos
// (inclusive as antigas da matéria) e escreve o artigo; (6) o servidor valida e
// publica no blog. Sem API paga, sem API do Instagram, sem publicar no
// Instagram (isso é do fluxo matéria -> Instagram).
//
// Regra de ouro: a matéria só sai se as imagens forem realmente úteis para
// explicar/vender o lugar (capa que mostra o lugar, sem texto sobreposto, com
// resolução decente, e cenas coerentes com a categoria). Senão, pula a pauta.
//
// Uso:  node src/run.mjs --dry-run [--partner ID] [--probe-upload] [--no-mark]
//       node src/run.mjs             (execução real, só com o motor ligado)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_DIR, MAX_IMAGENS, IG_ESTAGIOS } from "./config.mjs";
import { log, notify } from "./log.mjs";
import { api } from "./api.mjs";
import { abrirNavegador, abrirPerfil, midiaDoPost, pausa } from "./ig.mjs";
import { baixar, tamanho, sha256, quadroDoVideo, versaoInstagram, miniatura, enviarAoB2 } from "./media.mjs";
import { imagensDoSite } from "./site.mjs";
import { avaliarImagens, escreverArtigo } from "./claude.mjs";
import { selecionar } from "./select.mjs";

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes("--dry-run");
const NO_MARK = ARGS.includes("--no-mark");
const PROBE = ARGS.includes("--probe-upload");
const argVal = (n) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : null; };
const SO_LUGAR = DRY && argVal("--partner") ? Number(argVal("--partner")) : null; // só no dry-run
const MAX_PAUTAS = 5;
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA_DRY = path.resolve(AQUI, "..", "..", "output", "engine-dry-run");
const LOCK = path.join(CACHE_DIR, "run.lock");
const REJEITADOS = path.join(CACHE_DIR, "rejeitados.json");

const hojeBRT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

// ─── Trava local (evita duas execuções ao mesmo tempo no Mac) ───────────────
function pegarLock() {
  try {
    const st = fs.statSync(LOCK);
    if (Date.now() - st.mtimeMs < 90 * 60000) return false; // outra execução recente
  } catch {}
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
}
const soltarLock = () => { try { fs.unlinkSync(LOCK); } catch {} };

// Cache local de posts já reprovados na avaliação visual (não reavaliar).
function lerRejeitados() { try { return JSON.parse(fs.readFileSync(REJEITADOS, "utf8")); } catch { return {}; } }
function salvarRejeitados(o) { fs.writeFileSync(REJEITADOS, JSON.stringify(o)); }

let browser = null;

// Desconto por resolução baixa (menor lado em px).
function penalidadeResolucao(w, h) {
  const lado = Math.min(w || 0, h || 0);
  if (!lado) return 2;
  if (lado < 800) return 2;
  if (lado < 1000) return 1;
  return 0;
}

const descricaoDe = (r) => String(r.descricao ?? r.nota ?? "").split(" | ")[0] || "imagem do lugar";

// ─── Avaliação visual (todas as imagens, inclusive as antigas da matéria) ────
// Cada item precisa de { file, width, height, legenda? }. Preenche score final
// (nota visual, com teto 4 só para texto problemático, e desconto de resolução),
// cena, descricao e `aprovada`. Imagem ilegível é descartada sozinha.
async function avaliarEFiltrar(itens, dir, topic) {
  if (!itens.length) return itens;
  const regras = topic.regras;
  const vetDir = path.join(dir, "vet");
  fs.mkdirSync(vetDir, { recursive: true });
  const lote = [];
  for (const c of itens) {
    const nome = `v${String(lote.length + 1).padStart(2, "0")}.jpg`;
    try {
      await miniatura(c.file, path.join(vetDir, nome));
      lote.push({ c, nome });
    } catch {
      c.score = 0; c.cena = "outro"; c.aprovada = false; c.descricao = "arquivo ilegível";
    }
  }
  if (!lote.length) return itens;
  const resp = await avaliarImagens(lote.map((l) => ({ nomeArquivo: l.nome, legenda: l.c.legenda, data: l.c.takenAt })), {
    cwd: vetDir, lugar: topic.fatos.nome, categoria: topic.categoria, cenasNucleo: regras.cenasNucleo,
  });
  lote.forEach((l, i) => {
    const r = resp.find((x) => x.arquivo === l.nome) || resp[i] || {};
    const c = l.c;
    let nota = Number.isFinite(r.nota) ? r.nota : 0;
    // Texto sobre a imagem NÃO reprova por si só: só o texto problemático
    // (poluído, promoção vencida, preço antigo, evento passado, arte ruim).
    c.textoSobreposto = r.texto_sobreposto === true;
    c.textoProblematico = r.texto_problematico === true;
    c.chamada = typeof r.chamada === "string" ? r.chamada.trim() : "";
    if (c.textoProblematico) nota = Math.min(nota, 4);
    const pen = penalidadeResolucao(c.width, c.height);
    c.score = Math.max(0, Math.round(nota - pen));
    c.cena = r.cena || "outro";
    c.descricao = r.descricao || "";
    c.motivo = r.motivo || "";
    c.penalidade = pen;
    c.notaVisual = Math.round(Number.isFinite(r.nota) ? r.nota : 0);
    c.aprovada = c.score >= regras.scoreUtil;
    c.nota = `${c.descricao} | ${c.motivo}${c.textoProblematico ? " | texto problemático" : ""}${c.chamada ? ` | chamada: ${c.chamada}` : ""}${pen ? ` | -${pen} resolução` : ""}`;
  });
  return itens;
}

// Aprovada: em execução real vai para o B2 + acervo; no dry-run fica só local.
async function guardar(c, topic) {
  if (DRY) return { id: null, url: null, local: true };
  const principal = await enviarAoB2(api, { partnerId: topic.partnerId, source: c.source, sourceId: c.sourceId, hash: c.sha256, arquivo: c.file });
  if (principal.exists) return { id: principal.id, url: principal.url };
  let urlIg = null;
  const ig = await versaoInstagram(c.file, { width: c.width, height: c.height });
  if (ig) {
    const up = await enviarAoB2(api, { partnerId: topic.partnerId, source: c.source, sourceId: c.sourceId, arquivo: ig, role: "ig" });
    urlIg = up.url;
  }
  const reg = await api("/media/register", {
    partnerId: topic.partnerId, source: c.source, sourceId: c.sourceId, url: principal.url, urlInstagram: urlIg,
    sha256: c.sha256, width: c.width, height: c.height, origemUrl: c.origemUrl, destinoUrl: c.destinoUrl,
    isReel: c.isReel, tipoMidia: c.source === "site_oficial" ? "site_oficial" : "instagram_oficial",
    takenAt: c.takenAt ? new Date(c.takenAt).toISOString() : null, cena: c.cena, score: c.score, nota: c.nota,
  });
  if (reg.status !== "created" && reg.status !== "exists") throw new Error(`register: ${reg.status || reg.http} ${reg.error || ""}`);
  return { id: reg.id, url: principal.url };
}

// opts.carrossel: para carrossel de VÁRIOS lugares basta 1 foto boa por lugar (nota >= scoreUtil);
// o destaque individual continua exigindo a seleção completa (capa, núcleo, 3+ imagens).
export async function prepararMidia(topic, dir, opts = {}) {
  const handle = topic.fontes.instagram;
  const lugar = topic.fatos.nome;
  const regras = topic.regras;
  const pool0 = await api("/media/pool", { partnerId: topic.partnerId, materialize: !DRY });
  let pool = pool0.rows || [];
  const locais = []; // aprovadas ainda só locais (dry-run)
  const todas = []; // toda candidata avaliada (para transparência)
  const atual = () => [...pool, ...locais];
  const escolher = () => {
    if (!opts.carrossel) return selecionar(atual(), regras);
    const boas = atual().filter((r) => (r.score ?? 0) >= regras.scoreUtil);
    return boas.length ? { ok: true, lista: boas } : { ok: false, motivo: "nenhuma foto útil ainda" };
  };
  const conhecidos = new Set(pool.map((r) => String(r.sourceId)));
  const hashesVistos = new Set();
  const rejeitados = lerRejeitados();
  const chaveRej = handle || `lugar${topic.partnerId}`;
  const rejH = (rejeitados[chaveRej] = rejeitados[chaveRej] || {});
  const resumo = { daMateria: pool.length, avaliadasDaMateria: 0, instagram: { postsLidos: 0, candidatos: 0, aprovadas: 0 }, site: { candidatos: 0, aprovadas: 0 } };
  log("midia_inicial", { lugar, noAcervo: pool.length, ready: pool0.ready });

  // ── Fotos antigas da matéria/acervo SEM nota: avaliar de verdade ──
  const semNota = pool.filter((r) => r.score == null);
  if (semNota.length) {
    const itens = [];
    let n = 0;
    for (const r of semNota) {
      n++;
      const file = path.join(dir, `acervo_${n}.jpg`);
      try {
        await baixar(r.url, file);
        const dim = await tamanho(file);
        r.width = dim.width; r.height = dim.height;
        itens.push({ file, width: dim.width, height: dim.height, row: r, legenda: "" });
      } catch { r.score = 0; r.cena = "outro"; }
    }
    await avaliarEFiltrar(itens, dir, topic);
    for (const it of itens) {
      const r = it.row;
      r.score = it.score; r.cena = it.cena; r.nota = it.nota; r.descricao = it.descricao; r.file = it.file; r.width = it.width; r.height = it.height;
      todas.push({ origem: "matéria/B2", url: r.url, score: it.score, cena: it.cena, descricao: it.descricao, motivo: it.motivo, texto: it.textoProblematico ? "problemático" : it.textoSobreposto ? "útil" : false, chamada: it.chamada, tamanho: `${it.width}x${it.height}`, penalidade: it.penalidade, file: it.file });
      if (!DRY && r.id) await api("/media/rate", { id: r.id, score: it.score, cena: it.cena, nota: it.nota, width: it.width, height: it.height });
    }
    resumo.avaliadasDaMateria = itens.length;
  }
  let sel = escolher();

  async function processarCandidatos(candidatos, origem) {
    await avaliarEFiltrar(candidatos, dir, topic);
    for (const c of candidatos) {
      todas.push({ origem: c.source, sourceId: c.sourceId, takenAt: c.takenAt ?? null, origemUrl: c.origemUrl ?? null, legenda: (c.legenda || "").slice(0, 400), width: c.width, height: c.height, score: c.score, cena: c.cena, descricao: c.descricao, motivo: c.motivo, texto: c.textoProblematico ? "problemático" : c.textoSobreposto ? "útil" : false, chamada: c.chamada, tamanho: `${c.width}x${c.height}`, penalidade: c.penalidade, reel: c.isReel, file: c.file });
      if (!c.aprovada) continue;
      const g = await guardar(c, topic);
      const linha = {
        id: g.id, source: c.source, sourceId: c.sourceId, url: g.url || `file://${c.file}`, width: c.width, height: c.height,
        score: c.score, cena: c.cena, nota: c.nota, descricao: c.descricao, isReel: c.isReel,
        tipoMidia: c.source === "site_oficial" ? "site_oficial" : "instagram_oficial",
        origemUrl: c.origemUrl, destinoUrl: c.destinoUrl, takenAt: c.takenAt, usedCount: 0, lastUsedAt: null, file: c.file,
      };
      if (DRY) locais.push(linha); else pool.push(linha);
      resumo[origem].aprovadas++;
    }
    return candidatos;
  }

  // ── Fonte 1: Instagram oficial (busca gradual 12 -> 20 -> 30 posts) ──
  if (handle) {
    browser = browser || (await abrirNavegador());
    const perfil = await abrirPerfil(browser, handle);
    if (perfil.bloqueado) {
      log("instagram_bloqueado", { handle });
    } else {
      try {
        for (let e = 0; e < IG_ESTAGIOS.length; e++) {
          // Instagram é a 1ª fonte: só pula se o acervo já tem fotos úteis suficientes DELE.
          if (e === 0 && atual().filter((r) => r.source === "instagram_oficial" && (r.score ?? 0) >= regras.scoreUtil).length >= MAX_IMAGENS) break;
          if (e > 0 && sel.ok) break;
          const posts = await perfil.posts(IG_ESTAGIOS[e]);
          resumo.instagram.postsLidos = Math.max(resumo.instagram.postsLidos, posts.length);
          const novos = posts.filter((p) => !rejH[p.codigo] && ![...conhecidos].some((s) => s.startsWith(`${p.codigo}:`)));
          log("instagram_estagio", { handle, limite: IG_ESTAGIOS[e], posts: posts.length, novos: novos.length });
          const candidatos = [];
          for (const p of novos) {
            if (candidatos.length >= 14) break;
            try {
              const m = await midiaDoPost(p.permalink);
              await pausa();
              if (!m) { rejH[p.codigo] = "sem mídia"; continue; }
              let n = 0;
              for (const it of m.itens.slice(0, 6)) {
                n++;
                const base = path.join(dir, `${p.codigo}_${n}`);
                if (it.type === "image") {
                  const file = `${base}.jpg`;
                  try { await baixar(it.url, file); } catch { continue; }
                  candidatos.push({ file, sourceId: `${p.codigo}:${n}`, isReel: false, origemUrl: p.permalink, destinoUrl: p.permalink, takenAt: m.takenAt || p.data, legenda: m.legenda, source: "instagram_oficial", codigo: p.codigo });
                } else {
                  for (const [k, seg] of [["f1", 1.5], ["f2", 4]]) {
                    const file = `${base}_${k}.jpg`;
                    try { if (!(await quadroDoVideo(it.url, seg, file))) continue; } catch { continue; }
                    candidatos.push({ file, sourceId: `${p.codigo}:${k}`, isReel: true, origemUrl: p.permalink, destinoUrl: p.permalink, takenAt: m.takenAt || p.data, legenda: m.legenda, source: "instagram_oficial", codigo: p.codigo });
                  }
                }
              }
            } catch (err) {
              log("instagram_post_erro", { codigo: p.codigo, erro: String(err.message).slice(0, 100) });
            }
          }
          // dimensões, hash e dedupe local (mesma foto não entra duas vezes)
          const uteis = [];
          for (const c of candidatos) {
            try {
              const buf = fs.readFileSync(c.file);
              c.sha256 = sha256(buf);
              if (hashesVistos.has(c.sha256)) continue;
              hashesVistos.add(c.sha256);
              Object.assign(c, await tamanho(c.file));
              uteis.push(c);
            } catch { /* imagem ilegível: ignora só esta */ }
          }
          resumo.instagram.candidatos += uteis.length;
          await processarCandidatos(uteis, "instagram");
          // Posts sem nenhuma foto aprovada entram no cache (não reavaliar).
          const aprovouPost = new Map();
          for (const c of uteis) aprovouPost.set(c.codigo, aprovouPost.get(c.codigo) || c.aprovada);
          for (const [codigo, ok] of aprovouPost) { if (ok) delete rejH[codigo]; else rejH[codigo] = "reprovada na avaliação visual"; }
          salvarRejeitados(rejeitados);
          sel = escolher();
        }
      } finally {
        await perfil.fechar();
      }
    }
  }

  // ── Regra: a avaliação é por IMAGEM, nunca por parceiro ──
  // Cartaz, arte promocional ou texto pesado reprovam SÓ aquela imagem. Antes de
  // desistir do lugar, volta aos Reels já lidos do mesmo perfil e tira quadros
  // novos (7s, 11s, 15s). Depois ainda vêm o acervo da matéria (B2) e o site.
  if (!sel.ok && handle && browser) {
    const reprovados = Object.entries(rejH).filter(([, v]) => v === "reprovada na avaliação visual").map(([c]) => c).slice(0, 10);
    const candidatos = [];
    for (const codigo of reprovados) {
      if (rejH[`${codigo}:x`]) continue; // quadros extras deste Reel já foram tentados
      rejH[`${codigo}:x`] = "quadros extras tentados";
      try {
        const permalink = `https://www.instagram.com/${handle}/reel/${codigo}/`;
        const m = await midiaDoPost(permalink);
        await pausa();
        for (const it of (m?.itens || []).filter((i) => i.type === "video").slice(0, 2)) {
          for (const [k, seg] of [["f3", 7], ["f4", 11], ["f5", 15]]) {
            const file = path.join(dir, `${codigo}_x_${k}.jpg`);
            try { if (!(await quadroDoVideo(it.url, seg, file))) continue; } catch { continue; }
            candidatos.push({ file, sourceId: `${codigo}:${k}`, isReel: true, origemUrl: permalink, destinoUrl: permalink, takenAt: m.takenAt || null, legenda: m.legenda, source: "instagram_oficial", codigo });
          }
        }
      } catch { /* este Reel não rende mais quadros: segue para o próximo */ }
    }
    const uteis = [];
    for (const c of candidatos) {
      try {
        c.sha256 = sha256(fs.readFileSync(c.file));
        if (hashesVistos.has(c.sha256)) continue;
        hashesVistos.add(c.sha256);
        Object.assign(c, await tamanho(c.file));
        uteis.push(c);
      } catch { /* imagem ilegível: só esta é ignorada */ }
    }
    salvarRejeitados(rejeitados);
    log("instagram_quadros_extras", { handle, reels: reprovados.length, candidatos: uteis.length });
    if (uteis.length) {
      resumo.instagram.candidatos += uteis.length;
      await processarCandidatos(uteis, "instagram");
      sel = escolher();
    }
  }

  // ── Fonte 3: site oficial (só se ainda faltar) ──
  if (!sel.ok && topic.fontes.site) {
    try {
      const imgs = await imagensDoSite(topic.fontes.site);
      const candidatos = [];
      let n = 0;
      for (const im of imgs) {
        n++;
        const file = path.join(dir, `site_${n}.jpg`);
        try { await baixar(im.url, file); } catch { continue; }
        const dim = await tamanho(file).catch(() => null);
        if (!dim || dim.width < 1000) continue;
        const buf = fs.readFileSync(file);
        const h = sha256(buf);
        if (hashesVistos.has(h)) continue;
        hashesVistos.add(h);
        candidatos.push({ file, sourceId: im.url, sha256: h, ...dim, isReel: false, origemUrl: im.destino, destinoUrl: im.destino, takenAt: null, legenda: "", source: "site_oficial" });
      }
      resumo.site.candidatos = candidatos.length;
      await processarCandidatos(candidatos, "site");
      sel = escolher();
    } catch (err) {
      log("site_erro", { erro: String(err.message).slice(0, 100) });
    }
  }

  // Em execução real, relê o acervo para ter ids de todas as selecionadas.
  if (!DRY) {
    const fim = await api("/media/pool", { partnerId: topic.partnerId, materialize: true });
    pool = fim.rows || pool;
    sel = opts.carrossel ? escolher() : selecionar(pool, regras);
  }
  log("midia_final", { lugar, ok: sel.ok, selecionadas: sel.lista?.length ?? 0, motivo: sel.motivo, resumo });
  return sel.ok ? { ok: true, selecionadas: sel.lista, todas, resumo } : { ok: false, motivo: `mídia não serve: ${sel.motivo}`, todas, resumo };
}

// ─── Texto ──────────────────────────────────────────────────────────────────
const metaDe = (r) => ({ score: r.score ?? null, cena: r.cena ?? null, width: r.width ?? null, height: r.height ?? null });

export async function redigir(topic, selecionadas, dir) {
  const capa = selecionadas[0];
  const fotos = selecionadas.slice(1).map((r, i) => ({ n: i + 1, cena: r.cena, descricao: descricaoDe(r) }));
  let erros = null;
  for (let t = 0; t < 3; t++) {
    const art = await escreverArtigo(topic, { cwd: dir, erros, capa: { cena: capa.cena, descricao: descricaoDe(capa) }, fotos });
    // O Claude responde com o NÚMERO da foto; traduz para o índice/ID.
    const artigo = { ...art, sections: (art.sections || []).map((s) => {
      const n = Number.isInteger(s.imagem) && s.imagem >= 1 && s.imagem <= fotos.length ? s.imagem : null;
      const { imagem, ...resto } = s;
      return { ...resto, imagemIdx: n, imagemId: n ? selecionadas[n].id : null };
    }) };
    const v = await api("/publish", { partnerId: topic.partnerId, article: artigo, dryRun: true, imagensMeta: selecionadas.map(metaDe) });
    if (v.status === "dry_run_ok") return { ok: true, artigo, imagensPublicadas: v.imagensPublicadas };
    erros = v.erros || [`validação: ${v.status || v.http}`];
    log("artigo_rejeitado", { tentativa: t + 1, erros });
  }
  return { ok: false, motivo: `artigo reprovado na validação: ${erros.join(" | ").slice(0, 400)}` };
}

// Prévia do dry-run: tudo local, para revisar sem publicar nada.
function escreverPrevia(topic, selecionadas, artigo, todas) {
  const pasta = path.join(SAIDA_DRY, `${hojeBRT()}-${String(Date.now()).slice(-5)}`);
  fs.mkdirSync(pasta, { recursive: true });
  const copiar = (r, nome) => {
    if (r.file && fs.existsSync(r.file)) { const n = `${nome}${path.extname(r.file) || ".jpg"}`; fs.copyFileSync(r.file, path.join(pasta, n)); return n; }
    return r.url;
  };
  const capaSrc = copiar(selecionadas[0], "capa");
  const usadas = new Set(artigo.sections.map((s) => s.imagemIdx).filter(Boolean));
  const secoes = artigo.sections.map((s) => ({ s, src: s.imagemIdx ? copiar(selecionadas[s.imagemIdx], `secao-${s.imagemIdx}`) : null }));
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const secs = secoes.map(({ s, src }) => `<h2>${esc(s.heading)}</h2><p>${s.paragraphHtml}</p>${src ? `<img src="${src}">` : ""}`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>Prévia (dry-run)</title><style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6}img{width:100%;border-radius:6px;margin:1rem 0}small{color:#777}</style>
<p><small>PRÉVIA DO DRY-RUN. NADA FOI PUBLICADO.</small></p><h1>${esc(artigo.title)}</h1><p><em>${esc(artigo.subtitle || "")}</em></p><img src="${capaSrc}">${secs}`;
  fs.writeFileSync(path.join(pasta, "index.html"), html);
  // Todas as imagens avaliadas (aprovadas ou não), para auditar o critério.
  const avaliadas = todas.map((t, i) => {
    let arq = null;
    if (t.file && fs.existsSync(t.file)) { arq = `avaliada-${String(i + 1).padStart(2, "0")}${path.extname(t.file)}`; fs.copyFileSync(t.file, path.join(pasta, arq)); }
    const { file, ...resto } = t;
    return { arquivo: arq, ...resto };
  });
  fs.writeFileSync(path.join(pasta, "detalhes.json"), JSON.stringify({
    lugar: topic.fatos.nome, partnerId: topic.partnerId, categoria: topic.categoria, titulo: artigo.title,
    publicadas: [selecionadas[0], ...secoes.filter((x) => x.s.imagemIdx).map((x) => selecionadas[x.s.imagemIdx])].map((r, i) => ({
      ordem: i + 1, papel: i === 0 ? "capa" : "seção", fonte: r.source, nota: r.score, cena: r.cena, descricao: descricaoDe(r), tamanho: `${r.width}x${r.height}`, origem: r.origemUrl,
    })),
    descartadasDaSelecao: selecionadas.filter((_, i) => i > 0 && !usadas.has(i)).map((r) => ({ sourceId: r.sourceId, cena: r.cena, descricao: descricaoDe(r) })),
    todasAvaliadas: avaliadas,
  }, null, 1));
  return pasta;
}

// ─── Principal ──────────────────────────────────────────────────────────────
async function executar(runId) {
  const excluidos = [];
  const descartes = [];
  let infra = false;
  for (let i = 0; i < MAX_PAUTAS; i++) {
    const topic = await api("/next-topic", { exclude: excluidos, only: SO_LUGAR });
    if (topic.status === "no_topic") { descartes.push("sem pauta elegível"); break; }
    if (topic.status !== "ok") throw new Error(`next-topic: ${topic.status || topic.http}`);
    const nome = topic.fatos.nome;
    log("pauta", { partnerId: topic.partnerId, nome, categoria: topic.categoria, elegiveis: topic.elegiveis });
    const dir = path.join(CACHE_DIR, hojeBRT(), `p${topic.partnerId}`);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const midia = await prepararMidia(topic, dir);
      if (!midia.ok) {
        descartes.push(`${nome}: ${midia.motivo}`);
        excluidos.push(topic.partnerId);
        if (DRY) {
          const d = path.join(SAIDA_DRY, `descartada-${hojeBRT()}-p${topic.partnerId}-${String(Date.now()).slice(-4)}`);
          fs.mkdirSync(d, { recursive: true });
          const avaliadas = midia.todas.map((t, k) => {
            let arq = null;
            if (t.file && fs.existsSync(t.file)) { arq = `avaliada-${String(k + 1).padStart(2, "0")}${path.extname(t.file)}`; fs.copyFileSync(t.file, path.join(d, arq)); }
            const { file, ...resto } = t;
            return { arquivo: arq, ...resto };
          });
          fs.writeFileSync(path.join(d, "detalhes.json"), JSON.stringify({ lugar: nome, categoria: topic.categoria, motivo: midia.motivo, resumo: midia.resumo, avaliadas }, null, 1));
          log("pauta_descartada_detalhes", { pasta: d });
        }
        continue;
      }
      const r = await redigir(topic, midia.selecionadas, dir);
      if (!r.ok) { descartes.push(`${nome}: ${r.motivo}`); excluidos.push(topic.partnerId); continue; }

      if (DRY) {
        const pasta = escreverPrevia(topic, midia.selecionadas, r.artigo, midia.todas);
        if (PROBE) {
          const enviados = [];
          const usados = [midia.selecionadas[0], ...r.artigo.sections.filter((s) => s.imagemIdx).map((s) => midia.selecionadas[s.imagemIdx])];
          for (let k = 0; k < usados.length; k++) {
            const x = usados[k];
            if (!x.file) { enviados.push({ ordem: k + 1, origem: "ja_no_b2", url: x.url }); continue; }
            const up = await enviarAoB2(api, { partnerId: topic.partnerId, source: "probe", sourceId: `probe-${Date.now()}-${k}`, hash: null, arquivo: x.file });
            enviados.push({ ordem: k + 1, origem: x.source, url: up.url });
          }
          fs.writeFileSync(path.join(pasta, "enviados-b2.json"), JSON.stringify(enviados, null, 1));
          log("probe_upload_ok", { enviados: enviados.length });
        }
        if (!NO_MARK) await api("/dry-run-complete", { resumo: { partnerId: topic.partnerId, lugar: nome, titulo: r.artigo.title, imagens: r.imagensPublicadas } });
        log("dry_run_ok", { lugar: nome, imagensPublicadas: r.imagensPublicadas, previa: pasta, marcado: !NO_MARK });
        return { ok: true, dry: true, pasta };
      }

      const pub = await api("/publish", { runId, partnerId: topic.partnerId, article: r.artigo, imagens: midia.selecionadas.map((x) => x.id) });
      if (pub.status === "published") {
        log("publicado", { postId: pub.postId, slug: pub.slug, lugar: nome, imagens: pub.imagens });
        notify("Refúgio: matéria publicada", `${r.artigo.title}`);
        return { ok: true, postId: pub.postId };
      }
      descartes.push(`${nome}: publish ${pub.status || pub.http} ${(pub.erros || [pub.error]).join(" | ")}`);
      excluidos.push(topic.partnerId);
    } catch (err) {
      infra = true;
      descartes.push(`${nome}: ERRO ${String(err.message).slice(0, 160)}`);
      excluidos.push(topic.partnerId);
      log("pauta_erro", { nome, erro: String(err.message).slice(0, 200) });
    }
    if (SO_LUGAR) break; // teste forçado de um lugar: não sorteia outro
  }
  return { ok: false, descartes, infra };
}

async function main() {
  if (!pegarLock()) { log("outra_execucao_em_andamento"); return; }
  let runId = null;
  try {
    log("inicio", { dry: DRY, api: process.env.ENGINE_API || "producao", somenteLugar: SO_LUGAR });
    const st = await api("/status");
    if (st.http === 401) throw new Error("segredo inválido (401)");
    if (!DRY) {
      if (!st.enabled) { log("motor_desligado"); return; }
      if (!st.dryRunOk) { log("dry_run_pendente"); return; }
      if (st.run?.status === "published") { log("ja_executou_hoje", { postId: st.run.postId }); return; }
      const claim = await api("/claim", {});
      if (claim.status !== "claimed") { log("sem_execucao", { motivo: claim.status }); if (claim.status === "gave_up") notify("Refúgio: motor", "3 tentativas hoje sem sucesso. Tenta de novo amanhã."); return; }
      runId = claim.runId;
    }
    const r = await executar(runId);
    if (!r.ok) {
      log("sem_materia", { descartes: r.descartes });
      if (!DRY && runId) {
        // Falha de conteúdo (sem mídia/validação): encerra o dia. Falha de
        // infraestrutura (Claude fora do ar etc.): libera para nova tentativa.
        await api("/fail", { runId, reason: r.descartes.join(" | "), final: !r.infra });
        if (!r.infra) notify("Refúgio: sem matéria hoje", r.descartes[0] || "nenhuma pauta viável");
      }
      process.exitCode = DRY ? 2 : 0;
    }
  } catch (err) {
    log("erro_fatal", { erro: String(err.message).slice(0, 300) });
    if (runId) await api("/fail", { runId, reason: `erro: ${String(err.message).slice(0, 300)}`, final: false }).catch(() => {});
    if (!DRY) notify("Refúgio: erro no motor", String(err.message).slice(0, 120));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    soltarLock();
  }
}

// Permite reaproveitar a coleta de mídia no comando semanal (semana.mjs) sem disparar o motor diário.
export async function fecharNavegador() { if (browser) { await browser.close().catch(() => {}); browser = null; } }
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
