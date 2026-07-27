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

// Copia uma foto aprovada para a biblioteca permanente do Refúgio. A fonte
// original continua registrada no post para crédito e clique, mas o site não
// depende mais de links temporários de redes sociais ou sites de terceiros.
export async function archiveApprovedImage(sourceUrl: string, slug: string): Promise<string> {
  if (isCloudinaryUrl(sourceUrl)) return sourceUrl;

  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder: "refugio-da-ferradura",
    public_id: `post-${slug}`,
    unique_filename: true,
    overwrite: false,
    resource_type: "image",
    quality: "auto",
    fetch_format: "auto",
  });

  if (!result.secure_url) throw new Error("Cloudinary não retornou URL para a imagem aprovada.");
  return result.secure_url;
}
