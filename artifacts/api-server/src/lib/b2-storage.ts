import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

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

export async function uploadMediaBuffer(params: {
  body: Buffer | Uint8Array;
  filename: string;
  contentType: string;
  type: MediaResourceType;
  folder?: string;
  key?: string;
}): Promise<{ url: string; type: MediaResourceType; key: string }> {
  const prepared = params.type === "image"
    ? await optimizeImage(params.body, params.filename, params.contentType)
    : { body: params.body, filename: params.filename, contentType: params.contentType };
  const key = params.key || createMediaKey(prepared.filename, prepared.contentType, params.type, params.folder);
  await getB2Client().send(new PutObjectCommand({
    Bucket: bucket(), Key: key, Body: prepared.body, ContentType: prepared.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return { url: b2PublicUrl(key), type: params.type, key };
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
