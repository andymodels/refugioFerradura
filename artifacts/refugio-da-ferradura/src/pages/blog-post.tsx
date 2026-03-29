import React from "react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Tag, ArrowLeft, Images } from "lucide-react";
import { Layout } from "@/components/layout";
import { useGetPost } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const { data: post, isLoading, error } = useGetPost(params?.slug || "");

  if (isLoading) {
    return (
      <Layout>
        <div className="pt-32 pb-16 max-w-3xl mx-auto px-4 animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-6"></div>
          <div className="h-12 bg-muted rounded w-3/4 mb-6"></div>
          <div className="aspect-video bg-muted rounded-xl mb-10"></div>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !post) {
    return (
      <Layout>
        <div className="pt-40 pb-20 text-center">
          <h1 className="text-3xl font-serif text-foreground mb-4">Conteúdo não encontrado</h1>
          <Link href="/blog" className="text-primary hover:underline">Voltar para o blog</Link>
        </div>
      </Layout>
    );
  }

  const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
  const gallery: string[] = post.gallery ? JSON.parse(post.gallery) : [];
  const videoEmbeds: string[] = post.videoEmbeds ? JSON.parse(post.videoEmbeds) : [];

  return (
    <Layout>
      <article className="pt-32 pb-24">
        {/* Header */}
        <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-12">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                  <Tag className="w-3 h-3" /> {t}
                </span>
              ))}
              <span className="text-muted-foreground">•</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(post.createdAt), "dd 'de' MMM, yyyy", { locale: ptBR })}
              </span>
            </div>
          )}

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-foreground leading-tight mb-4">
            {post.title}
          </h1>
          {post.subtitle && (
            <p className="text-xl md:text-2xl text-primary/70 font-light italic mb-6">
              {post.subtitle}
            </p>
          )}
          {post.excerpt && (
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
              {post.excerpt}
            </p>
          )}
        </header>

        {/* Hero Image */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <div className="aspect-[21/9] rounded-2xl overflow-hidden shadow-lg">
            <img
              src={post.coverImage || "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop"}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="prose prose-stone prose-lg max-w-none 
              prose-headings:font-serif prose-headings:text-foreground
              prose-h2:text-3xl prose-h2:mt-12 prose-h2:mb-6
              prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-6
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline
              prose-img:rounded-xl prose-img:shadow-md"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </div>

        {/* Gallery */}
        {gallery.length > 0 && (
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
            <h2 className="text-2xl font-serif text-foreground mb-8 flex items-center gap-3">
              <Images className="w-6 h-6 text-primary" />
              Galeria de Fotos
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((url, idx) => (
                <div key={idx} className={`overflow-hidden rounded-xl bg-muted shadow-sm ${idx === 0 && gallery.length >= 3 ? "col-span-2 row-span-2" : ""}`}>
                  <img
                    src={url}
                    alt={`Galeria ${idx + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                    style={{ minHeight: idx === 0 && gallery.length >= 3 ? "320px" : "180px" }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Video Embeds */}
        {videoEmbeds.length > 0 && (
          <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
            <h2 className="text-2xl font-serif text-foreground mb-8">Vídeos</h2>
            <div className="space-y-8">
              {videoEmbeds.map((embedUrl, idx) => (
                <div key={idx} className="aspect-video rounded-2xl overflow-hidden shadow-lg bg-muted">
                  <iframe
                    src={embedUrl}
                    title={`Video ${idx + 1}`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </article>
    </Layout>
  );
}
