import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { getInstagramToken, guardarTokenRenovado, lerSetting, K_RENOVADO, K_EXPIRA } from "../lib/instagram-token";

// Renovação automática do token do Instagram oficial (chamada pelo GitHub
// Actions duas vezes por mês). Aceita CRON_SECRET (workflow) ou ENGINE_SECRET
// (uso manual). Nunca devolve o token.
const router: IRouter = Router();

function autorizado(req: any, res: any): boolean {
  const h = req.headers.authorization;
  const ok = [process.env.CRON_SECRET, process.env.ENGINE_SECRET].some((s) => s && h === `Bearer ${s}`);
  if (!ok) res.status(401).json({ error: "Não autorizado" });
  return ok;
}

router.get("/refresh", async (req, res): Promise<void> => {
  if (!autorizado(req, res)) return;
  const { token, origem } = await getInstagramToken();
  if (!token) {
    res.status(500).json({ ok: false, erro: "Nenhum token do Instagram configurado." });
    return;
  }
  // dryRun=1: só confere se o token atual é válido e de qual conta.
  if (req.query.dryRun === "1") {
    try {
      const r = await fetch(`https://graph.instagram.com/v21.0/me?fields=username&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
      const d: any = await r.json();
      res.json({ ok: r.ok && !!d?.username, username: d?.username ?? null, origemDoToken: origem, erro: d?.error?.message ?? null, renovadoEm: await lerSetting(K_RENOVADO), expiraEm: await lerSetting(K_EXPIRA) });
    } catch (err: any) {
      res.status(502).json({ ok: false, erro: String(err?.message ?? err).slice(0, 200) });
    }
    return;
  }
  try {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", token);
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const d: any = await r.json();
    if (!r.ok || !d?.access_token) {
      logger.error({ status: r.status, erro: d?.error?.message }, "[instagram-token] Falha ao renovar o token");
      res.status(502).json({ ok: false, erro: d?.error?.message ?? "A Meta não devolveu um token novo." });
      return;
    }
    const { expiraEm } = await guardarTokenRenovado(d.access_token, Number(d.expires_in) || 5184000);
    logger.info({ expiraEm }, "[instagram-token] Token renovado");
    res.json({ ok: true, expiraEm, diasRestantes: Math.round((Number(d.expires_in) || 5184000) / 86400) });
  } catch (err: any) {
    logger.error({ erro: String(err?.message ?? err) }, "[instagram-token] Erro ao renovar o token");
    res.status(502).json({ ok: false, erro: String(err?.message ?? err).slice(0, 200) });
  }
});

export default router;
