import { Router, type IRouter } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const router: IRouter = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_IMAGE = /jpeg|jpg|png|gif|webp|svg/;
const ALLOWED_VIDEO = /mp4|webm|mov|avi|mkv|m4v/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB (vídeos pequenos)
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase().split(".").pop() || "";
    const isImage = ALLOWED_IMAGE.test(ext) && /^image\//.test(file.mimetype);
    const isVideo = ALLOWED_VIDEO.test(ext) && /^video\//.test(file.mimetype);
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não suportado. Use imagens (JPG, PNG, WEBP) ou vídeos (MP4, WEBM, MOV)."));
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

router.post("/media/upload", upload.array("file", 10), async (req, res): Promise<void> => {
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
