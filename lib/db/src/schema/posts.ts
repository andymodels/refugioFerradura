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
  // Enquadramento CSS (object-position) da capa, ex. "center top", "center
  // bottom" — corrige o corte de foto/vídeo de capa quando o assunto não
  // está centralizado no quadro. Vídeo nunca é recortado no Cloudinary (o
  // poster sai inteiro), então este valor resolve o corte pra foto e vídeo
  // ao mesmo tempo, sempre no CSS.
  coverImagePosition: text("cover_image_position").notNull().default("center center"),
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
  // Preenchidos quando o post é publicado no feed do Instagram oficial via
  // painel admin (sempre uma ação manual, nunca automática).
  instagramPostedAt: timestamp("instagram_posted_at", { withTimezone: true }),
  instagramMediaId: text("instagram_media_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
