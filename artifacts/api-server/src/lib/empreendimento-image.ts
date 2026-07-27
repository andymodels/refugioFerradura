import type { MediaItem } from "./article-generation";
import {
  resolveInstagramMedia,
  resolveSiteMedia,
  searchOfficialChannel,
  getInstitutionalFallback,
} from "./media-pipeline";
import { logger } from "./logger";

// Adaptador do pipeline único de mídia (media-pipeline.ts) pro formato de
// dados da fila de empreendimentos (catálogo digitizado do Diagnóstico
// Turístico e Econômico da Rota da Ferradura). O PDF é fonte de texto/dados,
// nunca de mídia — suas fotos NUNCA entram como mídia editorial. Prioridade:
// Instagram oficial > site oficial > busca de apoio (só pra achar canal) >
// paisagens institucionais da Rota da Ferradura (nunca fica sem mídia).

export interface EmpreendimentoImageInput {
  nome: string;
  regiao?: string | null;
  endereco?: string | null;
  plusCode?: string | null;
  instagram?: string | null; // já confirmado alcançável, com ou sem @
  site?: string | null; // já confirmado alcançável
  slug: string;
}

export async function resolveEmpreendimentoImage(input: EmpreendimentoImageInput): Promise<MediaItem[]> {
  if (input.instagram) {
    const items = await resolveInstagramMedia(input.instagram, input.nome, input.slug);
    if (items.length > 0) return items;
  }

  if (input.site) {
    const items = await resolveSiteMedia(input.site, input.nome, input.slug);
    if (items.length > 0) return items;
  }

  // Nem Instagram nem site do cadastro renderam mídia usável (ou não
  // constavam no cadastro) — busca de apoio só pra achar canal oficial.
  const locationHint = [input.regiao, input.endereco, input.plusCode].filter(Boolean).join(", ") || "Rota da Ferradura, Guarapari-ES";
  const found = await searchOfficialChannel(input.nome, locationHint);

  if (found.instagram) {
    const items = await resolveInstagramMedia(found.instagram, input.nome, input.slug);
    if (items.length > 0) return items;
  }
  if (found.site) {
    const items = await resolveSiteMedia(found.site, input.nome, input.slug);
    if (items.length > 0) return items;
  }

  const fallback = getInstitutionalFallback(3);
  if (fallback.length === 0) {
    logger.warn({ nome: input.nome }, "[empreendimento-image] Sem mídia oficial nem fallback institucional disponível");
  }
  return fallback;
}
