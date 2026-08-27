import { Router, type IRouter } from "express";
import multer from "multer";
import { extractFeaturedMedia } from "../lib/article-generation";
import { archiveApprovedMedia } from "../lib/media-library";
import { fetchInstagramMedia } from "../lib/instagram-media";
import { backfillMissingVideoPosters, captureRemoteVideoFrame, createDirectUpload, deleteMediaObject, listMediaObjects, uploadMediaBuffer } from "../lib/b2-storage";

const router: IRouter = Router();

const ALLOWED_IMAGE = /jpeg|jpg|png|gif|webp|svg|heic|heif/;
const ALLOWED_VIDEO = /mp4|webm|mov|avi|mkv|m4v/;

// A Vercel rejeita o corpo da requisição acima de ~4,5MB antes mesmo dela
// chegar aqui (limite fixo da plataforma pra funções serverless Node.js,
// não configurável por código) — testado empiricamente: 4MB passa, 4,5MB
// já volta FUNCTION_PAYLOAD_TOO_LARGE. Configurar o multer pra 100MB só
// engana quem lê o código; o teto real é este. Não afeta vídeos inseridos
// por link (Cloudinary, YouTube, MP4 direto) — só upload de arquivo.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split(".").pop() || "";
    // HEIC/HEIF (padrão de foto do iPhone) vem com o mimetype inconsistente
    // dependendo do navegador/SO — às vezes image/heic, às vezes vazio ou
    // application/octet-stream. Confia na extensão nesse caso específico.
    const isHeic = /^(heic|heif)$/.test(ext);
    const isImage = ALLOWED_IMAGE.test(ext) && (isHeic || /^image\//.test(file.mimetype));
    const isVideo = ALLOWED_VIDEO.test(ext) && /^video\//.test(file.mimetype);
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não suportado. Use imagens (JPG, PNG, WEBP, HEIC) ou vídeos (MP4, WEBM, MOV)."));
    }
  },
});

function isVideoFile(file: Express.Multer.File) {
  return /^video\//.test(file.mimetype);
}

export async function uploadToMediaStorage(
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "video",
  filename = `${Date.now()}.${resourceType === "video" ? "mp4" : "jpg"}`,
  contentType = resourceType === "video" ? "video/mp4" : "image/jpeg",
): Promise<{ url: string; type: string }> {
  const result = await uploadMediaBuffer({ body: buffer, folder, type: resourceType, filename, contentType });
  return { url: result.url, type: result.type };
}

router.get("/media/list", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    res.json({ images: await listMediaObjects() });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao listar mídia: " + e.message });
  }
});

// Gera uma assinatura de upload direto pro Cloudinary. Não recebe nem
// encaminha o arquivo — o navegador usa isso pra subir direto pro Cloudinary
// sem passar pela função serverless da Vercel, que corta qualquer corpo de
// requisição acima de ~4,5MB (ver MAX_UPLOAD_BYTES acima). Mantém a rota
// /media/upload existente intacta como caminho alternativo.
router.get("/media/upload-url", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const filename = typeof req.query.filename === "string" ? req.query.filename : "arquivo";
  const contentType = typeof req.query.contentType === "string" ? req.query.contentType : "application/octet-stream";
  const type = contentType.startsWith("video/") ? "video" : "image";
  const posterFor = typeof req.query.posterFor === "string" ? req.query.posterFor : null;
  if (posterFor && (!posterFor.startsWith("refugio-da-ferradura/") || !/\.(mp4|webm|mov|m4v)$/i.test(posterFor))) {
    res.status(400).json({ error: "Vídeo de origem inválido para o preview." });
    return;
  }
  try {
    res.json(await createDirectUpload({
      filename,
      contentType,
      type,
      key: posterFor ? `${posterFor}.poster.jpg` : undefined,
    }));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao preparar upload no B2: " + e.message });
  }
});

// Tira um frame de um vídeo (de qualquer URL) num instante escolhido e
// devolve a imagem já salva no B2 — usado pelo "Definir capa" do editor.
// Roda no servidor (não no navegador) porque o domínio que serve os vídeos
// não libera CORS pra leitura de pixel entre sites, então o navegador nunca
// conseguiria capturar o frame sozinho, mesmo o vídeo tocando normalmente.
router.post("/media/video-frame", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const sourceUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  const time = typeof req.body?.time === "number" && Number.isFinite(req.body.time) ? req.body.time : 0.6;
  try {
    new URL(sourceUrl);
  } catch {
    res.status(400).json({ error: "URL de vídeo inválida." });
    return;
  }
  try {
    const url = await captureRemoteVideoFrame(sourceUrl, time);
    if (!url) {
      res.status(422).json({ error: "Não consegui capturar um frame desse vídeo." });
      return;
    }
    res.json({ url });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao capturar o frame: " + e.message });
  }
});

