import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fontesTable = pgTable("fontes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  url: text("url").notNull(),
  tipo: text("tipo").notNull().default("site"),
  ativo: boolean("ativo").notNull().default(true),
  ultimaVerificacao: timestamp("ultima_verificacao", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFonteSchema = createInsertSchema(fontesTable).omit({
  id: true,
  criadoEm: true,
  ultimaVerificacao: true,
});
export type InsertFonte = z.infer<typeof insertFonteSchema>;
export type Fonte = typeof fontesTable.$inferSelect;
