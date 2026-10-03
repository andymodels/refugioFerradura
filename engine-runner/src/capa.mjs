// Capa PADRÃO dos carrosséis do Refúgio da Ferradura.
//
// A capa é uma CHAMADA EDITORIAL, não uma fotografia: o elemento principal é o
// TEXTO (título grande, forte, legível em 1 segundo, contraste alto). A foto é
// só BACKGROUND (clima e contexto): desfoque LEVE, leve escurecimento e overlay
// verde de mata, sem apagar a identidade da paisagem.
//
// Fundo: natureza (mata, montanha, rio, cachoeira, cascata, estrada rural, vale,
// paisagem). Evitar prato, produto, pessoa, fachada. Não repetir fundo próximo
// (ver fundos.mjs).
//
// VARIAÇÃO EDITORIAL: as capas não podem parecer o mesmo template com outro
// texto. A marca fica fixa (tipografia Arial Black em caixa alta, paleta verde
// mata + dourado, linguagem de turismo/natureza); o resto varia entre 6
// composições (posição e alinhamento do título, escala, nº de linhas, corte e
// zoom da paisagem, intensidade do overlay, selo e assinatura ligados ou não).
// A composição nunca repete nas últimas 3 capas (cache local).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright-core";
import { CACHE_DIR, ensureDirs } from "./config.mjs";

export const CENAS_FUNDO = ["paisagem", "ponto"]; // natureza e vista
export const CENAS_EVITAR_NO_FUNDO = ["prato", "bebida", "produto", "pessoas", "fachada", "cartaz", "detalhe", "hospedagem", "ambiente", "atividade"];

export function escolherFundo(candidatas) {
  return candidatas
    .filter((c) => CENAS_FUNDO.includes(c.cena) && !c.textoSobreposto && c.file && fs.existsSync(c.file))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Math.min(b.width, b.height) - Math.min(a.width, a.height))[0] || null;
}

// ─── Composições ────────────────────────────────────────────────────────────
// box: área do título (px, canvas 1080x1350). max: tamanho máximo da fonte.
// ov: alfa do overlay (topo/meio/base). selo/assin/desliza: elementos de marca.
export const LAYOUTS = {
  esquerda: {
    box: { l: 84, r: 84, t: 250, h: 760 }, v: "center", align: "left", max: 230,
    ov: [0.42, 0.26, 0.74], selo: "topo-esq", assin: "baixo-esq", desliza: true, barra: false,
  },
  base: {
    box: { l: 80, r: 80, t: 430, h: 740 }, v: "end", align: "left", max: 280,
    ov: [0.12, 0.28, 0.86], selo: "topo-esq-pequeno", assin: false, desliza: true, barra: false,
  },
  centro: {
    box: { l: 90, r: 90, t: 260, h: 740 }, v: "center", align: "center", max: 190,
    ov: [0.40, 0.38, 0.62], selo: "topo-centro", assin: "baixo-centro", desliza: false, barra: false,
  },
  topo: {
    box: { l: 84, r: 84, t: 130, h: 640 }, v: "start", align: "left", max: 210,
    ov: [0.80, 0.30, 0.12], selo: false, assin: "baixo-esq", desliza: true, barra: false,
  },
  direita: {
    box: { l: 150, r: 84, t: 240, h: 780 }, v: "center", align: "right", max: 200,
    ov: [0.50, 0.30, 0.66], selo: "topo-dir", assin: "baixo-dir", desliza: false, barra: true,
  },
  revista: {
    box: { l: 70, r: 70, t: 260, h: 880 }, v: "end", align: "left", max: 330,
    ov: [0.22, 0.20, 0.58], selo: false, assin: false, desliza: false, barra: false, lateral: true,
  },
};
const NOMES = Object.keys(LAYOUTS);

// Cortes da paisagem (posição do background); o zoom varia de 1,02 a 1,21.
const CORTES = ["center", "center 20%", "center 80%", "30% center", "70% center", "25% 25%", "75% 70%"];

const CACHE_LAYOUTS = path.join(CACHE_DIR, "capas-layouts.json");
function ultimos() { try { return JSON.parse(fs.readFileSync(CACHE_LAYOUTS, "utf8")); } catch { return []; } }
function lembrar(nome) { try { ensureDirs(); fs.writeFileSync(CACHE_LAYOUTS, JSON.stringify([nome, ...ultimos()].slice(0, 6))); } catch { /* sem cache: segue */ } }

