import { Router, type IRouter } from "express";
import multer from "multer";
import { db, postsTable } from "@workspace/db";
import {
  generateArticle,
  extractArticleContent,
  extractImagesFromSource,
  generateFromText,
  interleaveImages,
  slugify,
  type ExtractionFailure,
  type MediaItem,
} from "../lib/article-generation";
import { vetAndArchiveFoundImages } from "../lib/media-pipeline";
import { uploadToCloudinary } from "./media";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas imagens são aceitas para anexo."));
  },
});

router.post("/generate-from-url", async (req, res) => {
  const input: string = (req.body.url || "").trim();
  const extraInstructions: string = (req.body.instructions || "").trim();

  try {
    const article = await generateArticle(input, extraInstructions || undefined);
    res.json(article);
  } catch (e: any) {
    if (typeof e?.blocked === "boolean") {
      const failure = e as ExtractionFailure;
      res.status(422).json({ error: failure.message, blocked: failure.blocked });
      return;
    }
    res.status(500).json({ error: "Erro na geração com IA: " + e.message });
  }
});

// Cola um link + (opcionalmente) fotos próprias e já cria o post como rascunho,
// sem passar pela etapa de revisar os campos antes de salvar.
router.post("/generate-and-create", upload.array("photos", 10), async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const url: string = (req.body.url || "").trim();
  const instructions: string = (req.body.instructions || "").trim();
  const files = (req.files as Express.Multer.File[]) || [];

  if (!url.startsWith("http")) {
    res.status(400).json({ error: "Informe uma URL de artigo válida." });
    return;
  }

  try {
    const extraction = await extractArticleContent(url);
    if (extraction.isImage || extraction.text.length < 50) {
      res.status(422).json({
        error: extraction.blocked
          ? "Este site usa proteção contra leitura automática. Abra o artigo no navegador, copie o texto e use o campo de texto colado em vez do link."
          : "Não foi possível extrair conteúdo suficiente do link.",
        blocked: extraction.blocked,
      });
      return;
    }

    const article = await generateFromText(extraction.text, instructions || undefined);

    if (article.error || !article.title || !article.content) {
      res.status(422).json({ error: article.message || "Conteúdo fora do escopo da Rota da Ferradura." });
      return;
    }

    // Fotos que o próprio admin escolheu e enviou não passam por vetting —
    // ele já decidiu que servem. Fotos raspadas da página-fonte, sim (mesma
    // regra de qualquer outro pipeline automático: nunca hotlink, nunca
    // flyer/logo/texto-sobreposto/selfie sem revisão visual).
    const slug = `${slugify(article.title)}-${Date.now().toString(36)}`;
    const verificadoEm = new Date().toISOString();
    const uploadedItems: MediaItem[] = (
      await Promise.all(files.map((file) => uploadToCloudinary(file.buffer, "refugio-da-ferradura", "image")))
    ).map((p) => ({
      kind: "foto",
      urlArquivo: p.url,
      urlOrigem: null,
      urlDestino: null,
      tipo: "licenciada",
      verificadoEm,
      isReel: false,
    }));

    const sourceImages = await extractImagesFromSource(url);
    const vettedSourceItems = await vetAndArchiveFoundImages(article.title || url, sourceImages, slug);

    const images: MediaItem[] = [...uploadedItems, ...vettedSourceItems];

    const finalContent = interleaveImages(article.content, images);

    const [post] = await db
      .insert(postsTable)
      .values({
        title: article.title,
        subtitle: article.subtitle ?? null,
        slug,
        excerpt: article.excerpt ?? null,
        content: finalContent,
        coverImage: images[0]?.urlArquivo ?? null,
        coverImageDisplayMode: "natural",
        mediaItems: images.length > 0 ? JSON.stringify(images) : null,
        tags: JSON.stringify(article.tags ?? []),
        status: "draft",
        metaDescription: article.metaDescription ?? null,
      })
      .returning();

    res.status(201).json(post);
  } catch (e: any) {
    if (typeof e?.blocked === "boolean") {
      const failure = e as ExtractionFailure;
      res.status(422).json({ error: failure.message, blocked: failure.blocked });
      return;
    }
    res.status(500).json({ error: "Erro ao gerar e criar o post: " + e.message });
  }
});

export default router;
