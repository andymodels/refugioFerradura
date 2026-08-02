import { Router, type IRouter } from "express";
import crypto from "crypto";
import multer from "multer";
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
  CreatePartnerConnectLinkResponse,
  CreatePartnerUploadLinkResponse,
  GetPartnerUploadInfoResponse,
} from "@workspace/api-zod";
import { scanPostsForPartners } from "../lib/partners";
import { computeSchedulePreview, assignScheduleSlots } from "../lib/story-schedule";
import { buildPartnerConnectUrl, verifyState, exchangePartnerCode } from "../lib/partner-oauth";
import { publishPartnerContentToInstagram } from "../lib/instagram";
import { uploadToCloudinary } from "./media";
import { logger } from "../lib/logger";

const publicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Tipo de arquivo não suportado."));
  },
});

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
      // Nunca selecionar igAccessToken aqui — não pode ir pro cliente.
      igUsername: instagramPartnersTable.igUsername,
      conectadoEm: instagramPartnersTable.conectadoEm,
      ultimoPollEm: instagramPartnersTable.ultimoPollEm,
      uploadToken: instagramPartnersTable.uploadToken,
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

// ─── Conexão única da conta do parceiro (Feed/Reels automáticos) ─────────
// O parceiro autoriza a PRÓPRIA conta a nos deixar ler o próprio feed —
// nunca lemos conta de terceiro sem essa autorização direta dele.

router.post("/partners/admin/:id/connect-link", async (req, res): Promise<void> => {
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

  const [partner] = await db.select({ id: instagramPartnersTable.id }).from(instagramPartnersTable).where(eq(instagramPartnersTable.id, params.data.id));
  if (!partner) {
    res.status(404).json({ error: "Parceiro não encontrado" });
    return;
  }

  try {
    const url = buildPartnerConnectUrl(partner.id);
    res.json(CreatePartnerConnectLinkResponse.parse({ url }));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Falha ao gerar link de conexão." });
  }
});

router.post("/partners/admin/:id/disconnect", async (req, res): Promise<void> => {
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

  const [partner] = await db
    .update(instagramPartnersTable)
    .set({ igUserId: null, igUsername: null, igAccessToken: null, igTokenExpiresAt: null, conectadoEm: null, ultimoPollEm: null })
    .where(eq(instagramPartnersTable.id, params.data.id))
    .returning();

  if (!partner) {
    res.status(404).json({ error: "Parceiro não encontrado" });
    return;
  }

  res.json(UpdateInstagramPartnerResponse.parse(partner));
});

// ─── Link exclusivo de envio de Story (sem login) ─────────────────────────

router.post("/partners/admin/:id/upload-link", async (req, res): Promise<void> => {
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

  const [partner] = await db.select().from(instagramPartnersTable).where(eq(instagramPartnersTable.id, params.data.id));
  if (!partner) {
    res.status(404).json({ error: "Parceiro não encontrado" });
    return;
  }

  let token = partner.uploadToken;
  if (!token) {
    token = crypto.randomBytes(20).toString("hex");
    await db.update(instagramPartnersTable).set({ uploadToken: token }).where(eq(instagramPartnersTable.id, partner.id));
  }

  const base = process.env.FRONTEND_URL || "https://refugioferradura.com.br";
  res.json(CreatePartnerUploadLinkResponse.parse({ url: `${base.replace(/\/+$/, "")}/parceiro/${token}` }));
});

// Rotas públicas abaixo — sem sessão de admin, é o parceiro no próprio
// celular. Só aceitam envio se o parceiro estiver autorizado pra Stories.

router.get("/partners/upload/:token", async (req, res): Promise<void> => {
  const [partner] = await db
    .select({
      nomeEstabelecimento: instagramPartnersTable.nomeEstabelecimento,
      status: instagramPartnersTable.status,
      pausado: instagramPartnersTable.pausado,
      autorizacaoStories: instagramPartnersTable.autorizacaoStories,
    })
    .from(instagramPartnersTable)
    .where(eq(instagramPartnersTable.uploadToken, String(req.params.token)));

  if (!partner || partner.status !== "autorizado_repost" || partner.pausado) {
    res.status(404).json({ error: "Link não encontrado ou não está mais ativo." });
    return;
  }

  res.json(GetPartnerUploadInfoResponse.parse({ nomeEstabelecimento: partner.nomeEstabelecimento, autorizacaoStories: partner.autorizacaoStories }));
});

