import { API_BASE, getSecret } from "./config.mjs";

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
