// Capa v2 dos carrosséis do Refúgio da Ferradura (EM TESTE, ainda não ligada à produção semanal).
//
// A foto real do lugar é a protagonista. O modelo da capa depende da foto:
// - "foto" (principal): degradê preto forte da base até a metade da foto, texto
//   embaixo sobre o degradê. Só é usado se a medição de contraste aprovar.
// - "revista", "faixa", "moldura": texto em fundo de cor sólida, sem nada por cima da foto.
// Conferência automática: depois de montar, o texto é medido contra o que está
// atrás dele (contraste mínimo 4,5:1, critério de legibilidade WCAG). Se reprovar,
// a capa é refeita em outro modelo. "foto" no máximo 2 vezes seguidas; os sólidos se revezam.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { CACHE_DIR, ensureDirs } from "./config.mjs";

const CREME = "#F2ECE1", VERDE = "#1E3A2D", DOURADO = "#E3B66B", TERRA = "#A4552F";
const CONTRASTE_MIN = 4.5;
const MIN_LADO = 700; // lado menor mínimo da foto da capa (abaixo disso fica borrada em 1080x1350)
const OVERLAY_MAX = 0.95; // preto quase total na base do degradê

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const base = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px;height:1350px;overflow:hidden}`;
// Título: *palavra* vira destaque (itálico dourado)
const tit = (t) => esc(t).replace(/\*([^*]+)\*/g, "<em>$1</em>");

const MODELOS = {
  // degradê forte: preto na base sumindo até a metade da foto; texto embaixo, sobre o degradê
  foto: ({ foto, titulo, nome, rotulo, lista, alfa, pos }) => `<style>${base}
    .c{position:relative;width:1080px;height:1350px;background:url(${foto}) ${pos}/cover}
    .ov{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,${alfa}) 0%,rgba(0,0,0,${alfa * 0.85}) 20%,rgba(0,0,0,${alfa * 0.5}) 36%,rgba(0,0,0,${alfa * 0.15}) 48%,rgba(0,0,0,0) 56%)}
    .b{position:absolute;left:72px;right:72px;bottom:84px;color:#fff}
    .k{font:600 21px "Avenir Next";letter-spacing:.3em;color:${DOURADO};margin-bottom:22px}
    h1{font:italic 400 88px/1.03 "Didot";text-wrap:balance}h1 em{color:${DOURADO}}
    .n{margin-top:26px;font:500 27px "Avenir Next";letter-spacing:.05em;color:rgba(255,255,255,.9)}
    ul{list-style:none;margin-top:30px}li{display:flex;gap:24px;padding:12px 0;border-top:1px solid rgba(255,255,255,.22);font:500 27px "Avenir Next"}
    li b{font:700 21px "Avenir Next";color:${DOURADO};letter-spacing:.1em;padding-top:5px}
  </style><div class="c"><div class="ov"></div>
  <div class="b"><div class="k t">${esc(rotulo)}</div><h1 class="t" data-fit="88">${tit(titulo)}</h1>
  ${lista ? `<ul>${lista.map((l, i) => `<li class="t"><b>0${i + 1}</b>${esc(l)}</li>`).join("")}</ul>` : `<div class="n t">${esc(nome)}</div>`}</div></div>`,

  revista: ({ foto, titulo, nome, rotulo, lista, pos }) => `<style>${base}
    .c{width:1080px;height:1350px;background:${CREME};padding:62px 64px 0;color:${VERDE}}
    .top{display:flex;justify-content:space-between;font:600 20px "Avenir Next";letter-spacing:.3em;margin-bottom:34px}
    .f{width:952px;height:${lista ? 640 : 820}px;background:url(${foto}) ${pos}/cover}
    ol{list-style:none;margin-top:22px}ol li{display:flex;gap:24px;padding:12px 0;border-top:1px solid rgba(30,58,45,.18);font:500 27px "Avenir Next"}ol li b{color:${TERRA};font:700 21px "Avenir Next";letter-spacing:.1em;padding-top:5px}
    .k{margin-top:50px;font:600 20px "Avenir Next";letter-spacing:.3em;color:${TERRA}}
    .h{height:${lista ? 170 : 190}px;margin-top:16px}h1{font:400 72px/1.08 "Baskerville";text-wrap:balance}h1 em{font-style:italic;color:${TERRA}}
    .r{display:flex;align-items:center;gap:22px;margin-top:18px;font:500 23px "Avenir Next";letter-spacing:.08em;color:#5B6B60}
    .r i{display:block;width:70px;height:1px;background:${TERRA}}
  </style><div class="c"><div class="top t"><span>GUIA DA ROTA</span><span>REFÚGIO DA FERRADURA</span></div>
  <div class="f"></div><div class="k t">${esc(rotulo)}</div><div class="h"><h1 class="t" data-fit="72">${tit(titulo)}</h1></div>
  ${lista ? `<ol>${lista.map((l, i) => `<li class="t"><b>0${i + 1}</b>${esc(l)}</li>`).join("")}</ol>` : `<div class="r t"><i></i><span>${esc(nome)}</span></div>`}</div>`,

  faixa: ({ foto, titulo, nome, rotulo, lista, pos }) => `<style>${base}
    .c{position:relative;width:1080px;height:1350px;background:${VERDE}}
    .f{position:absolute;top:0;left:0;right:0;height:${lista ? 740 : 860}px;background:url(${foto}) ${pos}/cover}
    .tag{position:absolute;top:56px;left:64px;background:${CREME};color:${VERDE};font:700 20px "Avenir Next";letter-spacing:.24em;padding:14px 22px}
    .b{position:absolute;left:64px;right:64px;top:${lista ? 800 : 930}px;bottom:70px;color:${CREME}}
    h1{font:700 74px/1.04 "Avenir Next";letter-spacing:-.02em;text-wrap:balance}h1 em{font:italic 400 1.08em "Didot";color:${DOURADO}}
    ul{list-style:none;margin-top:38px;border-top:1px solid rgba(242,236,225,.3)}
    li{display:flex;gap:28px;padding:18px 0;border-bottom:1px solid rgba(242,236,225,.3);font:500 28px "Avenir Next"}
    li b{font:700 22px "Avenir Next";color:${DOURADO};letter-spacing:.1em;padding-top:5px}
    .n{margin-top:26px;font:500 26px "Avenir Next";letter-spacing:.06em;color:${DOURADO}}
  </style><div class="c"><div class="f"></div><div class="tag">${esc(rotulo)}</div>
  <div class="b" id="caixa"><h1 class="t" data-fit="74">${tit(titulo)}</h1>
  ${lista ? `<ul>${lista.map((l, i) => `<li class="t"><b>0${i + 1}</b>${esc(l)}</li>`).join("")}</ul>` : `<div class="n t">${esc(nome)}</div>`}</div></div>`,

  moldura: ({ foto, titulo, nome, rotulo, pos }) => `<style>${base}
    .c{width:1080px;height:1350px;background:${VERDE};padding:90px 90px 0;color:${CREME};text-align:center}
    .f{width:900px;height:800px;background:url(${foto}) ${pos}/cover;outline:1px solid rgba(227,182,107,.6);outline-offset:18px}
    .k{margin-top:70px;font:600 20px "Avenir Next";letter-spacing:.34em;color:${DOURADO}}
    .h{height:200px;margin-top:18px;display:flex;align-items:flex-start;justify-content:center}
    h1{font:italic 400 76px/1.06 "Didot";text-wrap:balance}h1 em{color:${DOURADO}}
    .n{font:500 22px "Avenir Next";letter-spacing:.3em;color:rgba(242,236,225,.75);white-space:nowrap}
  </style><div class="c"><div class="f"></div><div class="k t">${esc(rotulo)}</div><div class="h"><h1 class="t" data-fit="76">${tit(titulo)}</h1></div>
  <div class="n t">${esc(nome).toUpperCase()}</div></div>`,
};
export const NOMES_MODELOS = Object.keys(MODELOS);

const CACHE = path.join(CACHE_DIR, "capas-v2-modelos.json");
const recentes = () => { try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return []; } };
const lembrar = (m) => { try { ensureDirs(); fs.writeFileSync(CACHE, JSON.stringify([m, ...recentes()].slice(0, 6))); } catch { /* sem cache: segue */ } };

// Ajusta o título para caber; mede o contraste de cada texto contra o que está atrás dele.
async function montarEMedir(page, html) {
  await page.setContent(`<!doctype html><meta charset="utf-8">${html}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const h of document.querySelectorAll("[data-fit]")) {
      let fs = Number(h.dataset.fit);
      const caixa = h.parentElement;
      const estoura = () => h.scrollWidth > h.clientWidth + 1 || (caixa.clientHeight && caixa.scrollHeight > caixa.clientHeight + 1) || h.getBoundingClientRect().bottom > 1290;
      while (estoura() && fs > 44) { fs -= 2; h.style.fontSize = fs + "px"; }
    }
  });
  const caixas = await page.evaluate(() => [...document.querySelectorAll(".t")].map((e) => {
    const r = e.getBoundingClientRect();
    const cor = getComputedStyle(e).color.match(/\d+(\.\d+)?/g).map(Number);
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(1080, r.width), h: Math.min(1350, r.height), cor };
  }).filter((b) => b.w > 4 && b.h > 4));
  const estourou = await page.evaluate(() => [...document.querySelectorAll(".t")].some((e) => { const r = e.getBoundingClientRect(); return r.right > 1081 || r.bottom > 1351 || r.left < -1; }));
  // fundo sem o texto
  await page.addStyleTag({ content: ".t{visibility:hidden!important}" });
  const semTexto = (await page.screenshot({ type: "png" })).toString("base64");
  const piores = await page.evaluate(async ({ png, caixas }) => {
    const im = new Image(); im.src = "data:image/png;base64," + png; await im.decode();
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1350;
    const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return caixas.map((b) => {
      const d = cx.getImageData(b.x, b.y, b.w, b.h).data, ls = [];
      for (let i = 0; i < d.length; i += 16) ls.push(lum(d[i], d[i + 1], d[i + 2]));
      ls.sort((a, z) => a - z);
      const lt = lum(...b.cor);
      // pior caso: os 8% de pixels de fundo mais parecidos com a cor do texto
      const ref = lt > 0.5 ? ls[Math.floor(ls.length * 0.92)] : ls[Math.floor(ls.length * 0.08)];
      return (Math.max(lt, ref) + 0.05) / (Math.min(lt, ref) + 0.05);
    });
  }, { png: semTexto, caixas });
  return { contraste: Math.min(...piores), estourou };
}

