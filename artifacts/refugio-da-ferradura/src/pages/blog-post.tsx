import React from "react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Tag, ArrowLeft } from "lucide-react";
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
          <h1 className="text-3xl font-serif text-foreground mb-4">Postagem não encontrada</h1>
          <Link href="/blog" className="text-primary hover:underline">Voltar para o blog</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="pt-32 pb-24">
        {/* Header */}
        <header className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-12">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Voltar para o Blog
          </Link>
          <div className="flex items-center justify-center gap-4 text-xs font-medium uppercase tracking-wider text-primary mb-6">
            <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> {post.category}</span>
            <span className="text-muted-foreground">•</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" /> {format(new Date(post.createdAt), "dd 'de' MMM, yyyy", { locale: ptBR })}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-foreground leading-tight mb-6">
            {post.title}
          </h1>
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
      </article>
    </Layout>
  );
}
