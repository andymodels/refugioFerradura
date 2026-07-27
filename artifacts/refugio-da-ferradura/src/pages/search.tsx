import React, { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Layout } from "@/components/layout";
import { Input, Button, Card } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSeo } from "@/hooks/use-seo";
import { PostThumbnail } from "@/components/post-thumbnail";

export default function Search() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  useSeo({
    title: "Buscar · Rota da Ferradura",
    description: "Pesquise por lugares, restaurantes, pousadas e experiências na Rota da Ferradura, Guarapari – ES.",
    noIndex: true,
  });

  const { data: postsData, isLoading } = useListPosts({ search: submittedQuery || undefined } as any);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const posts = postsData?.posts || [];

  return (
    <Layout>
      <div className="bg-background pt-32 pb-16 min-h-[70vh]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-serif mb-4">Buscar no Refúgio</h1>
            <p className="text-muted-foreground mb-8">Encontre lugares, experiências, gastronomia e muito mais.</p>
            <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: cachoeira, moqueca, trilha..."
                  className="pl-12 h-14 text-lg rounded-full bg-muted/30 border-border"
                />
              </div>
              <Button type="submit" size="lg" className="rounded-full px-8">Buscar</Button>
            </form>
          </div>

          {submittedQuery && (
            <div className="mt-12">
              <h2 className="text-xl font-medium text-muted-foreground mb-8">
                {isLoading ? "Buscando..." : `${posts.length} resultado${posts.length !== 1 ? "s" : ""} para "${submittedQuery}"`}
              </h2>

              {!isLoading && posts.length === 0 && (
                <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed border-border">
                  <p className="text-lg text-foreground mb-2">Nenhum resultado encontrado.</p>
                  <p className="text-muted-foreground text-sm">Tente palavras-chave diferentes.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {posts.map(post => {
                  const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
                  return (
                    <Link key={post.id} href={`/blog/${post.slug}`}>
                      <Card className="flex gap-4 p-4 hover:border-primary/50 transition-all hover:shadow-md cursor-pointer group">
                        <div className="w-24 h-24 rounded-md overflow-hidden shrink-0 bg-muted">
                          <PostThumbnail src={post.coverImage} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                        <div className="flex flex-col justify-center min-w-0">
                          <div className="flex gap-1 mb-1 flex-wrap">
                            {tags.slice(0, 2).map(t => (
                              <span key={t} className="text-xs text-primary font-medium capitalize">{t}</span>
                            ))}
                          </div>
                          <h4 className="font-serif font-medium leading-tight mb-1 line-clamp-2">{post.title}</h4>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(post.createdAt), "dd 'de' MMM, yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
