// Limpeza das duplicatas JÁ existentes na lista de Estabelecimentos.
// Mesma regra de lib/partner-dedupe.ts (mesmo Instagram, ou nome exato, ou telefone
// quando falta Instagram). Dois passos: PRÉVIA (não altera nada) e APLICAR (confirmado).
//
// Ao aplicar, para cada grupo de repetidos:
//   1. escolhe quem FICA: conta conectada > status mais avançado > tem matéria principal >
//      mais usos no Instagram > cadastro mais antigo;
//   2. passa para quem fica tudo o que apontava para os repetidos (conteúdo de parceiro,
//      acervo de mídia, achados do radar, fila do Instagram e histórico do motor), para o
//      rodízio e o histórico não se perderem;
//   3. completa os campos vazios de quem fica com os dos repetidos;
//   4. guarda uma CÓPIA dos repetidos removidos em `settings` (sem tokens) e só então os apaga.
// Tudo em uma transação: se algo falhar, nada muda.
import { db, instagramPartnersTable, gravarSettingBackup } from "./partner-merge-db";
import { sql, inArray } from "drizzle-orm";
import { ehMesmoParceiro } from "./partner-dedupe";

type Linha = typeof instagramPartnersTable.$inferSelect;

const RANK_STATUS: Record<string, number> = { autorizado_repost: 3, conferido: 2, seguido_manualmente: 1, encontrado: 0 };

function agrupar(linhas: Linha[]): Linha[][] {
  const pai = linhas.map((_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let i = 0; i < linhas.length; i++)
    for (let j = i + 1; j < linhas.length; j++)
      if (ehMesmoParceiro({ nome: linhas[i].nomeEstabelecimento, instagram: linhas[i].instagramHandle, telefone: linhas[i].telefone }, { nome: linhas[j].nomeEstabelecimento, instagram: linhas[j].instagramHandle, telefone: linhas[j].telefone }))
        pai[raiz(i)] = raiz(j);
  const mapa = new Map<number, Linha[]>();
  linhas.forEach((l, i) => mapa.set(raiz(i), [...(mapa.get(raiz(i)) || []), l]));
  return [...mapa.values()].filter((g) => g.length > 1);
}

const pontos = (l: Linha) =>
  (l.igUserId ? 1_000_000 : 0) + (RANK_STATUS[l.status] ?? 0) * 100_000 + (l.materiaPrincipalPostId ? 10_000 : 0) + (l.usosInstagram || 0) * 10 - l.id / 1_000_000;

const resumo = (l: Linha) => ({ id: l.id, nome: l.nomeEstabelecimento, instagram: l.instagramHandle ? "@" + l.instagramHandle.replace(/^@/, "") : null, status: l.status });

export async function mesclarParceirosDuplicados(confirmar: boolean) {
  const linhas = await db.select().from(instagramPartnersTable);
  const grupos = agrupar(linhas).map((g) => {
    const ordenado = [...g].sort((a, b) => pontos(b) - pontos(a));
    return { manter: ordenado[0], remover: ordenado.slice(1) };
  });
  const removerTotal = grupos.reduce((n, g) => n + g.remover.length, 0);
  const previa = {
    total: linhas.length,
    removeria: removerTotal,
    ficaria: linhas.length - removerTotal,
    grupos: grupos.map((g) => ({ manter: resumo(g.manter), remover: g.remover.map(resumo) })),
  };
  if (!confirmar || !grupos.length) return { aplicado: false, ...previa };

  const chaveBackup = `backup_mesclagem_parceiros_${new Date().toISOString()}`;
  await db.transaction(async (tx) => {
    // cópia de segurança dos que serão removidos (sem tokens) e do mapa antigo -> novo
    const copia = grupos.flatMap((g) => g.remover.map((r) => ({ ...r, igAccessToken: undefined, uploadToken: undefined, mantidoComoId: g.manter.id })));
    await gravarSettingBackup(tx, chaveBackup, JSON.stringify(copia));

    for (const { manter, remover } of grupos) {
      for (const r of remover) {
        // acervo de mídia: o que já existe igual em quem fica é descartado (restrição de unicidade); o resto passa
        await tx.execute(sql`DELETE FROM partner_media WHERE partner_id = ${r.id} AND (source, source_id) IN (SELECT source, source_id FROM partner_media WHERE partner_id = ${manter.id})`);
        await tx.execute(sql`UPDATE partner_media SET partner_id = ${manter.id} WHERE partner_id = ${r.id}`);
        await tx.execute(sql`UPDATE partner_content_items SET partner_id = ${manter.id} WHERE partner_id = ${r.id}`);
        await tx.execute(sql`UPDATE radar_findings SET parceiro_id = ${manter.id} WHERE parceiro_id = ${r.id}`);
        for (const tabela of ["instagram_queue", "engine_runs"]) {
          await tx.execute(
            sql`UPDATE ${sql.raw(tabela)} SET partner_ids = (SELECT array_agg(DISTINCT CASE WHEN x = ${r.id}::int THEN ${manter.id}::int ELSE x END) FROM unnest(partner_ids) AS x) WHERE ${r.id}::int = ANY(partner_ids)`,
          );
        }
      }
      // completa quem fica com o que só os repetidos tinham
      const todos = [manter, ...remover];
      const primeiro = <K extends keyof Linha>(k: K) => todos.map((l) => l[k]).find((v) => v !== null && v !== undefined && v !== "") as Linha[K] | undefined;
      const uniao = (k: "tags" | "fotoReferencia") => [...new Set(todos.flatMap((l) => l[k] || []))];
      const datas = (k: "ultimoUsoInstagramEm" | "dadosVerificadosEm") => todos.map((l) => l[k]).filter(Boolean).map((d) => new Date(d as any).getTime());
      const maxData = (k: "ultimoUsoInstagramEm" | "dadosVerificadosEm") => (datas(k).length ? new Date(Math.max(...datas(k))) : null);
      await tx
        .update(instagramPartnersTable)
        .set({
          telefone: primeiro("telefone") ?? null,
          instagramHandle: primeiro("instagramHandle") ?? null,
          categoria: primeiro("categoria") ?? null,
          regiao: primeiro("regiao") ?? null,
          descricaoCurta: primeiro("descricaoCurta") ?? null,
          endereco: primeiro("endereco") ?? null,
          googleMapsUrl: primeiro("googleMapsUrl") ?? null,
          site: primeiro("site") ?? null,
          materiaPrincipalPostId: primeiro("materiaPrincipalPostId") ?? null,
          tags: uniao("tags"),
          fotoReferencia: uniao("fotoReferencia"),
          autorizacaoFotos: todos.some((l) => l.autorizacaoFotos),
          autorizacaoVideosReels: todos.some((l) => l.autorizacaoVideosReels),
          autorizacaoStories: todos.some((l) => l.autorizacaoStories),
          marcacaoObrigatoria: todos.some((l) => l.marcacaoObrigatoria),
          usosInstagram: todos.reduce((n, l) => n + (l.usosInstagram || 0), 0),
          ultimoUsoInstagramEm: maxData("ultimoUsoInstagramEm"),
          dadosVerificadosEm: maxData("dadosVerificadosEm"),
        })
        .where(sql`${instagramPartnersTable.id} = ${manter.id}`);
      await tx.delete(instagramPartnersTable).where(inArray(instagramPartnersTable.id, remover.map((r) => r.id)));
    }
  });
  return { aplicado: true, backup: chaveBackup, ...previa };
}
