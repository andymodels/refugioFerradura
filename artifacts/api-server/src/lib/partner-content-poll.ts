import { db, instagramPartnersTable, partnerContentItemsTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { archiveApprovedMedia } from "./media-library";
import { logger } from "./logger";

const GRAPH_API_VERSION = "v21.0";

interface PartnerMedia {
  id: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
}

async function refreshPartnerTokenIfNeeded(partner: {
  id: number;
  igAccessToken: string | null;
  igTokenExpiresAt: Date | null;
}): Promise<string | null> {
  if (!partner.igAccessToken) return null;

  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
  const needsRefresh = !partner.igTokenExpiresAt || partner.igTokenExpiresAt.getTime() - Date.now() < fiveDaysMs;
  if (!needsRefresh) return partner.igAccessToken;

  const url = new URL(`https://graph.instagram.com/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", partner.igAccessToken);

  const res = await fetch(url);
  const data: any = await res.json();
  if (!res.ok || !data?.access_token) {
    logger.error({ partnerId: partner.id, data }, "[partners] Falha ao renovar token do parceiro — reconexão necessária");
    return null;
  }

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 5184000) * 1000);
  await db
    .update(instagramPartnersTable)
    .set({ igAccessToken: data.access_token, igTokenExpiresAt: expiresAt })
    .where(eq(instagramPartnersTable.id, partner.id));

  return data.access_token;
}

export interface PollResult {
  partnersChecked: number;
  itemsQueued: number;
}

// Roda periodicamente (cron): pra cada parceiro com conta conectada, lê o
// feed/Reels dele com o próprio token — nunca de terceiro sem autorização —
// e enfileira o que ainda não vimos, dentro do que ele autorizou. Nunca
// segue ninguém, nunca publica nada, só descobre e organiza.
export async function pollConnectedPartners(): Promise<PollResult> {
  const partners = await db
    .select()
    .from(instagramPartnersTable)
    .where(
      and(
        isNotNull(instagramPartnersTable.igUserId),
        eq(instagramPartnersTable.status, "autorizado_repost"),
        eq(instagramPartnersTable.pausado, false),
      ),
    );

  let itemsQueued = 0;

  for (const partner of partners) {
    try {
      const token = await refreshPartnerTokenIfNeeded(partner);
      if (!token || !partner.igUserId) continue;

      const mediaUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/${partner.igUserId}/media`);
      mediaUrl.searchParams.set("fields", "id,media_type,media_product_type,media_url,permalink,timestamp");
      mediaUrl.searchParams.set("limit", "15");
      mediaUrl.searchParams.set("access_token", token);

      const res = await fetch(mediaUrl);
      const data: any = await res.json();
      if (!res.ok || !Array.isArray(data?.data)) {
        logger.error({ partnerId: partner.id, data }, "[partners] Falha ao ler mídia do parceiro conectado");
        continue;
      }

      for (const media of data.data as PartnerMedia[]) {
        if (!media.media_url) continue; // carrossel sem media_url direto — fora do escopo por ora

        const [already] = await db
          .select({ id: partnerContentItemsTable.id })
          .from(partnerContentItemsTable)
          .where(eq(partnerContentItemsTable.sourceMediaId, media.id));
        if (already) continue;

        const isVideo = media.media_type === "VIDEO";
        const tipoConteudo = isVideo ? "reel" : "feed";
        const autorizado = isVideo ? partner.autorizacaoVideosReels : partner.autorizacaoFotos;
        if (!autorizado) continue;

        try {
          const rehosted = await archiveApprovedMedia(
            media.media_url,
            `parceiro-${partner.id}-${media.id}`,
            0,
            isVideo ? "video" : "image",
          );

          await db.insert(partnerContentItemsTable).values({
            partnerId: partner.id,
            origem: "conexao",
            sourceMediaId: media.id,
            mediaUrl: rehosted,
            mediaType: isVideo ? "video" : "foto",
            tipoConteudo,
            status: "na_fila",
          });
          itemsQueued++;
        } catch (err) {
          logger.error(
            { partnerId: partner.id, mediaId: media.id, error: String((err as any)?.message ?? err) },
            "[partners] Falha ao rehospedar mídia do parceiro",
          );
        }
      }

      await db
        .update(instagramPartnersTable)
        .set({ ultimoPollEm: new Date() })
        .where(eq(instagramPartnersTable.id, partner.id));
    } catch (err) {
      logger.error({ partnerId: partner.id, error: String((err as any)?.message ?? err) }, "[partners] Falha ao processar parceiro no polling");
    }
  }

  return { partnersChecked: partners.length, itemsQueued };
}
