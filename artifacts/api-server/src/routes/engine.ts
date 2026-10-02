import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import {
  db,
  postsTable,
  instagramPartnersTable,
  engineRunsTable,
  settingsTable,
  partnerMediaTable,
} from "@workspace/db";
import { eq, and, or, inArray, sql, asc, desc } from "drizzle-orm";
import { slugify, type MediaItem } from "../lib/article-generation";
import { createDirectUpload } from "../lib/b2-storage";
import { logger } from "../lib/logger";
import {
  COOLDOWN_DIAS,
  MIN_IMAGENS_DESTAQUE,
  MAX_IMAGENS_DESTAQUE,
  EXT_POR_TIPO,
  CATEGORIA_LABEL,
  CATEGORIA_TAG_BLOG,
  nomeParaConteudo,
  montarMidia,
  midiaVirtualDaMateria,
  isB2Url,
  textoLimpo,
  extrairServicoHtml,
  validarArtigo,
  renderArtigoComFotos,
  hojeBRT,
  type ArtigoGerado,
} from "../lib/engine";

// Motor de conteúdo automático (Parte 2). Todas as rotas exigem o segredo
// ENGINE_SECRET (separado do CRON_SECRET: o Mac só guarda este). Nenhuma
// publica no Instagram: o post sai no blog e o fluxo existente matéria ->
// Instagram cuida do resto. Fotos e vídeos são buscados no Mac (Playwright +
// Claude Code) e chegam aqui só como arquivos já arquivados no B2.
const router: IRouter = Router();

const MAX_TENTATIVAS_DIA = 3;
const RUNNING_STALE_MIN = 60;
const SETTING_ENABLED = "engine_enabled";
const SETTING_DRY_RUN_OK = "engine_dry_run_ok";

function autorizado(req: any, res: any): boolean {
  const expected = process.env.ENGINE_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return false;
  }
  return true;
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

// Desligado por padrão: só roda de verdade com engine_enabled = "true".
async function engineEnabled(): Promise<boolean> {
  return (await getSetting(SETTING_ENABLED)) === "true";
}

async function partnerMediaReady(): Promise<boolean> {
  try {
    const r: any = await db.execute(sql`select to_regclass('public.partner_media') as t`);
    const row = (r.rows ?? r)[0];
    return !!row?.t;
  } catch {
    return false;
  }
}

async function carregarCandidatos() {
  return db
    .select({ partner: instagramPartnersTable, post: postsTable })
    .from(instagramPartnersTable)
    .innerJoin(
      postsTable,
      eq(postsTable.id, sql`coalesce(${instagramPartnersTable.materiaPrincipalPostId}, ${instagramPartnersTable.postId})`),
    );
}

function montarFatos(partner: any, post: any, nome: string) {
  const conteudo: string = post.content || "";
  const servicoHtml = extrairServicoHtml(conteudo);
  const corpoSemServico = servicoHtml ? conteudo.replace(servicoHtml, "") : conteudo;
  const fonteTexto = textoLimpo(corpoSemServico).slice(0, 6000);
  const servicoTexto = servicoHtml ? textoLimpo(servicoHtml) : "";
  const fatos = {
    nome,
    categoria: CATEGORIA_LABEL[partner.categoria] ?? partner.categoria,
    regiao: partner.regiao ?? null,
    descricaoCurta: partner.descricaoCurta ?? null,
    tags: partner.tags ?? [],
    endereco: partner.endereco ?? null,
    site: partner.site ?? null,
    telefone: partner.telefone ?? null,
    instagram: partner.instagramHandle ?? null,
    materia: { id: post.id, slug: post.slug, titulo: post.title, resumo: post.excerpt ?? null },
    fonteTexto,
  };
  const corpusFatos = [
    nome, fatos.categoria, fatos.regiao, fatos.descricaoCurta, fatos.tags.join(" "), fatos.endereco,
    fatos.site, fatos.telefone, fatos.instagram, post.title, post.excerpt, fonteTexto, servicoTexto,
    servicoHtml ?? "",
  ].filter(Boolean).join("\n");
  return { fatos, corpusFatos, servicoHtml };
}

