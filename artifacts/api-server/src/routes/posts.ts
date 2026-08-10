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
  ReorderPostsBody,
  PublishPostInstagramParams,
  PublishPostInstagramResponse,
} from "@workspace/api-zod";
import { publishPostToInstagram } from "../lib/instagram";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Posts com pinnedUntil no futuro sobem pro topo sozinhos; passado esse
// prazo, a mesma linha volta a cair pra ordem normal (displayOrder) sem
// precisar de nenhuma rotina agendada — a comparação com now() é feita a
// cada busca.
const postOrder = [
  desc(sql`(${postsTable.pinnedUntil} is not null and ${postsTable.pinnedUntil} > now())`),
  desc(postsTable.displayOrder),
];

// A listagem do admin usa uma ordem diferente da pública: rascunho antigo não
// pode ficar enterrado embaixo de publicados recentes, senão a pessoa tem que
// rolar a página inteira pra achar o que estava escrevendo. Rascunhos sempre
// aparecem primeiro (mais recente editado no topo). O "-infinity" garante que
// esse critério de data só decide a ordem ENTRE rascunhos — pros publicados
// ele sempre empata no menor valor possível, caindo pro próximo critério
// (fixado/arrastado), sem interferir na ordem que a pessoa já definiu.
const adminPostOrder = [
  desc(sql`(${postsTable.status} = 'draft')`),
  desc(sql`(case when ${postsTable.status} = 'draft' then ${postsTable.updatedAt} else '-infinity'::timestamptz end)`),
  ...postOrder,
];

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
    .orderBy(...postOrder);

  const posts = limit ? await (q as any).limit(limit) : await q;

  res.json(ListPostsResponse.parse({ posts, total: posts.length }));
});

router.get("/posts/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const posts = await db.select().from(postsTable).orderBy(...adminPostOrder);
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

  // Post novo entra no topo da listagem (mesmo critério usado ao publicar um
  // rascunho existente — ver PATCH abaixo).
  const [post] = await db
    .insert(postsTable)
    .values({ ...parsed.data, displayOrder: Math.floor(Date.now() / 1000) })
    .returning();
  res.status(201).json(GetPostResponse.parse(post));
});

// Reatribui displayOrder pra refletir a ordem arrastada no admin. Reindexa
// só os posts recebidos (contagem tipicamente pequena) em vez de fazer
// ordenação fracionária — mais simples e sem casos extremos pra depurar.
router.post("/posts/admin/reorder", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = ReorderPostsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // displayOrder de posts nunca arrastados usa segundos desde epoch (criação
  // ou publicação — ver POST /create e o PATCH acima), um número bem grande.
  // Reindexar com valores pequenos (1, 2, 3...) fazia um post recém-arrastado
  // nunca superar, na prática, qualquer post intocado. Usar a mesma escala
  // (epoch "agora" menos a posição) mantém o arraste comparável com o resto.
  const { ids } = parsed.data;
  const base = Math.floor(Date.now() / 1000);
  await Promise.all(
    ids.map((id, index) =>
      db
        .update(postsTable)
        .set({ displayOrder: base - index })
        .where(eq(postsTable.id, id))
    )
  );

  const posts = await db.select().from(postsTable).orderBy(...adminPostOrder);
  res.json(ListPostsAdminResponse.parse({ posts, total: posts.length }));
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

  // Ativar um rascunho (status vira "published" agora) leva o post pro topo
  // da listagem — sem isso ele ficava na posição da data de criação
  // original, enterrado embaixo de posts mais recentes.
  const [existing] = await db.select({ status: postsTable.status }).from(postsTable).where(eq(postsTable.id, params.data.id));
  const isBeingPublished = existing?.status !== "published" && parsed.data.status === "published";

  const [post] = await db
    .update(postsTable)
    .set({
      ...parsed.data,
      ...(isBeingPublished ? { displayOrder: Math.floor(Date.now() / 1000) } : {}),
      updatedAt: new Date(),
    })
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

  // Publicar de novo é permitido de propósito (post atualizado com foto/texto
  // novo, por exemplo) — não apaga a publicação anterior no Instagram, só
  // atualiza a marcação de "última publicação" deste post no painel.
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
