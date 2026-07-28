import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postsTable } from "./posts";

export const empreendimentosFilaTable = pgTable("empreendimentos_fila", {
  id: serial("id").primaryKey(),
  ordem: integer("ordem").notNull().unique(),
  nome: text("nome").notNull(),
  regiao: text("regiao"),
  proprietario: text("proprietario"),
  telefone: text("telefone"),
  email: text("email"),
  endereco: text("endereco"),
  plusCode: text("plus_code"),
  instagram: text("instagram"),
  site: text("site"),
  caracteristicas: text("caracteristicas"), // JSON array de strings
  fotos: text("fotos"), // JSON array de URLs Cloudinary
  status: text("status").notNull().default("pendente"),
  postId: integer("post_id").references(() => postsTable.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  publicadoEm: timestamp("publicado_em", { withTimezone: true }),
  // Mensagem do último erro transitório (limite de uso da IA, timeout,
  // indisponibilidade) — o item NUNCA é descartado por isso, só volta pra
  // "pendente" e registra aqui o motivo, pra ficar visível sem travar a fila.
  ultimoErro: text("ultimo_erro"),
  // Quando um erro trouxer uma data de retorno conhecida (ex: limite de uso
  // da API que só libera numa data específica), evita reprocessar o mesmo
  // item a cada execução até essa data — barato, sem custo de IA.
  pausadoAte: timestamp("pausado_ate", { withTimezone: true }),
});

export const insertEmpreendimentoFilaSchema = createInsertSchema(empreendimentosFilaTable).omit({
  id: true,
  criadoEm: true,
});
export type InsertEmpreendimentoFila = z.infer<typeof insertEmpreendimentoFilaSchema>;
export type EmpreendimentoFila = typeof empreendimentosFilaTable.$inferSelect;
