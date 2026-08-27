import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

export type MediaResourceType = "image" | "video";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function endpoint(): string {
  const value = required("B2_ENDPOINT").replace(/\/$/, "");
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function bucket(): string {
  return required("B2_BUCKET");
}

function region(): string {
  return process.env.B2_REGION?.trim()
    || endpoint().match(/^https:\/\/s3\.([^.]+)\.backblazeb2\.com$/)?.[1]
    || "us-east-005";
}

let client: S3Client | undefined;

export function getB2Client(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: endpoint(),
      region: region(),
      forcePathStyle: true,
      credentials: {
        accessKeyId: required("B2_KEY_ID"),
        secretAccessKey: required("B2_APPLICATION_KEY"),
      },
    });
  }
  return client;
}

export function b2PublicUrl(key: string): string {
  const customBase = process.env.B2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const base = customBase || `${endpoint()}/${encodeURIComponent(bucket())}`;
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function extension(filename: string, contentType: string, type: MediaResourceType): string {
  const fromName = filename.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  if (fromName) return fromName;
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "image/svg+xml": "svg", "image/heic": "heic",
    "image/heif": "heif", "video/mp4": "mp4", "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return byMime[contentType.split(";")[0].trim().toLowerCase()] || (type === "video" ? "mp4" : "jpg");
}

export function createMediaKey(filename: string, contentType: string, type: MediaResourceType, folder = "refugio-da-ferradura"): string {
  return `${folder.replace(/^\/+|\/+$/g, "")}/${Date.now()}-${randomUUID()}.${extension(filename, contentType, type)}`;
}

// O B2 armazena o arquivo recebido; diferente do Cloudinary, não aplica uma
// transformação na entrega. Toda imagem que entra pelo servidor precisa sair
// daqui já limitada para não ocupar espaço desnecessário.
async function optimizeImage(body: Buffer | Uint8Array, filename: string, contentType: string) {
  const normalizedType = contentType.split(";", 1)[0].toLowerCase();
  if (normalizedType === "image/svg+xml" || normalizedType === "image/gif") {
    return { body, filename, contentType };
  }
  try {
    const input = Buffer.from(body);
    const image = sharp(input, { animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) <= 740) {
      return { body, filename, contentType };
    }
    const output = await image
      .rotate()
      .resize({ width: 740, height: 740, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return {
      body: output,
      filename: filename.replace(/\.[a-z0-9]+$/i, ".webp"),
      contentType: "image/webp",
    };
  } catch {
    // Não bloqueia uma publicação por um formato que o Sharp não suporte.
    return { body, filename, contentType };
  }
}

// Tira um frame do próprio vídeo pra servir de miniatura — sem isso a
// matéria abre com o vídeo em tela preta até alguém clicar em play. Roda no
// exato momento em que o vídeo já está em memória pronto pra subir pro B2
// (upload direto de arquivo OU arquivamento de link externo, ex. Instagram —
// os dois caminhos passam por uploadMediaBuffer, então um vídeo importado
// por link ganha miniatura do mesmo jeito que um enviado por upload). Nunca
// derruba o upload do vídeo: qualquer falha aqui (ffmpeg indisponível,
// formato não suportado, timeout) só significa que esse vídeo específico
// fica sem miniatura própria — o frontend já tem um fallback visual pra
// isso, não é obrigatório existir.
export async function extractVideoPosterFrame(body: Buffer | Uint8Array, atSeconds = 0.6): Promise<Buffer | null> {
  if (!ffmpegPath) return null;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "refugio-video-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, "poster.jpg");
  try {
    await writeFile(inputPath, body);
    // -ss antes do -i faz o ffmpeg pular direto pro segundo pedido sem
    // decodificar o vídeo inteiro (rápido o bastante pra rodar dentro de uma
    // função serverless) — o padrão (0.6s) evita pegar o primeiro frame, que
    // em vídeo do Instagram costuma vir preto/em fade.
    await execFileAsync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-ss", String(Math.max(0, atSeconds)), "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=740:740:force_original_aspect_ratio=decrease",
      "-q:v", "3", outputPath,
    ], { timeout: 8000 });
    const poster = await readFile(outputPath);
    return poster.length > 100 ? poster : null;
  } catch {
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function uploadMediaBuffer(params: {
  body: Buffer | Uint8Array;
  filename: string;
  contentType: string;
  type: MediaResourceType;
  folder?: string;
  key?: string;
}): Promise<{ url: string; type: MediaResourceType; key: string; posterUrl?: string }> {
  const prepared = params.type === "image"
    ? await optimizeImage(params.body, params.filename, params.contentType)
    : { body: params.body, filename: params.filename, contentType: params.contentType };
  const key = params.key || createMediaKey(prepared.filename, prepared.contentType, params.type, params.folder);
  await getB2Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: prepared.body, ContentType: prepared.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  let posterUrl: string | undefined;
  if (params.type === "video") {
    const poster = await extractVideoPosterFrame(prepared.body).catch(() => null);
    if (poster) {
      const posterKey = `${key}.poster.jpg`;
      try {
        await getB2Client().send(new PutObjectCommand({
          Bucket: bucket(), Key: posterKey, Body: poster, ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000, immutable",
        }));
        posterUrl = b2PublicUrl(posterKey);
      } catch {
        // Vídeo já subiu — miniatura é um extra, nunca motivo pra falhar aqui.
      }
    }
  }

  return { url: b2PublicUrl(key), type: params.type, key, posterUrl };
}

// Baixa um vídeo de qualquer URL (o mesmo que já é feito pra arquivar link
// do Instagram, ver archiveRemoteMedia abaixo) só pra tirar um frame num
// instante escolhido e salvar como imagem no B2 — usado pelo "Definir capa"
// do editor (ver rota /media/video-frame) sempre que a pessoa quer um frame
// diferente do automático, ou quando o vídeo é um link externo (o navegador
// não consegue ler pixel de vídeo de outro domínio sem CORS, então quem tira
// o frame precisa ser o servidor, que baixa o arquivo sem essa restrição).
export async function captureRemoteVideoFrame(sourceUrl: string, atSeconds: number): Promise<string | null> {
  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Falha ao baixar vídeo (HTTP ${response.status})`);
  const body = new Uint8Array(await response.arrayBuffer());
  const poster = await extractVideoPosterFrame(body, atSeconds);
  if (!poster) return null;
  const key = createMediaKey("frame.jpg", "image/jpeg", "image", "refugio-da-ferradura/video-covers");
  await getB2Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: poster, ContentType: "image/jpeg",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return b2PublicUrl(key);
}

export async function archiveRemoteMedia(sourceUrl: string, slug: string, index: number, type: MediaResourceType): Promise<string> {
  if (sourceUrl.startsWith(`${endpoint()}/`) || (process.env.B2_PUBLIC_BASE_URL && sourceUrl.startsWith(process.env.B2_PUBLIC_BASE_URL))) return sourceUrl;
  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Falha ao baixar mídia de origem (HTTP ${response.status})`);
  const contentType = response.headers.get("content-type") || (type === "video" ? "video/mp4" : "image/jpeg");
  const filename = new URL(response.url).pathname.split("/").pop() || `${slug}-${index}`;
  const result = await uploadMediaBuffer({
    body: new Uint8Array(await response.arrayBuffer()), filename, contentType, type,
    folder: `refugio-da-ferradura/posts/${slug}`,
  });
  return result.url;
}

export async function createDirectUpload(params: { filename: string; contentType: string; type: MediaResourceType; key?: string }) {
  const key = params.key || createMediaKey(params.filename, params.contentType, params.type);
  const command = new PutObjectCommand({
    Bucket: bucket(), Key: key, ContentType: params.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  return { uploadUrl: await getSignedUrl(getB2Client(), command, { expiresIn: 600 }), url: b2PublicUrl(key), key };
}

export async function listMediaObjects() {
  const result = await getB2Client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: "refugio-da-ferradura/", MaxKeys: 200 }));
  return (result.Contents || []).filter((item) => item.Key).map((item) => {
    const key = item.Key!;
    const type: MediaResourceType = /\.(mp4|webm|mov|m4v)$/i.test(key) ? "video" : "image";
    return { url: b2PublicUrl(key), filename: key.split("/").pop() || key, publicId: key, createdAt: item.LastModified, type };
  }).sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}

export async function deleteMediaObject(key: string): Promise<void> {
  if (!key.startsWith("refugio-da-ferradura/")) throw new Error("Chave de mídia inválida");
  await getB2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
