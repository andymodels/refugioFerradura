import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

// Vídeo de celular vem com bitrate muito acima do que a web precisa (um
// minuto em 4K passa fácil de 100MB). Reduz aqui no navegador antes de
// enviar, do mesmo jeito que compressImageFile já faz pra imagem. Usa o
// núcleo single-thread do ffmpeg.wasm (core-st) de propósito: o núcleo
// multi-thread exige os cabeçalhos COOP/COEP no site inteiro, o que quebraria
// os embeds de YouTube/Instagram e as imagens do Cloudinary já em uso.
const COMPRESS_THRESHOLD_BYTES = 8 * 1024 * 1024;
const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core-st@${CORE_VERSION}/dist/esm`;

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

export async function compressVideoFile(file: File): Promise<File> {
  if (!/^video\//.test(file.type)) return file;
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return file;

  try {
    const ffmpeg = await getFFmpeg();
    const inputName = "input" + (file.name.match(/\.\w+$/)?.[0] || ".mp4");
    const outputName = "output.mp4";

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec([
      "-i", inputName,
      "-vf", "scale='min(1280,iw)':-2",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "26",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data as unknown as BlobPart], { type: "video/mp4" });
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    if (blob.size === 0 || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".mp4"), { type: "video/mp4" });
  } catch {
    // Se a compressão falhar por qualquer motivo (memória, formato exótico,
    // CDN do núcleo fora do ar), sobe o arquivo original — nunca bloqueia o
    // upload por causa da compressão.
    return file;
  }
}
