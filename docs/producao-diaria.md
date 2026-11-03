# Produção diária do Refúgio da Ferradura (roteiro da tarefa agendada na nuvem)

Esta tarefa roda sozinha numa sessão nova que **não lembra de nada**. Tudo o que ela precisa está aqui. O João já decidiu o fluxo: **não faça perguntas a ele**. Respostas ao João: curtas, simples, em português, horário de Brasília. Nada de texto longo.

## Regras do João (valem sempre)
1. **Blog primeiro, Instagram depois.** Todo post de Instagram aponta para uma matéria real do blog (existente ou nova), citada na legenda pelo endereço completo, em texto.
2. **Nunca escreva "link na bio".** O perfil não tem link na bio.
3. **Fotos: só oficiais, do blog ou do Instagram do parceiro. Nunca gere, invente ou altere imagem.** Nada de foto de terceiros pesquisada na internet.
4. **Foto muito boa, ligada ao texto.** Feed = **1 foto**, sem texto sobre a imagem; todo o texto vai na legenda. A foto precisa ter ligação direta com o que a legenda diz.
5. **Atual ou nada.** Informação datada (evento, promoção, cardápio) só entra se ainda estiver valendo na data de publicação. Sem preço. Sem horário que não esteja na fonte. Sem citar avaliação, comentário ou relato de hóspede ou seguidor como fonte.
6. **Um só tipo de agendamento: a fila do Instagram** (`instagram_queue`). Você **nunca** publica direto, **nunca** cancela nem altera itens que já estão na fila.
7. Aos poucos: **no máximo 4 itens por execução**, cada um revisado.

## Ritmo e horários
- **2 posts de feed por dia**, às **09:00** (12:00 UTC) e **17:00** (20:00 UTC), horário de Brasília = UTC-3.
- Manter **5 dias à frente** (10 posts). Cria só o que falta, até 4 por execução.
- **Toda sexta-feira, às 09:00**, o post do dia é a **matéria da Rota da Ferradura** (seção "Sexta da Rota" abaixo), no lugar de um parceiro.

## Ferramentas (tudo pelo GitHub MCP; carregue com ToolSearch se preciso)
Repositório: `andymodels/refugioferradura`. Se não estiver na sessão, use `add_repo` (owner `andymodels`, repo `refugioferradura`, access `push`). Dispare workflows com `actions_run_trigger` (`ref: main`), espere ~25 s, ache a execução com `actions_list` (`list_workflow_runs`, `per_page: 1`), pegue o job com `list_workflow_jobs` e leia com `get_job_logs` (`return_content: true`, `tail_lines: 400`).

| Workflow | Para quê |
|---|---|
| `producao-estado.yml` (`ler=1`) | Estado: fila, ciclo e **próximos parceiros da vez** |
| `diagnostico-instagram-api.yml` (`handles=<perfil>`, `detalhe=1`) | Posts recentes do perfil do parceiro: legenda, data, tipo, link |
| `create-draft-post.yml` (`payload`) | Cria uma matéria nova no blog como rascunho (devolve `id` e `slug`) |
| `enfileirar-manual.yml` | Coloca 1 item na fila do Instagram |

## 1. Estado
Dispare `producao-estado.yml` com `ler=1`. Repita (no máximo 4 vezes) até `ciclo.pendentesDeLeitura` ser 0. No último log:
- `fila.proximos`: itens já agendados (horário em UTC). Dias e horários ocupados.
- `proximos`: lista na ordem em que os parceiros devem sair (mais atualizado primeiro; o ciclo desce a lista e recomeça no topo sozinho). Cada um traz `materia` (id, slug, título e as **fotos já guardadas**) e `tipoSugerido`.

## 2. Vagas
Liste as vagas livres nos próximos 5 dias (09:00 e 17:00). Vaga ocupada = já existe item da fila naquele horário. Preencha as primeiras vagas livres, em ordem, no máximo 4. Sextas às 09:00 seguem a seção "Sexta da Rota". Se não houver vaga, encerre: "fila cheia".

## 3. Para cada vaga: escolha o parceiro
Pegue o próximo de `proximos` que ainda não foi usado nesta execução. Não repita parceiro no mesmo dia.

