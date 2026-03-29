import React from "react";
import { useQuery } from "@tanstack/react-query";

export interface SiteSettings {
  // Hero
  hero_image_url: string;
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
  hero_image_url: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=85&auto=format&fit=crop",
  hero_overlay_opacity: "0.4",
  hero_style: "gradient",
  hero_height_vh: "85",
  header_style: "transparent",
  header_bg_color: "#0b0f0c",
  header_sticky: "true",
  header_height_px: "100",
  logo_size_px: "80",
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
  return { background: `rgba(0,0,0,${opacity})` };
}
