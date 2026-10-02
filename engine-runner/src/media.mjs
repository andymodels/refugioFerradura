import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export async function baixar(url, arquivo) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tipo = (res.headers.get("content-type") || "").split(";")[0];
  if (!tipo.startsWith("image/")) throw new Error(`não é imagem (${tipo || "sem tipo"})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error("arquivo pequeno demais");
  fs.writeFileSync(arquivo, buf);
  return { buf, tipo };
}

// Dimensões via sips (já vem no macOS).
export async function tamanho(arquivo) {
  const { stdout } = await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", arquivo]);
  const w = +stdout.match(/pixelWidth: (\d+)/)?.[1];
  const h = +stdout.match(/pixelHeight: (\d+)/)?.[1];
  return { width: w, height: h };
}

// Quadro de um Reel direto da URL do MP4 (ffmpeg lê só o trecho necessário).
export async function quadroDoVideo(videoUrl, segundos, saida) {
  await exec("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(segundos), "-i", videoUrl, "-frames:v", "1", "-q:v", "2", saida], { timeout: 90000 });
  return fs.existsSync(saida) && fs.statSync(saida).size > 8000;
}

// Versão para o feed do Instagram: a proporção aceita vai de 4:5 a 1,91:1.
// Fora disso (ex.: quadro de Reel 9:16), recorta ao centro para 4:5 e limita a
// 1080 px. Devolve null se o arquivo já serve. Não altera o original.
export async function versaoInstagram(arquivo, { width, height }) {
  const r = width / height;
  if (r >= 0.8 && r <= 1.91) return null;
  const saida = arquivo.replace(/\.jpg$/i, "-4x5.jpg");
  if (r < 0.8) await exec("sips", ["-c", String(Math.round(width / 0.8)), String(width), arquivo, "--out", saida]);
  else await exec("sips", ["-c", String(height), String(Math.round(height * 1.91)), arquivo, "--out", saida]);
  await exec("sips", ["--resampleWidth", "1080", saida]);
  return saida;
}

// Cópia reduzida só para a avaliação visual (menos custo no Claude Code).
export async function miniatura(arquivo, saida) {
  await exec("sips", ["--resampleHeightWidthMax", "900", arquivo, "--out", saida]);
  return saida;
}

// Sobe um arquivo ao B2 pelo link temporário gerado pelo servidor (a chave do
// B2 nunca vai para o Mac). Se já existe (mesmo hash/origem), reaproveita.
export async function enviarAoB2(api, { partnerId, source, sourceId, hash, arquivo, role }) {
  const buf = fs.readFileSync(arquivo);
  const contentType = "image/jpeg";
  const up = await api("/media/upload-url", { partnerId, source, sourceId, sha256: hash, contentType, role });
  if (up.status === "exists") return { exists: true, id: up.id, url: up.url };
  if (up.status !== "ok") throw new Error(`upload-url: ${up.status || up.http} ${up.error || ""}`);
  let put = await fetch(up.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" }, body: buf });
  if (!put.ok) put = await fetch(up.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: buf });
  if (!put.ok) throw new Error(`PUT no B2 falhou: HTTP ${put.status}`);
  return { exists: false, url: up.url };
}