// Escolhe a próxima pauta (destaque individual) — leitura apenas. Lugar é
// elegível se tem nome utilizável e QUALQUER fonte de mídia possível: foto
// nossa já na matéria, Instagram oficial ou site oficial. A suficiência de
// mídia (mínimo de imagens boas) é verificada depois, pelo runner.
async function escolherPauta(exclude: number[]) {
  const linhas = await carregarCandidatos();
  const agora = Date.now();
  const cooldownMs = COOLDOWN_DIAS * 86400000;
  const chaveGrupo = (p: any) => (p.instagramHandle ? `ig:${String(p.instagramHandle).toLowerCase()}` : `id:${p.id}`);

  const emCooldown = new Set<string>();
  let ultimoUsado: { quando: number; categoria: string | null } | null = null;
  for (const { partner } of linhas) {
    const t = partner.ultimoUsoInstagramEm ? new Date(partner.ultimoUsoInstagramEm).getTime() : 0;
    if (t && agora - t < cooldownMs) emCooldown.add(chaveGrupo(partner));
    if (t && (!ultimoUsado || t > ultimoUsado.quando)) ultimoUsado = { quando: t, categoria: partner.categoria };
  }

  const stats = { total: linhas.length, inelegiveis: { pausado: 0, categoria: 0, materia_nao_publicada: 0, nome: 0, sem_fonte_de_midia: 0, cooldown: 0, excluido: 0 } };
  const elegiveis: any[] = [];
  for (const { partner, post } of linhas) {
    if (exclude.includes(partner.id)) { stats.inelegiveis.excluido++; continue; }
    if (partner.pausado) { stats.inelegiveis.pausado++; continue; }
    if (!partner.categoria || partner.categoria === "outra" || partner.categoria === "eventos") { stats.inelegiveis.categoria++; continue; }
    if (post.status !== "published") { stats.inelegiveis.materia_nao_publicada++; continue; }
    const nome = nomeParaConteudo(partner.nomeEstabelecimento, partner.instagramHandle);
    if (!nome) { stats.inelegiveis.nome++; continue; }
    const temB2 = !!montarMidia(post);
    if (!temB2 && !partner.instagramHandle && !partner.site) { stats.inelegiveis.sem_fonte_de_midia++; continue; }
    if (emCooldown.has(chaveGrupo(partner))) { stats.inelegiveis.cooldown++; continue; }
    elegiveis.push({ partner, post, nome, temB2 });
  }

  elegiveis.sort((a, b) => {
    const ta = a.partner.ultimoUsoInstagramEm ? new Date(a.partner.ultimoUsoInstagramEm).getTime() : 0;
    const tb = b.partner.ultimoUsoInstagramEm ? new Date(b.partner.ultimoUsoInstagramEm).getTime() : 0;
    if (ta !== tb) return ta - tb;
    if (a.partner.usosInstagram !== b.partner.usosInstagram) return a.partner.usosInstagram - b.partner.usosInstagram;
    const da = a.partner.categoria === ultimoUsado?.categoria ? 1 : 0;
    const db_ = b.partner.categoria === ultimoUsado?.categoria ? 1 : 0;
    if (da !== db_) return da - db_;
    return Math.random() - 0.5;
  });

  return { escolhido: elegiveis[0] ?? null, elegiveis: elegiveis.length, stats };
}

// Linha do acervo no formato que o runner consome.
function linhaPool(r: any) {
  return {
    id: r.id as number | null,
    source: r.source as string,
    sourceId: r.sourceId as string,
    url: r.urlArquivo as string,
    urlInstagram: (r.urlInstagram ?? null) as string | null,
    width: r.width ?? null,
    height: r.height ?? null,
    score: r.score ?? null,
    cena: r.cena ?? null,
    isReel: !!r.isReel,
    tipoMidia: r.tipoMidia,
    origemUrl: r.origemUrl ?? null,
    destinoUrl: r.destinoUrl ?? null,
    takenAt: r.takenAt ?? null,
    usedCount: r.usedCount ?? 0,
    lastUsedAt: r.lastUsedAt ?? null,
  };
}

