import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { postsTable } from "./posts";

// Fila de carrosséis do Instagram. O Mac (Claude Code) produz o conteúdo
// FINALIZADO e o coloca aqui; a nuvem só verifica a fila e publica na hora
// marcada. Nada aqui é escrito, escolhido ou reescrito pela nuvem.
export const instagramQueueTable = pgTable("instagram_queue", {
  id: serial("id").primaryKey(),
  // Rótulo curto para o painel (ex.: "Domingo na Rota").
  titulo: text("titulo").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  caption: text("caption").notNull(),
  // URLs do B2 já prontas (JPEG 4:5), na ordem dos slides. O slide 1 é a capa.
  imageUrls: text("image_urls").array().notNull().default(sql`'{}'::text[]`),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  // Foto usada como FUNDO da capa: serve para não repetir fundos próximos.
  capaFundo: text("capa_fundo"),
  // "aguardando" | "publicando" | "publicado" | "falhou" | "cancelado"
  status: text("status").notNull().default("aguardando"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
  igMediaId: text("ig_media_id"),
  permalink: text("permalink"),
  // Impede enfileirar duas vezes o mesmo conteúdo (hash de imagens + legenda).
  dedupeKey: text("dedupe_key").notNull().unique(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InstagramQueueItem = typeof instagramQueueTable.$inferSelect;
