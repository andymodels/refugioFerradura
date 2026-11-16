// Blog primeiro, Instagram depois (agendado).
// Uso:
//   node publicar.mjs --arte <pasta-da-arte> --legenda <legenda.txt> --titulo "<título interno>" \
//        [--materia <materia.json> --origem <pasta-das-midias-originais>] \
//        [--quando <ISO com fuso, ex. 2026-11-20T19:00:00-03:00> | --minutos 5] [--publicar]
// SEM --publicar só confere: sobe os arquivos ao B2 e valida, mas NÃO cria matéria nem enfileira.
// Com --publicar: cria a matéria no blog como RASCUNHO (se houver --materia) e enfileira o Instagram
// ligado a ela; na hora marcada o servidor publica o blog e DEPOIS o Instagram (se o blog não
// confirmar, o Instagram não sai).
//
// materia.json: { title, subtitle, excerpt, metaDescription, tags, servico, capa: "001.jpg",
//                 sections: [ { heading, paragraphHtml, midia: "003.jpg" | "009.mp4" } ] }
// "capa" e "midia" são nomes de arquivos dentro de --origem; sobem no tamanho original (qualquer formato).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const ENG = "/Users/joaoaraujo2/Documents/Ferradura-Refugio/engine-runner/src";
const { apiFila } = await import(`${ENG}/api.mjs`);
const { getSecret } = await import(`${ENG}/config.mjs`);

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const publicar = process.argv.includes("--publicar");
const pastaArte = arg("arte"), legendaPath = arg("legenda"), titulo = arg("titulo");
const materiaPath = arg("materia"), origem = arg("origem");
if (!pastaArte || !legendaPath || !titulo) throw new Error("Faltam --arte, --legenda ou --titulo.");
if (materiaPath && !origem) throw new Error("--materia exige --origem (pasta das mídias originais).");
// Ordem obrigatória do fluxo: BLOG primeiro, Instagram depois. Sem matéria o script não segue.
if (!materiaPath && !process.argv.includes("--so-instagram-autorizado")) {
  throw new Error("RECUSADO: falta --materia. O fluxo é blog primeiro, Instagram depois. Escreva a matéria nova do blog (materia.json) antes. Só use --so-instagram-autorizado se o usuário mandou, por escrito, publicar só no Instagram.");
}
const quando = arg("quando") ? new Date(arg("quando")) : new Date(Date.now() + (Number(arg("minutos")) || 5) * 60_000);
if (isNaN(quando.getTime())) throw new Error("--quando inválido.");

async function subir(arq, tipo) {
  const up = await apiFila("/upload-midia", { contentType: tipo });
  if (up.status !== "ok") throw new Error(`upload-midia (${path.basename(arq)}): ${up.http} ${up.erro || ""}`);
  const put = await fetch(up.uploadUrl, { method: "PUT", headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=31536000, immutable" }, body: fs.readFileSync(arq), signal: AbortSignal.timeout(300000) });
  if (!put.ok) throw new Error(`PUT no B2 falhou (${path.basename(arq)}): HTTP ${put.status}`);
  return up.url;
}
// Qualquer foto vira JPEG (o Instagram e o servidor só aceitam JPEG); vídeo precisa ser MP4.
async function subirMidia(arq) {
  if (/\.mp4$/i.test(arq)) {
    const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq], { encoding: "utf8" }));
    if (dur > 60) console.warn(`AVISO: ${path.basename(arq)} tem ${dur.toFixed(1)}s; o Instagram pode recusar vídeo de carrossel acima de ~60s.`);
    return subir(arq, "video/mp4");
  }
  let jpg = arq;
  if (!/\.jpe?g$/i.test(arq)) {
    jpg = path.join(pastaArte, `_${path.basename(arq)}.jpg`);
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", arq, "--out", jpg], { stdio: "ignore" });
  }
  return subir(jpg, "image/jpeg");
}

// 1) Arte do Instagram
const arquivos = fs.readdirSync(pastaArte).filter((f) => /^carrossel-\d+\.(png|jpg|mp4)$/i.test(f)).sort();
if (arquivos.length < 2 || arquivos.length > 10) throw new Error(`Carrossel precisa de 2 a 10 itens; achei ${arquivos.length}.`);
const urls = [];
for (const f of arquivos) { urls.push(await subirMidia(path.join(pastaArte, f))); console.log(`instagram: subiu ${f}`); }

// 2) Matéria do blog (rascunho) com as mídias originais
let postId = null, slug = null;
if (materiaPath) {
  const m = JSON.parse(fs.readFileSync(materiaPath, "utf8"));
  const cache = {};
  const up = async (nome) => (cache[nome] ||= await subirMidia(path.join(origem, nome)));
  const payload = { ...m, sections: [] };
  if (m.capa) { payload.coverImage = await up(m.capa); payload.coverImageDisplayMode = "natural"; }
  delete payload.capa;
  for (const s of m.sections) {
    const { midia, ...resto } = s;
    if (midia) { const u = await up(midia); if (/\.mp4$/i.test(midia)) resto.videoUrl = u; else resto.imageUrl = u; }
    payload.sections.push(resto);
  }
  if (publicar) {
    const r = await fetch("https://refugioferradura.com.br/api/cron/create-draft-post", { method: "POST", headers: { Authorization: `Bearer ${getSecret()}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(`Criar matéria falhou: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    postId = j.id; slug = j.slug;
    console.log(`blog: rascunho criado (id ${postId}) https://refugioferradura.com.br/blog/${slug}`);
  } else console.log("blog: mídias subidas e matéria validada (nada criado, falta --publicar).");
}

// 3) Fila do Instagram
let caption = fs.readFileSync(legendaPath, "utf8").trim();
if (slug) caption = caption.replace(/refugioferradura\.com\.br\/blog\/\S+/, `refugioferradura.com.br/blog/${slug}`);
const r = await apiFila("/enqueue", { titulo, scheduledAt: quando.toISOString(), caption, imageUrls: urls, postId, dryRun: !publicar });
console.log(JSON.stringify(r, null, 2));

// 4) Estoque da fila (para avisar quando estiver acabando)
const st = await apiFila("/status");
const dias = st.diasCobertos ?? 0;
console.log(`ESTOQUE: a fila cobre ${dias} dia(s) à frente.${dias < 5 ? " ATENÇÃO: estoque baixo, é hora de criar novos posts." : ""}`);
if (!publicar) console.log("Conferência concluída. Nada foi criado nem enfileirado (falta --publicar).");
