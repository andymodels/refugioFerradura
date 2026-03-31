import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { useGetPost } from "@workspace/api-client-react";

function stripLeadingH1(html: string): string {
  // Remove the first <h1>...</h1> regardless of attributes or line breaks
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}

export default function BlogPost() {
  const { slug } = useParams();
  const { data, isLoading } = useGetPost(slug || "");

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-32 text-center text-muted-foreground">
          Carregando...
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-32 text-center text-muted-foreground">
          Post não encontrado.
        </div>
      </Layout>
    );
  }

  const post = data;
  const cleanedContent = stripLeadingH1(post.content || "");

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-4 py-16 md:py-24">

        {/* Tags */}
        {post.tags && (() => {
          try {
            const tags: string[] = JSON.parse(post.tags as string);
            if (tags.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 mb-6">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] uppercase tracking-widest text-primary/70 border border-primary/20 rounded-full px-3 py-1"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            );
          } catch {
            return null;
          }
        })()}

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-semibold leading-tight tracking-tight text-foreground mb-4">
          {post.title}
        </h1>

        {/* Subtitle */}
        {post.subtitle && (
          <p className="text-base sm:text-lg text-primary/70 italic mb-8 leading-relaxed">
            {post.subtitle}
          </p>
        )}

        {/* Date */}
        {post.createdAt && (
          <p className="text-xs text-muted-foreground mb-8">
            {new Date(post.createdAt as string).toLocaleDateString("pt-BR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        {/* Cover image */}
        {post.coverImage && (
          <div className="relative w-full mb-10 rounded-xl overflow-hidden">
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full max-h-[480px] object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {/* Content */}
        <div
          className="post-content text-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: cleanedContent }}
        />

      </article>
    </Layout>
  );
}