// Gera a capa. Devolve { saida, modelo, contraste, tentativas }.
// dados: { foto (arquivo), titulo, nome, rotulo, lista?, pos?, evitar? (vão para o fim da fila),
//          preferir?, proibir? (modelos reprovados na conferência visual) }
export async function gerarCapaV2({ foto, titulo, nome, rotulo, lista = null, pos = "center", saida, evitar = recentes().slice(0, 2), preferir = null, proibir = [], browser = null }) {
  if (!fs.existsSync(foto)) throw new Error(`foto não encontrada: ${foto}`);
  // Converte qualquer formato (HEIC do iPhone, PNG, WebP) para JPEG e recusa foto pequena demais para capa.
  const jpg = foto.replace(/\.[a-z0-9]+$/i, "") + "-capa-src.jpg";
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", foto, "--out", jpg], { stdio: "ignore" });
  const dims = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", jpg]).toString().match(/\d+/g).slice(-2).map(Number);
  if (Math.min(...dims) < MIN_LADO) throw new Error(`foto pequena demais para capa (${dims.join("x")})`);
  const fotoUri = "data:image/jpeg;base64," + fs.readFileSync(jpg).toString("base64");
  const proprio = !browser;
  const b = browser || (await chromium.launch({ channel: "chrome", headless: true }));
  const tentativas = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })).newPage();
    // ordem: "foto" (degradê) é o principal; no máximo 2 seguidas. Sólidos quando a foto reprova ou para quebrar a sequência.
    const solidos = lista ? ["revista", "faixa"] : ["revista", "moldura", "faixa"];
    const solidosLivres = [...solidos.filter((m) => m !== evitar[0]), ...solidos.filter((m) => m === evitar[0])];
    const fotoCansou = evitar[0] === "foto" && evitar[1] === "foto";
    let ordem = fotoCansou ? [...solidosLivres, "foto"] : ["foto", ...solidosLivres];
    if (preferir) ordem = [preferir, ...ordem.filter((m) => m !== preferir)];
    ordem = ordem.filter((m) => !proibir.includes(m));
    for (const modelo of ordem) {
      const variantes = modelo === "foto"
        ? [0.85, OVERLAY_MAX].map((alfa) => ({ alfa }))
        : [{}];
      for (const v of variantes) {
        const html = MODELOS[modelo]({ foto: fotoUri, titulo, nome, rotulo, lista, pos, ...v });
        const { contraste, estourou } = await montarEMedir(page, html);
        tentativas.push({ modelo, ...v, contraste: +contraste.toFixed(2), estourou });
        if (contraste >= CONTRASTE_MIN && !estourou) {
          await page.setContent(`<!doctype html><meta charset="utf-8">${html}`, { waitUntil: "load" });
          await montarEMedir(page, html); // reaplica o ajuste de tamanho
          await page.addStyleTag({ content: ".t{visibility:visible!important}" });
          fs.mkdirSync(path.dirname(saida), { recursive: true });
          await page.screenshot({ path: saida, type: "jpeg", quality: 92 });
          lembrar(modelo);
          return { saida, modelo, ...v, contraste: +contraste.toFixed(2), tentativas };
        }
      }
    }
    throw new Error(`nenhum modelo passou na conferência de legibilidade: ${JSON.stringify(tentativas)}`);
  } finally {
    if (proprio) await b.close();
  }
}
