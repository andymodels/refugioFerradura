import React from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TAG_META: Record<string, { title: string; subtitle: string; description: string }> = {
  lugares: {
    title: "Lugares para Visitar",
    subtitle: "Destinos",
    description: "Os melhores destinos e pontos turísticos da Rota da Ferradura para explorar.",
  },
  experiencias: {
    title: "Experiências",
    subtitle: "Viva a Rota",
    description: "Aventuras, atividades e momentos inesquecíveis para vivenciar na região.",
  },
  gastronomia: {
    title: "Gastronomia",
    subtitle: "Sabores Locais",
    description: "Restaurantes, pratos típicos e sabores autênticos que encantam visitantes e moradores.",
  },
  hospedagem: {
    title: "Hospedagem",
    subtitle: "Onde Ficar",
    description: "Pousadas, chalés e acomodações charmosas para tornar sua estadia inesquecível.",
  },
};

interface TagPageProps {
  tag: string;
}

export default function TagPage({ tag }: TagPageProps) {
  const meta = TAG_META[tag] || { title: tag, subtitle: tag, description: "" };
  const { data, isLoading } = useListPosts({ tag } as any);
  const posts = data?.posts || [];

  return (
    <Layout>
      <div className="pt-32 pb-16 border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="text-primary font-medium tracking-wider uppercase text-xs mb-2 block">
            {meta.subtitle}
          </span>
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">{meta.title}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{meta.description}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="animate-pulse space-y-4">
                <div className="bg-muted aspect-[4/3] rounded-lg"></div>
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-16 bg-muted rounded w-full"></div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-serif text-muted-foreground">
              Nenhum conteúdo publicado nesta categoria ainda.
            </h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {posts.map((post) => {
              const postTags: string[] = post.tags ? JSON.parse(post.tags) : [];
              return (
                <Link key={post.id} href={`/blog/${post.slug}`} className="group flex flex-col h-full">
                  <Card className="h-full flex flex-col border-border/50 hover:border-primary/30 hover:shadow-xl transition-all duration-300">
                    <div className="aspect-[4/3] overflow-hidden relative">
                      <img
                        src={
                          post.coverImage ||
                          "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop"
                        }
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
                        {postTags
                          .filter((t) => t !== tag)
                          .slice(0, 2)
                          .map((t) => (
                            <span
                              key={t}
                              className="bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-full text-primary shadow-sm capitalize"
                            >
                              {t}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <time className="text-xs text-muted-foreground mb-3 font-medium tracking-wide uppercase">
                        {format(new Date(post.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                      </time>
                      <h3 className="text-xl font-serif font-medium mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h3>
                      {post.subtitle && (
                        <p className="text-xs text-primary/70 italic mb-2">{post.subtitle}</p>
                      )}
                      <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
                        {post.excerpt || post.content.replace(/<[^>]*>?/gm, "").substring(0, 120) + "..."}
                      </p>
                      <span className="text-primary text-sm font-medium group-hover:underline">
                        Ler mais →
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
