import React, { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { Layout } from "@/components/layout";
import { Input, Button, Card } from "@/components/ui-elements";
import { useListPosts, useListPlaces } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function Search() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const { data: postsData, isLoading: isLoadingPosts } = useListPosts({ search: submittedQuery || undefined });
  const { data: placesData, isLoading: isLoadingPlaces } = useListPlaces({ search: submittedQuery || undefined });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(query);
  };

  const isLoading = isLoadingPosts || isLoadingPlaces;
  const hasResults = (postsData?.posts?.length || 0) > 0 || (placesData?.places?.length || 0) > 0;

  return (
    <Layout>
      <div className="bg-background pt-32 pb-16 min-h-[70vh]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-serif mb-6">O que você está procurando?</h1>
            <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: Cachoeira, Restaurante, Trilhas..." 
                  className="pl-12 h-14 text-lg rounded-full bg-muted/30 border-border"
                />
              </div>
              <Button type="submit" size="lg" className="rounded-full px-8">Buscar</Button>
            </form>
          </div>

          {submittedQuery && (
            <div className="mt-12">
              <h2 className="text-xl font-medium text-muted-foreground mb-8">
                Resultados para "{submittedQuery}"
              </h2>

              {isLoading ? (
                <div className="text-center py-10">Buscando...</div>
              ) : !hasResults ? (
                <div className="text-center py-12 bg-muted/30 rounded-2xl border border-border border-dashed">
                  <p className="text-lg text-foreground mb-2">Nenhum resultado encontrado.</p>
                  <p className="text-muted-foreground text-sm">Tente palavras-chave diferentes.</p>
                </div>
              ) : (
                <div className="space-y-12">
                  {/* Places Results */}
                  {placesData?.places && placesData.places.length > 0 && (
                    <div>
                      <h3 className="text-2xl font-serif mb-6 text-primary flex items-center gap-2">
                        Lugares <span className="text-sm bg-primary/10 px-2 py-0.5 rounded-full text-primary">{placesData.places.length}</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {placesData.places.map(place => (
                          <Link key={place.id} href={`/lugares/${place.slug}`}>
                            <Card className="flex gap-4 p-4 hover:border-primary/50 transition-colors cursor-pointer group">
                              <div className="w-24 h-24 rounded-md overflow-hidden shrink-0">
                                <img src={place.coverImage || ''} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              </div>
                              <div className="flex flex-col justify-center">
                                <span className="text-xs text-primary font-medium mb-1">{place.category}</span>
                                <h4 className="font-serif font-medium text-lg leading-tight mb-1">{place.name}</h4>
                                <p className="text-sm text-muted-foreground line-clamp-1">{place.address}</p>
                              </div>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Posts Results */}
                  {postsData?.posts && postsData.posts.length > 0 && (
                    <div>
                      <h3 className="text-2xl font-serif mb-6 text-primary flex items-center gap-2">
                        Postagens <span className="text-sm bg-primary/10 px-2 py-0.5 rounded-full text-primary">{postsData.posts.length}</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {postsData.posts.map(post => (
                          <Link key={post.id} href={`/blog/${post.slug}`}>
                            <Card className="flex gap-4 p-4 hover:border-primary/50 transition-colors cursor-pointer group">
                              <div className="w-24 h-24 rounded-md overflow-hidden shrink-0 bg-muted">
                                <img src={post.coverImage || ''} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              </div>
                              <div className="flex flex-col justify-center">
                                <span className="text-xs text-primary font-medium mb-1">{post.category}</span>
                                <h4 className="font-serif font-medium text-lg leading-tight mb-1">{post.title}</h4>
                              </div>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
