import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postsTable } from "./posts";

// Um perfil parceiro citado no blog (varredura) ou cadastrado manualmente no
// painel. Uma vez com status "autorizado_repost", conteúdo dele que entra na
// fila (partnerContentItemsTable) é publicado automaticamente pelo
// agendamento — a autorização é dada uma vez, no nível do parceiro, não item
// por item.
export const instagramPartnersTable = pgTable("instagram_partners", {
  id: serial("id").primaryKey(),
  // Nulo quando o parceiro foi cadastrado manualmente (não veio de um post).
  postId: integer("post_id").references(() => postsTable.id, { onDelete: "cascade" }).unique(),
  // "blog" (achado pela varredura) | "manual" (cadastrado direto no painel).
  origem: text("origem").notNull().default("blog"),
  // Editável — o título da matéria nem sempre é igual ao nome do negócio.
  nomeEstabelecimento: text("nome_estabelecimento").notNull(),
  instagramHandle: text("instagram_handle"),
  telefone: text("telefone"),
  // "encontrado" (recém-descoberto pela varredura) | "conferido" (revisado
  // manualmente) | "seguido_manualmente" | "autorizado_repost".
  status: text("status").notNull().default("encontrado"),
  // Pausa esse parceiro especificamente — a fila/agendamento pula qualquer
  // conteúdo dele enquanto pausado, mesmo que esteja autorizado.
  pausado: boolean("pausado").notNull().default(false),
  // Registro de autorização — tudo preenchido manualmente pelo admin.
  autorizacaoData: timestamp("autorizacao_data", { withTimezone: true }),
  autorizacaoCanal: text("autorizacao_canal"),
  autorizacaoObservacao: text("autorizacao_observacao"),
  autorizacaoFotos: boolean("autorizacao_fotos").notNull().default(false),
  autorizacaoVideosReels: boolean("autorizacao_videos_reels").notNull().default(false),
  autorizacaoStories: boolean("autorizacao_stories").notNull().default(false),
  marcacaoObrigatoria: boolean("marcacao_obrigatoria").notNull().default(false),
  // Preenchidos quando o parceiro conecta a própria conta (login único do
  // Instagram) — nunca expostos em nenhuma resposta de API. Com isso dá pra
  // ler o feed/Reels dele automaticamente, sem repost de terceiro nenhum:
  // é a própria conta dele autorizando o acesso aos próprios dados.
  igUserId: text("ig_user_id"),
  igUsername: text("ig_username"),
  igAccessToken: text("ig_access_token"),
  igTokenExpiresAt: timestamp("ig_token_expires_at", { withTimezone: true }),
  conectadoEm: timestamp("conectado_em", { withTimezone: true }),
  ultimoPollEm: timestamp("ultimo_poll_em", { withTimezone: true }),
  // Token único e imprevisível pro link pessoal de envio de Stories — o
  // parceiro usa esse link sem login nenhum no painel.
  uploadToken: text("upload_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInstagramPartnerSchema = createInsertSchema(instagramPartnersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertInstagramPartner = z.infer<typeof insertInstagramPartnerSchema>;
export type InstagramPartner = typeof instagramPartnersTable.$inferSelect;
