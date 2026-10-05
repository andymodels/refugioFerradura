#!/usr/bin/env node
// Ponto de entrada ÚNICO da Rotina semanal: produz os dias que faltam (semana.mjs --real)
// e em seguida mostra o resumo da fila (semana-resumo.mjs). Nunca publica.
// Um comando só = uma única aprovação ("Sempre permitir") na Rotina.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const roda = (arq, args = []) => spawnSync(process.execPath, [path.join(aqui, arq), ...args], { stdio: "inherit" }).status ?? 1;
const st = roda("semana.mjs", ["--real", "--dias", "8"]);
console.log("\n--- Estado da semana ---");
roda("semana-resumo.mjs");
process.exitCode = st === 0 ? 0 : 2;
