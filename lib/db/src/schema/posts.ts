import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull().default(""),
  coverImage: text("cover_image"),
  coverImageDisplayMode: text("cover_image_display_mode").notNull().default("cover"),
  // JSON com a proveniência da imagem de capa: tipo de origem
  // (instagram_oficial/site_oficial/pdf/licenciada), URL original, URL de
  // destino do clique, crédito exibido, data de verificação e se é embed.
  coverImageMeta: text("cover_image_meta"),
  gallery: text("gallery"),
  videoEmbeds: text("video_embeds"),
  // JSON MediaItem[] — mídia editorial aprovada (foto/vídeo) do corpo do
  // post, com metadados completos de proveniência. Preenchido pelo pipeline
  // único de mídia (lib/media-pipeline.ts) e pela rotina de reconciliação.
  mediaItems: text("media_items"),
  // Snapshot do content/coverImage originais, gravado uma única vez antes da
  // primeira reconciliação — nunca sobrescrito depois, serve de backup.
  mediaMigrationBackup: text("media_migration_backup"),
  // Motivo da última falha de validação da reconciliação, se houver; null
  // quando o post está em dia ou nunca foi reconciliado.
  mediaMigrationFlag: text("media_migration_flag"),
  tags: text("tags"),
  status: text("status").notNull().default("draft"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
