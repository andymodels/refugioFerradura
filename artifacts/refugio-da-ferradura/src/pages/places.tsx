import React, { useState } from "react";
import { Link } from "wouter";
import { MapPin, Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, Input } from "@/components/ui-elements";
import { useListPlaces } from "@workspace/api-client-react";
import { cn } from "@/components/ui-elements";

const CATEGORIES = ["Todos", "Cachoeiras", "Trilhas", "Gastronomia", "Hospedagem", "Praias", "Mirantes"];

export default function Places() {
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  
  // Use debounced search or manual submission in a real app, here we pass it directly
  const { data, isLoading } = useListPlaces({ 
    category: activeCategory === "Todos" ? undefined : activeCategory,
    search: search || undefined
  });
  
  const places = data?.places || [];

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

          {/* Filters */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-background p-4 rounded-xl shadow-sm border border-border">
            <div className="flex overflow-x-auto w-full md:w-auto no-scrollbar pb-2 md:pb-0 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                    activeCategory === cat 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {cat}
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
        ) : places.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-serif text-foreground mb-2">Nenhum lugar encontrado.</h3>
            <p className="text-muted-foreground">Tente ajustar seus filtros de busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {places.map((place) => (
              <Link key={place.id} href={`/lugares/${place.slug}`} className="group block h-full">
                <Card className="h-full flex flex-col border-border/50 hover:border-primary/30 hover:shadow-xl transition-all duration-300">
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <img 
                      src={place.coverImage || "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop"} 
                      alt={place.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <div className="bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-full text-primary shadow-sm">
                        {place.category}
                      </div>
                      {place.featured && (
                        <div className="bg-accent/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-full text-accent-foreground shadow-sm w-fit">
                          Destaque
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-6 flex flex-col flex-1">
                    <h3 className="text-xl font-serif font-medium mb-2 group-hover:text-primary transition-colors">{place.name}</h3>
                    <p className="text-muted-foreground text-sm line-clamp-3 mb-6 flex-1">
                      {place.description.replace(/<[^>]*>?/gm, '')}
                    </p>
                    {place.address && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-4 border-t border-border/50">
                        <MapPin className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="truncate">{place.address}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
