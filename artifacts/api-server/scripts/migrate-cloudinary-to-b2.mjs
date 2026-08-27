import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const { Pool } = pg;
const action = process.argv[2] || "scan";
const manifestPath = path.resolve("work/cloudinary-b2-manifest.json");
const backupPath = path.resolve("work/cloudinary-b2-database-backup.json");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

const endpointValue = required("B2_ENDPOINT").replace(/\/$/, "");
const endpoint = /^https?:\/\//i.test(endpointValue) ? endpointValue : `https://${endpointValue}`;
const bucket = required("B2_BUCKET");
const region = process.env.B2_REGION?.trim() || endpoint.match(/^https:\/\/s3\.([^.]+)\.backblazeb2\.com$/)?.[1] || "us-east-005";
const publicBase = (process.env.B2_PUBLIC_BASE_URL?.trim() || `${endpoint}/${encodeURIComponent(bucket)}`).replace(/\/$/, "");
const s3 = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId: required("B2_KEY_ID"), secretAccessKey: required("B2_APPLICATION_KEY") },
});
const pool = new Pool({ connectionString: required("DATABASE_URL") });

const sources = [
  { table: "posts", key: "id", fields: ["content", "cover_image", "gallery", "video_embeds", "cover_image_meta", "media_items", "media_migration_backup"] },
  { table: "places", key: "id", fields: ["cover_image"] },
  { table: "partner_content_items", key: "id", fields: ["media_url"] },
  { table: "empreendimentos_fila", key: "id", fields: ["fotos"] },
  { table: "settings", key: "id", fields: ["value"] },
];

const cloudinaryPattern = /https?:\/\/res\.cloudinary\.com\/[^\s"'<>\\&]+/g;
const codeFallbackUrls = [
  "https://res.cloudinary.com/dj7gpnjnl/image/upload/c_limit,w_640,h_640,q_auto,f_auto/v1775002767/refugio-da-ferradura/urot9h6goam0sbbiroxs.jpg",
  "https://res.cloudinary.com/dj7gpnjnl/image/upload/c_limit,w_640,h_640,q_auto,f_auto/v1785184012/refugio-da-ferradura/jx9fyustnmeord8muciw.png",
  "https://res.cloudinary.com/dj7gpnjnl/image/upload/c_limit,w_640,h_640,q_auto,f_auto/v1785184014/refugio-da-ferradura/m6pnscvok3lwxwuokkml.png",
  "https://res.cloudinary.com/dj7gpnjnl/image/upload/c_limit,w_640,h_640,q_auto,f_auto/v1785184016/refugio-da-ferradura/neb7hhllw8ikadgh6dg0.png",
];

function extractUrls(value) {
  if (typeof value !== "string") return [];
  return (value.match(cloudinaryPattern) || []).map((url) => url.replace(/[),;\]]+$/, ""));
}

async function readRows(client) {
  const all = [];
  for (const source of sources) {
    const columns = [source.key, ...source.fields].join(", ");
    const result = await client.query(`SELECT ${columns} FROM ${source.table}`);
    all.push({ ...source, rows: result.rows });
  }
  return all;
}

async function loadManifest() {
  try { return JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { return { createdAt: new Date().toISOString(), entries: {} }; }
}

async function saveManifest(manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function extension(contentType, sourceUrl) {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "image/svg+xml": "svg", "image/heic": "heic", "image/heif": "heif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  return map[mime] || new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() || "bin";
}

function publicUrl(key) {
  return `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function scan() {
  const client = await pool.connect();
  try {
    const grouped = await readRows(client);
    const urls = new Set();
    for (const url of codeFallbackUrls) urls.add(url);
    for (const source of grouped) for (const row of source.rows) for (const field of source.fields) {
      for (const url of extractUrls(row[field])) urls.add(url);
    }
    const previous = await loadManifest();
    const manifest = { ...previous, entries: {} };
    for (const url of urls) manifest.entries[url] = previous.entries[url] || { status: "pending" };
    await saveManifest(manifest);
    console.log(`SCAN_OK urls=${urls.size} manifest=${manifestPath}`);
    return manifest;
  } finally { client.release(); }
}

async function copy() {
  const manifest = await scan();
  let copied = 0;
  let failed = 0;
  const pending = Object.entries(manifest.entries).filter(([, entry]) => entry.status !== "validated");
  const batchSize = 24;
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    await Promise.all(batch.map(async ([sourceUrl, entry]) => {
      try {
        const response = await fetch(sourceUrl, { redirect: "follow" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const digest = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24);
        const key = `refugio-da-ferradura/migrated/${digest}.${extension(contentType, sourceUrl)}`;
        const body = new Uint8Array(await response.arrayBuffer());
        await s3.send(new PutObjectCommand({
          Bucket: bucket, Key: key, Body: body, ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: { migratedFrom: "cloudinary" },
        }));
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        manifest.entries[sourceUrl] = { status: "validated", key, url: publicUrl(key), bytes: body.byteLength, contentType };
        copied += 1;
      } catch (error) {
        manifest.entries[sourceUrl] = { ...entry, status: "failed", error: error instanceof Error ? error.message : String(error) };
        failed += 1;
      }
    }));
    await saveManifest(manifest);
    console.log(`COPY_PROGRESS done=${Math.min(offset + batch.length, pending.length)}/${pending.length} copied=${copied} failed=${failed}`);
  }
  console.log(`COPY_DONE copied=${copied} failed=${failed}`);
  if (failed) process.exitCode = 2;
}

function replaceUrls(value, entries) {
  if (typeof value !== "string") return value;
  let next = value;
  for (const [oldUrl, entry] of Object.entries(entries)) {
    if (entry.status === "validated") next = next.split(oldUrl).join(entry.url);
  }
  return next;
}

async function rewrite() {
  const manifest = await loadManifest();
  const incomplete = Object.entries(manifest.entries).filter(([, entry]) => entry.status !== "validated");
  if (incomplete.length) throw new Error(`Migração incompleta: ${incomplete.length} URL(s) ainda não validadas`);
  const client = await pool.connect();
  try {
    const grouped = await readRows(client);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), grouped }, null, 2) + "\n");
    await client.query("BEGIN");
    let changed = 0;
    for (const source of grouped) for (const row of source.rows) {
      const updates = [];
      const values = [];
      for (const field of source.fields) {
        const next = replaceUrls(row[field], manifest.entries);
        if (next !== row[field]) {
          values.push(next);
          updates.push(`${field} = $${values.length}`);
        }
      }
      if (updates.length) {
        values.push(row[source.key]);
        await client.query(`UPDATE ${source.table} SET ${updates.join(", ")} WHERE ${source.key} = $${values.length}`, values);
        changed += 1;
      }
    }
    await client.query("COMMIT");
    console.log(`REWRITE_OK rows=${changed} backup=${backupPath}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

try {
  if (action === "scan") await scan();
  else if (action === "copy") await copy();
  else if (action === "rewrite") await rewrite();
  else throw new Error("Use: scan, copy ou rewrite");
} finally {
  await pool.end();
}