router.post("/partners/upload/:token", publicUpload.single("file"), async (req, res): Promise<void> => {
  const [partner] = await db.select().from(instagramPartnersTable).where(eq(instagramPartnersTable.uploadToken, String(req.params.token)));

  if (!partner || partner.status !== "autorizado_repost" || partner.pausado) {
    res.status(404).json({ error: "Link não encontrado ou não está mais ativo." });
    return;
  }
  if (!partner.autorizacaoStories) {
    res.status(400).json({ error: "Esse link não está autorizado pra envio de Stories." });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado." });
    return;
  }

  try {
    const isVideo = /^video\//.test(req.file.mimetype);
    const { url } = await uploadToCloudinary(req.file.buffer, "refugio-da-ferradura/parceiros", isVideo ? "video" : "image");

    await db.insert(partnerContentItemsTable).values({
      partnerId: partner.id,
      origem: "link_parceiro",
      mediaUrl: url,
      mediaType: isVideo ? "video" : "foto",
      tipoConteudo: "story",
      status: "na_fila",
    });

    res.status(201).json({ success: true });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique")) {
      res.status(400).json({ error: "Esse arquivo já foi enviado antes." });
      return;
    }
    logger.error({ partnerId: partner.id, error: String(err?.message ?? err) }, "[partners] Falha no upload público de Story");
    res.status(500).json({ error: "Falha ao enviar o arquivo. Tente de novo." });
  }
});

// Instagram redireciona pra cá depois do parceiro autorizar — sem sessão de
// admin, é o navegador do próprio parceiro. Responde com uma página simples.
router.get("/partners/connect/callback", async (req, res): Promise<void> => {
  const { code, state, error, error_description } = req.query as Record<string, string | undefined>;

  const renderPage = (title: string, message: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b0f0c;color:#f2f2f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
.card{max-width:420px}h1{font-size:1.25rem;margin-bottom:0.5rem}p{color:#c9c9c4}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;

  if (error) {
    res.status(200).type("html").send(renderPage("Conexão cancelada", error_description || "A autorização não foi concluída. Pode fechar esta aba."));
    return;
  }
  if (!code || !state) {
    res.status(400).type("html").send(renderPage("Link inválido", "Faltam dados na resposta do Instagram. Peça um novo link."));
    return;
  }

  const partnerId = verifyState(state);
  if (!partnerId) {
    res.status(400).type("html").send(renderPage("Link inválido", "Esse link de conexão não é válido ou expirou. Peça um novo."));
    return;
  }

  try {
    const connection = await exchangePartnerCode(code);
    await db
      .update(instagramPartnersTable)
      .set({
        igUserId: connection.igUserId,
        igUsername: connection.igUsername,
        igAccessToken: connection.accessToken,
        igTokenExpiresAt: connection.expiresAt,
        conectadoEm: new Date(),
      })
      .where(eq(instagramPartnersTable.id, partnerId));

    logger.info({ partnerId, igUsername: connection.igUsername }, "[partners] Conta de parceiro conectada");
    res.status(200).type("html").send(renderPage("Conectado!", "Sua conta do Instagram foi conectada. Pode fechar esta aba."));
  } catch (err: any) {
    logger.error({ partnerId, error: String(err?.message ?? err) }, "[partners] Falha ao conectar conta do parceiro");
    res.status(500).type("html").send(renderPage("Erro ao conectar", err?.message || "Não foi possível concluir a conexão. Tente novamente."));
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

// Único gatilho que de fato chama a API do Instagram pra publicar conteúdo
// de parceiro — sempre um clique explícito do admin. Não existe cron
// nenhum chamando isso ainda; é assim de propósito, até o primeiro teste
// real ser feito e autorizado.
router.post("/partners/admin/content/:id/publish-now", async (req, res): Promise<void> => {
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

  const [item] = await db
    .select({
      id: partnerContentItemsTable.id,
      partnerId: partnerContentItemsTable.partnerId,
      mediaUrl: partnerContentItemsTable.mediaUrl,
      mediaType: partnerContentItemsTable.mediaType,
      tipoConteudo: partnerContentItemsTable.tipoConteudo,
      status: partnerContentItemsTable.status,
      nomeEstabelecimento: instagramPartnersTable.nomeEstabelecimento,
      instagramHandle: instagramPartnersTable.instagramHandle,
    })
    .from(partnerContentItemsTable)
    .innerJoin(instagramPartnersTable, eq(partnerContentItemsTable.partnerId, instagramPartnersTable.id))
    .where(eq(partnerContentItemsTable.id, params.data.id));

  if (!item) {
    res.status(404).json({ error: "Item não encontrado" });
    return;
  }
  if (item.status === "publicado") {
    res.status(400).json({ error: "Esse item já foi publicado." });
    return;
  }

  try {
    const result = await publishPartnerContentToInstagram(item, {
      nomeEstabelecimento: item.nomeEstabelecimento,
      instagramHandle: item.instagramHandle,
    });

    const [updated] = await db
      .update(partnerContentItemsTable)
      .set({ status: "publicado", publishedAt: new Date(), publishedMediaId: result.mediaId })
      .where(eq(partnerContentItemsTable.id, item.id))
      .returning();

    res.json(UpdatePartnerContentItemResponse.parse(updated));
  } catch (err: any) {
    logger.error({ itemId: item.id, error: String(err?.message ?? err) }, "[partners] Falha ao publicar conteúdo de parceiro");
    res.status(400).json({ error: err?.message ?? "Falha ao publicar no Instagram." });
  }
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
