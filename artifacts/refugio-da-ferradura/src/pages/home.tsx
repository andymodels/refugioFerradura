import React, { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { useSiteSettings, parseHomeBlocks, parseHeroPool, parseHeroBanners, getOverlayStyle, type HeroBanner } from "@/hooks/use-site-settings";
import { useSeo } from "@/hooks/use-seo";
import { PostThumbnail, getPostThumbnailSource } from "@/components/post-thumbnail";

// Overrides de pré-visualização via URL (?preview_hero=1&hh=400&ho=0.22&hs=light),
// sem afetar as configurações reais salvas — só pra validar ajustes visuais
// antes de aplicar de fato nas configurações do site.
function useHeroPreviewOverrides() {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview_hero") !== "1") return null;
    return {
      height: params.get("hh"),
      opacity: params.get("ho"),
      style: params.get("hs"),
      demoBanners: params.get("pb") === "1",
    };
  }, []);
}

// Demo client-side dos 3 tipos de banner (não grava nada no banco) — só pra
// validar visualmente antes de configurar de verdade no admin.
function buildDemoBanners(pool: string[], firstRecentPostSlug?: string): HeroBanner[] {
  return [
    { id: "demo-1", image: pool[0] ?? "", title: "", subtitle: "", buttonText: "", buttonLink: "" },
    {
      id: "demo-2",
      image: pool[1] ?? pool[0] ?? "",
      title: "Explore a Rota",
      subtitle: "Rota da Ferradura · Guarapari",
      buttonText: "",
      buttonLink: "",
    },
    {
      id: "demo-3",
      image: pool[2] ?? pool[0] ?? "",
      title: "Confira a matéria mais recente",
      subtitle: "Novidades na Rota",
      buttonText: "Ler matéria",
      buttonLink: firstRecentPostSlug ? `/blog/${firstRecentPostSlug}` : "",
    },
  ];
}

const HERO_ROTATE_MS = 6000;

function useHeroCarousel(poolLength: number) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(poolLength, 1)));
  useEffect(() => {
    if (poolLength <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % poolLength), HERO_ROTATE_MS);
    return () => clearInterval(id);
  }, [poolLength]);
  return poolLength > 0 ? index % poolLength : 0;
}

