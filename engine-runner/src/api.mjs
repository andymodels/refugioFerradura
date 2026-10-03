import { API_BASE, getSecret } from "./config.mjs";

// Fila do Instagram vive em /cron/instagram-queue (irmã de /cron/engine).
const API_RAIZ = API_BASE.replace(/\/engine$/, "");

let secret = null;

export async function api(path, body, method) {
  secret = secret || getSecret();
  const m = method || (body === undefined ? "GET" : "POST");
  const res = await fetch(`${API_BASE}${path}`, {
    method: m,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, ...json };
}

export async function apiFila(path, body, method) {
  secret = secret || getSecret();
  const m = method || (body === undefined ? "GET" : "POST");
  const res = await fetch(`${API_RAIZ}/instagram-queue${path}`, {
    method: m,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const json = await res.json().catch(() => ({}));
  return { http: res.status, ...json };
}
