import { Router, type IRouter } from "express";
import { db, instagramPartnersTable, radarFindingsTable } from "@workspace/db";
import { desc, isNotNull, sql } from "drizzle-orm";
import { runRadarScan } from "../lib/radar";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Painel somente de leitura: mostra só as novidades já registradas pelo
// Radar, sem criar rascunhos, publicar posts ou alterar a fila de parceiros.
router.get("/radar/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [novidades, [{ count: parceirosMonitorados }]] = await Promise.all([
    db
      .select()
      .from(radarFindingsTable)
      .orderBy(desc(radarFindingsTable.encontradoEm))
      .limit(60),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(instagramPartnersTable)
      .where(isNotNull(instagramPartnersTable.instagramHandle)),
  ]);

  res.json({ novidades, parceirosMonitorados, atualizadoEm: new Date().toISOString() });
});

// Dispara a varredura na hora, a pedido do admin (botão "Atualizar agora").
// Mesma lógica da rotina diária — só descoberta, nunca publica nada sozinho.
router.post("/radar/admin/scan", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const result = await runRadarScan({ incluirNoticias: req.body?.incluirNoticias !== false });
    res.json({ status: "ok", ...result });
  } catch (err) {
    logger.error({ err }, "[radar] Falha na varredura manual");
    res.status(500).json({ status: "error", error: "Falha ao rodar a varredura." });
  }
});

export default router;
