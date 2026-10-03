// Capa PADRÃO dos carrosséis do Refúgio da Ferradura.
//
// A capa é uma CHAMADA EDITORIAL, não uma fotografia: o elemento principal é o
// TEXTO (título grande, forte, legível em 1 segundo, contraste alto). A foto é
// só BACKGROUND (clima e contexto): fica desfocada, escurecida e sob um overlay
// verde de mata, para nunca disputar atenção com o título.
//
// Fundo ideal: natureza, montanha, mata, rio, cachoeira, cascata, estrada rural,
// vista, paisagem da Rota. EVITAR como fundo: prato de comida, close de produto,
// pessoa em destaque, fachada carregada ou qualquer imagem que concorra com o
// texto. Os slides seguintes é que mostram lugares, comidas, pessoas e produtos.
//
// Desfoque LEVE (2,5 px): só o bastante para o texto ganhar destaque; a paisagem
// continua reconhecível. O fundo NÃO deve se repetir em publicações próximas:
// ver fundos.mjs (escolha variada a partir do acervo do blog no B2).
// Identidade: verde-mata profundo + dourado de fim de tarde (destaque), título em
// maiúsculas, selo "Rota da Ferradura" no topo e assinatura do Refúgio embaixo.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

export const CENAS_FUNDO = ["paisagem", "ponto"]; // natureza e vista
export const CENAS_EVITAR_NO_FUNDO = ["prato", "bebida", "produto", "pessoas", "fachada", "cartaz", "detalhe", "hospedagem", "ambiente", "atividade"];

// Escolhe o melhor fundo entre imagens já avaliadas ({ cena, score, textoSobreposto,
// file, width, height }). Como o fundo é desfocado, a nota e a resolução pesam
// pouco: o que importa é a CENA (natureza) e não ter texto sobreposto.
export function escolherFundo(candidatas) {
  return candidatas
    .filter((c) => CENAS_FUNDO.includes(c.cena) && !c.textoSobreposto && c.file && fs.existsSync(c.file))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Math.min(b.width, b.height) - Math.min(a.width, a.height))[0] || null;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Marque palavras de destaque com *asteriscos*: "O QUE FAZER NESTE *SÁBADO* EM BUENOS AIRES".
function tituloHtml(titulo) {
  return esc(titulo.toUpperCase()).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
}

function html({ titulo, fundoUrl, selo, assinatura }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1080px;height:1350px;overflow:hidden;background:#0a1f17}
  .capa{position:relative;width:1080px;height:1350px;overflow:hidden;font-family:"Arial Black","Helvetica Neue",Impact,Arial,sans-serif}
  .bg{position:absolute;inset:-60px;background:url("${fundoUrl}") center/cover no-repeat;filter:blur(2.5px) saturate(.95) brightness(.86);transform:scale(1.02)}
  .ov{position:absolute;inset:0;background:
      linear-gradient(180deg,rgba(6,26,18,.42) 0%,rgba(6,26,18,.26) 32%,rgba(6,26,18,.42) 70%,rgba(5,20,14,.74) 100%),
      radial-gradient(120% 80% at 50% 45%,rgba(10,50,34,.10),rgba(2,12,8,.30))}
  .selo{position:absolute;left:84px;top:96px;display:flex;align-items:center;gap:22px;color:#F6C77A;font-size:30px;letter-spacing:.2em}
  .selo i{display:block;width:84px;height:6px;background:#F6C77A;border-radius:3px}
  .titulo{position:absolute;left:84px;right:84px;top:250px;height:760px;display:flex;align-items:center;color:#fff}
  .titulo h1{font-weight:900;line-height:.98;letter-spacing:-.01em;text-transform:uppercase;text-shadow:0 4px 28px rgba(0,0,0,.70),0 1px 3px rgba(0,0,0,.55);text-wrap:balance;width:100%}
  .titulo .hl{color:#F6C77A}
  .rodape{position:absolute;left:84px;right:84px;bottom:92px;display:flex;align-items:flex-end;justify-content:space-between;color:#fff}
  .assin b{display:block;font-size:40px;letter-spacing:.04em}
  .assin span{display:block;margin-top:8px;font-size:24px;letter-spacing:.22em;color:#F6C77A}
  .desliza{display:flex;align-items:center;gap:18px;font-size:26px;letter-spacing:.18em;color:#F6C77A}
  .desliza u{display:block;width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:26px solid #F6C77A}
  </style></head><body><div class="capa">
  <div class="bg"></div><div class="ov"></div>
  <div class="selo"><i></i>${esc(selo)}</div>
  <div class="titulo"><h1 id="t">${tituloHtml(titulo)}</h1></div>
  <div class="rodape"><div class="assin"><b>${esc(assinatura[0])}</b><span>${esc(assinatura[1])}</span></div><div class="desliza">DESLIZE<u></u></div></div>
  </div></body></html>`;
}

// Gera a capa 1080x1350 (4:5, JPEG). O tamanho do título se ajusta sozinho para
// ocupar o máximo do espaço sem estourar.
export async function gerarCapa({ titulo, fundo, saida, selo = "ROTA DA FERRADURA · GUARAPARI", assinatura = ["REFÚGIO DA FERRADURA", "GUIA DA ROTA"], browser = null }) {
  if (!fs.existsSync(fundo)) throw new Error(`fundo não encontrado: ${fundo}`);
  const proprio = !browser;
  const b = browser || (await chromium.launch({ channel: "chrome", headless: true }));
  try {
    const page = await (await b.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })).newPage();
    await page.setContent(html({ titulo, fundoUrl: "data:image/jpeg;base64," + fs.readFileSync(fundo).toString("base64"), selo, assinatura }), { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const h1 = document.getElementById("t");
      const box = h1.parentElement;
      let fs = 230;
      h1.style.fontSize = fs + "px";
      while ((h1.scrollHeight > box.clientHeight || h1.scrollWidth > box.clientWidth) && fs > 60) { fs -= 4; h1.style.fontSize = fs + "px"; }
    });
    await page.waitForTimeout(250);
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    await page.screenshot({ path: saida, type: "jpeg", quality: 92 });
    return saida;
  } finally {
    if (proprio) await b.close();
  }
}
