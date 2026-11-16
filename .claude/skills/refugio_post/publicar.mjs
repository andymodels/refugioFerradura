// Sobe a arte do post para o B2 e coloca na fila do Instagram oficial.
// Uso: node publicar.mjs <pasta-da-arte> <legenda.txt> "<título interno>" [--publicar] [--minutos 5]
// SEM --publicar só confere tudo (dry run): sobe os arquivos e valida, mas NÃO enfileira.
// Ordem dos slides = ordem alfabética dos arquivos carrossel-01..NN (.png vira .jpg, .mp4 fica).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire("/Users/joaoaraujo2/Documents/Ferradura-Refugio/engine-runner/package.json");
const { apiFila } = await import("/Users/joaoaraujo2/Documents/Ferradura-Refugio/engine-runner/src/api.mjs");

const [pasta, legendaPath, titulo] = process.argv.slice(2);
const publicar = process.argv.includes("--publicar");
const minutos = Number(process.argv[process.argv.indexOf("--minutos") + 1]) || 5;
if (!pasta || !legendaPath || !titulo) throw new Error("Uso: node publicar.mjs <pasta-da-arte> <legenda.txt> \"<título>\" [--publicar] [--minutos 5]");

const arquivos = fs.readdirSync(pasta).filter((f) => /^carrossel-\d+\.(png|jpg|mp4)$/i.test(f)).sort();
if (arquivos.length < 2 || arquivos.length > 10) throw new Error(`Carrossel precisa de 2 a 10 itens; achei ${arquivos.length}.`);

const urls = [];
for (const f of arquivos) {
  let arq = path.join(pasta, f);
  let tipo = "video/mp4";
  if (!/\.mp4$/i.test(f)) {
    tipo = "image/jpeg";
    if (/\.png$/i.test(f)) {
      const jpg = arq.replace(/\.png$/i, ".jpg");
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", arq, "--out", jpg], { stdio: "ignore" });
      arq = jpg;
    }
  } else {
    const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq], { encoding: "utf8" }));
    if (dur > 60) console.warn(`AVISO: ${f} tem ${dur.toFixed(1)}s; o Instagram pode recusar vídeo de carrossel acima de ~60s.`);
  }
  const up = await apiFila("/upload-midia", { contentType: tipo });
  if (up.status !== "ok") throw new Error(`upload-midia (${f}): ${up.http} ${up.erro || ""}`);
  const put = await fetch(up.uploadUrl, { method: "PUT", headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=31536000, immutable" }, body: fs.readFileSync(arq), signal: AbortSignal.timeout(300000) });
  if (!put.ok) throw new Error(`PUT no B2 falhou (${f}): HTTP ${put.status}`);
  urls.push(up.url);
  console.log(`subiu ${f}`);
}

const r = await apiFila("/enqueue", {
  titulo,
  scheduledAt: new Date(Date.now() + minutos * 60_000).toISOString(),
  caption: fs.readFileSync(legendaPath, "utf8").trim(),
  imageUrls: urls,
  dryRun: !publicar,
});
console.log(JSON.stringify(r, null, 2));
if (!publicar) console.log("Conferência concluída. Nada foi enfileirado (falta --publicar).");
