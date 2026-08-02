// Extração determinística de contato (Instagram/telefone) a partir do HTML
// de um post já publicado — usada tanto pela legenda automática do
// Instagram (marcar o @ do parceiro) quanto pela varredura de parceiros
// (lib/partners.ts). Nunca baixa, segue ou publica nada — só lê texto.

// instagram.com/p/..., /reel/..., /stories/... etc. não são o @ do negócio —
// são links pra publicações específicas, não pro perfil.
const RESERVED_INSTAGRAM_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);

export function extractInstagramHandle(content: string): string | null {
  if (!content) return null;
  for (const match of content.matchAll(/instagram\.com\/([a-zA-Z0-9_.]+)/g)) {
    const handle = match[1].replace(/\/+$/, "");
    if (handle && !RESERVED_INSTAGRAM_PATHS.has(handle.toLowerCase())) {
      return handle;
    }
  }
  return null;
}

function formatBrPhone(digits: string): string {
  // digits sem o 55 do país, só DDD+número (10 ou 11 dígitos)
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

// Prioriza o número embutido em link de WhatsApp (wa.me/55XXXXXXXXXXX ou
// api.whatsapp.com/send?phone=55XXXXXXXXXXX) — mais confiável que tentar
// reconhecer um telefone solto no meio do texto.
export function extractPhone(content: string): string | null {
  if (!content) return null;

  const waMatch = content.match(/wa\.me\/(\d{12,13})/) || content.match(/[?&]phone=(\d{12,13})/);
  if (waMatch) {
    const digits = waMatch[1].replace(/^55/, "");
    if (digits.length === 10 || digits.length === 11) return formatBrPhone(digits);
  }

  // Fallback: telefone escrito por extenso no texto, ex. "(27) 99602-6115"
  const plainMatch = content.match(/\(\d{2}\)\s?\d{4,5}-?\d{4}/);
  if (plainMatch) return plainMatch[0];

  return null;
}
