import { Router, type IRouter } from "express";
import { db, fontesProcessadasTable, fontesTable, instagramPartnersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

// Painel somente de leitura: reúne o que o blog já encontrou, sem criar
// rascunhos, publicar posts ou alterar a fila de parceiros.
router.get("/radar/admin", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const [novidades, parceiros] = await Promise.all([
    db
      .select({
        id: fontesProcessadasTable.id,
        url: fontesProcessadasTable.url,
        status: fontesProcessadasTable.status,
        detalhe: fontesProcessadasTable.detalhe,
        criadoEm: fontesProcessadasTable.criadoEm,
        fonteNome: fontesTable.nome,
        fonteTipo: fontesTable.tipo,
      })
      .from(fontesProcessadasTable)
      .innerJoin(fontesTable, eq(fontesProcessadasTable.fonteId, fontesTable.id))
      .orderBy(desc(fontesProcessadasTable.criadoEm))
      .limit(100),
    db
      .select({
        id: instagramPartnersTable.id,
        nome: instagramPartnersTable.nomeEstabelecimento,
        handle: instagramPartnersTable.instagramHandle,
        ultimaVerificacao: instagramPartnersTable.ultimoPollEm,
        atualizadoEm: instagramPartnersTable.updatedAt,
      })
      .from(instagramPartnersTable)
      .orderBy(desc(instagramPartnersTable.updatedAt)),
  ]);

  res.json({ novidades, parceiros, atualizadoEm: new Date().toISOString() });
});

export default router;
