import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import postsRouter from "./posts";
import mediaRouter from "./media";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(postsRouter);
router.use(mediaRouter);

// Loaded lazily: pulls in jsdom, which fails to import eagerly in the
// Vercel serverless bundle. Deferring the import keeps that failure
// scoped to actual /api/ai requests instead of crashing every route.
const lazyAiRouter: RequestHandler = async (req, res, next) => {
  const { default: aiRouter } = await import("./ai");
  aiRouter(req, res, next);
};
router.use("/ai", lazyAiRouter);

router.use(settingsRouter);

router.use((_req, res) => {
  res.status(404).json({ status: "error", message: "this route doesn't exist" });
});

export default router;
