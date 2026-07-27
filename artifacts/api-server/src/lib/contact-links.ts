// Construtores únicos de link de contato, usados tanto na geração automática
// de artigos (EMPREENDIMENTO_PROMPT) quanto na rotina de reconciliação de
// posts já publicados — pra nunca haver dois formatos de wa.me/Maps/mailto
// coexistindo no site.

const WHATSAPP_MESSAGE =
  "Olá! Conheci vocês através do site Refúgio da Ferradura e gostaria de saber mais.";

// Aceita telefone em qualquer formatação BR (com/sem DDD, com/sem +55) e só
// retorna um link se der pra montar um número de WhatsApp plausível (DDD+9
// dígitos = 11, ou DDD+8 dígitos fixo = 10).
export function buildWhatsappHtml(telefone?: string | null): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length !== 10 && digits.length !== 11) return null;
  const whatsappNumber = `55${digits}`;
  return `<a href="https://wa.me/${whatsappNumber}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}" target="_blank" rel="noopener noreferrer">${telefone}</a>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildMailtoHtml(email?: string | null): string | null {
  if (!email || !EMAIL_RE.test(email.trim())) return null;
  const clean = email.trim();
  return `<a href="mailto:${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>`;
}

// Rota de carro no Google Maps a partir do endereço + Plus Code — formato já
// padronizado no artigo de empreendimento (endereco, plusCode, "Guarapari - ES").
export function buildMapsHtml(
  endereco?: string | null,
  plusCode?: string | null,
  linkText?: string,
): string | null {
  if (!endereco && !plusCode) return null;
  const destination = [endereco, plusCode, "Guarapari - ES"].filter(Boolean).join(", ");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText || "Abrir rota no Google Maps"}</a>`;
}

export function buildInstagramHtml(handle?: string | null): string | null {
  if (!handle) return null;
  const clean = handle.replace(/^@/, "");
  return `<a href="https://instagram.com/${clean}" target="_blank" rel="noopener noreferrer">@${clean}</a>`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Ajustes cirúrgicos de link de contato em HTML de post já publicado — nunca
// tocam no texto visível, só envolvem um valor já presente com o link
// correto (ou consertam um link malformado). Usados pela rotina de
// reconciliação, que nunca deve reescrever a prosa original.

export function ensureMailtoLink(html: string, email?: string | null): string {
  if (!email || html.includes(`mailto:${email}`)) return html;
  const re = new RegExp(`>(\\s*${escapeRegex(email)}\\s*)<`);
  if (!re.test(html)) return html;
  return html.replace(re, (_m, text) => `><a href="mailto:${email}" target="_blank" rel="noopener noreferrer">${text}</a><`);
}

export function ensureMapsLink(html: string, endereco?: string | null, plusCode?: string | null): string {
  if (html.includes("google.com/maps")) return html;
  const mapsHtml = buildMapsHtml(endereco, plusCode, plusCode || "abrir rota no Google Maps");
  if (!mapsHtml) return html;
  // Prioriza envolver o Plus Code (mais curto e específico); se não achar,
  // tenta o endereço completo.
  for (const needle of [plusCode, endereco]) {
    if (!needle) continue;
    const re = new RegExp(`>(\\s*${escapeRegex(needle)}\\s*)<`);
    if (re.test(html)) {
      return html.replace(re, (_m, text) => `>${text} — ${mapsHtml}<`);
    }
  }
  return html;
}

// Conserta o padrão malformado visto em alguns posts (handle do Instagram
// partido em dois <a> adjacentes, ex.: "@" + "handle/") — nunca remove o
// link, só limpa a marcação.
export function fixSplitInstagramLink(html: string, handle?: string | null): string {
  if (!handle) return html;
  const clean = handle.replace(/^@/, "").replace(/\/$/, "");
  const re = new RegExp(
    `<a[^>]*href="https://(?:www\\.)?instagram\\.com/${escapeRegex(clean)}/?"[^>]*>@?</a>\\s*<a[^>]*href="https://(?:www\\.)?instagram\\.com/${escapeRegex(clean)}/?"[^>]*>${escapeRegex(clean)}/?</a>`,
    "i",
  );
  if (!re.test(html)) return html;
  return html.replace(re, buildInstagramHtml(clean) || "");
}
