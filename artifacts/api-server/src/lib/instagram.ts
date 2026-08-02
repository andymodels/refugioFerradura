import Anthropic from "@anthropic-ai/sdk";
import { parseHTML } from "linkedom";
import type { Post } from "@workspace/db";
import { logger } from "./logger";

const GRAPH_API_VERSION = "v21.0";

const CAPTION_SYSTEM_PROMPT = `Você escreve legendas para o feed do Instagram oficial @refugioferradura, guia de turismo da Rota da Ferradura em Guarapari-ES.

Regras:
- Baseie-se apenas no texto do post fornecido, nunca invente detalhes (endereço, preço, contato) que não estejam nele.
- Tom convidativo, direto, sem exagero publicitário.
- Se for informado o Instagram do local/negócio do post, marque esse perfil (@handle) em algum ponto natural do texto — é obrigatório, nunca esqueça.
- Máximo 5 linhas de texto antes das hashtags.
- Termine com 5 a 8 hashtags relevantes (região, tipo de negócio, turismo capixaba).
- Não use markdown, apenas texto simples com quebras de linha.
- Responda só com a legenda final, sem comentários extras.`;

function getTextBlock(message: Anthropic.Message): string {
  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock) throw new Error("A IA não retornou texto.");
  return textBlock.text;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// instagram.com/p/..., /reel/..., /stories/... etc. não são o @ do negócio —
// são links pra publicações específicas, não pro perfil.
const RESERVED_INSTAGRAM_PATHS = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);

// Acha o @ do negócio/atrativo do post (vem do link de contato Instagram
// gerado por buildInstagramHtml em contact-links.ts, ex:
// <a href="https://instagram.com/nome.do.negocio">@nome.do.negocio</a>).
function extractFeaturedInstagramHandle(content: string): string | null {
  for (const match of content.matchAll(/instagram\.com\/([a-zA-Z0-9_.]+)/g)) {
    const handle = match[1].replace(/\/+$/, "");
    if (handle && !RESERVED_INSTAGRAM_PATHS.has(handle.toLowerCase())) {
      return handle;
    }
  }
  return null;
}

export async function generateInstagramCaption(post: Post): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const plainText = stripHtml(post.content).slice(0, 4000);
  const featuredHandle = extractFeaturedInstagramHandle(post.content);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: CAPTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Título: ${post.title}\n${post.subtitle ? `Subtítulo: ${post.subtitle}\n` : ""}${featuredHandle ? `Instagram do local/negócio: @${featuredHandle} (marque esse perfil na legenda, é obrigatório)\n` : ""}Texto do post:\n${plainText}`,
      },
    ],
  });

  let caption = getTextBlock(message).trim();

  // Rede de segurança: se a IA esquecer de marcar, garante que o @ do local
  // sempre apareça na legenda — isso é regra, não opcional.
  if (featuredHandle && !caption.toLowerCase().includes(`@${featuredHandle.toLowerCase()}`)) {
    caption = `${caption}\n\n📍 @${featuredHandle}`;
  }

  // O Instagram rejeita legendas acima de 2200 caracteres.
  return caption.slice(0, 2200);
}

export interface InstagramPublishResult {
  mediaId: string;
  caption: string;
  permalink: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MediaSource {
  kind: "foto" | "video";
  url: string;
}

// Prioriza a primeira foto/vídeo editorial aprovado no corpo do post
// (mediaItems, preenchido pelo pipeline de mídia com a mídia de verdade do
// artigo) — a imagem de capa é um campo opcional e às vezes é só um
// enfeite genérico, não a melhor foto do post. Só cai pra capa se não
// houver nenhuma mídia aprovada no corpo.
// Posts colados/criados direto no editor (sem passar pelo pipeline
// automático) nunca têm mediaItems preenchido, mas têm fotos/vídeos reais
// dentro do próprio HTML do corpo (figuras, imagens soltas, carrossel,
// vídeo editorial) — acha a primeira mídia de verdade aí.
function extractFirstMediaFromContent(content: string): MediaSource | null {
  if (!content) return null;
  const { document } = parseHTML(`<div>${content}</div>`);

  // querySelectorAll com seletor combinado devolve os elementos na ORDEM real
  // do documento — essencial aqui, porque a primeira mídia pode ser uma foto
  // solta, um vídeo ou um carrossel, em qualquer ordem entre os blocos de
  // texto. O primeiro elemento encontrado é sempre a primeira mídia de
  // verdade do post, nunca a "melhor" ou a de um tipo específico.
  const candidates = document.querySelectorAll("video[src], [data-carousel], img[src]");

  for (const el of candidates) {
    if (el.hasAttribute("data-carousel")) {
      try {
        const urls: unknown = JSON.parse(el.getAttribute("data-carousel") || "[]");
        if (Array.isArray(urls) && typeof urls[0] === "string" && urls[0]) {
          return { kind: "foto", url: urls[0] };
        }
      } catch {
        // carrossel malformado — segue pro próximo candidato na ordem
        continue;
      }
      continue;
    }

    const src = el.getAttribute("src");
    if (!src) continue;
    return { kind: el.tagName.toLowerCase() === "video" ? "video" : "foto", url: src };
  }

  return null;
}

function resolveMediaSource(post: Post): MediaSource | null {
  if (post.mediaItems) {
    try {
      const items: Array<{ kind?: string; urlArquivo?: string }> = JSON.parse(post.mediaItems);
      const first = items.find((item) => typeof item.urlArquivo === "string" && item.urlArquivo);
      if (first?.urlArquivo) {
        return { kind: first.kind === "video" ? "video" : "foto", url: first.urlArquivo };
      }
    } catch {
      // mediaItems malformado — segue pro próximo fallback
    }
  }

  const fromContent = extractFirstMediaFromContent(post.content);
  if (fromContent) return fromContent;

  if (post.coverImage) {
    // "Capa" é um campo genérico que às vezes guarda um vídeo do Cloudinary
    // (URL com /video/upload/ ou extensão de vídeo), não só foto.
    const isVideo = /\/video\/upload\//.test(post.coverImage) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(post.coverImage);
    return { kind: isVideo ? "video" : "foto", url: post.coverImage };
  }

  return null;
}

// Fotos enviadas de iPhone ficam salvas no Cloudinary como HEIC, formato que
// o Instagram não processa no upload por URL. Força a entrega em JPEG via
// transformação do Cloudinary (não baixa/reenvia nada, só muda a URL).
function ensureJpegUrl(url: string): string {
  if (!/\.heic(\?|$)/i.test(url)) return url;
  return url.replace("/upload/", "/upload/f_jpg,q_auto/");
}

// O Instagram processa o container de mídia de forma assíncrona (baixa e
// transcodifica o arquivo antes de deixar publicar — vídeo demora bem mais
// que foto). Publicar assim que o container é criado falha com "media is
// not ready for publishing" — é preciso esperar o status_code virar
// FINISHED antes de chamar media_publish.
async function waitForContainerReady(containerId: string, accessToken: string, kind: "foto" | "video"): Promise<void> {
  const statusUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${containerId}`);
  statusUrl.searchParams.set("fields", "status_code");
  statusUrl.searchParams.set("access_token", accessToken);

  const maxAttempts = kind === "video" ? 30 : 10;
  const intervalMs = kind === "video" ? 3000 : 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await fetch(statusUrl);
    const statusData: any = await statusRes.json();

    if (statusData?.status_code === "FINISHED") return;
    if (statusData?.status_code === "ERROR") {
      throw new Error(`O Instagram falhou ao processar ${kind === "video" ? "o vídeo" : "a imagem"} para publicação.`);
    }

    await sleep(intervalMs);
  }

  throw new Error(`O Instagram demorou demais pra processar ${kind === "video" ? "o vídeo" : "a imagem"}. Tente novamente em alguns instantes.`);
}

