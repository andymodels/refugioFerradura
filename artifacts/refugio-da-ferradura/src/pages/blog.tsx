import React, { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Layout } from "@/components/layout";
import { Card, cn } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { useSeo } from "@/hooks/use-seo";

const TAGS = [
  { label: "Todos", value: "" },
  { label: "Lugares", value: "lugares" },
  { label: "Experiências", value: "experiencias" },
  { label: "Gastronomia", value: "gastronomia" },
  { label: "Hospedagem", value: "hospedagem" },
];

export default function Blog() {
  const [activeTag, setActiveTag] = useState("");
  const { data, isLoading } = useListPosts({ tag: activeTag || undefined } as any);
  const posts = data?.posts || [];

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useSeo({
    title: "Conteúdo & Histórias da Rota da Ferradura",
    description:
      "Artigos sobre lugares, experiências, gastronomia e hospedagem na Rota da Ferradura, Guarapari – ES. Inspire-se para sua próxima viagem.",
    url: `${origin}/blog`,
    type: "website",
    jsonLd:
      posts.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Artigos · Rota da Ferradura",
            description:
              "Lista de artigos sobre turismo na Rota da Ferradura, Guarapari – ES.",
            numberOfItems: posts.length,
            itemListElement: posts.map((post, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: post.title,
              url: `${origin}/blog/${post.slug}`,
            })),
          }
        : undefined,
  });

  return (
    <Layout>
      <div className="bg-primary/5 pt-32 pb-16 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">Conteúdo & Histórias</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Lugares, experiências, gastronomia e tudo que a Rota da Ferradura tem a oferecer.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap px-4">
          {TAGS.map(tag => (
            <button
              key={tag.value}
              onClick={() => setActiveTag(tag.value)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all duration-200",
                activeTag === tag.value
                  ? "bg-primary text-white shadow-md shadow-primary/30"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              )}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
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
            <h3 className="text-xl font-serif text-muted-foreground">Nenhum conteúdo encontrado para este filtro.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {posts.map((post) => {
              const postTags: string[] = post.tags ? JSON.parse(post.tags) : [];
              return (
                <Link key={post.id} href={`/blog/${post.slug}`} className="group flex flex-col h-full">
                  <div className="aspect-[4/3] overflow-hidden rounded-lg mb-6 relative">
                    <img
                      src={post.coverImage || "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop"}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
                      {postTags.slice(0, 2).map(t => (
                        <span key={t} className="bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-sm text-primary capitalize">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <time className="text-xs text-muted-foreground mb-3 font-medium tracking-wide uppercase">
                      {format(new Date(post.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                    </time>

                    <h3 className="text-2xl font-serif font-medium mb-2 group-hover:text-primary transition-colors leading-snug">
                      {post.title}
                    </h3>

                    {post.subtitle && (
                      <p className="text-sm text-primary/70 italic mb-2">{post.subtitle}</p>
                    )}

                    <div
                      className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1"
                      dangerouslySetInnerHTML={{
                        __html: (post.excerpt || post.content).substring(0, 200)
                      }}
                    />

                    <div className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                      Ler mais <span className="text-lg leading-none">&rarr;</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}