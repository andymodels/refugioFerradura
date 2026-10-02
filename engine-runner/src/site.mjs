// Fonte 3: site oficial do lugar (só quando Instagram + matéria não bastam).
// Lê og:image e imagens da página inicial; nada de busca em outros sites.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

export async function imagensDoSite(siteUrl) {
  const res = await fetch(siteUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!res.ok) return [];
  const html = await res.text();
  const base = new URL(res.url);
  const urls = [];
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) urls.push(m[1]);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.push(m[1]);
  const vistos = new Set();
  const out = [];
  for (const u of urls) {
    let abs;
    try { abs = new URL(u, base).toString(); } catch { continue; }
    if (vistos.has(abs) || /logo|icon|favicon|sprite|avatar|\.svg|\.gif|pixel/i.test(abs)) continue;
    vistos.add(abs);
    out.push(abs);
    if (out.length >= 12) break;
  }
  return out.map((url) => ({ url, destino: base.toString() }));
}
