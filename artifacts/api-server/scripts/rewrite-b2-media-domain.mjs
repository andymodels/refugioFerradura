import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;

// Reescreve, no Postgres, as URLs do B2 geradas antes de existir o
// subdomínio `media.refugioferradura.com.br` (endpoint S3 cru da Backblaze)
// para o novo domínio com CDN/cache da Cloudflare. Só toca em texto que bate
// EXATAMENTE com o prefixo antigo — nenhuma URL Cloudinary, nenhuma URL já
// migrada, nenhum outro conteúdo do banco é alterado.
//
// Uso:
//   node scripts/rewrite-b2-media-domain.mjs            # dry-run (padrão, não escreve nada)
//   node scripts/rewrite-b2-media-domain.mjs --apply     # aplica de fato, transacional, com backup

const apply = process.argv.includes("--apply");
const backupPath = path.resolve("work", `b2-domain-rewrite-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

const OLD_PREFIX = "https://s3.us-east-005.backblazeb2.com/refugio-media/";
const NEW_BASE = (process.env.B2_PUBLIC_BASE_URL?.trim() || "https://media.refugioferradura.com.br").replace(/\/$/, "");
const NEW_PREFIX = `${NEW_BASE}/`;

// Mesma superfície de colunas que a migração Cloudinary→B2 já cobriu, mais
// "places.cover_image" (única coluna de mídia existente nessa tabela — não
// existe "images" no schema atual).
const sources = [
  { table: "posts", key: "id", fields: ["content", "cover_image", "gallery", "video_embeds", "cover_image_meta", "media_items", "media_migration_backup"] },
  { table: "places", key: "id", fields: ["cover_image"] },
  { table: "partner_content_items", key: "id", fields: ["media_url"] },
  { table: "empreendimentos_fila", key: "id", fields: ["fotos"] },
  { table: "settings", key: "id", fields: ["value"] },
];

// Só substitui o prefixo antigo, char a char — não é um replace genérico de
// domínio B2 (não toca em friendly URL f005.backblazeb2.com nem em qualquer
// outro bucket/endpoint que porventura apareça).
function rewriteValue(value) {
  if (typeof value !== "string" || !value.includes(OLD_PREFIX)) return value;
  return value.split(OLD_PREFIX).join(NEW_PREFIX);
}

const pool = new Pool({ connectionString: required("DATABASE_URL") });

async function readRows(client) {
  const grouped = [];
  for (const source of sources) {
    const columns = [source.key, ...source.fields].join(", ");
    let result;
    try {
      result = await client.query(`SELECT ${columns} FROM ${source.table}`);
    } catch (err) {
      console.warn(`[skip] ${source.table}: ${err.message}`);
      continue;
    }
    grouped.push({ ...source, rows: result.rows });
  }
  return grouped;
}

async function main() {
  const client = await pool.connect();
  try {
    const grouped = await readRows(client);

    const plannedUpdates = [];
    let totalUrlOccurrences = 0;
    for (const source of grouped) {
      for (const row of source.rows) {
        const changes = {};
        for (const field of source.fields) {
          const before = row[field];
          const after = rewriteValue(before);
          if (after !== before) {
            const occurrences = (before.match(new RegExp(OLD_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
            totalUrlOccurrences += occurrences;
            changes[field] = { before, after, occurrences };
          }
        }
        if (Object.keys(changes).length) {
          plannedUpdates.push({ table: source.table, key: source.key, id: row[source.key], changes });
        }
      }
    }

    console.log(`OLD_PREFIX=${OLD_PREFIX}`);
    console.log(`NEW_PREFIX=${NEW_PREFIX}`);
    console.log(`Linhas afetadas: ${plannedUpdates.length}`);
    console.log(`Ocorrências de URL a trocar: ${totalUrlOccurrences}`);

    const byTable = {};
    for (const u of plannedUpdates) byTable[u.table] = (byTable[u.table] || 0) + 1;
    for (const [table, count] of Object.entries(byTable)) console.log(`  ${table}: ${count} linha(s)`);

    console.log("\nAmostra (até 5):");
    for (const u of plannedUpdates.slice(0, 5)) {
      const [field, change] = Object.entries(u.changes)[0];
      console.log(`  ${u.table}#${u.id}.${field}: ${change.occurrences} ocorrência(s)`);
    }

    if (!apply) {
      console.log("\nDRY_RUN_OK — nada foi escrito. Rode com --apply para aplicar de verdade.");
      return;
    }

    if (plannedUpdates.length === 0) {
      console.log("\nNada para aplicar.");
      return;
    }

    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(
      backupPath,
      JSON.stringify({ createdAt: new Date().toISOString(), oldPrefix: OLD_PREFIX, newPrefix: NEW_PREFIX, updates: plannedUpdates }, null, 2) + "\n"
    );
    console.log(`\nBackup gravado em ${backupPath}`);

    await client.query("BEGIN");
    try {
      let changed = 0;
      for (const u of plannedUpdates) {
        const setClauses = [];
        const values = [];
        for (const [field, change] of Object.entries(u.changes)) {
          values.push(change.after);
          setClauses.push(`${field} = $${values.length}`);
        }
        values.push(u.id);
        await client.query(`UPDATE ${u.table} SET ${setClauses.join(", ")} WHERE ${u.key} = $${values.length}`, values);
        changed += 1;
      }
      await client.query("COMMIT");
      console.log(`REWRITE_OK rows=${changed} backup=${backupPath}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  } finally {
    client.release();
  }
}

try {
  await main();
} finally {
  await pool.end();
}
