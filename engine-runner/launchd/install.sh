#!/bin/bash
# Instala o agendamento do motor no Mac (LaunchAgent do usuário).
# SÓ rode depois do dry-run aprovado. Para remover: ./launchd/uninstall.sh
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="$(command -v node)"
DEST="$HOME/Library/LaunchAgents/br.com.refugio.engine.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
sed -e "s#__NODE__#$NODE#g" -e "s#__REPO__#$REPO#g" -e "s#__HOME__#$HOME#g" \
  "$REPO/engine-runner/launchd/br.com.refugio.engine.plist.template" > "$DEST"
launchctl bootout "gui/$(id -u)/br.com.refugio.engine" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DEST"
echo "Instalado: $DEST"
