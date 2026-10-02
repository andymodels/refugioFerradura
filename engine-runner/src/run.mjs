#!/usr/bin/env node
// Motor de conteúdo diário do Refúgio da Ferradura — roda NO MAC.
//
// Fluxo: (1) pergunta ao servidor se já publicou hoje; (2) reserva o dia;
// (3) pede uma pauta (destaque individual); (4) junta mídia REAL do lugar, nesta
// ordem de fontes: Instagram oficial (Playwright, sem login) > fotos já na
// matéria/B2 > site oficial; (5) o Claude Code local avalia as fotos e escreve
// o artigo; (6) o servidor valida e publica no blog. Sem API paga, sem API do
// Instagram, sem publicar no Instagram (isso é do fluxo matéria -> Instagram).
//
// Uso:  node src/run.mjs --dry-run   (simula tudo, não grava nada; obrigatório
//                                      antes de ativar)
//       node src/run.mjs             (execução real, só com o motor ligado)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CACHE_DIR, MIN_IMAGENS, MAX_IMAGENS, SCORE_MIN, IG_ESTAGIOS,
} from "./config.mjs";
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

// ─── Mídia ──────────────────────────────────────────────────────────────────
async function avaliarEFiltrar(candidatos, dir, lugar) {
  if (!candidatos.length) return candidatos;
  const vetDir = path.join(dir, "vet");
  fs.mkdirSync(vetDir, { recursive: true });
  const itens = [];
  const validos = [];
  for (let i = 0; i < candidatos.length; i++) {
    const nome = `v${String(validos.length + 1).padStart(2, "0")}.jpg`;
    try {
      await miniatura(candidatos[i].file, path.join(vetDir, nome));
      itens.push({ nomeArquivo: nome, legenda: candidatos[i].legenda });
      validos.push(candidatos[i]);
    } catch {
      candidatos[i].aprovada = false; // arquivo ilegível: descarta só esta imagem
      candidatos[i].score = 0;
      candidatos[i].cena = "outro";
    }
  }
  if (!validos.length) return candidatos;
  const resp = await avaliarImagens(itens, { cwd: vetDir, lugar });
  validos.forEach((c, i) => {
    const r = resp.find((x) => x.arquivo === itens[i].nomeArquivo) || resp[i] || {};
    c.score = Number.isFinite(r.nota) ? Math.round(r.nota) : 0;
    c.cena = r.cena || "outro";
    c.nota = r.motivo || "";
    c.aprovada = r.ok === true && c.score >= SCORE_MIN;
  });
  return candidatos;
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

async function prepararMidia(topic, dir) {
  const handle = topic.fontes.instagram;
  const lugar = topic.fatos.nome;
  const pool0 = await api("/media/pool", { partnerId: topic.partnerId, materialize: !DRY });
  let pool = pool0.rows || [];
  const locais = []; // aprovadas ainda só locais (dry-run)
  const atual = () => [...pool, ...locais];
  const conhecidos = new Set(pool.map((r) => String(r.sourceId)));
  const hashesVistos = new Set();
  const rejeitados = lerRejeitados();
  const rejH = (rejeitados[handle] = rejeitados[handle] || {});
  let sel = selecionar(atual());
  const resumo = { daMateria: pool.length, instagram: { postsLidos: 0, candidatos: 0, aprovadas: 0 }, site: { candidatos: 0, aprovadas: 0 } };
  log("midia_inicial", { lugar, noAcervo: pool.length, ready: pool0.ready, selecionaveis: sel?.length ?? 0 });

  async function processarCandidatos(candidatos, origem) {
    await avaliarEFiltrar(candidatos, dir, lugar);
    for (const c of candidatos) {
      if (!c.aprovada) continue;
      const g = await guardar(c, topic);
      const linha = {
        id: g.id, source: c.source, sourceId: c.sourceId, url: g.url || `file://${c.file}`, width: c.width, height: c.height,
        score: c.score, cena: c.cena, isReel: c.isReel, tipoMidia: c.source === "site_oficial" ? "site_oficial" : "instagram_oficial",
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
          // Instagram é a 1ª fonte: só pula se o acervo já tem fotos suficientes DELE.
          if (e === 0 && atual().filter((r) => r.source === "instagram_oficial" && (r.score ?? 0) >= SCORE_MIN).length >= MAX_IMAGENS) break;
          if (e > 0 && sel && sel.length >= MIN_IMAGENS) break;
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
          sel = selecionar(atual());
        }
      } finally {
        await perfil.fechar();
      }
    }
  }

  // ── Fonte 3: site oficial (só se ainda faltar) ──
  if ((!sel || sel.length < MIN_IMAGENS) && topic.fontes.site) {
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
      sel = selecionar(atual());
    } catch (err) {
      log("site_erro", { erro: String(err.message).slice(0, 100) });
    }
  }

  // Em execução real, relê o acervo para ter ids de todas as selecionadas.
  if (!DRY) {
    const fim = await api("/media/pool", { partnerId: topic.partnerId, materialize: true });
    pool = fim.rows || pool;
    sel = selecionar(pool);
  }
  log("midia_final", { lugar, selecionadas: sel?.length ?? 0, resumo });
  return sel ? { ok: true, selecionadas: sel, resumo } : { ok: false, motivo: `mídia insuficiente (${atual().filter((r) => (r.score ?? SCORE_MIN) >= SCORE_MIN).length} boas, mínimo ${MIN_IMAGENS})`, resumo };
}

