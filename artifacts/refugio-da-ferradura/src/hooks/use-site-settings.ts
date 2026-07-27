import React from "react";
import { useQuery } from "@tanstack/react-query";

export const DEFAULT_HERO_POOL = [
  "https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1448375240586-882707db888b?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1504893524553-b855bce32c67?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1516912481808-3406841bd33c?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540390769625-2fc3f8b1d50c?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1490682143684-14369e18dce8?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=85&w=1920&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=85&w=1920&auto=format&fit=crop",
];

export interface SiteSettings {
  // Hero
  hero_image_url: string;
  hero_image_pool: string;
  hero_overlay_opacity: string;
  hero_style: string;
  hero_height_vh: string;
  // Header
  header_style: string;
  header_bg_color: string;
  header_sticky: string;
  header_height_px: string;
  logo_size_px: string;
  // Footer
  footer_tagline: string;
  footer_address: string;
  footer_copyright: string;
  footer_instagram: string;
  footer_facebook: string;
  // Layout
  section_spacing: string;
  // Content Blocks
  home_blocks: string;
}

export const SETTINGS_DEFAULTS: SiteSettings = {
  hero_image_url: "",
  hero_image_pool: JSON.stringify(DEFAULT_HERO_POOL),
  hero_overlay_opacity: "0.22",
  hero_style: "light",
  // Guarda pixels da altura do hero no desktop (não mais "vh" — nome do campo
  // mantido pra não exigir migração de settings). Ver home.tsx para o cálculo
  // da altura no mobile e o guard contra valores antigos no formato vh (50–100).
  hero_height_vh: "400",
  header_style: "transparent",
  header_bg_color: "#0b0f0c",
  header_sticky: "true",
  header_height_px: "100",
  logo_size_px: "56",
  footer_tagline: "Descubra a magia e tranquilidade da Rota da Ferradura em Guarapari, ES. Natureza, gastronomia e paz.",
  footer_address: "Rota da Ferradura, Buenos Aires\nGuarapari - ES",
  footer_copyright: "",
  footer_instagram: "",
  footer_facebook: "",
  section_spacing: "normal",
  home_blocks: "[]",
};

export function useSiteSettings(): SiteSettings {
  const { data } = useQuery({
    queryKey: ["site-settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
    staleTime: 30_000,
  });
  return { ...SETTINGS_DEFAULTS, ...(data?.settings ?? {}) };
}

export function parseHeroPool(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_HERO_POOL;
  } catch {
    return DEFAULT_HERO_POOL;
  }
}

export interface HomeBlock {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  bgColor: string;
}

export function parseHomeBlocks(raw: string): HomeBlock[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getOverlayStyle(style: string, opacity: number): React.CSSProperties {
  if (style === "gradient") {
    return {
      background: `linear-gradient(to top, rgba(0,0,0,${Math.min(opacity + 0.3, 1)}) 0%, rgba(0,0,0,${opacity * 0.5}) 50%, rgba(0,0,0,${opacity}) 100%)`,
    };
  }
  if (style === "light") {
    // Escurecimento concentrado atrás do texto (que fica centralizado), bem
    // suave nas bordas — mantém a paisagem viva nos cantos da foto.
    const core = Math.min(opacity + 0.2, 0.85);
    const mid = opacity * 0.45;
    const edge = opacity * 0.12;
    return {
      background: `radial-gradient(ellipse 65% 55% at 50% 55%, rgba(0,0,0,${core}) 0%, rgba(0,0,0,${mid}) 55%, rgba(0,0,0,${edge}) 100%)`,
    };
  }
  return { background: `rgba(0,0,0,${opacity})` };
}
