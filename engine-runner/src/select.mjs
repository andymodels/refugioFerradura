import { MIN_IMAGENS, MAX_IMAGENS } from "./config.mjs";

const PRIORIDADE_FONTE = { instagram_oficial: 0, b2_materia: 1, site_oficial: 2 };
const DIAS_PENALIDADE = 14;

// Grupo de origem: todas as imagens do mesmo post/Reel do Instagram contam
// juntas (carrossel: até 2; quadros de Reel: só 1).
function grupo(r) {
  if (r.source === "instagram_oficial") return `ig:${String(r.sourceId).split(":")[0]}`;
  return `${r.source}:${r.sourceId}`;
}
const lado = (r) => (r.width && r.height ? Math.min(r.width, r.height) : 0);

// Seleção MELHOR PRIMEIRO. Regras (vêm do servidor em `regras`):
// - só entram imagens úteis (nota >= scoreUtil), já com desconto de resolução e
//   de texto sobreposto; fotos sem avaliação (score nulo) não entram;
// - a CAPA precisa ser uma cena que mostra o lugar, sem cartaz/texto/retrato,
//   com menor lado >= minLadoCapa;
// - precisa haver ao menos minNucleo imagens de cenas que mostram o lugar;
// - no máximo 2 por post (1 por Reel) e 3 da mesma cena; foto usada há menos de
//   14 dias desce na fila.
// Devolve { ok, lista, motivo }.
export function selecionar(pool, regras, { min = MIN_IMAGENS, max = MAX_IMAGENS } = {}) {
  const agora = Date.now();
  const nucleo = new Set(regras.cenasNucleo);
  const semCapa = new Set(regras.cenasSemCapa);
  const uteis = pool
    .filter((r) => r.score != null && r.score >= regras.scoreUtil)
    .map((r) => {
      const usadoRecente = r.lastUsedAt && agora - new Date(r.lastUsedAt).getTime() < DIAS_PENALIDADE * 86400000;
      // Idade do post (faixas, não regra rígida): até 30 dias = prioridade forte;
      // 31 a 60 = ainda atual se não houver informação mais recente conflitante;
      // acima de 60 = só apoio/contexto, sem bônus e nunca como "novidade atual".
      const idadeDias = r.takenAt ? (agora - new Date(r.takenAt).getTime()) / 86400000 : 999;
      const bonusRecente = idadeDias <= 30 ? 1 : idadeDias <= 60 ? 0.5 : 0;
      return { r, rank: r.score + bonusRecente - (usadoRecente ? 3 : 0) };
    })
    .sort((a, b) =>
      b.rank - a.rank ||
      (PRIORIDADE_FONTE[a.r.source] ?? 9) - (PRIORIDADE_FONTE[b.r.source] ?? 9) ||
      (new Date(b.r.takenAt || 0).getTime() - new Date(a.r.takenAt || 0).getTime()))
    .map((x) => x.r);

  const capa = uteis.find((r) => nucleo.has(r.cena) && !semCapa.has(r.cena) && lado(r) >= regras.minLadoCapa);
  if (!capa) return { ok: false, motivo: `nenhuma capa adequada (precisa mostrar o lugar, sem texto, com ${regras.minLadoCapa}px ou mais; úteis: ${uteis.length})` };

  const escolhidas = [capa];
  const porGrupo = new Map([[grupo(capa), 1]]);
  const porCena = new Map([[capa.cena, 1]]);
  for (const r of uteis) {
    if (escolhidas.length >= max) break;
    if (r === capa) continue;
    const g = grupo(r);
    if ((porGrupo.get(g) || 0) >= (r.isReel ? 1 : 2)) continue;
    const c = r.cena || "outro";
    if ((porCena.get(c) || 0) >= 3) continue;
    porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    porCena.set(c, (porCena.get(c) || 0) + 1);
    escolhidas.push(r);
  }
  const nNucleo = escolhidas.filter((r) => nucleo.has(r.cena)).length;
  if (escolhidas.length < min) return { ok: false, motivo: `poucas imagens úteis (${escolhidas.length}; mínimo ${min})` };
  if (nNucleo < regras.minNucleo) return { ok: false, motivo: `poucas imagens que mostram o lugar (${nNucleo}; mínimo ${regras.minNucleo})` };
  return { ok: true, lista: escolhidas };
}
