import { useState } from "react";
import { useParams } from "wouter";
import { Play } from "lucide-react";
import { Layout } from "@/components/layout";
import { useGetPost } from "@workspace/api-client-react";
import { useSeo } from "@/hooks/use-seo";
import { isVideoUrl, videoPosterUrl } from "@/lib/utils";

function stripLeadingH1(html: string): string {
  // Remove the first <h1>...</h1> regardless of attributes or line breaks
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}

function instagramEmbedUrl(_url: string): string | null {
  // Disabled on purpose: the official Instagram embed iframe always shows
  // Instagram's own white header/footer chrome, which cannot be removed
  // with CSS. This makes renderInstagramEmbeds() below a no-op (plain
  // Instagram links stay as plain links instead of becoming an iframe).
  // Re-enable by restoring the regex match once a real media-archiving
  // pipeline (downloads the photo/video instead of embedding Instagram's
  // UI) exists.
  return null;
}

// Compatibility layer for articles saved before the editor learned to turn
// standalone Instagram links into embeds. It also makes rendering resilient
// if a browser pasted a link as normal rich text instead of an iframe.
function renderInstagramEmbeds(html: string): string {
  if (typeof document === "undefined" || !/instagram\.com\/(p|reel|tv)\//i.test(html)) return html;

  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder.querySelectorAll("p").forEach((paragraph) => {
    const anchor = paragraph.querySelector("a[href]");
    const text = paragraph.textContent?.trim() || "";
    const sourceUrl = anchor?.getAttribute("href") || text;
    const isOnlyLink = anchor ? text === (anchor.textContent?.trim() || "") : true;
    const embedUrl = isOnlyLink ? instagramEmbedUrl(sourceUrl) : null;
    if (!embedUrl) return;

    const wrapper = document.createElement("div");
    wrapper.className = "video-embed-wrap";
    wrapper.style.width = "100%";
    wrapper.innerHTML = `<iframe data-video-embed data-embed-type="instagram" class="video-embed-instagram" src="${embedUrl}" frameborder="0" scrolling="no" allowtransparency="true" style="width:100%;min-height:540px;border-radius:12px"></iframe>`;
    paragraph.replaceWith(wrapper);
  });
  return holder.innerHTML;
}

// Carrossel publicado (fotos ou vídeos), estilo Instagram: um item por vez,
// ocupando o espaço de acordo com a própria proporção (retrato ou
// paisagem), com setas e bolinhas pra trocar — em vez da faixa horizontal
// antiga, que deixava vários itens pequenos lado a lado (ruim principalmente
// pra vídeo vertical/Reels, a maioria hoje). Os cliques usam onclick como
// string porque este HTML vira string (innerHTML) antes de ser injetado na
// página, perdendo qualquer closure de JS.
function enhanceCarousels(html: string): string {
  if (
    typeof document === "undefined" ||
    (!html.includes("image-carousel-block") && !html.includes("video-carousel-block") && !html.includes("media-carousel-block"))
  ) return html;

  const NAV = {
    prev: "var w=this.closest('[data-carousel-nav]'),v=[].slice.call(w.querySelectorAll('.carousel-slide')),d=[].slice.call(w.querySelectorAll('.carousel-dot')),c=v.findIndex(function(x){return x.classList.contains('is-active')}),n=(c-1+v.length)%v.length;v[c].classList.remove('is-active');if(v[c].pause)v[c].pause();v[n].classList.add('is-active');if(d[c])d[c].classList.remove('is-active');if(d[n])d[n].classList.add('is-active');",
    next: "var w=this.closest('[data-carousel-nav]'),v=[].slice.call(w.querySelectorAll('.carousel-slide')),d=[].slice.call(w.querySelectorAll('.carousel-dot')),c=v.findIndex(function(x){return x.classList.contains('is-active')}),n=(c+1)%v.length;v[c].classList.remove('is-active');if(v[c].pause)v[c].pause();v[n].classList.add('is-active');if(d[c])d[c].classList.remove('is-active');if(d[n])d[n].classList.add('is-active');",
    dot: "var w=this.closest('[data-carousel-nav]'),v=[].slice.call(w.querySelectorAll('.carousel-slide')),d=[].slice.call(w.querySelectorAll('.carousel-dot')),c=v.findIndex(function(x){return x.classList.contains('is-active')}),n=parseInt(this.dataset.index,10);if(n===c)return;v[c].classList.remove('is-active');if(v[c].pause)v[c].pause();v[n].classList.add('is-active');d[c].classList.remove('is-active');d[n].classList.add('is-active');",
  };

  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder.querySelectorAll(".image-carousel-block, .video-carousel-block, .media-carousel-block").forEach((block) => {
    // Posts salvos antes dessa mudança têm um <style> antigo (faixa
    // horizontal) gravado no HTML, que tem prioridade sobre a classe CSS
    // nova — remove pra deixar a folha de estilo atual assumir o layout. Os
    // slides desses posts antigos também não têm a classe .carousel-slide
    // (só .carousel-slide-img/-video), então usa os filhos diretos do bloco
    // em vez de depender da classe, e adiciona ela aqui — assim tanto posts
    // antigos quanto novos ficam compatíveis com o carrossel atual sem
    // precisar reabrir e salvar cada post de novo.
    block.removeAttribute("style");
    const slides = Array.from(block.children) as HTMLElement[];
    if (slides.length === 0) return;
    // Fotos de iPhone sobem como .heic — sem pedir a conversão pro Cloudinary
    // (f_auto), o arquivo cru é servido do jeito que foi enviado e a maioria
    // dos navegadores não consegue exibir, mesmo com o arquivo intacto.
    slides.forEach((el) => {
      if (el.tagName !== "IMG") return;
      const src = el.getAttribute("src") || "";
      if (/\.(heic|heif)(\?.*)?$/i.test(src)) {
        el.setAttribute("src", src.replace("/upload/", "/upload/f_auto,q_auto/"));
      }
    });
    slides.forEach((el) => el.classList.add("carousel-slide"));
    slides[0].classList.add("is-active");
    if (slides.length < 2) return; // 1 item não precisa de navegação

    const wrap = document.createElement("div");
    wrap.className = "carousel-wrap";
    wrap.setAttribute("data-carousel-nav", "");
    block.replaceWith(wrap);

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "carousel-arrow carousel-arrow-prev";
    prevBtn.setAttribute("aria-label", "Item anterior");
    prevBtn.innerHTML = "&#8249;";
    prevBtn.setAttribute("onclick", NAV.prev);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "carousel-arrow carousel-arrow-next";
    nextBtn.setAttribute("aria-label", "Próximo item");
    nextBtn.innerHTML = "&#8250;";
    nextBtn.setAttribute("onclick", NAV.next);

    const dots = document.createElement("div");
    dots.className = "carousel-dots";
    slides.forEach((_, i) => {
      const dot = document.createElement("span");
      dot.className = "carousel-dot" + (i === 0 ? " is-active" : "");
      dot.setAttribute("data-index", String(i));
      dot.setAttribute("onclick", NAV.dot);
      dots.appendChild(dot);
    });

    wrap.append(prevBtn, block, nextBtn, dots);
  });
  return holder.innerHTML;
}

function isInstagramPostUrl(url?: string | null) {
  return !!url && /instagram\.com\/(p|reel|tv)\//i.test(url);
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
  const [coverPlaying, setCoverPlaying] = useState(false);

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

  const cleanedContent = enhanceCarousels(renderInstagramEmbeds(stripLeadingH1(post!.content || "")));

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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-semibold leading-tight tracking-tight text-primary mb-4">
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

        {/* Cover image/video — capa em vídeo (comum em posts importados do
            Instagram) começa pausada, com um ícone de play por cima, igual o
            Instagram; só carrega e toca o vídeo de verdade se a pessoa
            clicar. Ver o comentário sobre o Safari em lib/utils.ts pro
            motivo de nunca usar a URL do vídeo direto como src de <img>. */}
        {post.coverImage && !isInstagramPostUrl(post.coverImage) && (
          <div
            className={
              post.coverImageDisplayMode === "natural"
                ? "mb-10 flex justify-start"
                : "relative w-full mb-10 rounded-xl overflow-hidden"
            }
          >
            {isVideoUrl(post.coverImage) && !coverPlaying ? (
              <button
                type="button"
                onClick={() => setCoverPlaying(true)}
                aria-label="Reproduzir vídeo de capa"
                className={
                  post.coverImageDisplayMode === "natural"
                    ? "relative block h-auto w-auto max-h-[640px] max-w-full rounded-xl overflow-hidden"
                    : "relative w-full max-h-[480px] block"
                }
              >
                {videoPosterUrl(post.coverImage) ? (
                  <img
                    src={videoPosterUrl(post.coverImage)!}
                    alt={post.title}
                    className={post.coverImageDisplayMode === "natural" ? "block h-auto w-auto max-h-[640px] max-w-full rounded-xl object-contain" : "w-full max-h-[480px] object-cover"}
                    style={{ objectPosition: post.coverImagePosition || "center center" }}
                  />
                ) : (
                  <video
                    src={post.coverImage}
                    preload="metadata"
                    muted
                    playsInline
                    className={post.coverImageDisplayMode === "natural" ? "block h-auto w-auto max-h-[640px] max-w-full rounded-xl object-contain" : "w-full max-h-[480px] object-cover"}
                    style={{ objectPosition: post.coverImagePosition || "center center" }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <div className="bg-black/50 rounded-full p-4">
                    <Play className="w-7 h-7 text-white fill-white" />
                  </div>
                </div>
              </button>
            ) : isVideoUrl(post.coverImage) ? (
              <video
                src={post.coverImage}
                controls
                autoPlay
                playsInline
                className={
                  post.coverImageDisplayMode === "natural"
                    ? "block h-auto w-auto max-h-[640px] max-w-full rounded-xl object-contain"
                    : "w-full max-h-[480px] object-cover"
                }
                style={{ objectPosition: post.coverImagePosition || "center center" }}
              />
            ) : (
              <img
                src={post.coverImage}
                alt={post.title}
                className={
                  post.coverImageDisplayMode === "natural"
                    ? "block h-auto w-auto max-h-[640px] max-w-full rounded-xl object-contain"
                    : "w-full max-h-[480px] object-cover"
                }
                style={{ objectPosition: post.coverImagePosition || "center center" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
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
