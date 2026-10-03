// Entrega de conteúdo FINALIZADO para a fila do Instagram (a nuvem só publica).
// O Mac produz tudo: pauta, fontes oficiais, atualidade, fotos no B2, capa,
// legenda. Aqui só se agenda o resultado.
import { apiFila } from "./api.mjs";

export async function enfileirar({ titulo, quando, caption, imageUrls, postId = null, capaFundo = null, dryRun = false }) {
  const scheduledAt = new Date(quando).toISOString();
  return apiFila("/enqueue", { titulo, scheduledAt, caption, imageUrls, postId, capaFundo, dryRun });
}
export const listarFila = (limite = 60) => apiFila(`/list?limite=${limite}`);
