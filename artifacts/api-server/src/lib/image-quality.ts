import { imageSize } from "image-size";

// Abaixo disso a foto fica visivelmente ruim quando recortada pra capa
// horizontal (16:9) — sem upscale artificial, só aceita ou rejeita.
export const MIN_COVER_WIDTH = 1200;
export const MIN_COVER_HEIGHT = 675;

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export interface ImageQuality {
  width: number;
  height: number;
  ok: boolean;
}

// Baixa a imagem e mede a resolução real, sem redimensionar/upscale — só pra
// decidir se ela passa no filtro mínimo de qualidade antes de virar capa.
export async function probeImageQuality(url: string): Promise<ImageQuality | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_DOWNLOAD_BYTES) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) return null;

    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) return null;

    const ok = dimensions.width >= MIN_COVER_WIDTH && dimensions.height >= MIN_COVER_HEIGHT;
    return { width: dimensions.width, height: dimensions.height, ok };
  } catch {
    return null;
  }
}
