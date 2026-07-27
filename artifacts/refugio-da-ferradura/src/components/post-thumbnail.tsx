import { useState } from "react";

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
  const imageSrc = !failed ? getPostThumbnailSource(src, content) : null;

  // Uma imagem genérica repetida fazia parecer que todos os lugares eram o
  // mesmo. Se ainda não existe foto própria, preservamos o card sem inventar
  // uma paisagem: ele será preenchido quando a mídia do post for aprovada.
  if (!imageSrc || !isDirectImageUrl(imageSrc)) {
    return <div role="img" aria-label={`Imagem em atualização: ${alt}`} className={`${className || ""} bg-muted/60`} />;
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
