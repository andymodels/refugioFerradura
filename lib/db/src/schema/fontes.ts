import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fontesTable = pgTable("fontes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  url: text("url").notNull(),
  // "site" (rotina antiga de vigiar um site) | "busca_web" (busca regional,
  // registro interno) | "instagram_oficial" (canal oficial monitorado —
  // Canais Oficiais).
  tipo: text("tipo").notNull().default("site"),
  ativo: boolean("ativo").notNull().default(true),
  ultimaVerificacao: timestamp("ultima_verificacao", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  // Campos do empreendimento por trás de um canal oficial — usados pra gerar
  // o bloco "Serviço" (WhatsApp/mailto/Maps/Instagram) de cada matéria.
  instagram: text("instagram"),
  site: text("site"),
  telefone: text("telefone"),
  email: text("email"),
  endereco: text("endereco"),
  tags: text("tags"),
});

export const insertFonteSchema = createInsertSchema(fontesTable).omit({
  id: true,
  criadoEm: true,
  ultimaVerificacao: true,
});
export type InsertFonte = z.infer<typeof insertFonteSchema>;
export type Fonte = typeof fontesTable.$inferSelect;
