import type { IncomingMessage, ServerResponse } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { setupDatabase } from "./db-setup";

let readyPromise: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = setupDatabase().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await ensureReady();
  } catch (err) {
    logger.error({ err }, "Database setup failed, aborting request");
    res.statusCode = 500;
    res.end("Internal Server Error");
    return;
  }
  app(req, res);
}
