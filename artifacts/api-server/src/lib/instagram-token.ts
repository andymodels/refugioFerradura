import crypto from "crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Token do Instagram oficial. A Meta vence o token em ~60 dias; a rota de
// renovação (routes/instagram-token.ts) gera um novo e guarda aqui, em
// settings. Regra: o token do banco só vale enquanto o token da variável de
// ambiente for AQUELE que existia na renovação. Se alguém colar um token novo
// na Vercel, o da variável (mais novo) passa a valer sozinho.
const K_TOKEN = "instagram_access_token";
const K_ENV_HASH = "instagram_token_env_hash";
export const K_RENOVADO = "instagram_token_renovado_em";
export const K_EXPIRA = "instagram_token_expira_em";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function lerSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

export async function gravarSetting(key: string, value: string): Promise<void> {
  await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

export async function getInstagramToken(): Promise<{ token: string | undefined; origem: "banco" | "ambiente" | "nenhuma" }> {
  const env = process.env.INSTAGRAM_ACCESS_TOKEN;
  try {
    const salvo = await lerSetting(K_TOKEN);
    if (salvo) {
      const hashEnv = await lerSetting(K_ENV_HASH);
      if (!env || hashEnv === sha(env)) return { token: salvo, origem: "banco" };
    }
  } catch {
    // banco indisponível: cai para a variável de ambiente
  }
  return env ? { token: env, origem: "ambiente" } : { token: undefined, origem: "nenhuma" };
}

export async function guardarTokenRenovado(novo: string, expiraEmSegundos: number): Promise<{ expiraEm: string }> {
  const env = process.env.INSTAGRAM_ACCESS_TOKEN;
  const expiraEm = new Date(Date.now() + expiraEmSegundos * 1000).toISOString();
  await gravarSetting(K_TOKEN, novo);
  await gravarSetting(K_ENV_HASH, env ? sha(env) : "");
  await gravarSetting(K_RENOVADO, new Date().toISOString());
  await gravarSetting(K_EXPIRA, expiraEm);
  return { expiraEm };
}
