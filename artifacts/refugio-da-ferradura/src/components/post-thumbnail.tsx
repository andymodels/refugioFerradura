import { useState } from "react";
import { Play } from "lucide-react";
import { isVideoUrl, cloudinaryVideoPoster } from "@/lib/utils";

function isDirectImageUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    // Páginas de Instagram, Airbnb e outras páginas HTML nunca devem virar
    // src de thumbnail. Fotos de CDN podem não ter extensão, por isso a
    // verificação final também acontece no onError.
    return !/(^|\.)(instagram\.com|airbnb\.[^/]+)$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function firstImageInArticle(content?: string | null): string | null {
  const match = content?.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
}

export function getPostThumbnailSource(src?: string | null, content?: string | null): string | null {
  const candidate = isDirectImageUrl(src) ? src : firstImageInArticle(content);
  return candidate && isDirectImageUrl(candidate) ? candidate : null;
}

export function PostThumbnail({ src, content, alt, className }: { src?: string | null; content?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const rawSrc = !failed ? getPostThumbnailSource(src, content) : null;
  // Capa em vídeo (comum em posts importados do Instagram) nunca deve virar
  // src de <img> diretamente — ver o comentário sobre o comportamento do
  // Safari em lib/utils.ts. Mostra o frame estático do Cloudinary + um ícone
  // de play por cima, parado, igual o Instagram.
  const isVideo = !!rawSrc && isVideoUrl(rawSrc);
  const imageSrc = rawSrc && isVideo ? cloudinaryVideoPoster(rawSrc) : rawSrc;

  // Uma imagem genérica repetida fazia parecer que todos os lugares eram o
  // mesmo. Se ainda não existe foto própria, preservamos o card sem inventar
  // uma paisagem: ele será preenchido quando a mídia do post for aprovada.
  if (!imageSrc || !isDirectImageUrl(imageSrc)) {
    return <div role="img" aria-label={`Imagem em atualização: ${alt}`} className={`${className || ""} bg-muted/60`} />;
  }

  const img = (
    <img
      src={imageSrc}
      alt={alt}
      className={isVideo ? "w-full h-full object-cover" : className}
      onError={() => setFailed(true)}
    />
  );

  if (!isVideo) return img;

  return (
    <div className={`relative ${className || ""}`}>
      {img}
      <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
        <div className="bg-black/50 rounded-full p-2.5">
          <Play className="w-5 h-5 text-white fill-white" />
        </div>
      </div>
    </div>
  );
}
