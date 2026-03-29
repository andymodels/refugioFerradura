import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq, ilike, or, and, sql } from "drizzle-orm";
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
} from "@workspace/api-zod";

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
    .orderBy(postsTable.createdAt);

  const posts = limit ? await (q as any).limit(limit) : await q;

  res.json(ListPostsResponse.parse({ posts, total: posts.length }));
});

router.get("/posts/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const posts = await db.select().from(postsTable).orderBy(postsTable.createdAt);
  res.json(ListPostsAdminResponse.parse({ posts, total: posts.length }));
});

router.post("/posts/admin/create", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CreatePostBody.safeParse(req.body);
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

  await db.delete(postsTable).where(eq(postsTable.id, params.data.id));
  res.sendStatus(204);
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
