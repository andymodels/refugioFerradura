import { Router, type IRouter } from "express";
import { db, postsTable, empreendimentosFilaTable } from "@workspace/db";
import { eq, ilike, or, and, sql, desc } from "drizzle-orm";
import {
  ListPostsQueryParams,
  ListPostsResponse,
  ListPostsAdminResponse,
  GetPostParams,
  GetPostResponse,
  GetPostAdminParams,
  GetPostAdminResponse,
  UpdatePostParams,
  UpdatePostBody,
  UpdatePostResponse,
  DeletePostParams,
  CreatePostBody,
  PublishPostInstagramParams,
  PublishPostInstagramResponse,
} from "@workspace/api-zod";
import { publishPostToInstagram } from "../lib/instagram";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/posts", async (req, res): Promise<void> => {
  const query = ListPostsQueryParams.safeParse(req.query);
  const search = query.success ? query.data.search : undefined;
  const tag = query.success ? (query.data as any).tag : undefined;
  const limit = query.success ? query.data.limit : undefined;

  const conditions: any[] = [eq(postsTable.status, "published")];

  if (search) {
    conditions.push(
      or(
        ilike(postsTable.title, `%${search}%`),
        ilike(postsTable.content, `%${search}%`)
      )!
    );
  }

  if (tag) {
    conditions.push(
      sql`${postsTable.tags}::text ILIKE ${"%" + tag + "%"}`
    );
  }

  let q = db
    .select()
    .from(postsTable)
    .where(and(...conditions))
    .orderBy(desc(postsTable.createdAt));

  const posts = limit ? await (q as any).limit(limit) : await q;

  res.json(ListPostsResponse.parse({ posts, total: posts.length }));
});

router.get("/posts/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const posts = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  res.json(ListPostsAdminResponse.parse({ posts, total: posts.length }));
});

router.post("/posts/admin/create", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CreatePostBody.safeParse({ ...req.body, content: (req.body.content || "").trim() === "<p></p>" ? "" : req.body.content });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db.insert(postsTable).values(parsed.data).returning();
  res.status(201).json(GetPostResponse.parse(post));
});

router.get("/posts/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = GetPostAdminParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!post) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }

  res.json(GetPostAdminResponse.parse(post));
});

router.patch("/posts/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = UpdatePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .update(postsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(postsTable.id, params.data.id))
    .returning();

  if (!post) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }

  res.json(UpdatePostResponse.parse(post));
});

router.delete("/posts/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Um post publicado pelo pipeline de empreendimentos fica referenciado por
  // empreendimentos_fila.post_id. Sem soltar esse vínculo antes, o delete
  // falha com violação de chave estrangeira (e o admin só vê "Erro ao
  // excluir", sem explicação). Deletar um post significa que o empreendimento
  // não deve mais ser tratado como publicado — solta a referência.
  await db
    .update(empreendimentosFilaTable)
    .set({ postId: null })
    .where(eq(empreendimentosFilaTable.postId, params.data.id));
  await db.delete(postsTable).where(eq(postsTable.id, params.data.id));
  res.sendStatus(204);
});

// Publica um post no feed do Instagram oficial. Ação sempre disparada
// manualmente pelo admin no painel — não existe cron/agendamento chamando
// esta rota.
router.post("/posts/admin/:id/publish-instagram", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = PublishPostInstagramParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.id));
  if (!post) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }

  if (post.status !== "published") {
    res.status(400).json({ error: "Só é possível publicar no Instagram um post que já esteja publicado no blog." });
    return;
  }
  if (post.instagramPostedAt) {
    res.status(400).json({ error: "Este post já foi publicado no Instagram." });
    return;
  }
  if (!post.coverImage) {
    res.status(400).json({ error: "Este post não tem imagem de capa." });
    return;
  }

  try {
    const result = await publishPostToInstagram(post);
    const [updated] = await db
      .update(postsTable)
      .set({ instagramPostedAt: new Date(), instagramMediaId: result.mediaId })
      .where(eq(postsTable.id, post.id))
      .returning();

    res.json(PublishPostInstagramResponse.parse(updated));
  } catch (err) {
    logger.error({ postId: post.id, error: String((err as any)?.message ?? err) }, "Falha ao publicar post no Instagram");
    res.status(400).json({ error: (err as any)?.message ?? "Falha ao publicar no Instagram." });
  }
});

router.get("/posts/:slug", async (req, res): Promise<void> => {
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db
    .select()
    .from(postsTable)
    .where(and(eq(postsTable.slug, params.data.slug), eq(postsTable.status, "published")));

  if (!post) {
    res.status(404).json({ error: "Post não encontrado" });
    return;
  }

  res.json(GetPostResponse.parse(post));
});

export default router;
