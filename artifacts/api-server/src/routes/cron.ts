import { Router, type IRouter } from "express";
import { parseHTML } from "linkedom";
import { db, fontesTable, fontesProcessadasTable, postsTable, empreendimentosFilaTable } from "@workspace/db";
import { CONTENT_TAGS } from "@workspace/db/constants/tags";
import { eq, and, gte, asc, desc, sql } from "drizzle-orm";
import {
  extractArticleContent,
  extractImagesFromSource,
  isImageUrlValid,
  interleaveImages,
  generateFromText,
  verifyArticleAgainstSource,
  generateEmpreendimentoArticle,
  searchAndGenerateRegionalArticle,
  slugify,
  type InterleaveImage,
  type RegionalSearchImage,
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
        const finalContent = interleaveImages(
          article.content,
          images.map((url) => ({ url, creditLabel: fonte.nome, creditHref: link })),
        );
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

async function isLinkReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RefugioFerraduraBot/1.0)" },
    });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

// Publica 1 item da fila de empreendimentos (catálogo do PDF do diagnóstico
// oficial). Chamado 3x/dia via GitHub Actions (Vercel Free só permite cron
// 1x/dia). Encerra sozinho quando a fila acabar.
router.get("/publish-next-empreendimento", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const [item] = await db
    .select()
    .from(empreendimentosFilaTable)
    .where(eq(empreendimentosFilaTable.status, "pendente"))
    .orderBy(asc(empreendimentosFilaTable.ordem))
    .limit(1);

  if (!item) {
    res.json({ status: "ok", message: "Fila de empreendimentos vazia — nada a publicar." });
    return;
  }

  try {
    // Confere se os links ainda funcionam antes de incluir no post.
    const [instagramOk, siteOk] = await Promise.all([
      item.instagram ? isLinkReachable(`https://instagram.com/${item.instagram.replace(/^@/, "")}`) : Promise.resolve(false),
      item.site && item.site.startsWith("http") ? isLinkReachable(item.site) : Promise.resolve(false),
    ]);

    const caracteristicas: string[] = item.caracteristicas ? JSON.parse(item.caracteristicas) : [];
    const fotos: string[] = item.fotos ? JSON.parse(item.fotos) : [];

    const article = await generateEmpreendimentoArticle({
      nome: item.nome,
      regiao: item.regiao,
      proprietario: item.proprietario,
      telefone: item.telefone,
      email: item.email,
      endereco: item.endereco,
      plusCode: item.plusCode,
      instagram: instagramOk ? item.instagram : null,
      site: siteOk ? item.site : null,
      caracteristicas,
    });

    if (!article.title || !article.content) {
      await db
        .update(empreendimentosFilaTable)
        .set({ status: "falhou" })
        .where(eq(empreendimentosFilaTable.id, item.id));
      res.status(500).json({ error: "Falha ao gerar o artigo do empreendimento." });
      return;
    }

    const finalContent = interleaveImages(article.content, fotos.map((url) => ({ url })));
    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: fotos[0] ?? null,
        tags: JSON.stringify(["empreendimentos"]),
        status: "published",
        metaDescription: article.metaDescription ?? null,
      })
      .returning();

    await db
      .update(empreendimentosFilaTable)
      .set({ status: "publicado", postId: post.id, publicadoEm: new Date() })
      .where(eq(empreendimentosFilaTable.id, item.id));

    logger.info({ postId: post.id, slug, empreendimento: item.nome }, "[cron] Post de empreendimento publicado");

    res.json({ status: "ok", post: { id: post.id, slug: post.slug, status: post.status } });
  } catch (err: any) {
    logger.error({ err, item: item.nome }, "[cron] Falha ao publicar empreendimento");
    await db
      .update(empreendimentosFilaTable)
      .set({ status: "falhou" })
      .where(eq(empreendimentosFilaTable.id, item.id));
    res.status(500).json({ error: "Erro ao publicar empreendimento: " + err.message });
  }
});

const BUSCA_REGIONAL_FONTE_NOME = "Busca regional automática (web)";

async function getOrCreateBuscaRegionalFonte() {
  const [existing] = await db
    .select()
    .from(fontesTable)
    .where(eq(fontesTable.nome, BUSCA_REGIONAL_FONTE_NOME))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(fontesTable)
    .values({
      nome: BUSCA_REGIONAL_FONTE_NOME,
      url: "busca-web://rota-da-ferradura",
      tipo: "busca_web",
      ativo: true,
    })
    .returning();
  return created;
}

