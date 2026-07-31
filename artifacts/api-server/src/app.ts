import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgSession = connectPgSimple(session);

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigin = process.env.FRONTEND_URL;
app.use(
  cors({
    credentials: true,
    origin: allowedOrigin ?? true,
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET ?? "refugio-ferradura-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "lax" : false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// A Vercel injeta Cache-Control/ETag por padrão nas respostas das funções
// serverless, mesmo pra rotas dinâmicas como esta API. Isso deixa brecha pra
// navegador/CDN reaproveitar uma resposta antiga em vez de buscar os dados
// atuais — exatamente o sintoma de "salvei no admin, mas ao recarregar volta
// o conteúdo antigo". Nenhuma resposta da API deve ser cacheada.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", router);

if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const staticDir = path.join(
    process.cwd(),
    "artifacts/refugio-da-ferradura/dist/public",
  );
  app.use(express.static(staticDir));
  app.use((_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
