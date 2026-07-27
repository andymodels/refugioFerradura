import React, { useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, Input, cn } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { PostThumbnail } from "@/components/post-thumbnail";

const TAG_FILTERS = [
  { label: "Todos", value: "lugares" },
  { label: "Experiências", value: "experiencias" },
  { label: "Gastronomia", value: "gastronomia" },
  { label: "Hospedagem", value: "hospedagem" },
  { label: "Natureza", value: "natureza" },
];

export default function Places() {
  const [activeTag, setActiveTag] = useState("lugares");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListPosts({ tag: activeTag, search: search || undefined } as any);
  const posts = data?.posts || [];

  return (
    <Layout>
      <div className="bg-muted/30 pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-4">Descubra Lugares</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore os melhores encantos da Rota da Ferradura e planeje seu roteiro.
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-background p-4 rounded-xl shadow-sm border border-border">
            <div className="flex overflow-x-auto w-full md:w-auto no-scrollbar pb-2 md:pb-0 gap-2">
              {TAG_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setActiveTag(f.value)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    activeTag === f.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar lugares..."
                className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Buscando lugares...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-serif text-foreground mb-2">Nenhum lugar encontrado.</h3>
            <p className="text-muted-foreground">Tente ajustar seus filtros de busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => {
              const postTags: string[] = post.tags ? JSON.parse(post.tags) : [];
              return (
                <Link key={post.id} href={`/blog/${post.slug}`} className="group block h-full">
                  <Card className="h-full flex flex-col border-border/50 hover:border-primary/30 hover:shadow-xl transition-all duration-300">
                    <div className="aspect-[4/3] overflow-hidden relative">
                      <PostThumbnail
                        src={post.coverImage}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
                        {postTags.filter(t => t !== "lugares").slice(0, 2).map(t => (
                          <span key={t} className="bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-full text-primary shadow-sm capitalize">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-6 flex flex-col flex-1">
                      <h3 className="text-xl font-serif font-medium mb-2 group-hover:text-primary transition-colors">{post.title}</h3>
                      {post.subtitle && (
                        <p className="text-xs text-primary/70 italic mb-2">{post.subtitle}</p>
                      )}
                      <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
                        {post.excerpt || post.content.replace(/<[^>]*>?/gm, '').substring(0, 120)}
                      </p>
                      <span className="text-primary text-sm font-medium group-hover:underline">
                        Ver detalhes →
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