// ─── Estado e trava do dia ──────────────────────────────────────────────
router.get("/status", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const hoje = hojeBRT();
  const [run] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.runDate, hoje));
  const dry = await getSetting(SETTING_DRY_RUN_OK);
  res.json({
    enabled: await engineEnabled(),
    dryRunOk: !!dry,
    dryRun: dry ? (() => { try { return JSON.parse(dry); } catch { return null; } })() : null,
    mediaReady: await partnerMediaReady(),
    hoje,
    run: run ?? null,
  });
});

// Reserva o dia (atômico via UNIQUE). Exige motor ligado E dry-run concluído.
router.post("/claim", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  if (!(await engineEnabled())) {
    res.status(403).json({ status: "disabled", message: "engine_enabled não está ligado." });
    return;
  }
  if (!(await getSetting(SETTING_DRY_RUN_OK))) {
    res.status(403).json({ status: "dry_run_required", message: "Rode o dry-run completo antes de ativar." });
    return;
  }
  if (!(await partnerMediaReady())) {
    res.status(503).json({ status: "media_not_ready", message: "Tabela partner_media ausente." });
    return;
  }
  const hoje = hojeBRT();
  const [existente] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.runDate, hoje));
  if (existente) {
    if (existente.status === "published") {
      res.status(409).json({ status: "already_ran", runId: existente.id });
      return;
    }
    const idadeMin = (Date.now() - new Date(existente.startedAt).getTime()) / 60000;
    if (existente.status === "running" && idadeMin < RUNNING_STALE_MIN) {
      res.status(409).json({ status: "busy", runId: existente.id });
      return;
    }
    if (existente.attempts >= MAX_TENTATIVAS_DIA) {
      res.status(409).json({ status: "gave_up", runId: existente.id });
      return;
    }
    const [r] = await db
      .update(engineRunsTable)
      .set({ status: "running", attempts: existente.attempts + 1, startedAt: new Date(), finishedAt: null })
      .where(eq(engineRunsTable.id, existente.id))
      .returning();
    res.json({ status: "claimed", runId: r.id, attempts: r.attempts });
    return;
  }
  try {
    const [r] = await db.insert(engineRunsTable).values({ runDate: hoje }).returning();
    res.json({ status: "claimed", runId: r.id, attempts: 1 });
  } catch {
    res.status(409).json({ status: "busy" }); // outra instância reservou primeiro
  }
});

router.post("/fail", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { runId, reason, final } = req.body || {};
  const [run] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.id, Number(runId)));
  if (!run || run.status === "published") {
    res.status(404).json({ error: "execução não encontrada ou já publicada" });
    return;
  }
  await db
    .update(engineRunsTable)
    .set({
      status: "failed",
      finishedAt: new Date(),
      attempts: final ? MAX_TENTATIVAS_DIA : run.attempts,
      detalhes: [run.detalhes, `${new Date().toISOString()} ${String(reason ?? "falha").slice(0, 500)}`].filter(Boolean).join("\n"),
    })
    .where(eq(engineRunsTable.id, run.id));
  res.json({ status: "ok" });
});

// Marca que o dry-run completo passou (única coisa que o dry-run grava).
router.post("/dry-run-complete", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const resumo = JSON.stringify({ at: new Date().toISOString(), ...(typeof req.body?.resumo === "object" ? req.body.resumo : {}) });
  await db
    .insert(settingsTable)
    .values({ key: SETTING_DRY_RUN_OK, value: resumo })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: resumo } });
  res.json({ status: "ok" });
});

// ─── Pauta ──────────────────────────────────────────────────────────────
router.post("/next-topic", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const exclude: number[] = Array.isArray(req.body?.exclude) ? req.body.exclude.map(Number) : [];
  const { escolhido, elegiveis, stats } = await escolherPauta(exclude);
  if (!escolhido) {
    res.json({ status: "no_topic", elegiveis, stats });
    return;
  }
  const { partner, post, nome } = escolhido;
  const { fatos } = montarFatos(partner, post, nome);
  res.json({
    status: "ok",
    kind: "destaque",
    partnerId: partner.id,
    categoria: partner.categoria,
    elegiveis,
    stats,
    fatos,
    fontes: { instagram: partner.instagramHandle ?? null, site: partner.site ?? null },
    limites: { minImagens: MIN_IMAGENS_DESTAQUE, maxImagens: MAX_IMAGENS_DESTAQUE },
  });
});

