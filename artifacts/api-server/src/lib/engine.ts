// Motor de conteúdo automático — lógica pura (sem rota, sem IA): escolha de
// pauta, elegibilidade de mídia e validação do artigo. Tudo determinístico:
// nada aqui inventa texto nem mídia. Só usa dados já existentes na base de
// lugares (instagram_partners) e na matéria vinculada (posts).

export const MEDIA_HOST = "media.refugioferradura.com.br";
export const COOLDOWN_DIAS = 30;
// Destaque individual: mínimo para publicar e teto de imagens por matéria.
export const MIN_IMAGENS_DESTAQUE = 3;
export const MAX_IMAGENS_DESTAQUE = 6;
// Extensões possíveis do upload direto de mídia do motor.
export const EXT_POR_TIPO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const CATEGORIA_LABEL: Record<string, string> = {
  hospedagem: "Hospedagem",
  restaurante_cafe: "Restaurante/café",
  cervejaria: "Cervejaria",
  atracao: "Atração",
  producao_rural: "Produção rural",
  comercio_servico: "Comércio/serviço",
  eventos: "Eventos",
  outra: "Outra",
};

// Categoria do lugar -> tag de conteúdo do blog (ids de CONTENT_TAGS).
export const CATEGORIA_TAG_BLOG: Record<string, string> = {
  hospedagem: "hospedagem",
  restaurante_cafe: "gastronomia",
  cervejaria: "gastronomia",
  atracao: "lugares",
  producao_rural: "lugares",
  comercio_servico: "lugares",
  eventos: "experiencias",
};

const norm = (s: string): string =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Nome utilizável no título. Hoje muitos registros guardam o título inteiro
// da matéria no nome ("Sítio Carminati: Aluguel de Temporada…"). Sem mexer no
// banco: aceita o nome se já é curto/limpo, ou o trecho antes do ":" quando
// ele bate com o @ do Instagram. Qualquer outro caso é inelegível até a
// limpeza de nomes (nunca chuta).
export function nomeParaConteudo(nome: string, handle: string | null): string | null {
  const n = (nome || "").trim();
  if (!n) return null;
  const i = n.indexOf(":");
  if (i < 0) return n.length <= 40 ? n : null;
  const pre = n.slice(0, i).trim();
  if (pre.length < 3 || pre.length > 45 || !handle) return null;
  const p = norm(pre);
  const h = norm(handle);
  const semTipo = norm(pre.replace(/^(Sítio|Restaurante|Bar e Restaurante|Chalés|Estância|Quilombo|Cervejaria)\s+/i, ""));
  const bate =
    h.includes(p) || p.includes(h) || h.includes(semTipo) || semTipo.includes(h) ||
    (semTipo.length > 5 && h.startsWith(semTipo.slice(0, 6)));
  return bate ? pre : null;
}

export function isB2Url(u: unknown): u is string {
  if (typeof u !== "string") return false;
  // HEIC/HEIF não serve (navegador e Instagram não exibem direito).
  if (/\.(heic|heif)(\?|$)/i.test(u)) return false;
  try {
    return new URL(u).hostname === MEDIA_HOST;
  } catch {
    return false;
  }
}

export interface MidiaPacote {
  coverImage: string | null;
  coverImageMeta: string | null;
  mediaItems: any[]; // itens já aprovados (urlArquivo no B2), copiados como estão
}

function parseJson(s: string | null | undefined): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Mídia suficiente = pelo menos 1 arquivo NOSSO (B2) já aprovado na matéria
// vinculada: capa em foto ou um mediaItem com urlArquivo no B2. Nunca usa URL
// externa, nunca baixa nada novo.
export function montarMidia(post: { coverImage: string | null; coverImageMeta: string | null; mediaItems: string | null }): MidiaPacote | null {
  const items = (parseJson(post.mediaItems) as any[] | null) ?? [];
  const itensB2 = items.filter((m) => m && isB2Url(m.urlArquivo));
  const capaB2 = isB2Url(post.coverImage) ? post.coverImage : null;
  if (!capaB2 && itensB2.length === 0) return null;
  return {
    coverImage: capaB2,
    coverImageMeta: capaB2 ? post.coverImageMeta : null,
    mediaItems: itensB2.slice(0, 4),
  };
}

