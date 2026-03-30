import React, { useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { useSiteSettings, parseHomeBlocks, parseHeroPool, getOverlayStyle } from "@/hooks/use-site-settings";

export default function Home() {
  const s = useSiteSettings();
  const { data: recentData } = useListPosts({ limit: 3 } as any);
  const { data: lugaresData } = useListPosts({ tag: "lugares", limit: 3 } as any);
  const { data: experienciasData } = useListPosts({ tag: "experiencias", limit: 3 } as any);
  const recentPosts = recentData?.posts || [];
  const lugaresPosts = lugaresData?.posts || [];
  const experienciasPosts = experienciasData?.posts || [];
  const heroPool = parseHeroPool(s.home_hero_image_pool || s.hero_image_pool);
  const heroImage = useMemo(() => heroPool[Math.floor(Math.random() * heroPool.length)], [heroPool]);

  return (
    <Layout>
      <section className="relative flex items-center justify-center min-h-[500px]" style={{ height: "80vh" }}>
        <div className="absolute inset-0 z-0">
          <img src={heroImage} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 text-center text-white px-4">
          <h1 className="text-5xl font-serif mb-4">Explore a Rota da Ferradura</h1>
          <p className="text-xl opacity-90">O melhor das montanhas de Guarapari</p>
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section className="py-16 bg-background">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-2 mb-8 text-primary">
              <Sparkles className="w-5 h-5" />
              <h2 className="text-2xl font-serif font-bold">Novidades na Rota</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentPosts.map((post: any) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <Card className="overflow-hidden hover:shadow-xl transition-all cursor-pointer border-0 shadow-sm">
                    <img src={post.coverImage} className="aspect-video object-cover w-full" />
                    <div className="p-5">
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
