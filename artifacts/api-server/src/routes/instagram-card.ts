import { Router, type IRouter } from "express";
import { db, postsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateInstagramCard } from "../lib/instagram-card";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Gera a imagem do card do feed do Instagram na hora (site + manchete por
// cima da foto) — chamada diretamente pelos servidores do Instagram quando
// publishPostToInstagram manda essa URL como image_url, então precisa ficar
// pública (sem autenticação) e devolver a imagem, nunca JSON de erro.
router.get("/instagram/card/:postId", async (req, res): Promise<void> => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId)) {
    res.status(400).send("ID inválido");
    return;
  }

  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
  if (!post || post.status !== "published") {
    res.status(404).send("Post não encontrado");
    return;
  }

  // A foto pode vir do próprio publishPostToInstagram (primeira mídia
  // confiável do corpo do post) via query string — sem isso, cai pra capa.
  const imageUrl = typeof req.query.src === "string" && req.query.src ? req.query.src : post.coverImage;
  if (!imageUrl) {
    res.status(404).send("Post sem imagem");
    return;
  }

  const colonIndex = post.title.indexOf(":");
  const headlineBold = colonIndex > 0 ? post.title.slice(0, colonIndex).trim() : "";
  const headlineRest = colonIndex > 0 ? post.title.slice(colonIndex + 1).trim() : post.title;

  try {
    const jpeg = await generateInstagramCard({
      imageUrl,
      siteLabel: "refugioferradura.com.br",
      headlineBold,
      headlineRest,
    });
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(jpeg);
  } catch (err) {
    logger.error({ postId, error: String((err as Error)?.message ?? err) }, "Falha ao gerar card do Instagram");
    res.status(500).send("Falha ao gerar imagem");
  }
});

export default router;
