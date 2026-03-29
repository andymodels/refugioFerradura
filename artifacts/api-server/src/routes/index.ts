import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import postsRouter from "./posts";
import placesRouter from "./places";
import mediaRouter from "./media";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(postsRouter);
router.use(placesRouter);
router.use(mediaRouter);
router.use(aiRouter);

export default router;
