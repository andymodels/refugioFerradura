import crypto from "crypto";

const GRAPH_API_VERSION = "v21.0";

// state assinado (partnerId.assinatura) — impede que alguém troque o id do
// parceiro no link antes de abrir, sem precisar de sessão nem de banco pra
// validar o callback.
function signState(partnerId: number): string {
  const secret = process.env.PARTNER_OAUTH_STATE_SECRET;
  if (!secret) throw new Error("PARTNER_OAUTH_STATE_SECRET não configurado.");
  const sig = crypto.createHmac("sha256", secret).update(String(partnerId)).digest("hex").slice(0, 16);
  return `${partnerId}.${sig}`;
}

export function verifyState(state: string): number | null {
  const secret = process.env.PARTNER_OAUTH_STATE_SECRET;
  if (!secret) return null;
  const [idPart, sig] = state.split(".");
  if (!idPart || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(idPart).digest("hex").slice(0, 16);
  if (sig !== expected) return null;
  const partnerId = Number(idPart);
  return Number.isInteger(partnerId) ? partnerId : null;
}

function getRedirectUri(): string {
  const base = process.env.FRONTEND_URL || "https://refugioferradura.com.br";
  return `${base.replace(/\/+$/, "")}/api/partners/connect/callback`;
}

// Link que o admin manda pro parceiro — abre a tela de autorização do
// próprio Instagram do parceiro (login dele, conta dele, uma vez só).
export function buildPartnerConnectUrl(partnerId: number): string {
  const appId = process.env.INSTAGRAM_APP_ID;
  if (!appId) throw new Error("INSTAGRAM_APP_ID não configurado.");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("response_type", "code");
  // Só leitura básica — não precisamos publicar pela conta do parceiro,
  // só ler o feed/Reels dele pra copiar o conteúdo autorizado pro nosso.
  url.searchParams.set("scope", "instagram_business_basic");
  url.searchParams.set("state", signState(partnerId));
  return url.toString();
}

export interface PartnerConnection {
  igUserId: string;
  igUsername: string | null;
  accessToken: string;
  expiresAt: Date;
}

export async function exchangePartnerCode(code: string): Promise<PartnerConnection> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Instagram OAuth não configurado neste ambiente.");

  const form = new URLSearchParams();
  form.set("client_id", appId);
  form.set("client_secret", appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", getRedirectUri());
  form.set("code", code);

  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const shortData: any = await shortRes.json();
  if (!shortRes.ok || !shortData?.access_token) {
    throw new Error(shortData?.error_message || "Falha ao trocar o código de autorização.");
  }

  const exchangeUrl = new URL(`https://graph.instagram.com/access_token`);
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("access_token", shortData.access_token);
  const longRes = await fetch(exchangeUrl);
  const longData: any = await longRes.json();
  if (!longRes.ok || !longData?.access_token) {
    throw new Error(longData?.error?.message || "Falha ao gerar o token de longa duração.");
  }

  const meUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/me`);
  meUrl.searchParams.set("fields", "id,username");
  meUrl.searchParams.set("access_token", longData.access_token);
  const meRes = await fetch(meUrl);
  const meData: any = await meRes.json();
  if (!meRes.ok || !meData?.id) {
    throw new Error("Não consegui identificar a conta do Instagram conectada.");
  }

  return {
    igUserId: meData.id,
    igUsername: meData.username ?? null,
    accessToken: longData.access_token,
    expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000),
  };
}
