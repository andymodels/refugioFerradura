// Fundos de capa VARIADOS: explora o acervo de imagens do blog no B2 (capas e
// fotos das matérias publicadas) antes de buscar ou repetir fundos.
//
// 1. acervo: a nuvem lista as URLs (GET /cron/instagram-queue/acervo).
// 2. catálogo: o Claude Code olha cada imagem nova UMA vez e diz se serve de
//    fundo (natureza/paisagem, sem prato, produto, retrato, fachada ou texto).
//    O resultado fica em cache no Mac (~/Library/Caches/refugio-engine).
// 3. escolha: nunca repete um fundo usado nas últimas publicações da fila
//    (a fila guarda o fundo de cada capa em `capa_fundo`) e, quando possível,
//    combina o fundo com o tema (cachoeira, rio, estrada, vista, mata...).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CACHE_DIR, ensureDirs } from "./config.mjs";
import { apiFila } from "./api.mjs";
import { baixar } from "./media.mjs";
import { rodarClaude, extrairJson } from "./claude.mjs";

const exec = promisify(execFile);
const CATALOGO = path.join(CACHE_DIR, "fundos-catalogo.json");
const MINIATURAS = path.join(CACHE_DIR, "fundos-mini");
const TEMAS = ["cachoeira", "rio", "mata", "montanha", "estrada", "vista", "paisagem"];
export const NAO_REPETIR_ULTIMAS = 20; // publicações

const lerCatalogo = () => (fs.existsSync(CATALOGO) ? JSON.parse(fs.readFileSync(CATALOGO, "utf8")) : {});
const gravarCatalogo = (c) => { ensureDirs(); fs.writeFileSync(CATALOGO, JSON.stringify(c, null, 1)); };
const idDe = (url) => crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);

async function classificarLote(lote) {
  const lista = lote.map((l, n) => `${n + 1}. ${l.arquivo}`).join("\n");
  const prompt = `Você escolhe FUNDOS de capa para posts de turismo da Rota da Ferradura (Guarapari, ES). A foto vira fundo de uma capa com título grande por cima, levemente desfocada.
Abra CADA imagem com a ferramenta Read (arquivos na pasta atual):
${lista}

Para cada uma diga:
- serve: true SOMENTE se a imagem é principalmente natureza ou paisagem (montanha, mata, rio, cachoeira, cascata, estrada rural, vista, vale, céu aberto) e NÃO tem como assunto principal prato/comida, bebida, produto, retrato ou pessoa em destaque, fachada/construção carregada, cartaz ou texto/logotipo sobreposto, interior de ambiente. Se tiver dúvida, false.
- temas: lista com os que valem entre ${TEMAS.join(", ")} (pode ser vazia).
- descricao: frase curta e factual do que aparece (até 12 palavras).
Responda SOMENTE com JSON, na mesma ordem: [{"arquivo":"<nome>","serve":true|false,"temas":["..."],"descricao":"..."}]`;
  const texto = await rodarClaude(prompt, { cwd: MINIATURAS, ferramentas: "Read", maxTurns: lote.length + 4, timeoutMs: 480000 });
  const arr = extrairJson(texto);
  if (!Array.isArray(arr)) throw new Error("classificação sem lista");
  return arr;
}

// Classifica imagens do acervo ainda não vistas (até `max` por execução).
export async function atualizarCatalogo({ max = 36, lote = 12, log = console.log } = {}) {
  ensureDirs(); fs.mkdirSync(MINIATURAS, { recursive: true });
  const acervo = await apiFila("/acervo");
  if (!acervo.itens) throw new Error(`acervo indisponível: ${acervo.http}`);
  const cat = lerCatalogo();
  const novas = acervo.itens.filter((i) => !cat[i.url]).slice(0, max);
  log(`acervo: ${acervo.total} imagens | já catalogadas: ${Object.keys(cat).length} | a classificar agora: ${novas.length}`);
  for (let i = 0; i < novas.length; i += lote) {
    const parte = [];
    for (const it of novas.slice(i, i + lote)) {
      const orig = path.join(MINIATURAS, `${idDe(it.url)}-orig`);
      const mini = path.join(MINIATURAS, `${idDe(it.url)}.jpg`);
      try {
        if (!fs.existsSync(mini)) { await baixar(it.url, orig); await exec("sips", ["-s", "format", "jpeg", "--resampleHeightWidthMax", "700", orig, "--out", mini]); fs.rmSync(orig, { force: true }); }
        parte.push({ ...it, arquivo: path.basename(mini) });
      } catch (e) { cat[it.url] = { serve: false, erro: String(e.message).slice(0, 80), em: new Date().toISOString() }; }
    }
    if (!parte.length) continue;
    try {
      const res = await classificarLote(parte);
      for (const p of parte) {
        const r = res.find((x) => x.arquivo === p.arquivo);
        cat[p.url] = r ? { serve: !!r.serve, temas: (r.temas || []).filter((t) => TEMAS.includes(t)), descricao: r.descricao || "", postId: p.postId, titulo: p.titulo, em: new Date().toISOString() } : { serve: false, erro: "sem resposta", em: new Date().toISOString() };
      }
    } catch (e) { log(`lote falhou (${e.message.slice(0, 80)}); será tentado de novo depois`); }
    gravarCatalogo(cat);
  }
  gravarCatalogo(cat);
  return cat;
}

// Escolhe um fundo que NÃO foi usado nas últimas publicações. `tema` é opcional
// (ex.: "cachoeira"); sem correspondência, escolhe qualquer natureza liberada.
export async function escolherFundoVariado({ tema = null } = {}) {
  const cat = lerCatalogo();
  const fila = await apiFila(`/list?limite=${NAO_REPETIR_ULTIMAS}`);
  const usados = new Set((fila.itens || []).map((i) => i.capaFundo).filter(Boolean));
  const livres = Object.entries(cat).filter(([url, v]) => v.serve && !usados.has(url));
  if (!livres.length) throw new Error("nenhum fundo livre no catálogo (rode atualizarCatalogo ou amplie o acervo)");
  const comTema = tema ? livres.filter(([, v]) => (v.temas || []).includes(tema)) : [];
  const pool = comTema.length ? comTema : livres;
  const [url, info] = pool[Math.floor(Math.random() * pool.length)];
  return { url, ...info, combinouComTema: comTema.length > 0, livres: livres.length };
}

export async function baixarFundo(url, saida) {
  await baixar(url, saida);
  return saida;
}

if (process.argv[1] && process.argv[1].endsWith("fundos.mjs")) {
  const max = Number(process.argv[process.argv.indexOf("--max") + 1]) || 36;
  const cat = await atualizarCatalogo({ max });
  const v = Object.values(cat);
  console.log(`catálogo: ${v.length} | servem de fundo: ${v.filter((x) => x.serve).length}`);
}