// ─── Acervo de mídia do lugar ───────────────────────────────────────────
// Devolve o que já existe (acervo + fotos da matéria vinculada). Com
// materialize=true grava as fotos da matéria no acervo (origem b2_materia)
// para poderem ser referenciadas por id na publicação.
router.post("/media/pool", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const partnerId = Number(req.body?.partnerId);
  const materialize = req.body?.materialize === true;
  const linhas = await carregarCandidatos();
  const linha = linhas.find((l) => l.partner.id === partnerId);
  if (!linha) {
    res.status(404).json({ status: "error", error: "lugar não encontrado" });
    return;
  }
  const ready = await partnerMediaReady();
  const virtuais = midiaVirtualDaMateria(linha.post);
  if (!ready) {
    res.json({
      status: "ok",
      ready: false,
      rows: virtuais.map((v) => linhaPool({ id: null, source: "b2_materia", sourceId: v.urlArquivo, score: 6, ...v })),
    });
    return;
  }
  if (materialize) {
    for (const v of virtuais) {
      await db
        .insert(partnerMediaTable)
        .values({
          partnerId, source: "b2_materia", sourceId: v.urlArquivo, urlArquivo: v.urlArquivo, tipoMidia: v.tipoMidia,
          origemUrl: v.origemUrl, destinoUrl: v.destinoUrl, isReel: v.isReel, score: 6, cena: "da-materia",
        })
        .onConflictDoNothing();
    }
  }
  const rows = await db.select().from(partnerMediaTable).where(eq(partnerMediaTable.partnerId, partnerId)).orderBy(desc(partnerMediaTable.score), asc(partnerMediaTable.lastUsedAt));
  const urls = new Set(rows.map((r) => r.urlArquivo));
  const extras = virtuais.filter((v) => !urls.has(v.urlArquivo)).map((v) =>
    linhaPool({ id: null, source: "b2_materia", sourceId: v.urlArquivo, score: 6, cena: "da-materia", ...v }));
  res.json({ status: "ok", ready: true, rows: [...rows.map(linhaPool), ...extras] });
});

// Pede um link temporário de upload ao B2. Se a foto já existe (mesmo hash ou
// mesma origem), devolve a existente e o runner não baixa nem sobe de novo.
router.post("/media/upload-url", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  if (!(await partnerMediaReady())) {
    res.status(503).json({ status: "media_not_ready" });
    return;
  }
  const { partnerId, source, sourceId, sha256, contentType, role } = req.body || {};
  const ext = EXT_POR_TIPO[String(contentType)];
  if (!partnerId || !source || !sourceId || !ext) {
    res.status(400).json({ status: "error", error: "partnerId, source, sourceId e contentType (jpeg/png/webp) são obrigatórios." });
    return;
  }
  if (role !== "ig") {
    const conds = [and(eq(partnerMediaTable.partnerId, Number(partnerId)), eq(partnerMediaTable.source, String(source)), eq(partnerMediaTable.sourceId, String(sourceId)))];
    if (sha256) conds.push(eq(partnerMediaTable.sha256, String(sha256)));
    const [dup] = await db.select().from(partnerMediaTable).where(or(...conds));
    if (dup) {
      res.json({ status: "exists", id: dup.id, url: dup.urlArquivo });
      return;
    }
  }
  const key = `refugio-da-ferradura/engine/${Number(partnerId)}/${Date.now()}-${randomUUID()}${role === "ig" ? "-4x5" : ""}.${ext}`;
  const up = await createDirectUpload({ filename: `engine.${ext}`, contentType: String(contentType), type: "image", key });
  res.json({ status: "ok", uploadUrl: up.uploadUrl, url: up.url, key: up.key });
});

