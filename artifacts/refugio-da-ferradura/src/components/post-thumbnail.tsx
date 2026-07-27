import { useState } from "react";

const FALLBACK_IMAGE = `${import.meta.env.BASE_URL}images/hero-bg.png`;

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

export function PostThumbnail({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = !failed && isDirectImageUrl(src) ? src! : FALLBACK_IMAGE;

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
