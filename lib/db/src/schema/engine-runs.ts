import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { postsTable } from "./posts";

// Uma linha por dia (fuso de Brasília) do motor de conteúdo automático. O
// UNIQUE em run_date é a trava de "1 matéria por dia": a primeira tentativa
// do dia reserva a data; qualquer outra encontra a linha e não faz nada.
export const engineRunsTable = pgTable("engine_runs", {
  id: serial("id").primaryKey(),
  // "YYYY-MM-DD" em America/Sao_Paulo.
  runDate: text("run_date").notNull().unique(),
  // "running" | "published" | "failed"
  status: text("status").notNull().default("running"),
  // Tipo de pauta: por enquanto só "destaque".
  kind: text("kind").notNull().default("destaque"),
  attempts: integer("attempts").notNull().default(1),
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "set null" }),
  partnerIds: integer("partner_ids").array().notNull().default(sql`'{}'::integer[]`),
  // Motivo de cada descarte/falha (texto livre, uma linha por evento).
  detalhes: text("detalhes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type EngineRun = typeof engineRunsTable.$inferSelect;
