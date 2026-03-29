import { Router, type IRouter } from "express";
import { db, placesTable } from "@workspace/db";
import { eq, ilike, or, and } from "drizzle-orm";
import {
  ListPlacesQueryParams,
  ListPlacesResponse,
  ListPlacesAdminResponse,
  GetPlaceParams,
  GetPlaceResponse,
  GetPlaceAdminParams,
  GetPlaceAdminResponse,
  UpdatePlaceParams,
  UpdatePlaceBody,
  UpdatePlaceResponse,
  DeletePlaceParams,
  CreatePlaceBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/places", async (req, res): Promise<void> => {
  const query = ListPlacesQueryParams.safeParse(req.query);
  const search = query.success ? query.data.search : undefined;
  const category = query.success ? query.data.category : undefined;

  const conditions: any[] = [];
  if (search) {
    conditions.push(or(ilike(placesTable.name, `%${search}%`), ilike(placesTable.description, `%${search}%`)));
  }
  if (category) {
    conditions.push(eq(placesTable.category, category));
  }

  const places = conditions.length > 0
    ? await db.select().from(placesTable).where(and(...conditions)).orderBy(placesTable.name)
    : await db.select().from(placesTable).orderBy(placesTable.name);

  res.json(ListPlacesResponse.parse({ places }));
});

router.get("/places/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const places = await db.select().from(placesTable).orderBy(placesTable.name);
  res.json(ListPlacesAdminResponse.parse({ places }));
});

router.post("/places/admin/create", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CreatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [place] = await db.insert(placesTable).values(parsed.data).returning();
  res.status(201).json(GetPlaceResponse.parse(place));
});

router.get("/places/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = GetPlaceAdminParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [place] = await db.select().from(placesTable).where(eq(placesTable.id, params.data.id));
  if (!place) {
    res.status(404).json({ error: "Local não encontrado" });
    return;
  }

  res.json(GetPlaceAdminResponse.parse(place));
});

router.patch("/places/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = UpdatePlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePlaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [place] = await db
    .update(placesTable)
    .set(parsed.data)
    .where(eq(placesTable.id, params.data.id))
    .returning();

  if (!place) {
    res.status(404).json({ error: "Local não encontrado" });
    return;
  }

  res.json(UpdatePlaceResponse.parse(place));
});

router.delete("/places/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = DeletePlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(placesTable).where(eq(placesTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/places/:slug", async (req, res): Promise<void> => {
  const params = GetPlaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [place] = await db
    .select()
    .from(placesTable)
    .where(eq(placesTable.slug, params.data.slug));

  if (!place) {
    res.status(404).json({ error: "Local não encontrado" });
    return;
  }

  res.json(GetPlaceResponse.parse(place));
});

export default router;
