import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// Configuração única (uma linha só) do agendamento automático de Stories de
// parceiros. automacaoAtiva começa sempre falsa — é o interruptor geral,
// só liga quando o admin testar e autorizar explicitamente a automação.
export const storyScheduleSettingsTable = pgTable("story_schedule_settings", {
  id: serial("id").primaryKey(),
  // JSON string[], ex: ["quinta","sexta","sabado","domingo"]
  diasSemana: text("dias_semana").notNull().default('["quinta","sexta","sabado","domingo"]'),
  // JSON string[], horários no formato "HH:mm", ex: ["10:00","14:00","18:00"]
  horarios: text("horarios").notNull().default('["10:00","15:00","19:00"]'),
  maxPorDia: integer("max_por_dia").notNull().default(6),
  maxPorParceiroDia: integer("max_por_parceiro_dia").notNull().default(1),
  automacaoAtiva: boolean("automacao_ativa").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StoryScheduleSettings = typeof storyScheduleSettingsTable.$inferSelect;
