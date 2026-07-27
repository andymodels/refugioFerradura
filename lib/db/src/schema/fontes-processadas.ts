import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fontesTable } from "./fontes";
import { postsTable } from "./posts";

export const fontesProcessadasTable = pgTable("fontes_processadas", {
  id: serial("id").primaryKey(),
  fonteId: integer("fonte_id")
    .notNull()
    .references(() => fontesTable.id),
  url: text("url").notNull().unique(),
  postId: integer("post_id").references(() => postsTable.id),
  status: text("status").notNull(),
  alertaRevisao: text("alerta_revisao"),
  detalhe: text("detalhe"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFonteProcessadaSchema = createInsertSchema(fontesProcessadasTable).omit({
  id: true,
  criadoEm: true,
});
export type InsertFonteProcessada = z.infer<typeof insertFonteProcessadaSchema>;
export type FonteProcessada = typeof fontesProcessadasTable.$inferSelect;
