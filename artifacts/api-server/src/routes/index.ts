import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import postsRouter from "./posts";
import mediaRouter from "./media";
import aiRouter from "./ai";
import settingsRouter from "./settings";
import fontesRouter from "./fontes";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(postsRouter);
router.use(mediaRouter);
router.use("/ai", aiRouter);
router.use(settingsRouter);
router.use(fontesRouter);
router.use("/cron", cronRouter);

router.use((_req, res) => {
  res.status(404).json({ status: "error", message: "this route doesn't exist" });
});

export default router;
