import { archiveRemoteMedia, makeInstagramSafeImage } from "./b2-storage";

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

// Copia uma mídia aprovada para a biblioteca permanente do Refúgio. O `src`
// real nunca depende de links temporários de redes sociais ou de terceiros.
export async function archiveApprovedMedia(
  sourceUrl: string,
  slug: string,
  index: number,
  resourceType: "image" | "video" = "image",
): Promise<string> {
  if (isPermanentMediaUrl(sourceUrl)) return sourceUrl;
  return archiveRemoteMedia(sourceUrl, slug, index, resourceType);
}

export { makeInstagramSafeImage };

// Mantido para compatibilidade com o fluxo de capa (1 imagem só, sem índice).
export async function archiveApprovedImage(sourceUrl: string, slug: string): Promise<string> {
  return archiveApprovedMedia(sourceUrl, slug, 0, "image");
}
