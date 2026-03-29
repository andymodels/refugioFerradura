import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Menu, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button, Card, cn } from "@/components/ui-elements";
import { useListPosts } from "@workspace/api-client-react";

const logoIcon = `${import.meta.env.BASE_URL}images/logo-icon.png`;

const navLinks = [
  { name: "Início", href: "/" },
  { name: "Lugares", href: "/lugares" },
  { name: "Experiências", href: "/experiencias" },
  { name: "Gastronomia", href: "/gastronomia" },
  { name: "Hospedagem", href: "/hospedagem" },
  { name: "Buscar", href: "/buscar" },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const { data: lugaresData } = useListPosts({ tag: "lugares", limit: 3 } as any);
  const { data: experienciasData } = useListPosts({ tag: "experiencias", limit: 3 } as any);

  const lugaresPosts = lugaresData?.posts || [];
  const experienciasPosts = experienciasData?.posts || [];

  return (
    <Layout hideHeader>
      {/* Hero Section — nav lives here */}
      <section className="relative h-[85vh] min-h-[600px] flex items-center justify-center">
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=85&auto=format&fit=crop"
            alt="Vista aérea da Mata Atlântica e montanhas de Guarapari"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 bg-gradient-to-t from-background via-black/20 to-black/60" />
        </div>

        {/* Logo + Nav — absolute at top of hero */}
        <div className="absolute top-0 inset-x-0 z-20 px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/">
              <img
                src={logoIcon}
                alt="Refúgio da Ferradura"
                className="h-[64px] w-auto object-contain drop-shadow-lg"
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={cn(
                    "text-sm font-semibold tracking-wide transition-all hover:opacity-100 text-white drop-shadow-md",
                    location === link.href ? "opacity-100 border-b border-white/60 pb-0.5" : "opacity-80"
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Mobile toggle */}
            <button
              className="md:hidden p-2 text-white drop-shadow-md"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 bg-background z-50 flex flex-col pt-24 px-6">
            <button className="absolute top-5 right-5 p-2" onClick={() => setMobileMenuOpen(false)}>
              <X className="w-6 h-6" />
            </button>
            <nav className="flex flex-col gap-6 text-2xl font-serif">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn("border-b border-border pb-4 transition-colors", location === link.href ? "text-primary" : "text-foreground")}
                >
                  {link.name}
                </Link>
              ))}
            </nav>
          </div>
        )}

        {/* Hero Content */}
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

      {/* Featured Places */}
      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-12">
            <div>
              <span className="text-primary font-medium tracking-wider uppercase text-xs mb-2 block">Destaques</span>
              <h2 className="text-3xl md:text-4xl font-serif">Lugares para Visitar</h2>
            </div>
            <Link href="/lugares" className="hidden sm:flex items-center gap-2 text-primary font-medium hover:opacity-80 transition-opacity">
              Ver todos <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {lugaresPosts.map((post) => {
              const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
              return (
                <Link key={post.id} href={`/blog/${post.slug}`} className="group block h-full">
                  <Card className="h-full border-transparent hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 bg-background/50 backdrop-blur-sm">
                    <div className="aspect-[4/3] overflow-hidden relative">
                      <img
                        src={post.coverImage || "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop"}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute top-4 left-4 flex gap-2 flex-wrap">
                        {tags.filter(t => t !== "lugares").slice(0, 1).map(t => (
                          <span key={t} className="bg-background/90 backdrop-blur px-3 py-1 text-xs font-medium rounded-full text-primary capitalize">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-serif font-medium mb-2 group-hover:text-primary transition-colors">{post.title}</h3>
                      {post.subtitle && <p className="text-xs text-primary/60 italic mb-2">{post.subtitle}</p>}
                      <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                        {post.excerpt || post.content.replace(/<[^>]*>?/gm, '').substring(0, 100)}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 sm:hidden text-center">
            <Link href="/lugares">
              <Button variant="outline" className="w-full">Ver todos os lugares</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Latest Experiências */}
      <section className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-16">
            <div className="text-center flex-1">
              <span className="text-primary font-medium tracking-wider uppercase text-xs mb-2 block">Inspire-se</span>
              <h2 className="text-3xl md:text-4xl font-serif">Experiências em Destaque</h2>
            </div>
            <Link href="/experiencias" className="hidden sm:flex items-center gap-2 text-primary font-medium hover:opacity-80 transition-opacity shrink-0">
              Ver todas <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {experienciasPosts.map((post, idx) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className={cn("group block", idx === 0 && "lg:col-span-2 lg:row-span-2")}>
                <div className="relative h-full overflow-hidden rounded-xl bg-muted aspect-square lg:aspect-auto">
                  <img
                    src={post.coverImage || "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=1200&auto=format&fit=crop"}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-6 sm:p-8 w-full">
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {(post.tags ? JSON.parse(post.tags) : []).slice(0, 2).map((t: string) => (
                        <span key={t} className="text-primary-foreground/90 text-xs font-medium tracking-wider uppercase bg-white/10 px-2 py-0.5 rounded capitalize">
                          {t}
                        </span>
                      ))}
                    </div>
                    <h3 className={cn("font-serif text-white font-medium group-hover:text-primary-foreground/90 transition-colors mb-1", idx === 0 ? "text-2xl sm:text-4xl" : "text-xl")}>
                      {post.title}
                    </h3>
                    {post.subtitle && idx === 0 && (
                      <p className="text-white/60 text-sm italic mt-1">{post.subtitle}</p>
                    )}
                    <p className="text-white/70 text-sm line-clamp-2 mt-2 font-light">
                      {post.excerpt || post.content.replace(/<[^>]*>?/gm, '').substring(0, 100)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
