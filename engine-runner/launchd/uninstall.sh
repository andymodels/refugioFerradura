#!/bin/bash
launchctl bootout "gui/$(id -u)/br.com.refugio.engine" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/br.com.refugio.engine.plist"
echo "Agendamento removido."
