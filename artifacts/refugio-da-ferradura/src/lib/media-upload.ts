import { compressImageFile } from "./image-compression";
import { compressVideoFile } from "./video-compression";

export interface UploadedMedia {
  url: string;
  filename: string;
  type: "image" | "video";
  publicId?: string;
}

async function compressMediaFile(file: File): Promise<File> {
  if (/^video\//.test(file.type)) return compressVideoFile(file);
  return compressImageFile(file);
}

interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

async function getCloudinarySignature(): Promise<CloudinarySignature> {
  const res = await fetch("/api/media/upload-signature", { credentials: "include" });
  if (!res.ok) throw new Error(`Falha ao gerar assinatura de upload (HTTP ${res.status})`);
  return res.json();
}

// Sobe direto do navegador pro Cloudinary, sem passar pela função serverless
// da Vercel — evita o teto de ~4,5MB por requisição da plataforma.
async function uploadDirectToCloudinary(file: File): Promise<UploadedMedia> {
  const { cloudName, apiKey, timestamp, signature, folder } = await getCloudinarySignature();
  const isVideo = /^video\//.test(file.type);
  const resourceType = isVideo ? "video" : "image";

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Falha no upload direto (HTTP ${res.status})`);
  }
  const data = await res.json();
  return {
    url: data.secure_url as string,
    filename: (data.secure_url as string).split("/").pop() || file.name,
    type: resourceType,
    publicId: data.public_id as string,
  };
}

// Caminho existente (arquivo passa pelo servidor Express na Vercel) —
// preservado como reserva caso o upload direto falhe por qualquer motivo
// (assinatura indisponível, bloqueio de rede, etc).
async function uploadViaServer(file: File): Promise<UploadedMedia> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 413) {
      throw new Error("Arquivo grande demais para a hospedagem (máx. ~4MB), mesmo depois de comprimido.");
    }
    throw new Error(body?.error || `Falha no upload (HTTP ${res.status})`);
  }
  const data = await res.json();
  return { url: data.url, filename: data.filename, type: data.type };
}

// Ponto único de upload de mídia usado pelo admin e pelo editor de posts:
// comprime (imagem ou vídeo), tenta ir direto pro Cloudinary e só cai pro
// upload via servidor se o caminho direto falhar.
export async function uploadMedia(
  file: File,
  onStatus?: (status: "compressing" | "uploading") => void
): Promise<UploadedMedia> {
  onStatus?.("compressing");
  const prepared = await compressMediaFile(file);
  onStatus?.("uploading");
  try {
    return await uploadDirectToCloudinary(prepared);
  } catch {
    return await uploadViaServer(prepared);
  }
}
