import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Safari (WebKit) tem um comportamento não-padrão: <img src="video.mp4">
// decodifica e toca o vídeo silenciosamente, em loop, como se fosse um GIF
// animado — sem controles, sem como pausar. Como a capa de vários posts
// (importados do Instagram) acaba sendo um vídeo, isso fazia a página
// inteira "se mexer" sozinha. Detecta esses casos pra tratar como vídeo (frame
// estático + ícone de play) em vez de deixar cair num <img> comum.
export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || url.includes("/video/upload/");
}

// Capa padrão de qualquer vídeo do site sem miniatura própria — nunca some,
// não depende de rede (é uma imagem embutida no próprio código), só usa as
// cores da identidade visual (ver @theme em index.css: fundo verde bem
// escuro, círculo terracota, ícone claro). Estado inicial de todo vídeo sem
// miniatura de verdade — nunca mais tela preta chapada.
export const VIDEO_FALLBACK_POSTER = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#171c19"/><stop offset="1" stop-color="#05070a"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="360" fill="url(#g)"/>` +
    `<circle cx="320" cy="180" r="44" fill="#a68a7b" fill-opacity="0.92"/>` +
    `<path d="M307 158 L349 180 L307 202 Z" fill="#e5e1da"/>` +
    `</svg>`,
)}`;

// Vídeo próprio (subido pelo site) sempre grava um arquivo ".poster.jpg" ao
// lado do vídeo — ver createVideoPoster em media-upload.ts e o script
// optimize-b2-media.mjs. Isso só existe pra mídia que passou pelo nosso
// armazenamento (B2); um link de vídeo de qualquer outro site não tem esse
// arquivo, então não adianta "adivinhar" essa URL pra ele.
const OWN_MEDIA_HOSTS = [/\.backblazeb2\.com$/i, /^media\.refugioferradura\.com\.br$/i];

function isOwnMediaHost(url: string): boolean {
  try {
    return OWN_MEDIA_HOSTS.some((re) => re.test(new URL(url).hostname));
  } catch {
    return false;
  }
}

// Frame estático gerado pelo próprio Cloudinary a partir do vídeo (1s de
// duração) — mesmo padrão usado no editor pra pôster de vídeo.
export function videoPosterUrl(url: string): string | null {
  if (url.includes("res.cloudinary.com")) {
    return url
      .replace("/upload/", "/upload/so_1,c_limit,w_640,h_640,q_auto,f_auto/")
      .replace(/\.\w+(\?.*)?$/, ".jpg");
  }
  if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) && isOwnMediaHost(url)) return `${url}.poster.jpg`;
  return null;
}
