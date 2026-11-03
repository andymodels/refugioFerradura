// Regra única para decidir se dois cadastros são o MESMO estabelecimento.
// Usada na varredura de matérias ("Importar das matérias") e no cadastro manual,
// para a lista de Estabelecimentos nunca ter o mesmo parceiro duas vezes.
//
// Dois cadastros são o mesmo quando:
//   1. têm o MESMO Instagram (principal, basta sozinho; ignora maiúsculas, @ e barra final); ou
//   2. têm o MESMO nome escrito exatamente igual (ignora maiúsculas, acentos e espaços extras); ou
//   3. têm o MESMO telefone e um dos dois não tem Instagram cadastrado.
// Telefone igual com Instagram DIFERENTE não une: o mesmo dono pode ter dois perfis/lugares.

export interface IdentidadeParceiro {
  nome?: string | null;
  instagram?: string | null;
  telefone?: string | null;
}

export const normalizarHandle = (h?: string | null): string => String(h ?? "").trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();

export const normalizarNome = (n?: string | null): string =>
  String(n ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Só dígitos, sem o 55 do país; compara os últimos 10 dígitos (DDD + número, ignorando o 9 extra em alguns cadastros).
export function normalizarTelefone(t?: string | null): string {
  let d = String(t ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d.slice(-10) : "";
}

export function ehMesmoParceiro(a: IdentidadeParceiro, b: IdentidadeParceiro): boolean {
  const ha = normalizarHandle(a.instagram), hb = normalizarHandle(b.instagram);
  if (ha && hb && ha === hb) return true;
  const na = normalizarNome(a.nome), nb = normalizarNome(b.nome);
  if (na && nb && na === nb) return true;
  const ta = normalizarTelefone(a.telefone), tb = normalizarTelefone(b.telefone);
  if (ta && tb && ta === tb && (!ha || !hb)) return true;
  return false;
}

export function acharDuplicado<T extends IdentidadeParceiro>(novo: IdentidadeParceiro, existentes: T[]): T | null {
  return existentes.find((e) => ehMesmoParceiro(novo, e)) ?? null;
}
