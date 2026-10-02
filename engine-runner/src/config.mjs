import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const API_BASE = process.env.ENGINE_API || "https://refugioferradura.com.br/api/cron/engine";
export const HOME = os.homedir();
export const CACHE_DIR = path.join(HOME, "Library", "Caches", "refugio-engine");
export const LOG_FILE = path.join(HOME, "Library", "Logs", "refugio-engine.log");
export const KEYCHAIN_SERVICE = "refugio-engine";

// Limites do destaque individual (iguais aos do servidor).
export const MIN_IMAGENS = 3;
export const MAX_IMAGENS = 6;
// Nota mínima (1 a 10) da avaliação visual para uma foto entrar no acervo.
export const SCORE_MIN = 6;
// Instagram: busca gradual de posts recentes do perfil oficial.
export const IG_ESTAGIOS = [12, 20, 30];
export const IG_MAX_IDADE_DIAS = 365;
export const IG_PAUSA_MS = 2500;

export function ensureDirs() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

// O segredo fica no Keychain do macOS (nunca em arquivo do projeto).
export function getSecret() {
  if (process.env.ENGINE_SECRET) return process.env.ENGINE_SECRET;
  try {
    return execFileSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(`Segredo não encontrado no Keychain (serviço "${KEYCHAIN_SERVICE}").`);
  }
}

export function findClaudeBin() {
  const candidates = [process.env.CLAUDE_BIN, "/opt/homebrew/bin/claude", "/usr/local/bin/claude", path.join(HOME, ".claude", "local", "claude"), path.join(HOME, ".local", "bin", "claude")].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  try { return execFileSync("which", ["claude"], { encoding: "utf8" }).trim(); } catch { throw new Error("Claude Code (`claude`) não encontrado."); }
}
