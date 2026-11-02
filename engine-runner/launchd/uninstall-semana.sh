#!/bin/bash
launchctl bootout "gui/$(id -u)/br.com.refugio.semana" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/br.com.refugio.semana.plist"
echo "Agendamento removido."