## 4. Atualidade ou institucional
Dispare `diagnostico-instagram-api.yml` com `handles=<handle>` e `detalhe=1` e leia `postsDetalhe` (legenda, data, tipo, link).
- **Atualidade:** há post dos últimos 14 dias cuja legenda traz novidade concreta e ainda válida (evento com data futura, abertura, novo prato, promoção vigente, mudança de horário). Escreva só com o que a legenda e a matéria dizem. Se citar data, ela precisa estar no futuro em relação ao dia da publicação.
- **Institucional:** não há novidade. Escreva sobre o lugar, só com fatos da matéria do blog (`materia`). Sem data, sem preço.
- Se a leitura falhou (`sem_leitura`) ou o perfil é só vídeo sem legenda, é institucional.

## 5. Legenda
2 a 4 frases corridas, concretas, em português correto, sem clichê ("imperdível", "aconchegante", "experiência inesquecível"), sem travessão, sem repetir a estrutura de frase das legendas anteriores. Cite o perfil do parceiro com `@handle` (exatamente). Não escreva fechamento nem hashtags: o workflow acrescenta o endereço da matéria e as hashtags.

## 6. Foto (curadoria)
Das `materia.imagens` (JPEG no nosso B2), baixe com `curl` e **abra cada uma** (Read). Escolha **uma**:
- muito boa: nítida, bem enquadrada, com boa luz; **pelo menos 720 px no lado menor**; proporção entre 0,8 e 1,91 (largura ÷ altura);
- **ligada ao texto** (se a legenda fala de piscina, a foto mostra a piscina);
- sem texto sobre a imagem, sem pessoa em primeiro plano, sem cartaz, sem logo grande, sem escurecer ou desfocar.
Se **nenhuma** passar, **não publique foto ruim**: troque de parceiro (o descartado volta no próximo ciclo) e anote o motivo.

## 7. Revisor independente (obrigatório)
Use o Agent `general-purpose` **novo** (nunca você mesmo), até 3 rodadas, passando: a legenda, o caminho da foto (para ele abrir), a matéria do blog e a legenda recente do perfil. Ele confere: fato fora das fontes, data vencida, promessa que a foto não cumpre, nome ou `@` errado, estilo. Aplique as correções e peça nova conferência. Reprovado na 3ª rodada: descarte e anote.

## 8. Enfileirar
Dispare `enfileirar-manual.yml` com:
- `titulo`: "Parceiro: assunto" (curto);
- `minutos`: minutos desde agora até a vaga (calcule em UTC; mínimo 5);
- `legenda`: o texto aprovado;
- `imagens`: a URL da foto escolhida (uma só);
- `post_id`: `materia.id`; `url_materia`: `https://refugioferradura.com.br/blog/<materia.slug>`.
Confira no log `HTTP 201` e `"status":"queued"`. `409` = duplicado (siga). Qualquer outro erro: pare e reporte.

## Sexta da Rota (uma por semana)
Na primeira sexta sem item de Rota na fila (`pauta` com "Rota"), crie:
1. **Matéria nova no blog**, conceitual e institucional sobre a **Rota da Ferradura** (Guarapari: Boa Esperança, Arraial do Jabuti, Buenos Aires e arredores), não sobre um lugar só. Fatos **verificados** por pesquisa (WebSearch) em fonte confiável, com a fonte anotada; texto original. Crie com `create-draft-post.yml` (`payload`: `title`, `subtitle`, `excerpt`, `metaDescription`, `sections[]` com `heading` e `paragraphHtml`, `coverImage`, `tags`). Fotos dentro das seções como `<img src="URL do B2" alt="...">`, **só** fotos já existentes em matérias do blog que passem na curadoria da seção 6.
2. Revisor independente (seção 7) sobre o texto inteiro.
3. Enfileire (seção 8) para sexta 09:00 com a **foto mais forte da matéria**, `post_id` = id do rascunho criado e `url_materia` com o slug devolvido. A fila publica a matéria no blog e confirma a página antes de soltar o Instagram.

## 9. Relatório final (curto, hora de Brasília)
Diga: itens enfileirados (parceiro, tipo, dia e hora), o que o revisor corrigiu, parceiros descartados e por quê, vagas ainda abertas e qualquer problema (login, workflow falhou, leitura do Instagram fora do ar). Sem perguntas.

## Limites e proibições
- Nunca altere código do site, nem itens que já estão na fila, nem matérias já publicadas.
- Nunca coloque senha, token ou segredo em arquivo, comentário ou mensagem. Você não vê nem precisa de nenhum segredo: os workflows usam os do GitHub.
- Se algo falhar de um jeito que este roteiro não prevê, **pare e reporte**; não improvise nada que publique.
- Story ainda **não** faz parte desta tarefa.
