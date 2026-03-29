import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

export const DEFAULT_SETTINGS: Record<string, string> = {
  // Hero
  hero_image_url: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=85&auto=format&fit=crop",
  hero_overlay_opacity: "0.4",
  hero_style: "gradient",
  hero_height_vh: "85",
  // Header
  header_style: "transparent",
  header_bg_color: "#0b0f0c",
  header_sticky: "true",
  header_height_px: "100",
  logo_size_px: "80",
  // Footer
  footer_tagline: "Descubra a magia e tranquilidade da Rota da Ferradura em Guarapari, ES. Natureza, gastronomia e paz.",
  footer_address: "Rota da Ferradura, Buenos Aires\nGuarapari - ES",
  footer_copyright: "",
  footer_instagram: "",
  footer_facebook: "",
  // Layout
  section_spacing: "normal",
  // Content Blocks (JSON array)
  home_blocks: "[]",
};

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));

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

  for (const key of Object.keys(settings)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = String(settings[key]);
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length > 0) {
      await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value });
    }
  }

  res.json({ success: true });
});

export default router;
