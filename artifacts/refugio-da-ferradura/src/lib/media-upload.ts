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

interface DirectUpload {
  uploadUrl: string;
  url: string;
  key: string;
}

async function getDirectUpload(file: File, posterFor?: string): Promise<DirectUpload> {
  const params = new URLSearchParams({ filename: file.name, contentType: file.type || "application/octet-stream" });
  if (posterFor) params.set("posterFor", posterFor);
  const res = await fetch(`/api/media/upload-url?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Falha ao preparar upload (HTTP ${res.status})`);
  return res.json();
}

async function createVideoPoster(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo"));
    });
    const targetTime = Number.isFinite(video.duration) ? Math.min(2, Math.max(0.25, video.duration * 0.25)) : 1;
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível buscar um frame do vídeo"));
      video.currentTime = targetTime;
    });
    const max = Math.max(video.videoWidth, video.videoHeight);
    if (!max) return null;
    const scale = Math.min(1, 740 / max);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], "video-poster.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Gera uma miniatura pra um vídeo que já está publicado em outro lugar (link
// colado direto no editor, não um arquivo enviado por nós) — tira um
// "print" de um frame do próprio vídeo no navegador e sobe essa imagem pro
// nosso storage. Sem isso, um link de vídeo externo nunca teria capa: só o
// que a gente mesmo hospeda ganha o ".poster.jpg" automático (ver
// createVideoPoster acima). Falha silenciosamente (volta null) sempre que o
// site de origem não libera o vídeo pra leitura entre domínios — nesse caso
// o post fica sem miniatura, mas nunca quebra a inserção do vídeo.
export async function generatePosterForVideoUrl(url: string): Promise<string | null> {
  try {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo"));
    });
    const targetTime = Number.isFinite(video.duration) ? Math.min(2, Math.max(0.25, video.duration * 0.25)) : 1;
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível buscar um frame do vídeo"));
      video.currentTime = targetTime;
    });
    const max = Math.max(video.videoWidth, video.videoHeight);
    if (!max) return null;
    const scale = Math.min(1, 740 / max);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/jpeg", 0.82);
      } catch {
        resolve(null);
      }
    });
    if (!blob) return null;
    const file = new File([blob], "video-poster.jpg", { type: "image/jpeg" });
    const target = await getDirectUpload(file);
    const res = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: file });
    if (!res.ok) return null;
    return target.url;
  } catch {
    return null;
  }
}

// Sobe direto do navegador pro Cloudinary, sem passar pela função serverless
// da Vercel — evita o teto de ~4,5MB por requisição da plataforma.
async function uploadDirectToB2(file: File): Promise<UploadedMedia> {
  const { uploadUrl, url, key } = await getDirectUpload(file);
  const isVideo = /^video\//.test(file.type);
  const resourceType = isVideo ? "video" : "image";
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Falha no upload direto (HTTP ${res.status})`);
  }
  if (isVideo) {
    const poster = await createVideoPoster(file);
    if (poster) {
      const target = await getDirectUpload(poster, key);
      await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": poster.type }, body: poster });
    }
  }
  return {
    url,
    filename: key.split("/").pop() || file.name,
    type: resourceType,
    publicId: key,
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
    return await uploadDirectToB2(prepared);
  } catch {
    return await uploadViaServer(prepared);
  }
}
