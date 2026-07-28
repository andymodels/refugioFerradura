import { Router, type IRouter } from "express";
import { parseHTML } from "linkedom";
import { db, fontesTable, fontesProcessadasTable, postsTable, empreendimentosFilaTable } from "@workspace/db";
import { CONTENT_TAGS } from "@workspace/db/constants/tags";
import { eq, and, gte, asc, desc, sql } from "drizzle-orm";
import {
  extractArticleContent,
  extractImagesFromSource,
  extractFeaturedMedia,
  isImageUrlValid,
  interleaveImages,
  stripExistingMedia,
  generateFromText,
  verifyArticleAgainstSource,
  generateEmpreendimentoArticle,
  generateChannelUpdateArticle,
  searchAndGenerateRegionalArticle,
  searchIllustrativePhotos,
  slugify,
  type RegionalSearchImage,
} from "../lib/article-generation";
import { resolveEmpreendimentoImage } from "../lib/empreendimento-image";
import {
  vetAndArchiveFoundImages,
  getInstitutionalFallback,
  searchInstagramPermalinks,
  buildCandidatesFromPermalinks,
  vetCandidates,
  archiveMediaItems,
} from "../lib/media-pipeline";
import { ensureMailtoLink, ensureMapsLink, fixSplitInstagramLink, renderServicoBlock } from "../lib/contact-links";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Nenhuma mídia (institucional ou não) deve virar capa de mais de um post —
// evita o cenário de várias matérias diferentes recebendo a mesma foto.
async function isCoverAlreadyUsed(coverUrl: string, excludePostId?: number): Promise<boolean> {
  const conditions = excludePostId
    ? and(eq(postsTable.coverImage, coverUrl), sql`${postsTable.id} != ${excludePostId}`)
    : eq(postsTable.coverImage, coverUrl);
  const rows = await db.select({ id: postsTable.id }).from(postsTable).where(conditions).limit(1);
  return rows.length > 0;
}

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

// Todo post do site é, por definição, sobre um lugar e uma experiência da
// Rota da Ferradura — por isso essas duas tags são obrigatórias em toda
// publicação, senão as páginas /lugares e /experiencias ficam vazias.
const ALWAYS_TAGS = ["lugares", "experiencias"];
// Categorias com regra explícita de conteúdo (garantidas quando a palavra-chave
// aparece, independente de ranking — não é só "nuance" como as demais tags).
const CONDITIONAL_TAGS = ["gastronomia", "hospedagem"];

const TAG_KEYWORDS = new Map(CONTENT_TAGS.map((t) => [t.id, t.keywords]));
const VALID_TAG_IDS = new Set(CONTENT_TAGS.map((t) => t.id));

