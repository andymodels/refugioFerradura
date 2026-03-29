import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AdminLoginBody, AdminLoginResponse, GetMeResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username));

  if (!admin) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Credenciais inválidas" });
    return;
  }

  (req.session as any).adminId = admin.id;
  (req.session as any).adminUsername = admin.username;

  res.json(AdminLoginResponse.parse({ success: true, user: { id: admin.id, username: admin.username } }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session?.destroy?.(() => {});
  res.json({ success: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const session = req.session as any;
  if (!session?.adminId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  res.json(GetMeResponse.parse({ id: session.adminId, username: session.adminUsername }));
});

export default router;
