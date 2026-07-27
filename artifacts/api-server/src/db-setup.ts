import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

export async function setupDatabase(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query("SET search_path TO public");

    // --- Tables ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "admins" (
        "id" serial PRIMARY KEY,
        "username" text NOT NULL UNIQUE,
        "password_hash" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "posts" (
        "id" serial PRIMARY KEY,
        "title" text NOT NULL,
        "subtitle" text,
        "slug" text NOT NULL UNIQUE,
        "excerpt" text,
        "content" text NOT NULL DEFAULT '',
        "cover_image" text,
        "gallery" text,
        "video_embeds" text,
        "tags" text,
        "status" text NOT NULL DEFAULT 'draft',
        "meta_description" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "settings" (
        "id" serial PRIMARY KEY,
        "key" text NOT NULL UNIQUE,
        "value" text NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "places" (
        "id" serial PRIMARY KEY,
        "name" text NOT NULL,
        "slug" text NOT NULL UNIQUE,
        "description" text,
        "category" text,
        "cover_image" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "fontes" (
        "id" serial PRIMARY KEY,
        "nome" text NOT NULL,
        "url" text NOT NULL,
        "tipo" text NOT NULL DEFAULT 'site',
        "ativo" boolean NOT NULL DEFAULT true,
        "ultima_verificacao" timestamptz,
        "criado_em" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "fontes_processadas" (
        "id" serial PRIMARY KEY,
        "fonte_id" integer NOT NULL REFERENCES "fontes"("id"),
        "url" text NOT NULL UNIQUE,
        "post_id" integer REFERENCES "posts"("id"),
        "status" text NOT NULL,
        "alerta_revisao" text,
        "detalhe" text,
        "criado_em" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "empreendimentos_fila" (
        "id" serial PRIMARY KEY,
        "ordem" integer NOT NULL UNIQUE,
        "nome" text NOT NULL,
        "regiao" text,
        "proprietario" text,
        "telefone" text,
        "email" text,
        "endereco" text,
        "plus_code" text,
        "instagram" text,
        "site" text,
        "caracteristicas" text,
        "fotos" text,
        "status" text NOT NULL DEFAULT 'pendente',
        "post_id" integer REFERENCES "posts"("id"),
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "publicado_em" timestamptz
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    // --- Seed admin user ---
    const existing = await pool.query(
      `SELECT id FROM admins WHERE username = $1`,
      ["admin"]
    );
    if (existing.rows.length === 0) {
      const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
      const hash = await bcrypt.hash(adminPassword, 10);
      await pool.query(
        `INSERT INTO admins (username, password_hash) VALUES ($1, $2)`,
        ["admin", hash]
      );
      console.log("[setup] Admin user created.");
    }

    console.log("[setup] Database ready.");
  } catch (err) {
    console.error("[setup] Database setup failed:", err);
    throw err;
  } finally {
    await pool.end();
  }
}