function mapTags(article: { title?: string; content?: string; tags?: string[] }, forceTags: string[] = []): string[] {
  const text = `${article.title ?? ""} ${article.content ?? ""}`.toLowerCase();
  const matchesKeywords = (id: string) => (TAG_KEYWORDS.get(id) ?? []).some((kw) => text.includes(kw.toLowerCase()));

  const conditional = CONDITIONAL_TAGS.filter(matchesKeywords);
  const guaranteed = new Set([...ALWAYS_TAGS, ...forceTags, ...conditional]);

  // Tags extras de nuance (natureza, eventos, cultura, aventura, turismo...),
  // por pontuação de palavra-chave — não são obrigatórias, só enriquecem.
  const scored = CONTENT_TAGS
    .filter((tag) => !guaranteed.has(tag.id))
    .map((tag) => ({ id: tag.id, score: tag.keywords.filter((kw) => text.includes(kw.toLowerCase())).length }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((t) => t.id);

  const suggested = (article.tags ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => VALID_TAG_IDS.has(t) && !guaranteed.has(t));

  const extra = [...new Set([...scored, ...suggested])].slice(0, 2);

  return [...ALWAYS_TAGS, ...forceTags, ...conditional, ...extra];
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

        const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;
        let images = await extractImagesFromSource(link);

        // A região tem fotos de sobra na internet — se a fonte não tinha
        // nenhuma foto própria, busca fotos ilustrativas da região antes de
        // desistir dessa publicação.
        if (images.length === 0) {
          const fallbackImages = await searchIllustrativePhotos(article.title || fonte.nome);
          const validatedFallback = (
            await Promise.all(
              fallbackImages.map(async (img) => ((await isImageUrlValid(img.url)) ? img : null)),
            )
          ).filter((img): img is NonNullable<typeof img> => img !== null);
          images = validatedFallback.map((img) => img.url);
        }

        // Pipeline único: vetting visual + arquivamento no Cloudinary do site.
        // Sem estabelecimento específico aqui, então cai direto pro fallback
        // institucional se nada passar na vetting — nunca publica sem mídia.
        let mediaItems = await vetAndArchiveFoundImages(article.title || fonte.nome, images, slug);
        if (mediaItems.length === 0) mediaItems = getInstitutionalFallback(3);

        if (mediaItems.length === 0) {
          await db.insert(fontesProcessadasTable).values({
            fonteId: fonte.id,
            url: link,
            status: "falhou",
            detalhe: "Nenhuma mídia aprovada, nem institucional — post não vale sem mídia.",
          });
          continue;
        }

        const cover = mediaItems.find((m) => m.kind === "foto") ?? mediaItems[0];
        if (cover && (await isCoverAlreadyUsed(cover.urlArquivo))) {
          await db.insert(fontesProcessadasTable).values({
            fonteId: fonte.id,
            url: link,
            status: "falhou",
            detalhe: `Mídia já usada como capa em outro post — bloqueado por unicidade (${cover.urlArquivo})`,
          });
          continue;
        }

        const verification = await verifyArticleAgainstSource(extraction.text, article);
        const finalContent = interleaveImages(article.content, mediaItems);
        const tags = mapTags(article);

        const status = !verification.ok ? "draft" : AUTO_PUBLISH_STATUS;

        const [post] = await db
          .insert(postsTable)
          .values({
            title: article.title,
            subtitle: article.subtitle ?? null,
            slug,
            excerpt: article.excerpt ?? null,
            content: finalContent,
            coverImage: cover?.urlArquivo ?? null,
            coverImageDisplayMode: "natural",
            coverImageMeta: cover ? JSON.stringify(cover) : null,
            mediaItems: JSON.stringify(mediaItems),
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

// Publica exatamente 1 item da fila de empreendimentos por execução.
// O GitHub Actions chama esta rota a cada hora, das 7h às 19h (BRT).
// Encerra sozinho quando a fila acabar.
// Erros de API (limite de uso, sobrecarga, timeout, rede) nunca devem
// descartar um empreendimento da fila — o item volta pra "pendente" e o
// motivo fica registrado em `ultimoErro`. Só um erro de CONTEÚDO (a IA
// respondeu mas o resultado não presta) é tratado como "falhou" de fato,
// e isso já acontece inline, fora daqui, antes de qualquer exceção.
function classifyTransientError(err: any): { message: string; pausadoAte: Date | null } {
  const message = String(err?.message ?? err ?? "Erro desconhecido").slice(0, 500);

  // A Anthropic retorna essa frase exata quando um limite de gasto/uso
  // mensal é atingido, com a data/hora UTC em que volta a funcionar —
  // aproveita isso pra não tentar de novo (e gastar mais um request) até lá.
  const match = message.match(/(\d{4}-\d{2}-\d{2})\s+at\s+(\d{2}:\d{2})\s*UTC/i);
  let pausadoAte: Date | null = null;
  if (match) {
    const parsed = new Date(`${match[1]}T${match[2]}:00Z`);
    if (!isNaN(parsed.getTime())) pausadoAte = parsed;
  }

  return { message, pausadoAte };
}

router.get("/publish-next-empreendimento", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  // Serializa a escolha e marca o item antes das chamadas externas. Duas
  // execuções nunca conseguem reivindicar o mesmo empreendimento.
  const item = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('refugio_ferradura'), hashtext('publish_next_empreendimento'))`,
    );

    // Pula itens pausados por um erro transitório com data de retorno
    // conhecida (ex: limite de uso da IA) — evita gastar outro request à toa.
    const [nextItem] = await tx
      .select()
      .from(empreendimentosFilaTable)
      .where(
        and(
          eq(empreendimentosFilaTable.status, "pendente"),
          sql`(${empreendimentosFilaTable.pausadoAte} IS NULL OR ${empreendimentosFilaTable.pausadoAte} < now())`,
        ),
      )
      .orderBy(asc(empreendimentosFilaTable.ordem))
      .limit(1);

    if (!nextItem) return undefined;

    const [claimedItem] = await tx
      .update(empreendimentosFilaTable)
      .set({ status: "processando" })
      .where(
        and(
          eq(empreendimentosFilaTable.id, nextItem.id),
          eq(empreendimentosFilaTable.status, "pendente"),
        ),
      )
      .returning();

    return claimedItem;
  });

  if (!item) {
    res.json({ status: "ok", message: "Fila de empreendimentos vazia — nada a publicar." });
    return;
  }

  try {
    // O Instagram pode bloquear verificações anônimas mesmo quando o perfil é
    // público. O resolvedor especializado deve tentar o canal cadastrado.
    const siteOk =
      item.site && item.site.startsWith("http")
        ? await isLinkReachable(item.site)
        : false;

    const caracteristicas: string[] = item.caracteristicas ? JSON.parse(item.caracteristicas) : [];

    const article = await generateEmpreendimentoArticle({
      nome: item.nome,
      regiao: item.regiao,
      proprietario: item.proprietario,
      telefone: item.telefone,
      email: item.email,
      endereco: item.endereco,
      plusCode: item.plusCode,
      instagram: item.instagram,
      site: siteOk ? item.site : null,
      caracteristicas,
    });

    if (!article.title || !article.content) {
      await db
        .update(empreendimentosFilaTable)
        .set({ status: "falhou" })
        .where(
          and(
            eq(empreendimentosFilaTable.id, item.id),
            eq(empreendimentosFilaTable.status, "processando"),
          ),
        );
      res.status(500).json({ error: "Falha ao gerar o artigo do empreendimento." });
      return;
    }

    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;

    // Pipeline único de mídia: Instagram oficial > site oficial > pesquisa
    // apenas para localizar outro canal oficial. PDF e paisagem institucional
    // genérica nunca entram em post de empreendimento.
    const mediaItems = await resolveEmpreendimentoImage({
      nome: item.nome,
      regiao: item.regiao,
      endereco: item.endereco,
      plusCode: item.plusCode,
      instagram: item.instagram,
      site: siteOk ? item.site : null,
      slug,
    });

    const finalContent = mediaItems.length > 0 ? interleaveImages(article.content, mediaItems) : article.content;
    const tags = mapTags(
      { title: item.nome, content: `${caracteristicas.join(" ")} ${article.content}` },
      ["empreendimentos"],
    );

    // Sem mídia oficial aprovada, preserva o texto como rascunho e libera a
    // fila para continuar no próximo horário.
    const cover = mediaItems.find((m) => m.kind === "foto") ?? mediaItems[0];
    const postStatus = mediaItems.length > 0 ? "published" : "draft";
    const queueStatus = mediaItems.length > 0 ? "publicado" : "rascunho";

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: cover?.urlArquivo ?? null,
        coverImageDisplayMode: "natural",
        coverImageMeta: cover ? JSON.stringify(cover) : null,
        mediaItems: mediaItems.length > 0 ? JSON.stringify(mediaItems) : null,
        tags: JSON.stringify(tags),
        status: postStatus,
        metaDescription: article.metaDescription ?? null,
      })
      .returning();

    await db
      .update(empreendimentosFilaTable)
      .set({ status: queueStatus, postId: post.id, publicadoEm: new Date() })
      .where(
        and(
          eq(empreendimentosFilaTable.id, item.id),
          eq(empreendimentosFilaTable.status, "processando"),
        ),
      );

    logger.info(
      {
        postId: post.id,
        slug,
        empreendimento: item.nome,
        postStatus,
        queueStatus,
        totalMidia: mediaItems.length,
        tipos: mediaItems.map((m) => m.tipo),
      },
      "[cron] Post de empreendimento processado",
    );

    res.json({
      status: "ok",
      post: { id: post.id, slug: post.slug, status: post.status },
      queueStatus,
    });
  } catch (err: any) {
    const { message, pausadoAte } = classifyTransientError(err);
    logger.error(
      { err, item: item.nome, pausadoAte },
      "[cron] Erro transitório ao publicar empreendimento — item volta pra pendente, fila não avança",
    );
    // Nunca descarta o empreendimento por um erro de API/rede/limite — só
    // registra o motivo e devolve pra fila, pro próprio ordem ser retomado
    // na próxima execução (nenhum outro item avança na frente dele).
    await db
      .update(empreendimentosFilaTable)
      .set({ status: "pendente", ultimoErro: message, pausadoAte })
      .where(
        and(
          eq(empreendimentosFilaTable.id, item.id),
          eq(empreendimentosFilaTable.status, "processando"),
        ),
      );
    res.status(500).json({ error: "Erro transitório ao publicar empreendimento (item devolvido pra fila): " + message, pausadoAte });
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
    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;

    const candidateUrls = [...validatedImages.map((img) => img.url), ...sourceImages];

    // Pipeline único: vetting visual + arquivamento no Cloudinary do site
    // (nunca hotlink pro site/rede social de origem).
    let mediaItems = await vetAndArchiveFoundImages(article.title, candidateUrls, slug);

    // A região tem fotos de sobra na internet — se nada passou na vetting,
    // faz uma busca de reforço só por fotos ilustrativas antes de cair no
    // fallback institucional.
    if (mediaItems.length === 0) {
      const fallbackImages = await searchIllustrativePhotos(article.title);
      const validatedFallback = (
        await Promise.all(
          fallbackImages.map(async (img) => ((await isImageUrlValid(img.url)) ? img : null)),
        )
      ).filter((img): img is RegionalSearchImage => img !== null);
      mediaItems = await vetAndArchiveFoundImages(article.title, validatedFallback.map((img) => img.url), slug);
    }

    // Nunca publica sem mídia — último recurso é a paisagem institucional.
    if (mediaItems.length === 0) mediaItems = getInstitutionalFallback(3);

    if (mediaItems.length === 0) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: article.sourceUrl,
        status: "falhou",
        detalhe: "Nenhuma mídia aprovada, nem institucional — post não vale sem mídia.",
      });
      res.json({ status: "ok", message: "Conteúdo encontrado, mas sem mídia válida — pulado." });
      return;
    }

    const cover = mediaItems.find((m) => m.kind === "foto") ?? mediaItems[0];
    if (cover && (await isCoverAlreadyUsed(cover.urlArquivo))) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: article.sourceUrl,
        status: "falhou",
        detalhe: `Mídia já usada como capa em outro post — bloqueado por unicidade (${cover.urlArquivo})`,
      });
      res.json({ status: "ok", message: "Mídia já usada em outro post — bloqueado por unicidade." });
      return;
    }

    const finalContent = interleaveImages(article.content, mediaItems);
    const tags = mapTags(article);

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: cover?.urlArquivo ?? null,
        coverImageDisplayMode: "natural",
        coverImageMeta: cover ? JSON.stringify(cover) : null,
        mediaItems: JSON.stringify(mediaItems),
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

// Rotina de correção — aplica a regra de tags obrigatórias/condicionais aos
// posts publicados antes dessa regra existir. Idempotente: só acrescenta
// tags que faltam (lugares, experiencias, gastronomia/hospedagem quando o
// conteúdo bate com a palavra-chave), nunca remove tags já existentes.
router.get("/backfill-tags", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const posts = await db
    .select({ id: postsTable.id, title: postsTable.title, content: postsTable.content, tags: postsTable.tags })
    .from(postsTable);

  let updated = 0;
  for (const post of posts) {
    const existingTags: string[] = post.tags ? JSON.parse(post.tags) : [];
    const forceTags = existingTags.includes("empreendimentos") ? ["empreendimentos"] : [];
    const computed = mapTags({ title: post.title ?? undefined, content: post.content ?? undefined }, forceTags);
    const merged = [...new Set([...existingTags, ...computed])];

    if (merged.length > existingTags.length) {
      await db.update(postsTable).set({ tags: JSON.stringify(merged) }).where(eq(postsTable.id, post.id));
      updated++;
    }
  }

  res.json({ status: "ok", totalPosts: posts.length, updated });
});

// Monitora 1 canal oficial por chamada (mesmo padrão de "1 item por
// invocação" das demais rotas), sempre o menos verificado recentemente.
// Nunca reaproveita uma publicação já processada (dedup via
// fontes_processadas.url, que tem UNIQUE constraint), nunca publica sem
// mídia aprovada, e nunca inventa dado de contato — o bloco "Serviço" é
// montado deterministicamente a partir do cadastro do canal, sem passar
// pela IA.
router.get("/monitor-canais-oficiais", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const expectedMigration = process.env.MIGRATION_SECRET;
  const authHeader = req.headers.authorization;
  const authorized =
    (!!expected && authHeader === `Bearer ${expected}`) ||
    (!!expectedMigration && authHeader === `Bearer ${expectedMigration}`);
  if (!authorized) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const [fonte] = await db
    .select()
    .from(fontesTable)
    .where(and(eq(fontesTable.tipo, "instagram_oficial"), eq(fontesTable.ativo, true)))
    .orderBy(sql`${fontesTable.ultimaVerificacao} asc nulls first`)
    .limit(1);

  if (!fonte || !fonte.instagram) {
    res.json({ status: "ok", message: "Nenhum canal oficial ativo cadastrado." });
    return;
  }

  await db.update(fontesTable).set({ ultimaVerificacao: new Date() }).where(eq(fontesTable.id, fonte.id));

  const log: Record<string, unknown> = { fonteId: fonte.id, nome: fonte.nome, instagram: fonte.instagram };

  try {
    const handle = fonte.instagram.replace(/^@/, "");
    const permalinks = await searchInstagramPermalinks(handle, fonte.nome);
    log.permalinksEncontrados = permalinks.length;

    if (permalinks.length === 0) {
      res.json({ status: "ok", log, message: "Nenhuma publicação encontrada." });
      return;
    }

    // Dedup: nunca reprocessa um permalink já registrado pra essa fonte.
    const already = await db
      .select({ url: fontesProcessadasTable.url })
      .from(fontesProcessadasTable)
      .where(eq(fontesProcessadasTable.fonteId, fonte.id));
    const alreadySet = new Set(already.map((r) => r.url));
    const novos = permalinks.filter((p) => !alreadySet.has(p));

    if (novos.length === 0) {
      res.json({ status: "ok", log, message: "Nenhuma publicação nova (todas já processadas)." });
      return;
    }

    const trigger = novos[0];
    log.trigger = trigger;

    // Pool de candidatos pra vetting visual: todas as publicações recentes
    // encontradas (não só a nova), pra ter de onde tirar 3-5 mídias aprovadas.
    const candidates = await buildCandidatesFromPermalinks(permalinks);
    const { approved, rejected } = await vetCandidates(fonte.nome, candidates);
    log.midiaAprovada = approved.length;
    log.midiaRejeitada = rejected.map((r) => r.motivo);

    if (approved.length === 0) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: trigger,
        status: "falhou",
        detalhe: "Nenhuma mídia aprovada na vetting visual",
      });
      logger.info(log, "[cron] Canal oficial sem mídia aprovada — não publicado");
      res.json({ status: "ok", log, message: "Publicação encontrada, mas sem mídia aprovada — não publicado." });
      return;
    }

    const triggerMedia = await extractFeaturedMedia(trigger);
    if (!triggerMedia.caption) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: trigger,
        status: "falhou",
        detalhe: "Não foi possível ler a legenda da publicação",
      });
      res.json({ status: "ok", log, message: "Publicação sem legenda legível — não publicado." });
      return;
    }

    const tags: string[] = fonte.tags ? JSON.parse(fonte.tags) : [];
    const article = await generateChannelUpdateArticle({ nome: fonte.nome, caption: triggerMedia.caption, tags });

    if (article.insuficiente || !article.title || !article.content) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: trigger,
        status: "rascunho",
        detalhe: article.motivo || "Legenda insuficiente para gerar matéria factual",
      });
      logger.info({ ...log, motivo: article.motivo }, "[cron] Canal oficial com legenda insuficiente — não publicado");
      res.json({ status: "ok", log, message: "Legenda insuficiente para gerar matéria — não publicado." });
      return;
    }

    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;
    const mediaItems = await archiveMediaItems(candidates, approved, slug, "instagram_oficial");

    if (mediaItems.length === 0) {
      await db.insert(fontesProcessadasTable).values({
        fonteId: fonte.id,
        url: trigger,
        status: "falhou",
        detalhe: "Falha ao arquivar a mídia aprovada",
      });
      res.json({ status: "ok", log, message: "Falha ao arquivar mídia aprovada — não publicado." });
      return;
    }

    const servicoBlock = renderServicoBlock({
      instagram: fonte.instagram,
      site: fonte.site,
      telefone: fonte.telefone,
      email: fonte.email,
      endereco: fonte.endereco,
    });
    const finalContent = interleaveImages(article.content, mediaItems) + servicoBlock;
    const computedTags = mapTags({ title: fonte.nome, content: `${tags.join(" ")} ${article.content}` }, ["empreendimentos", ...tags]);
    const cover = mediaItems.find((m) => m.kind === "foto") ?? mediaItems[0];

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: cover.urlArquivo,
        coverImageDisplayMode: "natural",
        coverImageMeta: JSON.stringify(cover),
        mediaItems: JSON.stringify(mediaItems),
        tags: JSON.stringify(computedTags),
        status: "published",
        metaDescription: article.metaDescription ?? null,
      })
      .returning();

    await db.insert(fontesProcessadasTable).values({
      fonteId: fonte.id,
      url: trigger,
      postId: post.id,
      status: "sucesso",
    });

    logger.info({ ...log, postId: post.id, slug }, "[cron] Post de canal oficial publicado");
    res.json({ status: "ok", log, post: { id: post.id, slug: post.slug, status: post.status } });
  } catch (err: any) {
    logger.error({ ...log, err }, "[cron] Falha ao monitorar canal oficial");
    res.status(500).json({ error: "Erro ao monitorar canal oficial: " + err.message, log });
  }
});

function significantWords(html: string): Set<string> {
  const text = html.replace(/<[^>]+>/g, " ").toLowerCase();
  return new Set(text.match(/[a-zà-úçã-õ0-9]{4,}/g) || []);
}

// Garante que a reconciliação nunca trunca/reescreve o texto original: pelo
// menos 95% dos termos significativos do conteúdo anterior precisam
// continuar presentes no novo, e o resultado precisa manter pelo menos um
// <h2>. Não é uma comparação byte-a-byte pra tolerar o texto de um link ser
// re-envolvido em <a>, mas pega qualquer perda real de conteúdo.
function validateReconciledContent(oldHtml: string, newHtml: string): { ok: boolean; motivo: string | null } {
  const oldWords = significantWords(oldHtml);
  const newWords = significantWords(newHtml);
  const missing = [...oldWords].filter((w) => !newWords.has(w));
  const ratio = oldWords.size > 0 ? missing.length / oldWords.size : 0;
  if (ratio > 0.05) {
    return { ok: false, motivo: `Perdeu ${missing.length} termo(s) do texto original (${(ratio * 100).toFixed(1)}%)` };
  }
  if (!/<h2>/i.test(newHtml)) {
    return { ok: false, motivo: "Resultado sem nenhum <h2>" };
  }
  return { ok: true, motivo: null };
}

async function isVideoUrlValid(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1024" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok && response.status !== 206) return false;
    return (response.headers.get("content-type") || "").startsWith("video/");
  } catch {
    return false;
  }
}

// Reconcilia UM post por chamada (mesmo padrão de "1 item por invocação" das
// demais rotas de cron, dado o timeout padrão do Vercel) — nunca escreve
// nada se a validação falhar, e faz backup do conteúdo original na primeira
// vez que o post é tocado.
router.get("/reconcile-media", async (req, res): Promise<void> => {
  const expected = process.env.CRON_SECRET;
  const expectedMigration = process.env.MIGRATION_SECRET;
  const authHeader = req.headers.authorization;
  const authorized =
    (!!expected && authHeader === `Bearer ${expected}`) ||
    (!!expectedMigration && authHeader === `Bearer ${expectedMigration}`);
  if (!authorized) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const postId = Number(req.query.postId);
  const dryRun = req.query.dryRun === "1";
  if (!postId) {
    res.status(400).json({ error: "Informe ?postId=<id>" });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }

  const [fila] = await db
    .select()
    .from(empreendimentosFilaTable)
    .where(eq(empreendimentosFilaTable.postId, postId));

  const log: Record<string, unknown> = { postId, slug: post.slug, filaLinked: !!fila };

  let newContent = post.content;
  let newMediaItems: string | null = post.mediaItems;
  let newCoverImage = post.coverImage;
  let newCoverImageMeta = post.coverImageMeta;

  const currentMediaCount = (post.content.match(/<figure class="instagram-editorial-(photo|video)"/g) || []).length;
  const needsMedia = !post.coverImage || currentMediaCount < 3;
  log.mediaAtual = currentMediaCount;
  log.precisaMidia = needsMedia;

  if (fila && needsMedia) {
    const mediaItems = await resolveEmpreendimentoImage({
      nome: fila.nome,
      regiao: fila.regiao,
      endereco: fila.endereco,
      plusCode: fila.plusCode,
      instagram: fila.instagram,
      site: fila.site,
      slug: post.slug,
    });
    log.midiaAprovada = mediaItems.map((m) => ({ kind: m.kind, tipo: m.tipo, url: m.urlArquivo }));

    // Nunca usa paisagem institucional pra um empreendimento específico —
    // e, por segurança extra, bloqueia se alguma mídia escolhida já for a
    // capa de outro post (nenhuma mídia de empreendimento deveria repetir).
    const institucional = mediaItems.filter((m) => m.tipo === "institucional");
    if (institucional.length > 0) {
      res.status(422).json({
        status: "invalid",
        log: { ...log, motivo: "Pipeline retornou mídia institucional para um empreendimento específico — bloqueado" },
      });
      return;
    }
    if (mediaItems.length > 0) {
      const urls = mediaItems.map((m) => m.urlArquivo);
      const dupCheck = await db
        .select({ id: postsTable.id, coverImage: postsTable.coverImage })
        .from(postsTable)
        .where(and(sql`${postsTable.coverImage} = ANY(${urls})`, sql`${postsTable.id} != ${postId}`));
      if (dupCheck.length > 0) {
        res.status(422).json({
          status: "invalid",
          log: { ...log, motivo: `Mídia já usada como capa em outro post (id ${dupCheck[0].id}) — bloqueado por unicidade` },
        });
        return;
      }
    }

    if (mediaItems.length > 0) {
      const stripped = stripExistingMedia(post.content);
      newContent = interleaveImages(stripped, mediaItems);
      newMediaItems = JSON.stringify(mediaItems);
      const cover = mediaItems.find((m) => m.kind === "foto") ?? mediaItems[0];
      newCoverImage = cover.urlArquivo;
      newCoverImageMeta = JSON.stringify(cover);
    }
  }

  if (fila) {
    const before = newContent;
    newContent = ensureMailtoLink(newContent, fila.email);
    newContent = ensureMapsLink(newContent, fila.endereco, fila.plusCode);
    newContent = fixSplitInstagramLink(newContent, fila.instagram);
    log.linksAjustados = before !== newContent;
  }

  const validation = validateReconciledContent(post.content, newContent);
  log.validacao = validation;

  if (!validation.ok) {
    if (!dryRun) {
      await db.update(postsTable).set({ mediaMigrationFlag: validation.motivo }).where(eq(postsTable.id, postId));
    }
    logger.warn(log, "[cron] Reconciliação de mídia falhou na validação");
    res.status(422).json({ status: "invalid", log });
    return;
  }

  // Confere que toda mídia nova realmente resolve pra um arquivo de
  // imagem/vídeo de verdade antes de gravar.
  if (newMediaItems && newMediaItems !== post.mediaItems) {
    const items = JSON.parse(newMediaItems) as { kind: string; urlArquivo: string }[];
    for (const item of items) {
      const ok = item.kind === "video" ? await isVideoUrlValid(item.urlArquivo) : await isImageUrlValid(item.urlArquivo);
      if (!ok) {
        if (!dryRun) {
          await db.update(postsTable).set({ mediaMigrationFlag: `Mídia inválida: ${item.urlArquivo}` }).where(eq(postsTable.id, postId));
        }
        logger.warn({ ...log, item }, "[cron] Reconciliação de mídia falhou na checagem de URL");
        res.status(422).json({ status: "invalid", log: { ...log, item } });
        return;
      }
    }
  }

  if (dryRun) {
    res.json({ status: "preview", log, before: post.content, after: newContent });
    return;
  }

  const backup = post.mediaMigrationBackup
    ?? JSON.stringify({
      content: post.content,
      coverImage: post.coverImage,
      coverImageDisplayMode: post.coverImageDisplayMode,
      coverImageMeta: post.coverImageMeta,
    });

  await db
    .update(postsTable)
    .set({
      content: newContent,
      coverImage: newCoverImage,
      coverImageDisplayMode: "natural",
      coverImageMeta: newCoverImageMeta,
      mediaItems: newMediaItems,
      mediaMigrationBackup: backup,
      mediaMigrationFlag: null,
    })
    .where(eq(postsTable.id, postId));

  logger.info(log, "[cron] Post reconciliado com sucesso");
  res.json({ status: "ok", log });
});

export default router;
