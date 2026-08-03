# Radar diário da Rota da Ferradura

Arquivos usados pela rotina agendada na nuvem (claude.ai/code/routines) que roda
todo dia às 11h (horário de Brasília) e gera um relatório em texto — não
publica nada e não mexe no banco de dados do blog.

- `partners.json` — cópia dos parceiros cadastrados (nome, Instagram, status).
  Não é lido automaticamente do banco pela rotina (ela roda isolada, sem
  acesso ao banco), por isso precisa ser atualizado manualmente aqui quando
  a lista de parceiros mudar.
- `state.json` — última data de post conhecida de cada parceiro, pra saber o
  que é novo. A própria rotina atualiza e commita esse arquivo a cada
  execução.