export function textoLimpo(html: string | null | undefined): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/Instagram oficial\s*↗/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Bloco "Serviço" já pronto da matéria vinculada (dados de contato já
// conferidos e com link formatado) — reaproveitado literalmente.
export function extrairServicoHtml(content: string | null | undefined): string | null {
  const m = (content || "").match(/<h2>\s*Servi[cç]o\s*<\/h2>[\s\S]*$/i);
  return m ? m[0] : null;
}

// ─── Validação do artigo gerado ─────────────────────────────────────────
export interface ArtigoGerado {
  title: string;
  subtitle?: string;
  excerpt?: string;
  metaDescription?: string;
  sections: { heading: string; paragraphHtml: string }[];
}

const TRAVESSAO = /[—–]/;
const PROIBIDO = /avalia[cç][aã]o|avalia[cç][oõ]es|estrelas|\bnota\s*\d|h[oó]spedes? (relatam|elogiam|dizem)|segundo (os )?h[oó]spedes/i;
const RE_URL = /https?:\/\/[^\s"'<>)]+/gi;
const RE_EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const RE_FONE = /\(?\d{2}\)?\s?9?\d{4}-?\d{4}/g;
const RE_NUM = /\d[\d.,:h]*/g;

export function validarArtigo(
  a: ArtigoGerado,
  ctx: { nome: string; corpusFatos: string; categoria: string },
): string[] {
  const erros: string[] = [];
  if (!a || typeof a.title !== "string" || !Array.isArray(a.sections)) return ["JSON do artigo inválido (title/sections)."];

  if (norm(a.title).indexOf(norm(ctx.nome)) !== 0) erros.push(`O título deve começar com o nome "${ctx.nome}".`);
  if (a.sections.length < 3 || a.sections.length > 6) erros.push("O artigo deve ter de 3 a 6 seções.");

  const partes = [a.title, a.subtitle, a.excerpt, a.metaDescription, ...a.sections.flatMap((s) => [s?.heading, s?.paragraphHtml])]
    .filter((x): x is string => typeof x === "string");
  const tudo = partes.join("\n");
  const texto = textoLimpo(tudo);

  const palavras = texto.split(/\s+/).filter(Boolean).length;
  if (palavras < 150) erros.push(`Texto curto demais (${palavras} palavras; mínimo 150).`);
  if (palavras > 900) erros.push(`Texto longo demais (${palavras} palavras; máximo 900).`);

  if (TRAVESSAO.test(tudo)) erros.push("Não use travessão (— ou –).");
  if (PROIBIDO.test(tudo)) erros.push("Não cite avaliações, estrelas, notas nem relatos de hóspedes.");
  if (/<(script|img|iframe|style)\b/i.test(tudo)) erros.push("HTML não permitido (script/img/iframe/style).");
  for (const s of a.sections) {
    if (!s?.heading || !s?.paragraphHtml) { erros.push("Toda seção precisa de heading e paragraphHtml."); break; }
  }

  const base = norm(ctx.corpusFatos);
  const naBase = (x: string) => base.includes(norm(x));
  // Dados de contato só se já estiverem nos fatos.
  for (const u of tudo.match(RE_URL) ?? []) if (!naBase(u.replace(/[.,;]+$/, ""))) erros.push(`URL fora dos fatos: ${u}`);
  for (const e of tudo.match(RE_EMAIL) ?? []) if (!naBase(e)) erros.push(`E-mail fora dos fatos: ${e}`);
  for (const f of tudo.match(RE_FONE) ?? []) if (!naBase(f.replace(/\D/g, ""))) erros.push(`Telefone fora dos fatos: ${f}`);
  // Qualquer número (ano, preço, horário, capacidade) precisa existir nos
  // fatos, comparando o número inteiro (não pedaço de outro número).
  const limpa = (n: string) => n.replace(/[.,:]+$/, "");
  const numerosFatos = new Set((ctx.corpusFatos.match(RE_NUM) ?? []).map(limpa));
  const numeros = new Set((texto.match(RE_NUM) ?? []).map(limpa).filter((n) => n.length > 0));
  for (const n of numeros) {
    if (!numerosFatos.has(n)) erros.push(`Número fora dos fatos: "${n}" (só cite números presentes nos fatos).`);
  }
  return erros;
}

export function renderArtigoHtml(a: ArtigoGerado, servicoHtml: string | null, materiaSlug: string, materiaTitulo: string): string {
  const corpo = a.sections.map((s) => `<h2>${s.heading}</h2><p>${s.paragraphHtml}</p>`).join("\n");
  const leia = `<p>Leia a matéria completa: <a href="/blog/${materiaSlug}">${materiaTitulo.replace(/</g, "&lt;")}</a></p>`;
  return [corpo, leia, servicoHtml || ""].filter(Boolean).join("\n");
}

// Data de hoje em Brasília, "YYYY-MM-DD".
export function hojeBRT(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Mídia "virtual" da matéria vinculada: fotos já aprovadas e no nosso B2
// (capa + mediaItems em foto). Entra no acervo do lugar como origem
// "b2_materia" quando o motor a usa.
export interface MidiaVirtual {
  urlArquivo: string;
  tipoMidia: string;
  origemUrl: string | null;
  destinoUrl: string | null;
  isReel: boolean;
}

export function midiaVirtualDaMateria(post: { coverImage: string | null; coverImageMeta: string | null; mediaItems: string | null }): MidiaVirtual[] {
  const out: MidiaVirtual[] = [];
  const vistos = new Set<string>();
  const items = (parseJson(post.mediaItems) as any[] | null) ?? [];
  for (const m of items) {
    if (m && m.kind === "foto" && isB2Url(m.urlArquivo) && !vistos.has(m.urlArquivo)) {
      vistos.add(m.urlArquivo);
      out.push({ urlArquivo: m.urlArquivo, tipoMidia: m.tipo || "instagram_oficial", origemUrl: m.urlOrigem ?? null, destinoUrl: m.urlDestino ?? null, isReel: !!m.isReel });
    }
  }
  if (isB2Url(post.coverImage) && !vistos.has(post.coverImage) && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(post.coverImage)) {
    const meta = parseJson(post.coverImageMeta);
    out.push({ urlArquivo: post.coverImage, tipoMidia: meta?.tipo || "instagram_oficial", origemUrl: meta?.urlOrigem ?? null, destinoUrl: meta?.urlDestino ?? null, isReel: false });
  }
  return out;
}

// Mesma marcação de figura do blog (classe já estilizada pelo tema).
function figuraHtml(f: { urlArquivo: string; urlDestino: string | null }, alt: string): string {
  const img = `<img src="${f.urlArquivo}" alt="${alt.replace(/"/g, "&quot;")}" loading="lazy">`;
  const inner = f.urlDestino
    ? `<a href="${f.urlDestino}" target="_blank" rel="noopener noreferrer" aria-label="Ver origem oficial">${img}</a>`
    : img;
  return `<figure class="instagram-editorial-photo">${inner}</figure>`;
}

// Artigo com as fotos DEPOIS do parágrafo de cada seção (uma por seção, a
// capa fica de fora porque já aparece no topo), depois o link da matéria
// completa e o bloco Serviço. Nunca separa título e texto, nunca põe foto
// dentro do Serviço.
export function renderArtigoComFotos(
  a: ArtigoGerado,
  fotos: { urlArquivo: string; urlDestino: string | null }[],
  servicoHtml: string | null,
  materiaSlug: string,
  materiaTitulo: string,
  nome: string,
): string {
  const corpo = a.sections
    .map((s, i) => `<h2>${s.heading}</h2><p>${s.paragraphHtml}</p>${fotos[i] ? figuraHtml(fotos[i], nome) : ""}`)
    .join("\n");
  const leia = `<p>Leia a matéria completa: <a href="/blog/${materiaSlug}">${materiaTitulo.replace(/</g, "&lt;")}</a></p>`;
  return [corpo, leia, servicoHtml || ""].filter(Boolean).join("\n");
}
