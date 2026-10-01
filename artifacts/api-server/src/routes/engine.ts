import { Router, type IRouter } from "express";
import {
  db,
  postsTable,
  instagramPartnersTable,
  engineRunsTable,
  settingsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { slugify } from "../lib/article-generation";
import { logger } from "../lib/logger";
import {
  COOLDOWN_DIAS,
  CATEGORIA_LABEL,
  CATEGORIA_TAG_BLOG,
  nomeParaConteudo,
  montarMidia,
  textoLimpo,
  extrairServicoHtml,
  validarArtigo,
  renderArtigoHtml,
  hojeBRT,
  type ArtigoGerado,
} from "../lib/engine";

// Motor de conteúdo automático (Parte 2). Todas as rotas exigem o mesmo
// CRON_SECRET dos demais crons. Nenhuma publica no Instagram: o post sai no
// blog e o fluxo existente matéria -> Instagram cuida do resto.
const router: IRouter = Router();

const MAX_TENTATIVAS_DIA = 3;
const RUNNING_STALE_MIN = 60;

function autorizado(req: any, res: any): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Não autorizado" });
    return false;
  }
  return true;
}

// Desligado por padrão: só roda de verdade com engine_enabled = "true".
async function engineEnabled(): Promise<boolean> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "engine_enabled"));
  return row?.value === "true";
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

// Escolhe a próxima pauta (destaque individual) — leitura apenas.
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

  const stats = { total: linhas.length, inelegiveis: { pausado: 0, categoria: 0, matera_nao_publicada: 0, nome: 0, sem_midia: 0, cooldown: 0, excluido: 0 } };
  const elegiveis: any[] = [];
  for (const { partner, post } of linhas) {
    if (exclude.includes(partner.id)) { stats.inelegiveis.excluido++; continue; }
    if (partner.pausado) { stats.inelegiveis.pausado++; continue; }
    if (!partner.categoria || partner.categoria === "outra" || partner.categoria === "eventos") { stats.inelegiveis.categoria++; continue; }
    if (post.status !== "published") { stats.inelegiveis.matera_nao_publicada++; continue; }
    const nome = nomeParaConteudo(partner.nomeEstabelecimento, partner.instagramHandle);
    if (!nome) { stats.inelegiveis.nome++; continue; }
    const midia = montarMidia(post);
    if (!midia) { stats.inelegiveis.sem_midia++; continue; }
    if (emCooldown.has(chaveGrupo(partner))) { stats.inelegiveis.cooldown++; continue; }
    elegiveis.push({ partner, post, nome, midia });
  }

  elegiveis.sort((a, b) => {
    // 1) nunca usados primeiro, depois o uso mais antigo
    const ta = a.partner.ultimoUsoInstagramEm ? new Date(a.partner.ultimoUsoInstagramEm).getTime() : 0;
    const tb = b.partner.ultimoUsoInstagramEm ? new Date(b.partner.ultimoUsoInstagramEm).getTime() : 0;
    if (ta !== tb) return ta - tb;
    // 2) menos usos
    if (a.partner.usosInstagram !== b.partner.usosInstagram) return a.partner.usosInstagram - b.partner.usosInstagram;
    // 3) variar a categoria em relação ao último destaque
    const da = a.partner.categoria === ultimoUsado?.categoria ? 1 : 0;
    const db_ = b.partner.categoria === ultimoUsado?.categoria ? 1 : 0;
    if (da !== db_) return da - db_;
    return Math.random() - 0.5;
  });

  return { escolhido: elegiveis[0] ?? null, elegiveis: elegiveis.length, stats };
}

router.get("/status", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const hoje = hojeBRT();
  const [run] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.runDate, hoje));
  res.json({ enabled: await engineEnabled(), hoje, run: run ?? null });
});