// Registra no acervo uma foto já enviada ao B2.
router.post("/media/register", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  if (!(await partnerMediaReady())) {
    res.status(503).json({ status: "media_not_ready" });
    return;
  }
  const b = req.body || {};
  const partnerId = Number(b.partnerId);
  if (!partnerId || !b.source || !b.sourceId || !isB2Url(b.url) || (b.urlInstagram && !isB2Url(b.urlInstagram))) {
    res.status(400).json({ status: "error", error: "dados inválidos (url precisa estar no B2)." });
    return;
  }
  try {
    const head = await fetch(b.url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    if (!head.ok || !(head.headers.get("content-type") || "").startsWith("image/")) {
      res.status(422).json({ status: "error", error: "o arquivo não está acessível como imagem no B2." });
      return;
    }
  } catch {
    res.status(422).json({ status: "error", error: "não consegui conferir o arquivo no B2." });
    return;
  }
  const valores = {
    partnerId,
    source: String(b.source),
    sourceId: String(b.sourceId),
    urlArquivo: String(b.url),
    urlInstagram: b.urlInstagram ? String(b.urlInstagram) : null,
    width: Number.isFinite(b.width) ? Number(b.width) : null,
    height: Number.isFinite(b.height) ? Number(b.height) : null,
    sha256: b.sha256 ? String(b.sha256) : null,
    origemUrl: b.origemUrl ? String(b.origemUrl) : null,
    destinoUrl: b.destinoUrl ? String(b.destinoUrl) : null,
    isReel: b.isReel === true,
    tipoMidia: b.tipoMidia ? String(b.tipoMidia) : "instagram_oficial",
    takenAt: b.takenAt ? new Date(b.takenAt) : null,
    cena: b.cena ? String(b.cena).slice(0, 60) : null,
    score: Number.isFinite(b.score) ? Math.max(1, Math.min(10, Number(b.score))) : null,
    nota: b.nota ? String(b.nota).slice(0, 300) : null,
  };
  const [r] = await db.insert(partnerMediaTable).values(valores).onConflictDoNothing().returning();
  if (!r) {
    const [ex] = await db.select().from(partnerMediaTable).where(or(eq(partnerMediaTable.urlArquivo, valores.urlArquivo), and(eq(partnerMediaTable.partnerId, partnerId), eq(partnerMediaTable.source, valores.source), eq(partnerMediaTable.sourceId, valores.sourceId))));
    res.json({ status: "exists", id: ex?.id ?? null });
    return;
  }
  res.status(201).json({ status: "created", id: r.id });
});

