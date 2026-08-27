import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";

const run = promisify(execFile);
const dryRun = process.argv.includes("--dry-run");
const postersOnly = process.argv.includes("--posters-only");
const manifestPath = path.resolve("work/b2-media-optimization-manifest.json");
const MAX_DIMENSION = 740;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

const endpointValue = required("B2_ENDPOINT").replace(/\/$/, "");
const endpoint = /^https?:\/\//i.test(endpointValue) ? endpointValue : `https://${endpointValue}`;
const bucket = required("B2_BUCKET");
const region = process.env.B2_REGION?.trim() || endpoint.match(/^https:\/\/s3\.([^.]+)\.backblazeb2\.com$/)?.[1] || "us-east-005";
const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId: required("B2_KEY_ID"), secretAccessKey: required("B2_APPLICATION_KEY") },
});

async function bodyBuffer(body) {
  return Buffer.from(await body.transformToByteArray());
}

async function put(key, body, contentType) {
  if (dryRun) return;
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

async function optimizeImage(item, manifest) {
  const key = item.Key;
  if (/\.(gif|svg)$/i.test(key)) return false;
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const input = await bodyBuffer(result.Body);
  const image = sharp(input, { animated: false });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) <= MAX_DIMENSION) return false;
  const output = await image
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await put(key, output, "image/webp");
  manifest.images[key] = { before: item.Size, after: output.length, width: metadata.width, height: metadata.height };
  return true;
}

async function createVideoPoster(item, manifest) {
  const key = item.Key;
  const posterKey = `${key}.poster.jpg`;
  if (!dryRun) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: posterKey }));
      return false;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404) throw error;
    }
  }
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "refugio-video-"));
  const inputPath = path.join(tempDir, `input${path.extname(key) || ".mp4"}`);
  const outputPath = path.join(tempDir, "poster.jpg");
  try {
    await writeFile(inputPath, await bodyBuffer(result.Body));
    // Escolhe um frame representativo, em vez do primeiro frame que pode ser preto.
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", inputPath,
      "-vf", `thumbnail=100,scale=${MAX_DIMENSION}:${MAX_DIMENSION}:force_original_aspect_ratio=decrease`,
      "-frames:v", "1", "-q:v", "3", outputPath,
    ]);
    const poster = await readFile(outputPath);
    if (poster.length < 100) throw new Error("preview vazio");
    await put(posterKey, poster, "image/jpeg");
    manifest.posters[key] = { posterKey, bytes: poster.length };
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function listAll() {
  const items = [];
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "refugio-da-ferradura/",
      ContinuationToken: token,
    }));
    items.push(...(page.Contents || []).filter((item) => item.Key));
    token = page.NextContinuationToken;
  } while (token);
  return items;
}

const manifest = { createdAt: new Date().toISOString(), dryRun, images: {}, posters: {}, skipped: {} };
const items = await listAll();
const images = items.filter((item) => /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(item.Key));
const videos = items.filter((item) => /\.(mp4|webm|mov|m4v)$/i.test(item.Key));
console.log(`B2_SCAN images=${images.length} videos=${videos.length} dryRun=${dryRun} postersOnly=${postersOnly}`);

let imageCount = 0;
for (const item of postersOnly ? [] : images) {
  try {
    if (await optimizeImage(item, manifest)) imageCount++;
  } catch (error) {
    manifest.skipped[item.Key] = String(error?.message || error);
  }
  if ((imageCount + Object.keys(manifest.skipped).length) % 25 === 0) console.log(`B2_IMAGES changed=${imageCount} skipped=${Object.keys(manifest.skipped).length}`);
}

let posterCount = 0;
for (const item of videos) {
  try {
    if (await createVideoPoster(item, manifest)) posterCount++;
  } catch (error) {
    manifest.skipped[item.Key] = String(error?.message || error);
  }
  if (posterCount && posterCount % 10 === 0) console.log(`B2_POSTERS created=${posterCount}`);
}

manifest.completedAt = new Date().toISOString();
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`B2_DONE images=${imageCount} posters=${posterCount} skipped=${Object.keys(manifest.skipped).length} manifest=${manifestPath}`);