// Reserva o dia (atômico via UNIQUE). Só depois de reservar o script procura
// pauta e chama o Claude.
router.post("/claim", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  if (!(await engineEnabled())) {
    res.status(403).json({ status: "disabled", message: "engine_enabled não está ligado." });
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

// Próxima pauta + pacote de fatos e mídia. Só leitura (serve para dry-run).
router.post("/next-topic", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const exclude: number[] = Array.isArray(req.body?.exclude) ? req.body.exclude.map(Number) : [];
  const { escolhido, elegiveis, stats } = await escolherPauta(exclude);
  if (!escolhido) {
    res.json({ status: "no_topic", elegiveis, stats });
    return;
  }
  const { partner, post, nome, midia } = escolhido;
  const { fatos } = montarFatos(partner, post, nome);
  res.json({
    status: "ok",
    kind: "destaque",
    partnerId: partner.id,
    categoria: partner.categoria,
    elegiveis,
    stats,
    fatos,
    midia: { coverImage: midia.coverImage, itens: midia.mediaItems.length },
  });
});

// Valida (e, fora do dry-run, publica) o artigo gerado pelo Claude local.
router.post("/publish", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { runId, partnerId, article, dryRun } = req.body || {};
  const linhas = await carregarCandidatos();
  const linha = linhas.find((l) => l.partner.id === Number(partnerId));
  if (!linha) {
    res.status(404).json({ status: "error", error: "lugar não encontrado" });
    return;
  }
  const { partner, post } = linha;
  const nome = nomeParaConteudo(partner.nomeEstabelecimento, partner.instagramHandle);
  const midia = montarMidia(post);
  if (!nome || !midia || post.status !== "published" || partner.pausado) {
    res.status(422).json({ status: "invalid", erros: ["lugar sem nome limpo, sem mídia B2, pausado ou matéria não publicada"] });
    return;
  }
  const { corpusFatos, servicoHtml } = montarFatos(partner, post, nome);
  const erros = validarArtigo(article as ArtigoGerado, { nome, corpusFatos, categoria: partner.categoria ?? "" });
  if (erros.length) {
    res.status(422).json({ status: "invalid", erros });
    return;
  }

  const art = article as ArtigoGerado;
  const content = renderArtigoHtml(art, servicoHtml, post.slug, post.title);
  const tags = JSON.stringify(["lugares", "turismo", ...(CATEGORIA_TAG_BLOG[partner.categoria ?? ""] ? [CATEGORIA_TAG_BLOG[partner.categoria ?? ""]] : [])].filter((v, i, a) => a.indexOf(v) === i));

  if (dryRun) {
    res.json({ status: "dry_run_ok", partnerId: partner.id, title: art.title, tags: JSON.parse(tags), midia: { coverImage: midia.coverImage, itens: midia.mediaItems.length }, contentPreview: content.slice(0, 1500) });
    return;
  }

  if (!(await engineEnabled())) {
    res.status(403).json({ status: "disabled" });
    return;
  }
  const [run] = await db.select().from(engineRunsTable).where(eq(engineRunsTable.id, Number(runId)));
  if (!run || run.status !== "running" || run.runDate !== hojeBRT()) {
    res.status(409).json({ status: "error", error: "execução do dia não está reservada (running)" });
    return;
  }

  try {
    const slug = `${slugify(art.title)}-${Date.now().toString(36)}`;
    const resultado = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(postsTable)
        .values({
          title: art.title,
          subtitle: art.subtitle ?? null,
          slug,
          excerpt: art.excerpt ?? art.subtitle ?? null,
          content,
          coverImage: midia.coverImage,
          coverImageMeta: midia.coverImageMeta,
          mediaItems: midia.mediaItems.length ? JSON.stringify(midia.mediaItems) : null,
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
        .update(engineRunsTable)
        .set({ status: "published", postId: novo.id, partnerIds: [partner.id], finishedAt: new Date() })
        .where(eq(engineRunsTable.id, run.id));
      return novo;
    });
    logger.info({ postId: resultado.id, partnerId: partner.id }, "[engine] Destaque publicado");
    res.status(201).json({ status: "published", postId: resultado.id, slug: resultado.slug });
  } catch (err: any) {
    logger.error({ error: String(err?.message ?? err) }, "[engine] Falha ao publicar destaque");
    res.status(500).json({ status: "error", error: "falha ao gravar" });
  }
});

export default router;
