// Rodízio de parceiros do comando semanal. Regra simples, sem pontuação:
//   1. quem NUNCA apareceu vem primeiro;
//   2. depois, quem está há MAIS TEMPO sem aparecer;
//   3. quem apareceu em poucos posts recentes fica para o fim (só volta cedo se
//      a categoria não tiver mais ninguém);
//   4. mídia ruim NÃO elimina o parceiro: ele só desce na fila por alguns dias
//      (cache `semMidia`) e volta a ser tentado;
//   5. dentro da categoria, todos têm a vez antes de alguém repetir.
// O histórico vem da própria fila (partner_ids) e dos campos do parceiro
// (ultimoUsoInstagramEm / usosInstagram); vale o mais recente dos dois.

const DIA = 86400000;

// Parceiros que dividem o mesmo Instagram (ex.: hospedagem e estância) contam como um só.
export const grupoDe = (c) => (c.handle ? `ig:${String(c.handle).toLowerCase()}` : `id:${c.id}`);

// historico: Map<id, { ultimo: ms, usos: n }> montado pela fila; completa com os campos do parceiro.
export function montarHistorico(candidatos, itensFila) {
  const h = new Map();
  const put = (id, ms, usos) => {
    const a = h.get(id) || { ultimo: 0, usos: 0 };
    h.set(id, { ultimo: Math.max(a.ultimo, ms || 0), usos: Math.max(a.usos, usos || 0) });
  };
  const doFila = new Map();
  for (const it of itensFila || []) {
    if (["cancelado"].includes(it.status)) continue;
    const ms = new Date(it.scheduledAt).getTime();
    for (const id of it.partnerIds || []) {
      const a = doFila.get(id) || { ultimo: 0, usos: 0 };
      doFila.set(id, { ultimo: Math.max(a.ultimo, ms), usos: a.usos + 1 });
    }
  }
  for (const [id, v] of doFila) put(id, v.ultimo, v.usos);
  for (const c of candidatos) put(c.id, c.ultimoUsoInstagramEm ? new Date(c.ultimoUsoInstagramEm).getTime() : 0, c.usosInstagram || 0);
  // O grupo (mesmo Instagram) herda o melhor histórico de qualquer membro.
  const porGrupo = new Map();
  for (const c of candidatos) {
    const g = grupoDe(c), v = h.get(c.id) || { ultimo: 0, usos: 0 };
    const a = porGrupo.get(g) || { ultimo: 0, usos: 0 };
    porGrupo.set(g, { ultimo: Math.max(a.ultimo, v.ultimo), usos: Math.max(a.usos, v.usos) });
  }
  for (const c of candidatos) h.set(c.id, porGrupo.get(grupoDe(c)));
  return h;
}

// Ordena os candidatos de uma pauta pela regra do rodízio.
//  - categorias: categorias aceitas pela pauta;
//  - recentes: Set de ids usados nos últimos posts (ficam para o fim);
//  - bloqueados: Set de ids já escolhidos nesta mesma execução;
//  - semMidia: { [id]: ISO } parceiros cuja mídia não serviu há pouco (descem ~7 dias);
//  - aleatorio: função [0,1) para desempate (injetável nos testes).
export function ordenar({ candidatos, historico, categorias, recentes = new Set(), bloqueados = new Set(), semMidia = {}, agora = Date.now(), aleatorio = Math.random }) {
  const gruposBloqueados = new Set(candidatos.filter((c) => bloqueados.has(c.id)).map(grupoDe));
  const vistos = new Set();
  const lista = candidatos
    .filter((c) => categorias.includes(c.categoria) && !bloqueados.has(c.id) && !gruposBloqueados.has(grupoDe(c)))
    .filter((c) => (vistos.has(grupoDe(c)) ? false : (vistos.add(grupoDe(c)), true)))
    .map((c) => {
      const h = historico.get(c.id) || { ultimo: 0, usos: 0 };
      const falhouEm = semMidia[c.id] ? new Date(semMidia[c.id]).getTime() : 0;
      return {
        c,
        nunca: h.usos === 0 && !h.ultimo,
        ultimo: h.ultimo,
        recente: recentes.has(c.id) || [...recentes].some((r) => candidatos.find((x) => x.id === r && grupoDe(x) === grupoDe(c))),
        semMidia: falhouEm && agora - falhouEm < 7 * DIA,
        desempate: aleatorio(),
      };
    });
  lista.sort((a, b) =>
    Number(a.semMidia) - Number(b.semMidia) ||
    Number(a.recente) - Number(b.recente) ||
    Number(b.nunca) - Number(a.nunca) ||
    a.ultimo - b.ultimo ||
    a.desempate - b.desempate);
  return lista.map((x) => x.c);
}
