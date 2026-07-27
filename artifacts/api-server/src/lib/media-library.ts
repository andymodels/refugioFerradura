import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function isCloudinaryUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "res.cloudinary.com";
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
  if (isCloudinaryUrl(sourceUrl)) return sourceUrl;

  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder: "refugio-da-ferradura",
    public_id: `post-${slug}-${index}`,
    unique_filename: true,
    overwrite: false,
    resource_type: resourceType,
    quality: "auto",
    fetch_format: "auto",
  });

  if (!result.secure_url) throw new Error("Cloudinary não retornou URL para a mídia aprovada.");
  return result.secure_url;
}

// Mantido para compatibilidade com o fluxo de capa (1 imagem só, sem índice).
export async function archiveApprovedImage(sourceUrl: string, slug: string): Promise<string> {
  return archiveApprovedMedia(sourceUrl, slug, 0, "image");
}
