import { Router, type IRouter } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import { extractFeaturedMedia } from "../lib/article-generation";
import { archiveApprovedMedia } from "../lib/media-library";
import { fetchInstagramMedia } from "../lib/instagram-media";

const router: IRouter = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

export function uploadToCloudinary(buffer: Buffer, folder: string, resourceType: "image" | "video"): Promise<{ url: string; type: string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({ url: result.secure_url, type: resourceType });
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

router.get("/media/list", async (req, res): Promise<void> => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    const [imageResult, videoResult] = await Promise.all([
      cloudinary.search
        .expression("folder:refugio-da-ferradura AND resource_type:image")
        .sort_by("created_at", "desc")
        .max_results(50)
        .execute()
        .catch(() => ({ resources: [] })),
      cloudinary.search
        .expression("folder:refugio-da-ferradura AND resource_type:video")
        .sort_by("created_at", "desc")
        .max_results(20)
        .execute()
        .catch(() => ({ resources: [] })),
    ]);

    const images = (imageResult.resources as any[]).map((r) => ({
      url: r.secure_url,
      filename: r.public_id.split("/").pop(),
      publicId: r.public_id,
      createdAt: r.created_at,
      type: "image",
    }));
    const videos = (videoResult.resources as any[]).map((r) => ({
      url: r.secure_url,
      filename: r.public_id.split("/").pop(),
      publicId: r.public_id,
      createdAt: r.created_at,
      type: "video",
    }));

    const all = [...images, ...videos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ images: all });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao listar mídia: " + e.message });
  }
});

// Gera uma assinatura de upload direto pro Cloudinary. Não recebe nem
// encaminha o arquivo — o navegador usa isso pra subir direto pro Cloudinary
// sem passar pela função serverless da Vercel, que corta qualquer corpo de
// requisição acima de ~4,5MB (ver MAX_UPLOAD_BYTES acima). Mantém a rota
// /media/upload existente intacta como caminho alternativo.
router.get("/media/upload-signature", (req, res): void => {
  const session = (req as any).session;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "refugio-da-ferradura";
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET as string
  );
  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
  });
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
        const { url, type } = await uploadToCloudinary(file.buffer, "refugio-da-ferradura", resourceType);
        return { url, filename: url.split("/").pop() || file.originalname, type };
      })
    );
    res.json({ images: results, ...results[0] });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao enviar para Cloudinary: " + e.message });
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

  // Try deleting as image first, then as video
  try {
    const imageResult = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    if (imageResult.result === "ok") {
      res.json({ ok: true });
      return;
    }
  } catch {}

  try {
    const videoResult = await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
    if (videoResult.result === "ok") {
      res.json({ ok: true });
      return;
    }
    res.status(404).json({ error: "Arquivo não encontrado no Cloudinary" });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir: " + e.message });
  }
});

export default router;