// 1x/dia, chamado via GitHub Actions em horário de maior engajamento (19h BRT).
// Pesquisa a web (em vez de vigiar um site fixo) por conteúdo atual sobre a
// região — lugares, curiosidades, restaurantes, pousadas e, com prioridade,
// eventos atualizados.
router.get("/publish-regional-search", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const fonte = await getOrCreateBuscaRegionalFonte();

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [alreadyPublishedToday] = await db
    .select()
    .from(fontesProcessadasTable)
    .where(
      and(
        eq(fontesProcessadasTable.fonteId, fonte.id),
        eq(fontesProcessadasTable.status, "sucesso"),
        gte(fontesProcessadasTable.criadoEm, startOfToday),
      ),
    )
    .limit(1);

  if (alreadyPublishedToday) {
    res.json({ status: "ok", message: "Já foi publicado um post de busca regional hoje." });
    return;
  }

  const previouslyUsed = await db
    .select({ url: fontesProcessadasTable.url })
    .from(fontesProcessadasTable)
    .where(eq(fontesProcessadasTable.fonteId, fonte.id));
  const excludeUrls = previouslyUsed.map((r) => r.url);

  const recentPosts = await db
    .select({ title: postsTable.title, tags: postsTable.tags })
    .from(fontesProcessadasTable)
    .innerJoin(postsTable, eq(fontesProcessadasTable.postId, postsTable.id))
    .where(eq(fontesProcessadasTable.fonteId, fonte.id))
    .orderBy(desc(fontesProcessadasTable.criadoEm))
    .limit(5);
  const recentTopics = recentPosts.map((p) => p.title);

  try {
    const article = await searchAndGenerateRegionalArticle(excludeUrls, recentTopics);

    if (article.error || !article.title || !article.content || !article.sourceUrl) {
      res.json({ status: "ok", message: "Nada novo e relevante encontrado na busca hoje." });
      return;
    }

    // Evita duplicar caso a IA repita uma fonte mesmo com a lista de exclusão.
    const [existingUrl] = await db
      .select()
      .from(fontesProcessadasTable)
      .where(eq(fontesProcessadasTable.url, article.sourceUrl))
      .limit(1);
    if (existingUrl) {
      res.json({ status: "ok", message: "Fonte encontrada já havia sido usada antes." });
      return;
    }

    // Fotos que a própria IA encontrou durante a busca (redes sociais, sites
    // de notícia etc.) — valida que a URL realmente aponta pra uma imagem de
    // verdade antes de usar, pra não arriscar link inventado/quebrado.
    const foundImages = article.images ?? [];
    const validatedImages = (
      await Promise.all(
        foundImages.map(async (img) => {
          const ok = await isImageUrlValid(img.url);
          return ok ? img : null;
        }),
      )
    ).filter((img): img is RegionalSearchImage => img !== null);

    // Complementa com fotos raspadas da própria página-fonte, se sobrar espaço.
    const sourceImages = await extractImagesFromSource(article.sourceUrl);
    const sourceName = new URL(article.sourceUrl).hostname.replace(/^www\./, "");

    const allImages: InterleaveImage[] = [
      ...validatedImages.map((img) => ({ url: img.url, creditLabel: img.creditLabel, creditHref: img.pageUrl })),
      ...sourceImages.map((url) => ({ url, creditLabel: sourceName, creditHref: article.sourceUrl! })),
    ];

    const finalContent = interleaveImages(article.content, allImages);
    const tags = mapTags(article);
    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: allImages[0]?.url ?? null,
        tags: JSON.stringify(tags),
        // Fase de validação: sempre rascunho, igual ao pipeline de fontes —
        // troca pra "published" depois de confirmar a qualidade por 1-2 semanas.
        status: "draft",
        metaDescription: article.metaDescription ?? null,
      })
      .returning();

    await db.insert(fontesProcessadasTable).values({
      fonteId: fonte.id,
      url: article.sourceUrl,
      postId: post.id,
      status: "sucesso",
    });

    logger.info({ postId: post.id, slug, sourceUrl: article.sourceUrl }, "[cron] Post de busca regional criado");

    res.json({ status: "ok", post: { id: post.id, slug: post.slug, status: post.status } });
  } catch (err: any) {
    logger.error({ err }, "[cron] Falha na busca regional");
    res.status(500).json({ error: "Erro na busca regional: " + err.message });
  }
});

export default router;
