import { chromium } from "playwright-core";
import { IG_MAX_IDADE_DIAS, IG_PAUSA_MS } from "./config.mjs";

// ─── Descoberta: lê a grade pública do perfil oficial, sem login ─────────────
// Mesma ideia do caso da N9VE (JavaScript sobre a grade renderizada), mas num
// Chrome automatizado. Só posts do próprio perfil (o caminho do link começa
// por /<handle>/); posts de outras contas (marcações) são ignorados.

const MESES = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5, July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };

function dataDoAlt(alt) {
  const m = (alt || "").match(/ on ([A-Z][a-z]+) (\d{2}), (\d{4})/);
  return m && m[1] in MESES ? new Date(Date.UTC(+m[3], MESES[m[1]], +m[2])) : null;
}

export async function abrirNavegador() {
  return chromium.launch({ channel: "chrome", headless: true });
}

// Sessão de um perfil: mantém a página aberta para ampliar a busca aos poucos
// (12 -> 20 -> 30 posts) sem recarregar.
export async function abrirPerfil(browser, handle) {
  const ctx = await browser.newContext({ locale: "pt-BR", viewport: { width: 1280, height: 1400 } }); // sem cookies = sem login
  const page = await ctx.newPage();
  const resp = await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.keyboard.press("Escape").catch(() => {});
  const bloqueado = /accounts\/login/.test(page.url()) || (await page.locator('input[name="username"]').count()) > 0;
  const prefixo = `/${handle.toLowerCase()}/`;

  async function ler() {
    const itens = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].map((a) => ({
        href: a.href, alt: a.querySelector("img")?.alt || "",
      })));
    const vistos = new Set();
    const out = [];
    for (const it of itens) {
      const u = new URL(it.href);
      if (!u.pathname.toLowerCase().startsWith(prefixo)) continue;
      const partes = u.pathname.split("/").filter(Boolean); // [handle, p|reel, codigo]
      const codigo = partes[2];
      if (!codigo || vistos.has(codigo)) continue;
      vistos.add(codigo);
      const data = dataDoAlt(it.alt);
      out.push({
        codigo, permalink: `https://www.instagram.com/${partes[0]}/${partes[1]}/${codigo}/`,
        tipo: partes[1] === "reel" ? "reel" : "post", data,
      });
    }
    return out;
  }

  return {
    http: resp?.status(), bloqueado,
    // Devolve até `limite` posts próprios e recentes (mais novos primeiro).
    async posts(limite) {
      if (bloqueado) return [];
      let atual = await ler();
      let semCrescer = 0;
      for (let i = 0; i < 12 && atual.length < limite && semCrescer < 3; i++) {
        await page.mouse.wheel(0, 1100);
        await page.waitForTimeout(1500);
        const novo = await ler();
        semCrescer = novo.length > atual.length ? 0 : semCrescer + 1;
        atual = novo;
      }
      const corte = Date.now() - IG_MAX_IDADE_DIAS * 86400000;
      return atual
        .filter((p) => !p.data || p.data.getTime() >= corte)
        .sort((a, b) => (b.data?.getTime() || 0) - (a.data?.getTime() || 0))
        .slice(0, limite);
    },
    async fechar() { await ctx.close(); },
  };
}

// ─── Mídia de um post: resolução original (foto) ou MP4 (Reel) ──────────────
// Mesma consulta pública que o servidor já usa (instagram-media.ts), sem login.
const IG_APP_ID = "936619743392459";
const IG_DOC_ID = "27128499623469141";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

async function bootstrapCsrf() {
  const res = await fetch("https://www.instagram.com/", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const csrf = set.map((c) => c.match(/^csrftoken=([^;]+)/)?.[1]).find(Boolean);
  if (!csrf) throw new Error("sem csrftoken");
  const cookie = set.map((c) => c.split(";")[0]).filter((p) => /^(csrftoken|mid|ig_did)=/.test(p)).join("; ");
  return { csrf, cookie };
}

function melhorImagem(no) {
  const c = no?.image_versions2?.candidates;
  if (!c?.length) return null;
  const b = c.reduce((x, y) => (x.width * x.height >= y.width * y.height ? x : y));
  return { type: "image", url: b.url, width: b.width, height: b.height };
}
function videoProgressivo(no) {
  const v = no?.video_versions;
  return v?.length ? { type: "video", url: v[0].url, width: v[0].width, height: v[0].height } : null;
}

export async function midiaDoPost(permalink) {
  const codigo = new URL(permalink).pathname.split("/").filter(Boolean)[2];
  const { csrf, cookie } = await bootstrapCsrf();
  const body = new URLSearchParams({
    doc_id: IG_DOC_ID,
    variables: JSON.stringify({ shortcode: codigo, __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false }),
  });
  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.8", Accept: "*/*", "Content-Type": "application/x-www-form-urlencoded", "x-ig-app-id": IG_APP_ID, "x-csrftoken": csrf, Origin: "https://www.instagram.com", Referer: "https://www.instagram.com/", Cookie: cookie },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const item = json?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  if (!item) return null;
  const legenda = item.caption?.text || "";
  const takenAt = item.taken_at ? new Date(item.taken_at * 1000) : null;
  const nos = Array.isArray(item.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
  const itens = nos.map((n) => videoProgressivo(n) || melhorImagem(n)).filter(Boolean);
  return itens.length ? { itens, legenda, takenAt } : null;
}

export const pausa = () => new Promise((r) => setTimeout(r, IG_PAUSA_MS));
