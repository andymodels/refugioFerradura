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

// Frame estático gerado pelo próprio Cloudinary a partir do vídeo (1s de
// duração) — mesmo padrão usado no editor pra pôster de vídeo.
export function cloudinaryVideoPoster(url: string): string {
  return url
    .replace("/upload/", "/upload/so_1,c_limit,w_640,h_640,q_auto,f_auto/")
    .replace(/\.\w+(\?.*)?$/, ".jpg");
}
