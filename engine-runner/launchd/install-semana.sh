#!/bin/bash
# Instala a reposição diária da fila (semana-rotina.mjs) no Mac. Para remover: ./uninstall-semana.sh
# ATENÇÃO: se o projeto está em ~/Documents (ou Desktop/Downloads), o macOS pode bloquear
# tarefas agendadas de ler a pasta. Se o log de erro mostrar "Operation not permitted",
# mova o projeto para ~/refugioFerradura ou dê "Acesso total ao disco" ao node.
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
DEST="$HOME/Library/LaunchAgents/br.com.refugio.semana.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s#__NODE__#$NODE#g" -e "s#__REPO__#$REPO#g" -e "s#__HOME__#$HOME#g" \
  "$REPO/engine-runner/launchd/br.com.refugio.semana.plist.template" > "$DEST"
launchctl bootout "gui/$(id -u)/br.com.refugio.semana" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "Instalado: $DEST (09:30 e 15:30). Teste agora com: launchctl kickstart gui/$(id -u)/br.com.refugio.semana"
