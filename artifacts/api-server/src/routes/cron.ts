import { Router, type IRouter } from "express";
import { parseHTML } from "linkedom";
import { db, fontesTable, fontesProcessadasTable, postsTable } from "@workspace/db";
import { CONTENT_TAGS } from "@workspace/db/constants/tags";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  extractArticleContent,
  extractImagesFromSource,
  interleaveImages,
  generateFromText,
  verifyArticleAgainstSource,
  slugify,
} from "../lib/article-generation";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const AUTOMATION_INSTRUCTIONS =
  "Reescreva de forma 100% autoral, com ângulo de turismo regional para quem visita a Rota da Ferradura. " +
  "Nunca copie frases literais da fonte. Quando fizer sentido, cite o nome do negócio/estabelecimento mencionado na fonte.";

// Enquanto o modo automático estiver em validação, todo post entra como
// rascunho — trocar para "published" depois de 1-2 semanas conferindo a
// qualidade das reescritas.
const AUTO_PUBLISH_STATUS: "draft" | "published" = "draft";

async function findLinksOnPage(pageUrl: string): Promise<string[]> {
  try {
    const response = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RefugioFerraduraBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    const html = await response.text();
    const { document } = parseHTML(html);
    const pageOrigin = new URL(pageUrl).origin;

    const links = (Array.from(document.querySelectorAll("a")) as any[])
      .map((a) => a.getAttribute("href") || "")
      .filter(Boolean)
      .filter((href) => !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:"))
      .map((href) => {
        try {
          return new URL(href, pageUrl).toString();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .filter((href) => new URL(href).origin === pageOrigin)
      .filter((href) => href !== pageUrl);

    return [...new Set(links)];
  } catch (err) {
    logger.warn({ err, pageUrl }, "[cron] Failed to fetch links from source page");
    return [];
  }
}

function mapTags(article: { title?: string; content?: string; tags?: string[] }): string[] {
  const text = `${article.title ?? ""} ${article.content ?? ""}`.toLowerCase();
  const scored = CONTENT_TAGS.map((tag) => ({
    id: tag.id,
    score: tag.keywords.filter((kw) => text.includes(kw.toLowerCase())).length,
  })).filter((t) => t.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const mapped = scored.slice(0, 4).map((t) => t.id);

  if (mapped.length > 0) return mapped;

  // fallback: usa as tags que a própria IA sugeriu, filtradas contra a taxonomia
  const validIds = new Set(CONTENT_TAGS.map((t) => t.id));
  const suggested = (article.tags ?? []).map((t) => t.toLowerCase()).filter((t) => validIds.has(t));
  return suggested.length > 0 ? suggested : ["turismo"];
}

// Vercel Cron Jobs invocam essa rota com GET.
router.get("/publish-pipeline", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [alreadyPublishedToday] = await db
    .select()
    .from(fontesProcessadasTable)
    .where(
      and(
        eq(fontesProcessadasTable.status, "sucesso"),
        gte(fontesProcessadasTable.criadoEm, startOfToday),
      ),
    )
    .limit(1);

  if (alreadyPublishedToday) {
    res.json({ status: "ok", message: "Já foi publicado um post automático hoje." });
    return;
  }

  const fontesAtivas = await db.select().from(fontesTable).where(eq(fontesTable.ativo, true));

  for (const fonte of fontesAtivas) {
    await db
      .update(fontesTable)
      .set({ ultimaVerificacao: new Date() })
      .where(eq(fontesTable.id, fonte.id));

    const candidateLinks = await findLinksOnPage(fonte.url);

    for (const link of candidateLinks) {
      const [existing] = await db
        .select()
        .from(fontesProcessadasTable)
        .where(eq(fontesProcessadasTable.url, link))
        .limit(1);

      if (existing) continue;

      // Novo link encontrado — processa e encerra o job (1 post por execução).
      try {
        const extraction = await extractArticleContent(link);
        if (extraction.isImage || extraction.text.length < 50) {
          await db.insert(fontesProcessadasTable).values({
            fonteId: fonte.id,
            url: link,
            status: "falhou",
            detalhe: extraction.blocked ? "Conteúdo bloqueado/inacessível" : "Conteúdo insuficiente",
          });
          continue;
        }

        const article = await generateFromText(extraction.text, AUTOMATION_INSTRUCTIONS);

        if (article.error || !article.title || !article.content) {
          await db.insert(fontesProcessadasTable).values({
            fonteId: fonte.id,
            url: link,
            status: "falhou",
            detalhe: article.message || "Fora de escopo",
          });
          continue;
        }

        const verification = await verifyArticleAgainstSource(extraction.text, article);
        const images = await extractImagesFromSource(link);
        const finalContent = interleaveImages(article.content, images, link, fonte.nome);
        const tags = mapTags(article);
        const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;

        const status = !verification.ok ? "draft" : AUTO_PUBLISH_STATUS;

        const [post] = await db
          .insert(postsTable)
          .values({
            title: article.title,
            subtitle: article.subtitle ?? null,
            slug,
            excerpt: article.excerpt ?? null,
            content: finalContent,
            coverImage: images[0] ?? null,
            tags: JSON.stringify(tags),
            status,
            metaDescription: article.metaDescription ?? null,
          })
          .returning();

        await db.insert(fontesProcessadasTable).values({
          fonteId: fonte.id,
          url: link,
          postId: post.id,
          status: "sucesso",
          alertaRevisao: verification.ok ? null : verification.problemas.join("; "),
        });

        logger.info({ postId: post.id, slug, fonte: fonte.nome, verificado: verification.ok }, "[cron] Post automático criado");

        res.json({
          status: "ok",
          post: { id: post.id, slug: post.slug, status: post.status },
          verificacao: verification,
        });
        return;
      } catch (err: any) {
        logger.error({ err, link }, "[cron] Falha ao processar link");
        await db.insert(fontesProcessadasTable).values({
          fonteId: fonte.id,
          url: link,
          status: "falhou",
          detalhe: String(err?.message ?? err),
        });
      }
    }
  }

  res.json({ status: "ok", message: "Nenhum conteúdo novo encontrado nas fontes ativas." });
});

export default router;
