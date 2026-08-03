import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { instagramPartnersTable } from "./instagram-partners";

// Achados do Radar (notícias regionais + posts públicos recentes de
// parceiros) — só descoberta e organização, nunca vira rascunho de post nem
// é publicado no Instagram sozinho. `url` é a chave de dedupe: um achado só
// entra aqui uma vez, pra nunca reaparecer como "novidade" numa varredura
// seguinte.
export const radarFindingsTable = pgTable("radar_findings", {
  id: serial("id").primaryKey(),
  // "noticia" (busca regional na web) | "parceiro_post" (post público de um
  // parceiro do Instagram, achado via busca — nunca via API/scraping direto).
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  url: text("url").notNull().unique(),
  fonte: text("fonte"),
  parceiroId: integer("parceiro_id").references(() => instagramPartnersTable.id, { onDelete: "set null" }),
  publicadoEm: timestamp("publicado_em", { withTimezone: true }),
  encontradoEm: timestamp("encontrado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRadarFindingSchema = createInsertSchema(radarFindingsTable).omit({ id: true, encontradoEm: true });
export type InsertRadarFinding = z.infer<typeof insertRadarFindingSchema>;
export type RadarFinding = typeof radarFindingsTable.$inferSelect;
