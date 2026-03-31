import { Router, type IRouter } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { UploadMediaResponse } from "@workspace/api-zod";
import streamifier from "streamifier";

const router: IRouter = Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowedTypes.test(file.originalname.toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Somente imagens são permitidas"));
    }
  },
});

function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve(result.secure_url);
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
    const result = await cloudinary.search
      .expression("folder:refugio-da-ferradura")
      .sort_by("created_at", "desc")
      .max_results(60)
      .execute();
    const images = result.resources.map((r: any) => ({
      url: r.secure_url,
      filename: r.public_id.split("/").pop(),
      createdAt: r.created_at,
    }));
    res.json({ images });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao listar imagens: " + e.message });
  }
});

router.post("/media/upload", upload.array("file", 20), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).json({ error: "Nenhum arquivo enviado" });
    return;
  }

  try {
    const results = await Promise.all(
      files.map(async (file) => {
        const url = await uploadToCloudinary(file.buffer, "refugio-da-ferradura");
        return { url, filename: url.split("/").pop() || file.originalname };
      })
    );
    res.json({ images: results, ...results[0] });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao enviar para Cloudinary: " + e.message });
  }
});

export default router;
