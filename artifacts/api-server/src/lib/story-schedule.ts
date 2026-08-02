import { db, instagramPartnersTable, partnerContentItemsTable, storyScheduleSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DIA_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

export async function getScheduleSettings() {
  const [row] = await db.select().from(storyScheduleSettingsTable).limit(1);
  if (!row) throw new Error("Configuração de agendamento não encontrada.");
  return {
    ...row,
    diasSemana: JSON.parse(row.diasSemana) as string[],
    horarios: JSON.parse(row.horarios) as string[],
  };
}

export interface ScheduleSlotPreview {
  data: string; // ISO date+time
  diaSemana: string;
  horario: string;
  contentItemId: number;
  partnerId: number;
  nomeEstabelecimento: string;
  instagramHandle: string | null;
  mediaUrl: string;
  tipoConteudo: string;
}

interface AllocationPlan {
  slots: ScheduleSlotPreview[];
}

// Monta a grade dos próximos 7 dias (só quinta-domingo, conforme
// configurado) alocando itens "na_fila" de parceiros autorizados e não
// pausados, respeitando os limites diários — considerando também o que já
// está "agendado" pra não estourar o limite do dia ao somar com o novo.
async function planAllocation(): Promise<AllocationPlan> {
  const settings = await getScheduleSettings();
  const allowedDayIndexes = new Set(settings.diasSemana.map((d) => DIA_INDEX[d]).filter((n) => n !== undefined));

  const [queuedItems, alreadyScheduled] = await Promise.all([
    db
      .select({
        id: partnerContentItemsTable.id,
        partnerId: partnerContentItemsTable.partnerId,
        mediaUrl: partnerContentItemsTable.mediaUrl,
        tipoConteudo: partnerContentItemsTable.tipoConteudo,
        createdAt: partnerContentItemsTable.createdAt,
        nomeEstabelecimento: instagramPartnersTable.nomeEstabelecimento,
        instagramHandle: instagramPartnersTable.instagramHandle,
        pausado: instagramPartnersTable.pausado,
        partnerStatus: instagramPartnersTable.status,
      })
      .from(partnerContentItemsTable)
      .innerJoin(instagramPartnersTable, eq(partnerContentItemsTable.partnerId, instagramPartnersTable.id))
      .where(eq(partnerContentItemsTable.status, "na_fila")),
    db
      .select({ partnerId: partnerContentItemsTable.partnerId, scheduledFor: partnerContentItemsTable.scheduledFor })
      .from(partnerContentItemsTable)
      .where(eq(partnerContentItemsTable.status, "agendado")),
  ]);

  const eligible = queuedItems
    .filter((item) => !item.pausado && item.partnerStatus === "autorizado_repost")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const slots: ScheduleSlotPreview[] = [];
  const perDayCount = new Map<string, number>();
  const perPartnerDayCount = new Map<string, number>();

  for (const s of alreadyScheduled) {
    if (!s.scheduledFor) continue;
    const dayKey = s.scheduledFor.toISOString().slice(0, 10);
    perDayCount.set(dayKey, (perDayCount.get(dayKey) || 0) + 1);
    const partnerDayKey = `${s.partnerId}:${dayKey}`;
    perPartnerDayCount.set(partnerDayKey, (perPartnerDayCount.get(partnerDayKey) || 0) + 1);
  }

  const now = new Date();

  for (let dayOffset = 0; dayOffset < 7 && eligible.length > 0; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    if (!allowedDayIndexes.has(day.getDay())) continue;

    const dayKey = day.toISOString().slice(0, 10);

    for (const horario of settings.horarios) {
      if (eligible.length === 0) break;
      if ((perDayCount.get(dayKey) || 0) >= settings.maxPorDia) break;

      let pickedIndex = -1;
      for (let i = 0; i < eligible.length; i++) {
        const item = eligible[i];
        const partnerDayKey = `${item.partnerId}:${dayKey}`;
        if ((perPartnerDayCount.get(partnerDayKey) || 0) < settings.maxPorParceiroDia) {
          pickedIndex = i;
          break;
        }
      }
      if (pickedIndex === -1) continue;

      const item = eligible[pickedIndex];
      eligible.splice(pickedIndex, 1);

      const [hh, mm] = horario.split(":").map(Number);
      const slotDate = new Date(day);
      slotDate.setHours(hh, mm, 0, 0);

      slots.push({
        data: slotDate.toISOString(),
        diaSemana: settings.diasSemana.find((d) => DIA_INDEX[d] === day.getDay()) || "",
        horario,
        contentItemId: item.id,
        partnerId: item.partnerId,
        nomeEstabelecimento: item.nomeEstabelecimento,
        instagramHandle: item.instagramHandle,
        mediaUrl: item.mediaUrl,
        tipoConteudo: item.tipoConteudo,
      });

      const dayKeyCount = perDayCount.get(dayKey) || 0;
      perDayCount.set(dayKey, dayKeyCount + 1);
      const partnerDayKey = `${item.partnerId}:${dayKey}`;
      perPartnerDayCount.set(partnerDayKey, (perPartnerDayCount.get(partnerDayKey) || 0) + 1);
    }
  }

  return { slots };
}

// Só simulação — não persiste nada, não publica nada. Usado pela tela de
// prévia pra revisão manual.
export async function computeSchedulePreview(): Promise<ScheduleSlotPreview[]> {
  const { slots } = await planAllocation();
  return slots;
}

export interface AssignScheduleResult {
  itemsScheduled: number;
}

// Persiste de verdade: grava scheduledFor e marca status="agendado" nos
// itens alocados. Seguro de rodar automaticamente — só organiza a fila,
// nunca chama a API do Instagram nem publica nada.
export async function assignScheduleSlots(): Promise<AssignScheduleResult> {
  const { slots } = await planAllocation();

  for (const slot of slots) {
    await db
      .update(partnerContentItemsTable)
      .set({ status: "agendado", scheduledFor: new Date(slot.data) })
      .where(and(eq(partnerContentItemsTable.id, slot.contentItemId), eq(partnerContentItemsTable.status, "na_fila")));
  }

  return { itemsScheduled: slots.length };
}
