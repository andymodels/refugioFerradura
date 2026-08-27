import { archiveRemoteMedia } from "./b2-storage";

function isPermanentMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const publicBase = process.env.B2_PUBLIC_BASE_URL?.trim();
    if (publicBase && url.startsWith(publicBase)) return true;
    return parsed.hostname.endsWith(".backblazeb2.com");
  } catch {
    return false;
  }
}

// Copia uma mídia aprovada (foto ou vídeo) para a biblioteca permanente do
// Refúgio. A fonte original continua registrada no post (metadados de
// origem/destino), mas o `src` real nunca depende de um link temporário de
// rede social ou site de terceiros — sempre um arquivo hospedado no
// Cloudinary do próprio site. `index` evita colisão de public_id quando um
// post tem várias mídias.
export async function archiveApprovedMedia(
  sourceUrl: string,
  slug: string,
  index: number,
  resourceType: "image" | "video" = "image",
): Promise<string> {
  if (isPermanentMediaUrl(sourceUrl)) return sourceUrl;
  return archiveRemoteMedia(sourceUrl, slug, index, resourceType);
}

// Mantido para compatibilidade com o fluxo de capa (1 imagem só, sem índice).
export async function archiveApprovedImage(sourceUrl: string, slug: string): Promise<string> {
  return archiveApprovedMedia(sourceUrl, slug, 0, "image");
}