// Publica no feed do Instagram oficial (@refugioferradura). Sempre disparado
// manualmente pelo painel admin — nunca por cron/agendamento.
export async function publishPostToInstagram(post: Post): Promise<InstagramPublishResult> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;
  if (!accessToken || !igUserId) {
    throw new Error("Instagram não está configurado neste ambiente (faltam INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID).");
  }
  const source = resolveMediaSource(post);
  if (!source) {
    throw new Error("Este post não tem nenhuma foto ou vídeo aprovado pra publicar no Instagram.");
  }

  const caption = await generateInstagramCaption(post);

  const containerUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/media`);
  if (source.kind === "video") {
    // media_type=REELS é obrigatório pro Instagram aceitar video_url neste
    // endpoint — vídeo publicado sem isso é rejeitado.
    containerUrl.searchParams.set("media_type", "REELS");
    containerUrl.searchParams.set("video_url", source.url);
  } else {
    containerUrl.searchParams.set("image_url", ensureJpegUrl(source.url));
  }
  containerUrl.searchParams.set("caption", caption);
  containerUrl.searchParams.set("access_token", accessToken);

  const containerRes = await fetch(containerUrl, { method: "POST" });
  const containerData: any = await containerRes.json();
  if (!containerRes.ok || !containerData?.id) {
    logger.error(
      { status: containerRes.status, data: containerData, postId: post.id, mediaKind: source.kind },
      "Falha ao criar container de mídia no Instagram",
    );
    throw new Error(
      containerData?.error?.error_user_msg || containerData?.error?.message || "Falha ao preparar a publicação no Instagram.",
    );
  }

  await waitForContainerReady(containerData.id, accessToken, source.kind);

  const publishUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/media_publish`);
  publishUrl.searchParams.set("creation_id", containerData.id);
  publishUrl.searchParams.set("access_token", accessToken);

  const publishRes = await fetch(publishUrl, { method: "POST" });
  const publishData: any = await publishRes.json();
  if (!publishRes.ok || !publishData?.id) {
    logger.error(
      { status: publishRes.status, data: publishData, postId: post.id },
      "Falha ao publicar mídia no Instagram",
    );
    throw new Error(
      publishData?.error?.error_user_msg || publishData?.error?.message || "Falha ao publicar no Instagram.",
    );
  }

  const permalink = await fetchPermalink(publishData.id, accessToken);
  logger.info({ postId: post.id, mediaId: publishData.id, permalink }, "Post publicado no Instagram");

  return { mediaId: publishData.id, caption, permalink };
}

async function fetchPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  try {
    const url = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${mediaId}`);
    url.searchParams.set("fields", "permalink");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    const data: any = await res.json();
    return typeof data?.permalink === "string" ? data.permalink : null;
  } catch {
    return null;
  }
}
