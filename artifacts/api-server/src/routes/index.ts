import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import postsRouter from "./posts";
import mediaRouter from "./media";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(postsRouter);
router.use(mediaRouter);
router.use(aiRouter);

router.use((_req, res) => {
  res.status(404).json({ status: "error", message: "this route doesn't exist" });
});

export default router;
