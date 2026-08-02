import { Router, type IRouter } from "express";
import { db, instagramPartnersTable, postsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListInstagramPartnersResponse,
  UpdateInstagramPartnerParams,
  UpdateInstagramPartnerBody,
  UpdateInstagramPartnerResponse,
  ScanInstagramPartnersResponse,
} from "@workspace/api-zod";
import { scanPostsForPartners } from "../lib/partners";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/partners/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const rows = await db
    .select({
      id: instagramPartnersTable.id,
      postId: instagramPartnersTable.postId,
      nomeEstabelecimento: instagramPartnersTable.nomeEstabelecimento,
      instagramHandle: instagramPartnersTable.instagramHandle,
      telefone: instagramPartnersTable.telefone,
      status: instagramPartnersTable.status,
      autorizacaoData: instagramPartnersTable.autorizacaoData,
      autorizacaoCanal: instagramPartnersTable.autorizacaoCanal,
      autorizacaoObservacao: instagramPartnersTable.autorizacaoObservacao,
      autorizacaoFotos: instagramPartnersTable.autorizacaoFotos,
      autorizacaoVideosReels: instagramPartnersTable.autorizacaoVideosReels,
      autorizacaoStories: instagramPartnersTable.autorizacaoStories,
      marcacaoObrigatoria: instagramPartnersTable.marcacaoObrigatoria,
      createdAt: instagramPartnersTable.createdAt,
      updatedAt: instagramPartnersTable.updatedAt,
      postSlug: postsTable.slug,
      postTitle: postsTable.title,
    })
    .from(instagramPartnersTable)
    .innerJoin(postsTable, eq(instagramPartnersTable.postId, postsTable.id))
    .orderBy(desc(instagramPartnersTable.createdAt));

  res.json(ListInstagramPartnersResponse.parse({ partners: rows, total: rows.length }));
});

// Varredura manual — só roda quando o admin clica no botão. Nunca segue
// perfil, nunca baixa/copia mídia, nunca publica nem altera posts.
router.post("/partners/admin/scan", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const result = await scanPostsForPartners();
    logger.info(result, "[partners] Varredura manual concluída");
    res.json(ScanInstagramPartnersResponse.parse(result));
  } catch (err) {
    logger.error({ error: String((err as any)?.message ?? err) }, "[partners] Falha na varredura");
    res.status(500).json({ error: "Falha ao varrer os posts." });
  }
});

router.patch("/partners/admin/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = UpdateInstagramPartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInstagramPartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .update(instagramPartnersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(instagramPartnersTable.id, params.data.id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Parceiro não encontrado" });
    return;
  }

  res.json(UpdateInstagramPartnerResponse.parse(partner));
});

export default router;
