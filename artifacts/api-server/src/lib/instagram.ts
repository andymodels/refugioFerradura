import Anthropic from "@anthropic-ai/sdk";
import type { Post } from "@workspace/db";
import { logger } from "./logger";

const GRAPH_API_VERSION = "v21.0";

const CAPTION_SYSTEM_PROMPT = `Você escreve legendas para o feed do Instagram oficial @refugioferradura, guia de turismo da Rota da Ferradura em Guarapari-ES.

Regras:
- Baseie-se apenas no texto do post fornecido, nunca invente detalhes (endereço, preço, contato) que não estejam nele.
- Tom convidativo, direto, sem exagero publicitário.
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

export async function generateInstagramCaption(post: Post): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const plainText = stripHtml(post.content).slice(0, 4000);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: CAPTION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Título: ${post.title}\n${post.subtitle ? `Subtítulo: ${post.subtitle}\n` : ""}Texto do post:\n${plainText}`,
      },
    ],
  });

  // O Instagram rejeita legendas acima de 2200 caracteres.
  return getTextBlock(message).trim().slice(0, 2200);
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
function resolveMediaSource(post: Post): MediaSource | null {
  if (post.mediaItems) {
    try {
      const items: Array<{ kind?: string; urlArquivo?: string }> = JSON.parse(post.mediaItems);
      const first = items.find((item) => typeof item.urlArquivo === "string" && item.urlArquivo);
      if (first?.urlArquivo) {
        return { kind: first.kind === "video" ? "video" : "foto", url: first.urlArquivo };
      }
    } catch {
      // mediaItems malformado — segue pro fallback da capa
    }
  }

  if (post.coverImage) {
    return { kind: "foto", url: post.coverImage };
  }

  return null;
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
    containerUrl.searchParams.set("image_url", source.url);
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
