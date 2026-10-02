import { MIN_IMAGENS, MAX_IMAGENS, SCORE_MIN } from "./config.mjs";

const PRIORIDADE_FONTE = { instagram_oficial: 0, b2_materia: 1, site_oficial: 2 };
const DIAS_PENALIDADE = 14;

// Grupo de origem: todas as imagens do mesmo post/Reel do Instagram contam
// juntas (carrossel: até 2; quadros de Reel: só 1).
function grupo(r) {
  if (r.source === "instagram_oficial") return `ig:${String(r.sourceId).split(":")[0]}`;
  return `${r.source}:${r.sourceId}`;
}

// Escolhe de MIN a MAX imagens, MELHOR PRIMEIRO (hoje só a primeira vai para o
// Instagram; a ordem já serve de base para o carrossel futuro). Regras:
// nota mínima, no máximo 2 por post (1 por Reel), no máximo 3 da mesma cena,
// foto usada há menos de 14 dias desce na fila. Devolve null se não alcançar o
// mínimo.
export function selecionar(pool, { min = MIN_IMAGENS, max = MAX_IMAGENS } = {}) {
  const agora = Date.now();
  const elegiveis = pool
    .filter((r) => (r.score ?? SCORE_MIN) >= SCORE_MIN)
    .map((r) => {
      const usadoRecente = r.lastUsedAt && agora - new Date(r.lastUsedAt).getTime() < DIAS_PENALIDADE * 86400000;
      return { r, rank: (r.score ?? SCORE_MIN) - (usadoRecente ? 3 : 0) };
    })
    .sort((a, b) =>
      b.rank - a.rank ||
      (PRIORIDADE_FONTE[a.r.source] ?? 9) - (PRIORIDADE_FONTE[b.r.source] ?? 9) ||
      (new Date(b.r.takenAt || 0).getTime() - new Date(a.r.takenAt || 0).getTime()));

  const porGrupo = new Map();
  const porCena = new Map();
  const escolhidas = [];
  for (const { r } of elegiveis) {
    if (escolhidas.length >= max) break;
    const g = grupo(r);
    const capGrupo = r.isReel ? 1 : 2;
    if ((porGrupo.get(g) || 0) >= capGrupo) continue;
    const c = r.cena || "outro";
    if ((porCena.get(c) || 0) >= 3) continue;
    porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    porCena.set(c, (porCena.get(c) || 0) + 1);
    escolhidas.push(r);
  }
  return escolhidas.length >= min ? escolhidas : null;
}
