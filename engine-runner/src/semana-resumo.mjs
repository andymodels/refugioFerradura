#!/usr/bin/env node
// Resumo da semana (só leitura): dia, horário, pauta, parceiros e status de cada item da fila.
// Usado pela Rotina semanal para mostrar o que está programado. Não altera nada.
import { listarFila } from "./fila.mjs";
import { api } from "./api.mjs";

const TZ = "America/Sao_Paulo";
const f = await listarFila(200);
if (!f.itens) { console.error(`fila indisponível (${f.http})`); process.exit(1); }
const c = await api("/candidatos");
const nome = new Map((c.candidatos || []).map((x) => [x.id, x.nome.split(":")[0]]));
const STATUS = { aguardando: "agendado", publicando: "publicando", publicado: "publicado", falhou: "FALHOU", cancelado: "cancelado" };
const desde = Date.now() - 36 * 3600000;
const itens = f.itens.filter((i) => new Date(i.scheduledAt).getTime() >= desde && i.status !== "cancelado").sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
const dia = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(d));
const hora = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
console.log("| Dia | Horário | Pauta | Parceiros | Matéria | Status |\n|---|---|---|---|---|---|");
for (const i of itens) console.log(`| ${dia(i.scheduledAt)} | ${hora(i.scheduledAt)} | ${(i.pauta || i.titulo).replace(/\|/g, "/")} | ${(i.partnerIds || []).map((id) => nome.get(id) || `#${id}`).join(", ") || "-"} | ${i.postId ? "rascunho/publicada #" + i.postId : "-"} | ${STATUS[i.status] || i.status} |`);
const aguardando = itens.filter((i) => i.status === "aguardando").length, falhas = itens.filter((i) => i.status === "falhou").length;
console.log(`\n${itens.length} itens: ${aguardando} agendados, ${itens.filter((i) => i.status === "publicado").length} publicados, ${falhas} com falha.`);
