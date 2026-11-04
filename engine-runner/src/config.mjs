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

// Ajustes do motor semanal (um lugar só para mexer; antes estavam soltos pelo código).
export const AVAL_GRUPO = 6;               // fotos por consulta de avaliação (mais que isso estoura o tempo)
export const IG_MAX_CANDIDATOS = 18;       // candidatas por perfil por rodada
export const REJ_VALIDADE_DIAS = 21;       // quanto tempo um post reprovado fica fora da avaliação
export const RODIZIO_RECENTE_DIAS = 30;    // parceiro usado há menos que isso só volta se faltar gente
export const PRESENCA_MAX_DIAS = 180;      // último post oficial mais antigo que isso = sem presença recente
export const LADO_MIN_FOTO = 700;          // abaixo disso a foto nem entra na seleção (e perde 2 pontos)
export const LADO_PENAL_FOTO = 900;        // entre o mínimo e isto perde 1 ponto
export const LADO_MIN_CAPA = 720;          // teto do mínimo exigido para capa (quadro de vídeo tem 720)
export const NOTA_SLIDE_MIN = 6;           // curadoria: nota mínima para o slide entrar
export const NOTA_CAPA_MIN = 7;            // curadoria: nota mínima da melhor capa
export const PRAZO_DIA_MS = 25 * 60000;    // depois disso não tenta outra pauta no dia: vai para a reserva do blog
export const TEMPO_AVALIACAO_MS = 600000;  // consulta de avaliação de fotos
export const TEMPO_CURADORIA_MS = 420000;  // consulta de curadoria dos slides

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
