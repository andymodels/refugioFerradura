# Motor de conteúdo diário (roda no Mac)

Uma matéria por dia no blog, sem horário fixo, sem API paga.

- `src/run.mjs` orquestra: trava do dia (servidor) > pauta > mídia > texto > publicação.
- Mídia, em ordem de fonte: Instagram oficial do lugar (Playwright, sem login) > fotos já na matéria/B2 > site oficial. Sem mídia suficiente (mínimo 3 boas), pula a pauta.
- Claude Code local avalia as fotos e escreve o artigo (`claude -p`).
- O servidor valida o texto e publica; o Instagram fica com o fluxo matéria > Instagram (não alterado).
- Segredo: Keychain do macOS, serviço `refugio-engine` (variável `ENGINE_SECRET` na Vercel).

## Comandos
```
npm install                      # uma vez
node src/run.mjs --dry-run       # simula tudo, grava só a prévia em ../output/engine-dry-run
node src/run.mjs --dry-run --probe-upload   # idem, e testa o envio de 1 foto ao B2
node src/run.mjs                 # real (só com engine_enabled = "true" e dry-run concluído)
```
Log: `~/Library/Logs/refugio-engine.log`. Agendamento: `launchd/install.sh` (só depois do dry-run aprovado).
