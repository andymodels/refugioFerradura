import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { useGetPost } from "@workspace/api-client-react";
import { useSeo } from "@/hooks/use-seo";

function stripLeadingH1(html: string): string {
  // Remove the first <h1>...</h1> regardless of attributes or line breaks
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}

function buildJsonLd(post: {
  title: string;
  subtitle?: string | null;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  coverImageDisplayMode?: string | null;
  slug: string;
  createdAt: string;
  updatedAt?: string | null;
  tags?: string | null;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/blog/${post.slug}`;
  const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
  const hasTag = (t: string) => tags.includes(t);
  const desc =
    post.excerpt ||
    (post.content || "").replace(/<[^>]*>/g, "").substring(0, 160);
  const image = post.coverImage || undefined;

  const publisher = {
    "@type": "Organization",
    name: "Refúgio da Ferradura",
    url: origin,
    logo: { "@type": "ImageObject", url: `${origin}/favicon.svg` },
  };

  if (hasTag("gastronomia")) {
    return {
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: post.title,
      description: desc,
      image,
      url,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Guarapari",
        addressRegion: "Espírito Santo",
        addressCountry: "BR",
      },
      servesCuisine: "Cozinha Regional Capixaba",
      areaServed: "Rota da Ferradura, Guarapari – ES",
    };
  }

  if (hasTag("hospedagem")) {
    return {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      name: post.title,
      description: desc,
      image,
      url,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Guarapari",
        addressRegion: "Espírito Santo",
        addressCountry: "BR",
      },
      areaServed: "Rota da Ferradura, Guarapari – ES",
    };
  }

  if (hasTag("lugares") || hasTag("experiencias")) {
    return {
      "@context": "https://schema.org",
      "@type": "TouristAttraction",
      name: post.title,
      description: desc,
      image,
      url,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Guarapari",
        addressRegion: "Espírito Santo",
        addressCountry: "BR",
      },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: desc,
    image,
    url,
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    author: publisher,
    publisher,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

export default function BlogPost() {
  const { slug } = useParams();
  const { data, isLoading } = useGetPost(slug || "");

  const post = data ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const postUrl = `${origin}/blog/${slug}`;

  useSeo(
    post
      ? {
          title: post.title,
          description:
            post.metaDescription ||
            post.excerpt ||
            (post.content || "").replace(/<[^>]*>/g, "").substring(0, 160),
          image: post.coverImage || undefined,
          url: postUrl,
          type: "article",
          jsonLd: buildJsonLd({
            ...post,
            slug: slug || "",
            createdAt: String(post.createdAt),
            updatedAt: String(post.updatedAt ?? post.createdAt),
          }),
        }
      : { noIndex: isLoading }
  );

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

  const cleanedContent = stripLeadingH1(post!.content || "");

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
          <div
            className={
              post.coverImageDisplayMode === "natural"
                ? "mb-10 flex justify-start"
                : "relative w-full mb-10 rounded-xl overflow-hidden"
            }
          >
            <img
              src={post.coverImage}
              alt={post.title}
              className={
                post.coverImageDisplayMode === "natural"
                  ? "block h-auto w-auto max-h-[640px] max-w-full rounded-xl object-contain"
                  : "w-full max-h-[480px] object-cover"
              }
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
