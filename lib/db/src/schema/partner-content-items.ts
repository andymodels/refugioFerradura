import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { instagramPartnersTable } from "./instagram-partners";

// Um item de mídia (foto/vídeo) recebido de um parceiro já autorizado,
// aguardando a vez de ser publicado pelo agendamento de quinta a domingo.
// Como a API do Instagram não permite ler Stories (nem posts, na maioria dos
// casos) de outra conta, esse item chega SEMPRE por envio manual — o
// parceiro manda o arquivo (WhatsApp/e-mail) e o admin sobe no painel.
// Entrar na fila já conta como aprovado: a autorização foi dada uma vez, no
// parceiro, não item por item.
export const partnerContentItemsTable = pgTable("partner_content_items", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => instagramPartnersTable.id, { onDelete: "cascade" }),
  mediaUrl: text("media_url").notNull().unique(),
  mediaType: text("media_type").notNull(), // "foto" | "video"
  // Qual autorização esse item consome: "story" | "feed" | "reel".
  tipoConteudo: text("tipo_conteudo").notNull(),
  // "na_fila" (aguardando agendamento) | "agendado" (alocado num horário
  // pela prévia) | "publicado" | "cancelado".
  status: text("status").notNull().default("na_fila"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  publishedMediaId: text("published_media_id"),
  notas: text("notas"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPartnerContentItemSchema = createInsertSchema(partnerContentItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPartnerContentItem = z.infer<typeof insertPartnerContentItemSchema>;
export type PartnerContentItem = typeof partnerContentItemsTable.$inferSelect;
