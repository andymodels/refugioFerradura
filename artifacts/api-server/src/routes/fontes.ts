import { Router, type IRouter } from "express";
import { db, fontesTable, fontesProcessadasTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListFontesResponse,
  CreateFonteBody,
  UpdateFonteParams,
  UpdateFonteBody,
  UpdateFonteResponse,
  DeleteFonteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/fontes/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const fontes = await db.select().from(fontesTable).orderBy(desc(fontesTable.criadoEm));
  res.json(ListFontesResponse.parse({ fontes, total: fontes.length }));
});

router.post("/fontes/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CreateFonteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fonte] = await db.insert(fontesTable).values(parsed.data).returning();
  res.status(201).json(UpdateFonteResponse.parse(fonte));
});

router.patch("/fontes/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = UpdateFonteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateFonteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fonte] = await db
    .update(fontesTable)
    .set(parsed.data)
    .where(eq(fontesTable.id, params.data.id))
    .returning();

  if (!fonte) {
    res.status(404).json({ error: "Fonte não encontrada" });
    return;
  }

  res.json(UpdateFonteResponse.parse(fonte));
});

router.delete("/fontes/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = DeleteFonteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Apaga primeiro o histórico de processamento (senão a FK bloqueia a exclusão da fonte).
  await db.delete(fontesProcessadasTable).where(eq(fontesProcessadasTable.fonteId, params.data.id));
  await db.delete(fontesTable).where(eq(fontesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