// ─── Validação e publicação ─────────────────────────────────────────────
// Valida (e, fora do dry-run, publica) o artigo gerado pelo Claude local, com
// as imagens escolhidas pelo runner (ids do acervo, MELHOR PRIMEIRO: hoje só
// a primeira vai para o Instagram; a ordem já serve para o futuro carrossel).
router.post("/publish", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { runId, partnerId, article, dryRun } = req.body || {};
  const imagens: number[] = Array.isArray(req.body?.imagens) ? req.body.imagens.map(Number) : [];
  const linhas = await carregarCandidatos();
  const linha = linhas.find((l) => l.partner.id === Number(partnerId));
  if (!linha) {
    res.status(404).json({ status: "error", error: "lugar não encontrado" });
    return;
  }
  const { partner, post } = linha;
  const nome = nomeParaConteudo(partner.nomeEstabelecimento, partner.instagramHandle);
  if (!nome || post.status !== "published" || partner.pausado) {
    res.status(422).json({ status: "invalid", erros: ["lugar sem nome limpo, pausado ou matéria não publicada"] });
    return;
  }
  const { corpusFatos, servicoHtml } = montarFatos(partner, post, nome);
  const erros = validarArtigo(article as ArtigoGerado, { nome, corpusFatos, categoria: partner.categoria ?? "" });

  if (dryRun) {
    const qtd = Number(req.body?.imagensCount ?? 0);
    if (qtd < MIN_IMAGENS_DESTAQUE) erros.push(`Imagens insuficientes (${qtd}; mínimo ${MIN_IMAGENS_DESTAQUE}).`);
    if (erros.length) {
      res.status(422).json({ status: "invalid", erros });
      return;
    }
    res.json({ status: "dry_run_ok", partnerId: partner.id, title: (article as ArtigoGerado).title, imagens: qtd });
    return;
  }

  if (!(await engineEnabled())) {
    res.status(403).json({ status: "disabled" });
    return;
  }
  const unicos = [...new Set(imagens)].slice(0, MAX_IMAGENS_DESTAQUE);
  if (unicos.length < MIN_IMAGENS_DESTAQUE) erros.push(`Imagens insuficientes (${unicos.length}; mínimo ${MIN_IMAGENS_DESTAQUE}).`);
  const rows = unicos.length ? await db.select().from(partnerMediaTable).where(and(eq(partnerMediaTable.partnerId, partner.id), inArray(partnerMediaTable.id, unicos))) : [];
  if (rows.length !== unicos.length) erros.push("Há imagens que não pertencem a este lugar ou não existem no acervo.");
  if (erros.length) {
    res.status(422).json({ status: "invalid", erros });
    return;
  }
  const [run] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.id, Number(runId)));
  if (!run || run.status !== "running" || run.runDate !== hojeBRT()) {
    res.status(409).json({ status: "error", error: "execução do dia não está reservada (running)" });
    return;
  }

  // Mantém exatamente a ordem pedida (melhor primeiro).
  const ordenadas = unicos.map((id) => rows.find((r) => r.id === id)!);
  const verificadoEm = new Date().toISOString();
  const mediaItems = ordenadas.map((r) => ({
    kind: "foto" as const,
    urlArquivo: r.urlArquivo,
    urlOrigem: r.origemUrl,
    urlDestino: r.destinoUrl,
    tipo: (r.tipoMidia as MediaItem["tipo"]) || "instagram_oficial",
    verificadoEm,
    isReel: r.isReel,
    // Extras ignorados pelo código atual; já preparam o carrossel futuro.
    urlInstagram: r.urlInstagram ?? r.urlArquivo,
    width: r.width,
    height: r.height,
    partnerMediaId: r.id,
  }));
  const capa = ordenadas[0];

  try {
    const art = article as ArtigoGerado;
    const slug = `${slugify(art.title)}-${Date.now().toString(36)}`;
    // A capa é a melhor foto; as demais entram no corpo, uma por seção.
    const content = renderArtigoComFotos(art, mediaItems.slice(1), servicoHtml, post.slug, post.title, nome);
    const tags = JSON.stringify(
      ["lugares", "turismo", ...(CATEGORIA_TAG_BLOG[partner.categoria ?? ""] ? [CATEGORIA_TAG_BLOG[partner.categoria ?? ""]] : [])].filter((v, i, a) => a.indexOf(v) === i),
    );
    const coverMeta = JSON.stringify({
      tipo: capa.tipoMidia, urlOrigem: capa.origemUrl, urlDestino: capa.destinoUrl,
      credito: capa.tipoMidia === "instagram_oficial" ? `Foto: Instagram oficial de ${nome}` : `Foto: ${nome}`,
      verificadoEm, embed: false,
    });
    const resultado = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(postsTable)
        .values({
          title: art.title,
          subtitle: art.subtitle ?? null,
          slug,
          excerpt: art.excerpt ?? art.subtitle ?? null,
          content,
          coverImage: capa.urlArquivo,
          coverImageMeta: coverMeta,
          mediaItems: JSON.stringify(mediaItems),
          tags,
          status: "published",
          metaDescription: art.metaDescription ?? null,
          displayOrder: Math.floor(Date.now() / 1000),
        })
        .returning();
      await tx
        .update(instagramPartnersTable)
        .set({ ultimoUsoInstagramEm: new Date(), usosInstagram: sql`${instagramPartnersTable.usosInstagram} + 1` })
        .where(eq(instagramPartnersTable.id, partner.id));
      await tx
        .update(partnerMediaTable)
        .set({ usedCount: sql`${partnerMediaTable.usedCount} + 1`, lastUsedAt: new Date() })
        .where(inArray(partnerMediaTable.id, unicos));
      await tx
        .update(engineRunsTable)
        .set({ status: "published", postId: novo.id, partnerIds: [partner.id], finishedAt: new Date() })
        .where(eq(engineRunsTable.id, run.id));
      return novo;
    });
    logger.info({ postId: resultado.id, partnerId: partner.id, imagens: unicos.length }, "[engine] Destaque publicado");
    res.status(201).json({ status: "published", postId: resultado.id, slug: resultado.slug, imagens: unicos.length });
  } catch (err: any) {
    logger.error({ error: String(err?.message ?? err) }, "[engine] Falha ao publicar destaque");
    res.status(500).json({ status: "error", error: "falha ao gravar" });
  }
});

export default router;
