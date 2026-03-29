import React from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";

export default function Blog() {
  const { data, isLoading } = useListPosts();
  const posts = data?.posts || [];

  return (
    <Layout>
      <div className="bg-primary/5 pt-32 pb-16 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">Blog & Histórias</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Dicas, roteiros e experiências para você aproveitar o melhor da Rota da Ferradura.
          </p>
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
            <h3 className="text-xl font-serif text-muted-foreground">Nenhuma postagem encontrada.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group flex flex-col h-full">
                <div className="aspect-[4/3] overflow-hidden rounded-lg mb-6 relative">
                  <img 
                    src={post.coverImage || "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=800&auto=format&fit=crop"} 
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-sm text-primary">
                    {post.category}
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <time className="text-xs text-muted-foreground mb-3 font-medium tracking-wide uppercase">
                    {format(new Date(post.createdAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                  </time>
                  <h3 className="text-2xl font-serif font-medium mb-3 group-hover:text-primary transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
                    {post.excerpt || post.content.replace(/<[^>]*>?/gm, '').substring(0, 120) + '...'}
                  </p>
                  <div className="text-primary text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                    Ler artigo <span className="text-lg leading-none">&rarr;</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
