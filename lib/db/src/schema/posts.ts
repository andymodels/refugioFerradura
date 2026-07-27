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
  tags: text("tags"),
  status: text("status").notNull().default("draft"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
