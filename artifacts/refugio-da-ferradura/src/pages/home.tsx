import React, { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { useSiteSettings, parseHomeBlocks, parseHeroPool, getOverlayStyle } from "@/hooks/use-site-settings";

export default function Home() {
  const s = useSiteSettings();
  const heroOpacity = parseFloat(s.hero_overlay_opacity) || 0.4;
  const heroHeight = parseInt(s.hero_height_vh) || 85;
  const blocks = parseHomeBlocks(s.home_blocks);
  const heroPool = parseHeroPool(s.hero_image_pool);

  const heroImage = useMemo(
    () => heroPool[Math.floor(Math.random() * heroPool.length)],
    [s.hero_image_pool]
  );

  const { data: lugaresData } = useListPosts({ tag: "lugares", limit: 3 } as any);
  const { data: experienciasData } = useListPosts({ tag: "experiencias", limit: 3 } as any);
  const lugaresPosts = lugaresData?.posts || [];
  const experienciasPosts = experienciasData?.posts || [];

  return (
    <Layout>
      {/* Hero Section */}
      <section
        className="relative flex items-center justify-center min-h-[500px]"
        style={{ height: `${heroHeight}vh` }}
      >
        <div className="absolute inset-0 z-0">
          <img
            src={heroImage}
            alt="Vista da Rota da Ferradura"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={getOverlayStyle(s.hero_style, heroOpacity)} />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <span className="text-white/80 uppercase tracking-[0.2em] text-sm font-medium mb-6 block drop-shadow-md">
            Rota da Ferradura · Guarapari – ES
          </span>
          <h1 className="text-5xl md:text-7xl font-serif text-white mb-6 drop-shadow-lg leading-tight">
            Explore a Rota da Ferradura
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto font-light drop-shadow-md">
            Descubra os melhores lugares, experiências, gastronomia e hospedagens nas montanhas de Guarapari.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/lugares">
              <Button size="lg" className="w-full sm:w-auto text-base">Explorar Lugares</Button>
            </Link>
            <Link href="/experiencias">
              <Button variant="outline" size="lg" className="w-full sm:w-auto text-base text-white border-white hover:bg-white hover:text-foreground">
                Ver o que Fazer
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section className="py-24 bg-background relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-accent/20 rounded-l-full -translate-y-1/4 translate-x-1/4 blur-3xl opacity-50 pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-serif text-primary mb-6">A Natureza Perto de Você</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            A apenas alguns minutos das famosas praias de Guarapari, encontra-se um santuário de montanhas, cachoeiras cristalinas e ar puro. A Rota da Ferradura em Buenos Aires é o destino ideal para quem busca ecoturismo, alta gastronomia e hospedagens charmosas.
          </p>
        </div>
      </section>

      {/* Custom Content Blocks */}
      {blocks.map((block) => (
        <section
          key={block.id}
          style={{ backgroundColor: block.bgColor }}
          className="py-16"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className={`flex flex-col ${block.image ? "md:flex-row" : ""} items-center gap-10`}>
              {block.image && (
                <div className="md:w-2/5 shrink-0">
                  <img
                    src={block.image}
                    alt={block.title}
                    className="w-full h-64 md:h-80 object-cover rounded-2xl shadow-lg"
                  />
                </div>
              )}
              <div className={block.image ? "md:w-3/5" : "text-center max-w-3xl mx-auto"}>
                {block.subtitle && (
                  <p className="text-primary/80 uppercase tracking-widest text-xs font-semibold mb-3">
                    {block.subtitle}
                  </p>
                )}
                {block.title && (
                  <h2 className="text-2xl md:text-3xl font-serif text-white mb-4">{block.title}</h2>
                )}
                {block.description && (
                  <p className="text-white/70 leading-relaxed">{block.description}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Lugares em Destaque */}
      {lugaresPosts.length > 0 && (
        <section className="py-20 bg-accent/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-primary uppercase tracking-widest text-xs font-semibold mb-2">Descubra</p>
                <h2 className="text-3xl md:text-4xl font-serif text-foreground">Lugares para Visitar</h2>
              </div>
              <Link href="/lugares" className="hidden md:flex items-center gap-2 text-primary hover:underline text-sm font-medium">
                Ver todos <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {lugaresPosts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-background">
                    <div className="aspect-[4/3] overflow-hidden">
                      {post.coverImage ? (
                        <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-accent/30 flex items-center justify-center">
                          <span className="text-muted-foreground text-sm">Sem imagem</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="font-serif text-lg text-foreground mb-2 group-hover:text-primary transition-colors leading-snug">{post.title}</h3>
                      {post.excerpt && <p className="text-muted-foreground text-sm line-clamp-2">{post.excerpt}</p>}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-8 flex md:hidden justify-center">
              <Link href="/lugares" className="flex items-center gap-2 text-primary hover:underline text-sm font-medium">
                Ver todos os lugares <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Experiências em Destaque */}
      {experienciasPosts.length > 0 && (
        <section className="py-20 bg-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="text-primary uppercase tracking-widest text-xs font-semibold mb-2">Viva</p>
                <h2 className="text-3xl md:text-4xl font-serif text-foreground">Experiências em Destaque</h2>
              </div>
              <Link href="/experiencias" className="hidden md:flex items-center gap-2 text-primary hover:underline text-sm font-medium">
                Ver todas <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {experienciasPosts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-300 border-0 bg-accent/10">
                    <div className="aspect-[4/3] overflow-hidden">
                      {post.coverImage ? (
                        <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-accent/30 flex items-center justify-center">
                          <span className="text-muted-foreground text-sm">Sem imagem</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="font-serif text-lg text-foreground mb-2 group-hover:text-primary transition-colors leading-snug">{post.title}</h3>
                      {post.excerpt && <p className="text-muted-foreground text-sm line-clamp-2">{post.excerpt}</p>}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <div className="mt-8 flex md:hidden justify-center">
              <Link href="/experiencias" className="flex items-center gap-2 text-primary hover:underline text-sm font-medium">
                Ver todas as experiências <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </Layout>
  );
}
