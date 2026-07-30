// Extrai a mídia real (foto em resolução original ou vídeo progressivo) de um
// post/Reel público do Instagram, sem precisar de login.
//
// A abordagem anterior (extractFeaturedMedia) lia só as meta tags og:image/
// og:video da página — que o Instagram usa pra gerar o card de preview quando
// alguém cola o link em outro app. Essas tags têm duas limitações estruturais:
// og:image é SEMPRE um recorte quadrado de baixa resolução (Instagram assina a
// URL da imagem, então não dá pra pedir uma versão maior trocando parâmetros
// — a assinatura invalida); og:video praticamente nunca vem preenchido num
// fetch de servidor sem sessão de navegador.
//
// Esta função usa a mesma API GraphQL interna que o app do Instagram consulta
// pra exibir o post (doc_id fixo, descoberto a partir do código-fonte do
// instaloader) — ela devolve todas as resoluções da foto (a maior tem a
// mesma resolução que o Instagram usa no feed) e, pra vídeo, uma URL de MP4
// progressivo (vídeo+áudio já combinados, pronta pra baixar direto, sem
// precisar remuxar). Continua sem exigir login.
const IG_APP_ID = "936619743392459";
const IG_DOC_ID = "27128499623469141";
const IG_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export interface InstagramMediaCandidate {
  type: "image" | "video";
  url: string;
  width: number;
  height: number;
}

export interface InstagramMediaResult {
  // Um item pra post/Reel simples; vários pra carrossel (nessa ordem, igual
  // ao carrossel no app). Quem chama pega o primeiro por padrão (a "capa").
  items: InstagramMediaCandidate[];
  caption?: string;
}

function extractSetCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

async function bootstrapCsrfToken(): Promise<{ csrf: string; cookie: string }> {
  const res = await fetch("https://www.instagram.com/", {
    headers: { "User-Agent": IG_USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  const setCookies = typeof (res.headers as any).getSetCookie === "function"
    ? ((res.headers as any).getSetCookie() as string[])
    : [];
  const csrf = extractSetCookieValue(setCookies, "csrftoken");
  if (!csrf) throw new Error("Não foi possível iniciar sessão com o Instagram (sem csrftoken).");
  const cookiePairs = setCookies
    .map((c) => c.split(";")[0])
    .filter((pair) => /^(csrftoken|mid|ig_did)=/.test(pair));
  return { csrf, cookie: cookiePairs.join("; ") };
}

function biggestImageCandidate(node: any): InstagramMediaCandidate | null {
  const candidates = node?.image_versions2?.candidates as
    | { url: string; width: number; height: number }[]
    | undefined;
  if (!candidates || candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return { type: "image", url: best.url, width: best.width, height: best.height };
}

function progressiveVideoCandidate(node: any): InstagramMediaCandidate | null {
  const versions = node?.video_versions as { url: string; width: number; height: number }[] | undefined;
  if (!versions || versions.length === 0) return null;
  const best = versions[0];
  return { type: "video", url: best.url, width: best.width, height: best.height };
}

function pickMedia(node: any): InstagramMediaCandidate | null {
  return progressiveVideoCandidate(node) || biggestImageCandidate(node);
}

export function extractInstagramShortcode(url: string): string | null {
  const match = new URL(url).pathname.match(/^\/(?:[^/]+\/)?(?:p|reel|tv)\/([\w-]+)/i);
  return match ? match[1] : null;
}

export async function fetchInstagramMedia(sourceUrl: string): Promise<InstagramMediaResult | null> {
  const shortcode = extractInstagramShortcode(sourceUrl);
  if (!shortcode) return null;

  const { csrf, cookie } = await bootstrapCsrfToken();

  const body = new URLSearchParams({
    doc_id: IG_DOC_ID,
    variables: JSON.stringify({
      shortcode,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }),
  });

  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      "User-Agent": IG_USER_AGENT,
      "Accept-Language": "en-US,en;q=0.8",
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-ig-app-id": IG_APP_ID,
      "x-csrftoken": csrf,
      Origin: "https://www.instagram.com",
      Referer: "https://www.instagram.com/",
      Cookie: cookie,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) return null;
  const json: any = await res.json().catch(() => null);
  const item = json?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  if (!item) return null;

  const caption = item.caption?.text as string | undefined;

  if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
    const items = item.carousel_media
      .map((node: any) => pickMedia(node))
      .filter((m: InstagramMediaCandidate | null): m is InstagramMediaCandidate => m !== null);
    return items.length > 0 ? { items, caption } : null;
  }

  const single = pickMedia(item);
  return single ? { items: [single], caption } : null;
}
