// Gera as artes (PNG) do post do Refúgio a partir de um arquivo JSON.
// Uso: node render.mjs spec.json
// Só gera arquivos de prévia. NÃO publica nem agenda nada.
//
// spec.json:
// {
//   "formato": "carrossel" | "feed" | "story",
//   "saida": "/pasta/de/saida",
//   "site": "refugioferradura.com.br",
//   "arroba": "@nomedoparceiro",
//   "posicao": "topo" (opcional: bloco de texto no alto, para não cobrir legenda embutida do vídeo),
//   "titulo": "TÍTULO EM CAIXA ALTA",
//   "destaques": ["destaque 1", "destaque 2", "destaque 3"],
//   "paginas": [ { "foto": "/caminho.jpg", "chamada": "CHAMADA EM CAIXA ALTA", "texto": "texto normal" } ]
// }
// A primeira foto é a capa (título + 3 destaques). As demais usam chamada + texto.
// No formato "feed" e "story" só a capa é gerada (foto única).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(fs.existsSync("/opt/node-tools/node_modules/playwright-core")
  ? "/opt/node-tools/package.json"
  : new URL("../../../engine-runner/package.json", import.meta.url).pathname);
const { chromium } = require("playwright-core");

const spec = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const W = 1080;
const H = spec.formato === "story" ? 1920 : 1350;
const DOURADO = "#E3B66B";
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const url = (p) => "file://" + path.resolve(p);

const topoDe = (arroba) => `<div class="top"><span>${esc(spec.site || "refugioferradura.com.br")}</span><span>${esc(arroba ?? spec.arroba ?? "")}</span></div>`;
const topo = topoDe();
const css = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}
.c{position:relative;width:${W}px;height:${H}px;background-size:cover;background-position:center;color:#fff;font-family:"Avenir Next","Helvetica Neue",Arial,sans-serif}
.top{position:absolute;top:${spec.formato === "story" ? 150 : 48}px;left:64px;right:64px;display:flex;justify-content:space-between;font-weight:600;font-size:24px;letter-spacing:.06em;text-shadow:0 1px 8px rgba(0,0,0,.7);z-index:3}
.ov{position:absolute;inset:0;z-index:1}
.c::before{content:"";position:absolute;left:0;right:0;top:0;height:200px;background:linear-gradient(to bottom,rgba(0,0,0,.55),rgba(0,0,0,0));z-index:2}`;

// Degradê: preto forte no rodapé, clareando até a metade da foto
const degrade = `linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,.66) 20%,rgba(0,0,0,.36) 34%,rgba(0,0,0,.1) 44%,rgba(0,0,0,0) 50%)`;

function capa(foto, ehVideo = false) {
  const d = (spec.destaques || []).slice(0, 3);
  const semMidia = !foto && !ehVideo;
  const fundo = spec.fundoCapa || "linear-gradient(160deg,#5a1226 0%,#2a0b16 55%,#14070c 100%)";
  return `<style>${css}
  ${semMidia ? `.c{background:${fundo}}.ov{background:none}` : `.ov{background:${spec.posicao === "topo" ? degrade.replace("to top", "to bottom") : degrade}}`}
  .b{position:absolute;left:64px;right:64px;${semMidia ? "top:50%;transform:translateY(-50%)" : spec.posicao === "topo" ? "top:270px" : `bottom:${spec.formato === "story" ? 190 : 80}px`};z-index:2}
  h1{font-weight:800;font-size:${semMidia ? 104 : 76}px;line-height:1.02;text-transform:uppercase;letter-spacing:-.01em;text-wrap:balance}
  .sub{margin-top:22px;font-weight:500;font-size:32px;line-height:1.3;color:${DOURADO};letter-spacing:.02em}
  ul{list-style:none;margin-top:${semMidia ? 54 : 30}px}
  li{padding:15px 0;border-top:1px solid rgba(255,255,255,.25);font-weight:600;font-size:34px;display:flex;gap:20px}
  li b{color:${DOURADO};font-size:24px;padding-top:6px;letter-spacing:.1em}
  </style><div class="c" style="${foto ? `background-image:url('${url(foto)}')` : ""}"><div class="ov"></div>${topo}
  <div class="b"><h1>${esc(spec.titulo)}</h1>${spec.subtitulo ? `<div class="sub">${esc(spec.subtitulo)}</div>` : ""}${d.length ? `<ul>${d.map((x, i) => `<li><b>0${i + 1}</b><span>${esc(x)}</span></li>`).join("")}</ul>` : ""}</div></div>`;
}

function interna(p) {
  return `<style>${css}
  .ov{background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.62) 12%,rgba(0,0,0,.32) 24%,rgba(0,0,0,.08) 33%,rgba(0,0,0,0) 38%)}
  .b{position:absolute;left:64px;right:64px;bottom:64px;z-index:2}
  h2{font-weight:800;font-size:58px;line-height:1.06;text-transform:uppercase;color:${DOURADO};text-wrap:balance}
  p{margin-top:20px;font-weight:500;font-size:32px;line-height:1.38}
  </style><div class="c" style="${p.foto ? `background-image:url('${url(p.foto)}')` : ""}"><div class="ov" ${p.chamada || p.texto ? "" : 'style="background:none"'}></div>${topoDe(p.arroba)}
  <div class="b">${p.chamada ? `<h2>${esc(p.chamada)}</h2>` : ""}${p.texto ? `<p>${esc(p.texto)}</p>` : ""}</div></div>`;
}

fs.mkdirSync(spec.saida, { recursive: true });
const browser = await chromium.launch(fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium", headless: true } : { channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const paginas = spec.paginas || [];
const lista = spec.formato === "carrossel"
  ? paginas.map((p, i) => (i === 0 ? capa(p.foto, !!p.video) : interna(p)))
  : [capa(paginas[0].foto, !!paginas[0].video)];
const arquivos = [];
for (let i = 0; i < lista.length; i++) {
  const pg = paginas[i] || paginas[0];
  const ehVideo = !!pg.video;
  // a página precisa ser um arquivo para o navegador liberar as fotos locais
  const html = path.join(spec.saida, `_pagina-${i + 1}.html`);
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8">${lista[i]}${ehVideo ? "<style>html,body{background:transparent!important}</style>" : ""}`);
  await page.goto("file://" + html, { waitUntil: "load" });
  const nome = `${spec.formato}-${String(i + 1).padStart(2, "0")}`;
  if (!ehVideo) {
    const f = path.join(spec.saida, nome + ".png");
    await page.screenshot({ path: f });
    arquivos.push(f);
  } else {
    // vídeo: a arte (degradê + textos) vira uma camada transparente por cima do vídeo
    const camada = path.join(spec.saida, nome + "-camada.png");
    await page.screenshot({ path: camada, omitBackground: true });
    const f = path.join(spec.saida, nome + ".mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", pg.video, "-i", camada, "-filter_complex",
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[v];[v][1:v]overlay`,
      "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", f]);
    arquivos.push(f);
  }
}
await browser.close();
console.log(arquivos.join("\n"));