// ─── Texto ──────────────────────────────────────────────────────────────────
async function redigir(topic, selecionadas, dir) {
  let erros = null;
  for (let t = 0; t < 3; t++) {
    const artigo = await escreverArtigo(topic, { cwd: dir, erros });
    const v = await api("/publish", { partnerId: topic.partnerId, article: artigo, dryRun: true, imagensCount: selecionadas.length });
    if (v.status === "dry_run_ok") return { ok: true, artigo };
    erros = v.erros || [`validação: ${v.status || v.http}`];
    log("artigo_rejeitado", { tentativa: t + 1, erros });
  }
  return { ok: false, motivo: `artigo reprovado na validação: ${erros.join(" | ").slice(0, 300)}` };
}

// Prévia do dry-run: tudo local, para revisar sem publicar nada.
function escreverPrevia(topic, selecionadas, artigo) {
  const pasta = path.join(SAIDA_DRY, `${hojeBRT()}-${String(Date.now()).slice(-5)}`);
  fs.mkdirSync(pasta, { recursive: true });
  const src = selecionadas.map((r, i) => {
    if (r.file) { const nome = `${String(i + 1).padStart(2, "0")}${path.extname(r.file) || ".jpg"}`; fs.copyFileSync(r.file, path.join(pasta, nome)); return nome; }
    return r.url;
  });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const secs = artigo.sections.map((s, i) => `<h2>${esc(s.heading)}</h2><p>${s.paragraphHtml}</p>${src[i + 1] ? `<img src="${src[i + 1]}">` : ""}`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>Prévia (dry-run)</title><style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.6}img{width:100%;border-radius:6px;margin:1rem 0}small{color:#777}</style>
<p><small>PRÉVIA DO DRY-RUN. NADA FOI PUBLICADO.</small></p><h1>${esc(artigo.title)}</h1><p><em>${esc(artigo.subtitle || "")}</em></p><img src="${src[0]}">${secs}`;
  fs.writeFileSync(path.join(pasta, "index.html"), html);
  fs.writeFileSync(path.join(pasta, "detalhes.json"), JSON.stringify({
    lugar: topic.fatos.nome, partnerId: topic.partnerId, titulo: artigo.title,
    imagens: selecionadas.map((r, i) => ({ ordem: i + 1, fonte: r.source, nota: r.score, cena: r.cena, reel: r.isReel, origem: r.origemUrl, tamanho: `${r.width}x${r.height}` })),
  }, null, 1));
  return pasta;
}

// ─── Principal ──────────────────────────────────────────────────────────────
async function executar(runId) {
  const excluidos = [];
  const descartes = [];
  let infra = false;
  for (let i = 0; i < MAX_PAUTAS; i++) {
    const topic = await api("/next-topic", { exclude: excluidos });
    if (topic.status === "no_topic") { descartes.push("sem pauta elegível"); break; }
    if (topic.status !== "ok") throw new Error(`next-topic: ${topic.status || topic.http}`);
    const nome = topic.fatos.nome;
    log("pauta", { partnerId: topic.partnerId, nome, categoria: topic.categoria, elegiveis: topic.elegiveis });
    const dir = path.join(CACHE_DIR, hojeBRT(), `p${topic.partnerId}`);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const midia = await prepararMidia(topic, dir);
      if (!midia.ok) { descartes.push(`${nome}: ${midia.motivo}`); excluidos.push(topic.partnerId); continue; }
      const r = await redigir(topic, midia.selecionadas, dir);
      if (!r.ok) { descartes.push(`${nome}: ${r.motivo}`); excluidos.push(topic.partnerId); continue; }

      if (DRY) {
        const pasta = escreverPrevia(topic, midia.selecionadas, r.artigo);
        if (PROBE) {
          // Teste real do envio ao B2: sobe as imagens escolhidas (e a versão 4:5
          // quando precisar), SEM registrar no acervo e SEM criar post.
          const enviados = [];
          for (let k = 0; k < midia.selecionadas.length; k++) {
            const x = midia.selecionadas[k];
            if (!x.file) { enviados.push({ ordem: k + 1, origem: "ja_no_b2", url: x.url }); continue; }
            const up = await enviarAoB2(api, { partnerId: topic.partnerId, source: "probe", sourceId: `probe-${Date.now()}-${k}`, hash: null, arquivo: x.file });
            const ig = await versaoInstagram(x.file, { width: x.width, height: x.height });
            const up45 = ig ? await enviarAoB2(api, { partnerId: topic.partnerId, source: "probe", sourceId: `probe-${Date.now()}-${k}-ig`, hash: null, arquivo: ig, role: "ig" }) : null;
            // confere que o arquivo está mesmo acessível publicamente
            const head = await fetch(up.url, { method: "HEAD" });
            enviados.push({ ordem: k + 1, origem: x.source, url: up.url, url4x5: up45?.url ?? null, http: head.status, tipo: head.headers.get("content-type"), bytes: head.headers.get("content-length"), nota: x.score, cena: x.cena });
          }
          fs.writeFileSync(path.join(pasta, "enviados-b2.json"), JSON.stringify(enviados, null, 1));
          log("probe_upload_ok", { enviados: enviados.length });
        }
        if (!NO_MARK) await api("/dry-run-complete", { resumo: { partnerId: topic.partnerId, lugar: nome, titulo: r.artigo.title, imagens: midia.selecionadas.length } });
        log("dry_run_ok", { lugar: nome, imagens: midia.selecionadas.length, previa: pasta, marcado: !NO_MARK });
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
  }
  return { ok: false, descartes, infra };
}

async function main() {
  if (!pegarLock()) { log("outra_execucao_em_andamento"); return; }
  let runId = null;
  try {
    log("inicio", { dry: DRY, api: process.env.ENGINE_API || "producao" });
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

main();
