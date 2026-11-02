// Entrega de conteúdo FINALIZADO para a fila do Instagram (a nuvem só publica).
// O Mac produz tudo: pauta, fontes oficiais, atualidade, fotos no B2, capa,
// legenda. Aqui só se agenda o resultado.
import { apiFila } from "./api.mjs";
import { limiteAtingido } from "./claude.mjs";

export async function enfileirar({ titulo, quando, caption, imageUrls, postId = null, capaFundo = null, pauta = null, partnerIds = [], dryRun = false }) {
  // Sem cota do Claude Code, curadoria e conferência de slides falham em silêncio e o
  // conteúdo sairia degradado: melhor deixar o dia vazio (a próxima produção refaz).
  if (!dryRun && limiteAtingido()) throw new Error(`Limite de uso do Claude Code atingido; nada enfileirado. (${limiteAtingido().slice(0, 120)})`);
  const scheduledAt = new Date(quando).toISOString();
  return apiFila("/enqueue", { titulo, scheduledAt, caption, imageUrls, postId, capaFundo, pauta, partnerIds, dryRun });
}
export const listarFila = (limite = 60) => apiFila(`/list?limite=${limite}`);