// Conserta de uma vez os vídeos publicados antes de o site gerar miniatura
// sozinho: varre o armazenamento (B2) inteiro e cria a miniatura que estiver
// faltando. Não mexe no texto de nenhum post — só cria o arquivo de imagem
// ao lado do vídeo; a página do post já sabe achar essa imagem sozinha.
// Processa em lotes pequenos (o botão "Consertar vídeos antigos" no painel
// chama isso repetidas vezes até `done` vir true) pra nunca estourar o
// tempo de uma função serverless.
router.post("/media/backfill-video-posters", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const limit = typeof req.body?.limit === "number" && req.body.limit > 0 ? Math.min(req.body.limit, 20) : 5;
  const startAfter = typeof req.body?.startAfter === "string" ? req.body.startAfter : undefined;
  try {
    const result = await backfillMissingVideoPosters({ limit, startAfter });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao consertar miniaturas: " + e.message });
  }
});

router.post("/media/upload", (req, res, next) => {
  // Checa a sessão ANTES do multer processar o arquivo — sem isso qualquer
  // pessoa (sem estar logada) conseguia subir arquivo pro Cloudinary do site,
  // sem limite de uso.
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  next();
}, upload.array("file", 10), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "Nenhum arquivo enviado" });
    return;
  }

  try {
    const results = await Promise.all(
      files.map(async (file) => {
        const resourceType = isVideoFile(file) ? "video" : "image";
        const { url, type } = await uploadToMediaStorage(
          file.buffer,
          "refugio-da-ferradura",
          resourceType,
          file.originalname,
          file.mimetype,
        );
        return { url, filename: url.split("/").pop() || file.originalname, type };
      })
    );
    res.json({ images: results, ...results[0] });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao enviar para o B2: " + e.message });
  }
});

// Arquiva uma publicação ou Reel no acervo do próprio Refúgio. O post usa a
// URL do Cloudinary, não o cartão incorporado do Instagram.
router.post("/media/import-instagram", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const sourceUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    res.status(400).json({ error: "Cole uma URL válida de publicação ou Reel do Instagram." });
    return;
  }

  const isInstagram = /(^|\.)instagram\.com$/i.test(parsed.hostname);
  const isPublication = /^\/(p|reel|tv)\/[\w-]+/i.test(parsed.pathname);
  if (!isInstagram || !isPublication) {
    res.status(400).json({ error: "Use o link de um post ou Reel do Instagram (instagram.com/p/... ou instagram.com/reel/...)." });
    return;
  }

  const code = parsed.pathname.split("/").filter(Boolean).at(-1) || "instagram";

  try {
    // Método principal: consulta a mesma API interna que o app do Instagram
    // usa pra exibir o post — devolve o vídeo real (não uma capa estática) e
    // a foto na resolução original (não o recorte quadrado de preview), sem
    // exigir login. Ver lib/instagram-media.ts pro porquê disso ser
    // necessário em vez de ler as meta tags og:image/og:video da página.
    const media = await fetchInstagramMedia(sourceUrl).catch(() => null);
    const chosen = media?.items?.[0];

    if (chosen) {
      const url = await archiveApprovedMedia(chosen.url, `instagram-${code}-${Date.now()}`, 0, chosen.type);
      res.json({ url, filename: `${code}.${chosen.type === "video" ? "mp4" : "jpg"}`, type: chosen.type, sourceUrl });
      return;
    }

    // Fallback: se a API interna do Instagram mudar ou bloquear, tenta pelas
    // meta tags og:image/og:video da página. Nunca usa a capa/thumbnail de
    // um vídeo como se fosse a publicação — melhor avisar e pedir upload
    // manual do que arquivar silenciosamente a mídia errada. A publicação é
    // um vídeo de verdade quando a própria URL canônica do Instagram
    // (og:url) aponta pra /reel/ — não dá pra confiar na URL que a pessoa
    // colou, já que o Instagram aceita /p/ e /reel/ como sinônimos pro mesmo
    // conteúdo.
    const fallback = await extractFeaturedMedia(sourceUrl);
    const canonicalIsReel = /\/reel\//i.test(fallback.canonicalUrl || "");

    if (canonicalIsReel && !fallback.videoUrl) {
      res.status(422).json({
        error: "Não consegui extrair o vídeo deste Reel agora (o Instagram bloqueou o acesso). Tente novamente em alguns minutos ou envie o arquivo de vídeo manualmente pelo botão de upload.",
      });
      return;
    }

    const fallbackUrl = fallback.videoUrl || fallback.imageUrl;
    const fallbackType: "image" | "video" = fallback.videoUrl ? "video" : "image";
    if (!fallbackUrl) {
      res.status(422).json({ error: "O Instagram não liberou o arquivo desta publicação agora. Tente novamente em alguns minutos ou envie o arquivo manualmente." });
      return;
    }

    const url = await archiveApprovedMedia(fallbackUrl, `instagram-${code}-${Date.now()}`, 0, fallbackType);
    res.json({ url, filename: `${code}.${fallbackType === "video" ? "mp4" : "jpg"}`, type: fallbackType, sourceUrl });
  } catch (e: any) {
    res.status(502).json({ error: "Não foi possível arquivar esta mídia do Instagram: " + (e?.message || "erro desconhecido") });
  }
});

router.delete("/media", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const publicId: string | undefined = req.body?.publicId;
  if (!publicId) {
    res.status(400).json({ error: "publicId obrigatório" });
    return;
  }

  try {
    await deleteMediaObject(publicId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir: " + e.message });
  }
});

export default router;
