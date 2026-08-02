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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// O Instagram processa o container de mídia de forma assíncrona (baixa e
// transcodifica a imagem antes de deixar publicar). Publicar assim que o
// container é criado falha com "media is not ready for publishing" — é
// preciso esperar o status_code virar FINISHED antes de chamar media_publish.
async function waitForContainerReady(containerId: string, accessToken: string): Promise<void> {
  const statusUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${containerId}`);
  statusUrl.searchParams.set("fields", "status_code");
  statusUrl.searchParams.set("access_token", accessToken);

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusRes = await fetch(statusUrl);
    const statusData: any = await statusRes.json();

    if (statusData?.status_code === "FINISHED") return;
    if (statusData?.status_code === "ERROR") {
      throw new Error("O Instagram falhou ao processar a imagem para publicação.");
    }

    await sleep(2000);
  }

  throw new Error("O Instagram demorou demais pra processar a imagem. Tente novamente em alguns instantes.");
}

// Publica no feed do Instagram oficial (@refugioferradura). Sempre disparado
// manualmente pelo painel admin — nunca por cron/agendamento.
export async function publishPostToInstagram(post: Post): Promise<InstagramPublishResult> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;
  if (!accessToken || !igUserId) {
    throw new Error("Instagram não está configurado neste ambiente (faltam INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID).");
  }
  if (!post.coverImage) {
    throw new Error("Este post não tem imagem de capa — o Instagram exige uma imagem pra publicar.");
  }

  const caption = await generateInstagramCaption(post);

  const containerUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${igUserId}/media`);
  containerUrl.searchParams.set("image_url", post.coverImage);
  containerUrl.searchParams.set("caption", caption);
  containerUrl.searchParams.set("access_token", accessToken);

  const containerRes = await fetch(containerUrl, { method: "POST" });
  const containerData: any = await containerRes.json();
  if (!containerRes.ok || !containerData?.id) {
    logger.error(
      { status: containerRes.status, data: containerData, postId: post.id },
      "Falha ao criar container de mídia no Instagram",
    );
    throw new Error(
      containerData?.error?.error_user_msg || containerData?.error?.message || "Falha ao preparar a publicação no Instagram.",
    );
  }

  await waitForContainerReady(containerData.id, accessToken);

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

  return { mediaId: publishData.id, caption };
}
