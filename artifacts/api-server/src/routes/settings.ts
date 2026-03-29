import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  hero_image_url: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=85&auto=format&fit=crop",
  hero_overlay_opacity: "0.4",
  hero_style: "gradient",
};

router.get("/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable);
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json({ settings });
});

router.put("/settings", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const { settings } = req.body as { settings: Record<string, string> };
  if (!settings || typeof settings !== "object") {
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  const allowed = ["hero_image_url", "hero_overlay_opacity", "hero_style"];
  for (const key of allowed) {
    if (key in settings) {
      const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
      if (existing.length > 0) {
        await db.update(settingsTable).set({ value: settings[key] }).where(eq(settingsTable.key, key));
      } else {
        await db.insert(settingsTable).values({ key, value: settings[key] });
      }
    }
  }

  res.json({ success: true });
});

export default router;
