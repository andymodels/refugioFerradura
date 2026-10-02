import { pgTable, text, serial, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { instagramPartnersTable } from "./instagram-partners";

// Acervo de mídia real de cada lugar (base mestre), usado pelo motor de
// conteúdo automático. Tudo já está arquivado no nosso B2 — nunca guarda URL
// do Instagram (ela expira). Serve a três coisas: (1) não baixar/gravar a mesma
// foto duas vezes (UNIQUE por origem e por hash do arquivo); (2) lembrar a
// nota da avaliação visual; (3) registrar quando cada foto foi usada, para não
// repetir a mesma imagem em matérias seguidas.
export const partnerMediaTable = pgTable(
  "partner_media",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id").notNull().references(() => instagramPartnersTable.id, { onDelete: "cascade" }),
    // "instagram_oficial" | "b2_materia" | "site_oficial"
    source: text("source").notNull(),
    // Identificador da origem: "<shortcode>:<n>" (Instagram), URL do arquivo
    // (b2_materia) ou URL da imagem no site (site_oficial).
    sourceId: text("source_id").notNull(),
    // Só "foto" por enquanto (quadros de Reel entram como foto).
    kind: text("kind").notNull().default("foto"),
    urlArquivo: text("url_arquivo").notNull().unique(),
    // Versão 4:5 pronta para carrossel do Instagram (futuro); nulo = o próprio
    // arquivo já serve.
    urlInstagram: text("url_instagram"),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").unique(),
    origemUrl: text("origem_url"),
    destinoUrl: text("destino_url"),
    isReel: boolean("is_reel").notNull().default(false),
    // Mesmo vocabulário de MediaItem.tipo.
    tipoMidia: text("tipo_midia").notNull().default("instagram_oficial"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    // Avaliação visual feita pelo Claude Code local: cena e nota de 1 a 10.
    cena: text("cena"),
    score: integer("score"),
    nota: text("nota"),
    usedCount: integer("used_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("partner_media_partner_source_unique").on(t.partnerId, t.source, t.sourceId)],
);

export type PartnerMedia = typeof partnerMediaTable.$inferSelect;
