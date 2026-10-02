import fs from "node:fs";
import { execFile } from "node:child_process";
import { LOG_FILE, ensureDirs } from "./config.mjs";

ensureDirs();

export function log(evento, dados = {}) {
  const linha = JSON.stringify({ t: new Date().toISOString(), evento, ...dados });
  try { fs.appendFileSync(LOG_FILE, linha + "\n"); } catch {}
  console.log(`[${evento}]`, Object.keys(dados).length ? JSON.stringify(dados) : "");
}

// Notificação do macOS (gratuita). Só em falha final ou publicação.
export function notify(titulo, texto) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  execFile("osascript", ["-e", `display notification "${esc(texto)}" with title "${esc(titulo)}"`], () => {});
}
