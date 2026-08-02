import { Router, type IRouter } from "express";
import { db, instagramPartnersTable, postsTable, partnerContentItemsTable, storyScheduleSettingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListInstagramPartnersResponse,
  UpdateInstagramPartnerParams,
  UpdateInstagramPartnerBody,
  UpdateInstagramPartnerResponse,
  ScanInstagramPartnersResponse,
  CreateInstagramPartnerBody,
  ListPartnerContentItemsResponse,
  CreatePartnerContentItemParams,
  CreatePartnerContentItemBody,
  UpdatePartnerContentItemParams,
  UpdatePartnerContentItemBody,
  UpdatePartnerContentItemResponse,
  GetScheduleSettingsResponse,
  UpdateScheduleSettingsBody,
  UpdateScheduleSettingsResponse,
  GetSchedulePreviewResponse,
} from "@workspace/api-zod";
import { scanPostsForPartners } from "../lib/partners";
import { computeSchedulePreview } from "../lib/story-schedule";
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
      origem: instagramPartnersTable.origem,
      pausado: instagramPartnersTable.pausado,
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
    // left join, não inner — parceiros cadastrados manualmente não têm post_id
    .leftJoin(postsTable, eq(instagramPartnersTable.postId, postsTable.id))
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

// Cadastro manual — parceiros que não vieram de nenhum post do blog.
router.post("/partners/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = CreateInstagramPartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .insert(instagramPartnersTable)
    .values({
      origem: "manual",
      nomeEstabelecimento: parsed.data.nomeEstabelecimento,
      instagramHandle: parsed.data.instagramHandle || null,
      telefone: parsed.data.telefone || null,
      status: "encontrado",
    })
    .returning();

  res.status(201).json(UpdateInstagramPartnerResponse.parse(partner));
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

// ─── Fila de conteúdo ────────────────────────────────────────────────────
// O arquivo já foi enviado pelo parceiro (WhatsApp/e-mail) e subido pelo
// admin via /media/upload — aqui só registra na fila. Entrar na fila já
// conta como aprovado: a autorização foi dada uma vez, no parceiro, não
// item por item. Por isso valida aqui que o parceiro está autorizado pro
// tipo de conteúdo antes de aceitar.

router.get("/partners/admin/content", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const rows = await db
    .select({
      id: partnerContentItemsTable.id,
      partnerId: partnerContentItemsTable.partnerId,
      mediaUrl: partnerContentItemsTable.mediaUrl,
      mediaType: partnerContentItemsTable.mediaType,
      tipoConteudo: partnerContentItemsTable.tipoConteudo,
      status: partnerContentItemsTable.status,
      scheduledFor: partnerContentItemsTable.scheduledFor,
      publishedAt: partnerContentItemsTable.publishedAt,
      publishedMediaId: partnerContentItemsTable.publishedMediaId,
      notas: partnerContentItemsTable.notas,
      createdAt: partnerContentItemsTable.createdAt,
      nomeEstabelecimento: instagramPartnersTable.nomeEstabelecimento,
      instagramHandle: instagramPartnersTable.instagramHandle,
    })
    .from(partnerContentItemsTable)
    .innerJoin(instagramPartnersTable, eq(partnerContentItemsTable.partnerId, instagramPartnersTable.id))
    .orderBy(desc(partnerContentItemsTable.createdAt));

  res.json(ListPartnerContentItemsResponse.parse({ items: rows, total: rows.length }));
});

router.post("/partners/admin/:id/content", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = CreatePartnerContentItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreatePartnerContentItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db.select().from(instagramPartnersTable).where(eq(instagramPartnersTable.id, params.data.id));
  if (!partner) {
    res.status(404).json({ error: "Parceiro não encontrado" });
    return;
  }
  if (partner.status !== "autorizado_repost") {
    res.status(400).json({ error: "Este parceiro ainda não está com status \"Autorizado a repostar\"." });
    return;
  }

  const tipo = parsed.data.tipoConteudo;
  const autorizadoParaTipo =
    (tipo === "story" && partner.autorizacaoStories) ||
    (tipo === "reel" && partner.autorizacaoVideosReels) ||
    (tipo === "feed" && partner.autorizacaoFotos);
  if (!autorizadoParaTipo) {
    res.status(400).json({ error: `Este parceiro não autorizou conteúdo do tipo "${tipo}".` });
    return;
  }

  try {
    const [item] = await db
      .insert(partnerContentItemsTable)
      .values({
        partnerId: partner.id,
        mediaUrl: parsed.data.mediaUrl,
        mediaType: parsed.data.mediaType,
        tipoConteudo: tipo,
        notas: parsed.data.notas || null,
        status: "na_fila",
      })
      .returning();
    res.status(201).json(UpdatePartnerContentItemResponse.parse(item));
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique")) {
      res.status(400).json({ error: "Esse mesmo arquivo já está na fila (conteúdo nunca é repetido)." });
      return;
    }
    throw err;
  }
});

router.patch("/partners/admin/content/:id", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const params = UpdatePartnerContentItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePartnerContentItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(partnerContentItemsTable)
    .set(parsed.data)
    .where(eq(partnerContentItemsTable.id, params.data.id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item não encontrado" });
    return;
  }

  res.json(UpdatePartnerContentItemResponse.parse(item));
});

// ─── Configuração do agendamento ─────────────────────────────────────────

router.get("/partners/admin/schedule-settings", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [row] = await db.select().from(storyScheduleSettingsTable).limit(1);
  if (!row) {
    res.status(500).json({ error: "Configuração de agendamento não encontrada." });
    return;
  }

  res.json(
    GetScheduleSettingsResponse.parse({
      ...row,
      diasSemana: JSON.parse(row.diasSemana),
      horarios: JSON.parse(row.horarios),
    }),
  );
});

router.patch("/partners/admin/schedule-settings", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const parsed = UpdateScheduleSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select({ id: storyScheduleSettingsTable.id }).from(storyScheduleSettingsTable).limit(1);
  if (!existing) {
    res.status(500).json({ error: "Configuração de agendamento não encontrada." });
    return;
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.diasSemana) update.diasSemana = JSON.stringify(parsed.data.diasSemana);
  if (parsed.data.horarios) update.horarios = JSON.stringify(parsed.data.horarios);
  if (parsed.data.maxPorDia !== undefined) update.maxPorDia = parsed.data.maxPorDia;
  if (parsed.data.maxPorParceiroDia !== undefined) update.maxPorParceiroDia = parsed.data.maxPorParceiroDia;
  if (parsed.data.automacaoAtiva !== undefined) update.automacaoAtiva = parsed.data.automacaoAtiva;

  const [row] = await db
    .update(storyScheduleSettingsTable)
    .set(update)
    .where(eq(storyScheduleSettingsTable.id, existing.id))
    .returning();

  logger.info({ automacaoAtiva: row.automacaoAtiva }, "[partners] Configuração de agendamento atualizada");

  res.json(
    UpdateScheduleSettingsResponse.parse({
      ...row,
      diasSemana: JSON.parse(row.diasSemana),
      horarios: JSON.parse(row.horarios),
    }),
  );
});

// Grade de prévia dos próximos 7 dias — só simulação, não persiste nada e
// não chama a API do Instagram. Serve pra revisar o que SERIA publicado.
router.get("/partners/admin/schedule-preview", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const slots = await computeSchedulePreview();
    res.json(GetSchedulePreviewResponse.parse({ slots }));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Falha ao gerar prévia." });
  }
});

export default router;
