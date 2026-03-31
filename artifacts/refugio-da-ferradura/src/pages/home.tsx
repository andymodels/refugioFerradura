import React, { useMemo } from "react";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";
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

  const { data: recentData } = useListPosts({ limit: 6 } as any);
  const recentPosts = recentData?.posts || [];

  return (
    <Layout>
      <section className="relative flex items-center justify-center min-h-[500px]" style={{ height: `${heroHeight}vh` }}>
        <div className="absolute inset-0 z-0">
          <img src={heroImage} alt="Vista" className="w-full h-full object-cover" />
          <div className="absolute inset-0" style={getOverlayStyle(s.hero_style, heroOpacity)} />
        </div>
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <span className="text-white/80 uppercase tracking-[0.2em] text-sm font-medium mb-6 block">Rota da Ferradura · Guarapari</span>
          <h1 className="text-5xl md:text-7xl font-serif text-white mb-6">Explore a Rota</h1>
          <div className="flex justify-center gap-4">
            <Link href="/lugares"><Button size="lg">Explorar</Button></Link>
          </div>
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section className="py-16 bg-background">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-2 mb-8">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="text-2xl font-serif font-bold">Novidades na Rota</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentPosts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden hover:shadow-lg transition-all cursor-pointer">
                    <img src={post.coverImage} className="aspect-video object-cover w-full" />
                    <div className="p-4">
                      <h3 className="font-serif font-bold text-lg mb-2">{post.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

    </Layout>
  );
}
