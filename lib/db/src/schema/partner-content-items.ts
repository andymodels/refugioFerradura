import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { instagramPartnersTable } from "./instagram-partners";

// Um item de mídia (foto/vídeo) de um parceiro já autorizado, aguardando a
// vez de ser publicado pelo agendamento de quinta a domingo. Chega de duas
// formas: (1) feed/Reels descobertos automaticamente via polling da conta
// conectada do parceiro (origem="conexao"), sempre re-hospedados no nosso
// Cloudinary pra não depender de URL assinada do Instagram que expira; ou
// (2) Stories enviados pelo próprio parceiro pelo link exclusivo de upload
// (origem="link_parceiro"). Entrar na fila já conta como aprovado — a
// autorização foi dada uma vez, no parceiro, não item por item.
export const partnerContentItemsTable = pgTable("partner_content_items", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => instagramPartnersTable.id, { onDelete: "cascade" }),
  // "conexao" (polling automático do feed/Reels) | "link_parceiro" (upload
  // pelo link de Stories) | "manual" (admin subiu direto no painel).
  origem: text("origem").notNull().default("manual"),
  // ID da mídia original no Instagram do parceiro — chave de dedupe do
  // polling, checada ANTES de rehospedar (evita reprocessar a cada rodada).
  sourceMediaId: text("source_media_id").unique(),
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