export default function Home() {
  const s = useSiteSettings();
  const heroPreview = useHeroPreviewOverrides();
  const heroOpacity = parseFloat(heroPreview?.opacity ?? s.hero_overlay_opacity) || 0.22;
  const rawHeightDesktop = parseInt(heroPreview?.height ?? s.hero_height_vh);
  // hero_height_vh guardava um valor de 50–100 (% da viewport); agora guarda pixels
  // do desktop. Enquanto o painel não é resalvo, valores antigos (<200) ainda podem
  // estar no banco — nesse caso caímos no novo padrão em vez de um hero de poucos px.
  const heroHeightDesktop = !rawHeightDesktop || rawHeightDesktop < 200 ? 400 : rawHeightDesktop;
  const heroHeightMobile = Math.max(300, Math.min(320, Math.round(heroHeightDesktop * 0.78)));
  const heroStyle = heroPreview?.style ?? s.hero_style;
  const blocks = parseHomeBlocks(s.home_blocks);
  const heroPool = useMemo(() => parseHeroPool(s.hero_image_pool), [s.hero_image_pool]);

  // A home é uma vitrine: só destaca matérias que já têm foto própria válida.
  // Textos sem mídia aprovada seguem acessíveis no blog, sem gerar card vazio
  // ou uma paisagem genérica que não corresponde ao estabelecimento.
  const { data: recentData } = useListPosts({ limit: 30 } as any);
  const recentPosts = (recentData?.posts || [])
    .filter((post: any) => Boolean(getPostThumbnailSource(post.coverImage, post.content)))
    .slice(0, 9);

  const heroBanners = useMemo(() => {
    if (heroPreview?.demoBanners) return buildDemoBanners(heroPool, recentPosts[0]?.slug);
    return parseHeroBanners(s.hero_banners, heroPool);
  }, [heroPreview?.demoBanners, s.hero_banners, heroPool, recentPosts[0]?.slug]);
  const heroIndex = useHeroCarousel(heroBanners.length);
  const activeBanner = heroBanners[heroIndex];
  const heroImage = activeBanner?.image;
  const isInternalLink = (href: string) => href.startsWith("/");

  useSeo({
    title: "Explore a Rota da Ferradura · Guarapari, ES",
    description:
      "Descubra a Rota da Ferradura em Guarapari, Espírito Santo. Guia completo de lugares, gastronomia, pousadas e experiências únicas na serra capixaba.",
    image: heroImage,
    url: typeof window !== "undefined" ? window.location.origin : undefined,
    type: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "TouristDestination",
      name: "Rota da Ferradura",
      alternateName: "Refúgio da Ferradura",
      description:
        "Roteiro turístico em Guarapari, Espírito Santo, que reúne cachoeiras, trilhas, gastronomia regional, pousadas e a tranquilidade da serra capixaba.",
      url: typeof window !== "undefined" ? window.location.origin : "",
      touristType: ["Ecoturismo", "Gastronomia", "Natureza", "Aventura"],
      address: {
        "@type": "PostalAddress",
        streetAddress: "Rodovia do Sol, Bueno Ayres",
        addressLocality: "Guarapari",
        addressRegion: "Espírito Santo",
        addressCountry: "BR",
        postalCode: "29200-000",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: -20.6456,
        longitude: -40.4989,
      },
      containedInPlace: {
        "@type": "City",
        name: "Guarapari",
        containedInPlace: {
          "@type": "State",
          name: "Espírito Santo",
        },
      },
    },
  });

  return (
    <Layout>
      <section
        className="relative flex items-center justify-center overflow-hidden h-[var(--hero-h-mobile)] md:h-[var(--hero-h-desktop)]"
        style={{
          ["--hero-h-mobile" as any]: `${heroHeightMobile}px`,
          ["--hero-h-desktop" as any]: `${heroHeightDesktop}px`,
        }}
      >
        <div className="absolute inset-0 z-0">
          {heroBanners.map((banner, idx) => (
            <img
              key={banner.id}
              src={banner.image}
              alt="Vista da Rota da Ferradura"
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
                idx === heroIndex ? "opacity-100" : "opacity-0"
              }`}
              style={{ objectPosition: "center 40%" }}
            />
          ))}
          <div className="absolute inset-0" style={getOverlayStyle(heroStyle, heroOpacity)} />
          <div className="absolute inset-x-0 bottom-0 h-10 md:h-14 bg-gradient-to-t from-background/70 to-transparent" />
        </div>
        {activeBanner && (activeBanner.title || activeBanner.subtitle || (activeBanner.buttonText && activeBanner.buttonLink)) && (
          <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
            {activeBanner.subtitle && (
              <span className="text-white/80 uppercase tracking-[0.2em] text-sm font-medium mb-4 block">{activeBanner.subtitle}</span>
            )}
            {activeBanner.title && (
              <h1 className="text-4xl md:text-6xl font-serif text-white mb-5">{activeBanner.title}</h1>
            )}
            {activeBanner.buttonText && activeBanner.buttonLink && (
              <div className="flex justify-center gap-4">
                {isInternalLink(activeBanner.buttonLink) ? (
                  <Link href={activeBanner.buttonLink}><Button size="lg">{activeBanner.buttonText}</Button></Link>
                ) : (
                  <a href={activeBanner.buttonLink} target="_blank" rel="noopener noreferrer">
                    <Button size="lg">{activeBanner.buttonText}</Button>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {recentPosts.length > 0 && (
        <section className="pt-6 pb-16 md:pt-8 md:pb-16 bg-background">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-2 mb-8">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-serif font-bold">Novidades na Rota</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentPosts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden hover:shadow-lg transition-all cursor-pointer">
                    <PostThumbnail src={post.coverImage} content={post.content} alt={post.title} className="aspect-video object-cover w-full" />
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-lg mb-2">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/blog"><Button variant="outline">Ver todas as matérias</Button></Link>
            </div>
          </div>
        </section>
      )}

    </Layout>
  );
}