// Sorteia uma composição que não esteja entre as 3 últimas.
export function escolherLayout(semente = "") {
  const recentes = new Set(ultimos().slice(0, 3));
  const livres = NOMES.filter((n) => !recentes.has(n));
  const pool = livres.length ? livres : NOMES;
  const h = crypto.createHash("sha1").update(String(semente) + Date.now()).digest()[0];
  return pool[h % pool.length];
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tituloHtml = (t) => esc(t.toUpperCase()).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function html({ titulo, fundoUrl, selo, assinatura, L, corte, zoom, jitter }) {
  const [oTopo, oMeio, oBase] = L.ov.map((a) => clamp(a + jitter, 0.08, 0.92));
  const posSelo = {
    "topo-esq": "left:84px;top:96px;",
    "topo-esq-pequeno": "left:80px;top:84px;font-size:24px;",
    "topo-centro": "left:0;right:0;top:96px;justify-content:center;",
    "topo-dir": "right:84px;top:96px;flex-direction:row-reverse;",
  }[L.selo] || "display:none;";
  const posAssin = {
    "baixo-esq": "left:84px;bottom:92px;text-align:left;",
    "baixo-centro": "left:0;right:0;bottom:92px;text-align:center;",
    "baixo-dir": "right:84px;bottom:92px;text-align:right;",
  }[L.assin] || "display:none;";
  const ladoDesliza = L.assin === "baixo-dir" || L.assin === "baixo-centro" ? "left:84px" : "right:84px";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1350px;overflow:hidden;background:#0a1f17}
  .capa{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:"Arial Black","Helvetica Neue",Impact,Arial,sans-serif}
  .bg{position:absolute;inset:-70px;background:url("${fundoUrl}") ${corte}/cover no-repeat;filter:blur(2.5px) saturate(.95) brightness(.88);transform:scale(${zoom})}
  .ov{position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,26,18,${oTopo}) 0%,rgba(6,26,18,${oMeio}) 45%,rgba(5,20,14,${oBase}) 100%)${L.selo === "topo-dir" ? ",linear-gradient(270deg,rgba(6,26,18,.35),rgba(6,26,18,0) 70%)" : ""}}
  .selo{position:absolute;display:flex;align-items:center;gap:22px;color:#F6C77A;font-size:30px;letter-spacing:.2em;${posSelo}}
  .selo i{display:block;width:84px;height:6px;background:#F6C77A;border-radius:3px}
  .titulo{position:absolute;left:${L.box.l}px;right:${L.box.r}px;top:${L.box.t}px;height:${L.box.h}px;display:flex;align-items:flex-${L.v};color:#fff;text-align:${L.align}}
  .titulo h1{font-weight:900;line-height:.96;letter-spacing:-.01em;text-transform:uppercase;text-shadow:0 4px 28px rgba(0,0,0,.70),0 1px 3px rgba(0,0,0,.55);text-wrap:balance;width:100%}
  .titulo .hl{color:#F6C77A}
  .assin{position:absolute;color:#fff;${posAssin}}
  .assin b{display:block;font-size:40px;letter-spacing:.04em}
  .assin span{display:block;margin-top:8px;font-size:24px;letter-spacing:.22em;color:#F6C77A}
  .desliza{position:absolute;bottom:96px;${ladoDesliza};display:${L.desliza ? "flex" : "none"};align-items:center;gap:18px;font-size:26px;letter-spacing:.18em;color:#F6C77A}
  .desliza u{display:block;width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:26px solid #F6C77A}
  .barra{position:absolute;right:84px;top:240px;width:8px;height:780px;background:#F6C77A;border-radius:4px;display:${L.barra ? "block" : "none"}}
  .lateral{position:absolute;left:22px;top:0;bottom:0;display:${L.lateral ? "flex" : "none"};align-items:center}
  .lateral span{display:block;transform:rotate(-90deg);white-space:nowrap;color:#F6C77A;font-size:24px;letter-spacing:.35em}
  </style></head><body><div class="capa">
  <div class="bg"></div><div class="ov"></div><div class="barra"></div><div class="lateral"><span>ROTA DA FERRADURA · GUARAPARI</span></div>
  <div class="selo"><i></i>${esc(selo)}</div>
  <div class="titulo"><h1 id="t">${tituloHtml(titulo)}</h1></div>
  <div class="assin"><b>${esc(assinatura[0])}</b><span>${esc(assinatura[1])}</span></div>
  <div class="desliza">DESLIZE<u></u></div>
  </div></body></html>`;
}

// Gera a capa 1080x1350 (4:5, JPEG). Devolve { saida, layout, corte, zoom }. O
// tamanho do título se ajusta sozinho para ocupar o máximo do espaço sem estourar.
export async function gerarCapa({ titulo, fundo, saida, layout = null, selo = "ROTA DA FERRADURA · GUARAPARI", assinatura = ["REFÚGIO DA FERRADURA", "GUIA DA ROTA"], browser = null }) {
  if (!fs.existsSync(fundo)) throw new Error(`fundo não encontrado: ${fundo}`);
  const nome = layout && LAYOUTS[layout] ? layout : escolherLayout(titulo);
  const L = LAYOUTS[nome];
  const h = crypto.createHash("sha1").update(titulo + fundo).digest();
  const corte = CORTES[h[1] % CORTES.length];
  const zoom = (1.02 + (h[2] % 20) / 100).toFixed(2);
  const jitter = ((h[3] % 17) - 8) / 100; // -0,08 a +0,08 de alfa no overlay
  const proprio = !browser;
  const b = browser || (await chromium.launch({ channel: "chrome", headless: true }));
  try {
    const page = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })).newPage();
    const dataUri = "data:image/jpeg;base64," + fs.readFileSync(fundo).toString("base64");
    await page.setContent(html({ titulo, fundoUrl: dataUri, selo, assinatura, L, corte, zoom, jitter }), { waitUntil: "load" });
    await page.evaluate(async (max) => {
      await document.fonts.ready;
      const h1 = document.getElementById("t");
      const box = h1.parentElement;
      let fs = max;
      h1.style.fontSize = fs + "px";
      while ((h1.scrollHeight > box.clientHeight || h1.scrollWidth > box.clientWidth) && fs > 60) { fs -= 4; h1.style.fontSize = fs + "px"; }
    }, L.max);
    await page.waitForTimeout(250);
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    await page.screenshot({ path: saida, type: "jpeg", quality: 92 });
    lembrar(nome);
    return { saida, layout: nome, corte, zoom };
  } finally {
    if (proprio) await b.close();
  }
}
