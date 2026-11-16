---
name: refugio_post
description: Produz e publica um post do Refúgio da Ferradura (blog + Instagram oficial @refugioferradura) a partir de uma PASTA com as fotos/vídeos que o usuário já baixou. O usuário só informa a pasta, o @ do Instagram do parceiro e o formato (Reels, Stories, Carrossel ou Feed). Use quando o usuário invocar "/refugio_post" ou disser algo como "Reels/Stories/Carrossel/Feed + @parceiro + pasta".
---

Responda sempre em português simples, sem jargão (o usuário não é técnico). O usuário NÃO explica nada além de: **pasta + @ do parceiro + formato**. Você descobre o resto sozinho. Não faça perguntas se der para decidir com bom senso.

## O que o usuário garante
- A pasta já tem o material certo para o formato: Reels = vídeo(s) vertical(is); Stories = material vertical; Carrossel = fotos numeradas 1, 2, 3... na ordem dos slides; Feed = 1 foto.
- Mídia sempre vem do usuário. Nunca baixe nada do Instagram de ninguém e nunca contate parceiro.

## Passos
1. **Leia a pasta** (ls). Confira se bate com o formato (ex.: carrossel com 2 a 10 fotos). Se não bater de forma que impeça o trabalho, diga o que está errado em uma frase e pare.
2. **Olhe as mídias** (Read nas imagens; para vídeo, extraia 3 quadros com ffmpeg e olhe). Em carrossel mantenha a ordem numerada.
3. **Pesquise o parceiro** pelo @: blog (`refugioferradura.com.br/blog`, busca pelo nome), Instagram público e site. Fatos reais só. Sem comentário de hóspede como fonte. Checar no blog se já existe matéria do parceiro (se existir, avise e use como base em vez de duplicar).
4. **Escreva a matéria do blog** seguindo as regras da skill `refugio_blog` e o formato de rascunho (TÍTULO começa com o nome do parceiro, sem nota do Google, sem travessão, seção Serviço só com dados confirmados).
5. **Escreva a legenda do Instagram**: gancho, @ do parceiro, @refugioferradura e o endereço da matéria do blog. Sem travessão, sem inventar telefone ou preço.
6. **Faça a arte** (carrossel, feed e story; Reels usa o vídeo como veio):
   monte um `spec.json` em `engine-runner/output/post/<data>-<parceiro>/` e rode
   `node .claude/skills/refugio_post/render.mjs <spec.json>`
   Padrão: degradê preto no rodapé clareando até a metade da foto; topo com site do Refúgio e @ do parceiro; capa com TÍTULO EM CAIXA ALTA + 3 destaques; páginas seguintes com CHAMADA grande em caixa alta + texto normal. Carrossel/feed 1080x1350, story 1080x1920.
   Confira cada PNG com Read antes de publicar (texto legível, nada cortado, foto não borrada).
7. **Publique** (autorizado pelo usuário nesta skill, sem pedir "pode" a cada vez):
   - **Blog**: rota existente de rascunho (`create-draft-post.yml` via `gh workflow run`, como na `refugio_blog`). Essa rota só grava **rascunho**; o usuário publica no painel. Diga isso no final com o link `refugioferradura.com.br/blog/<slug>`.
   - **Instagram (carrossel, com fotos e vídeos misturados)**: `node .claude/skills/refugio_post/publicar.mjs <pasta-da-arte> <legenda.txt> "<título>" --publicar`. Ele sobe os arquivos ao B2 e coloca na fila do Instagram oficial (publica em ~5 min). Sem `--publicar` só confere (dry run). Antes de publicar de verdade, rode sem `--publicar` e leia o resultado.
   - **Instagram feed (1 foto)**: mesma fila (`/enqueue`).
   - **Reels e Stories**: Reel de um vídeo só já cabe na fila (arquivo .mp4 único), mas ainda não foi provado em uso real; **Story ainda não tem agendamento** no servidor. Quando o formato for Story, faça blog + legenda + arte, **diga claramente que a publicação ficou pendente por isso** e não improvise.
   - Vídeo de carrossel com mais de 60s pode ser recusado pelo Instagram: avise o usuário em vez de cortar sozinho.
8. **Relate** em poucas linhas: o que foi publicado (link), o que ficou rascunho/pendente e por quê.

## Limites
- Não commitar, não fazer deploy, não escrever direto no banco, não mexer em código do servidor sem o usuário pedir.
- Se qualquer passo de publicação falhar, pare, mostre o erro em palavras simples e não tente de novo em loop.
- Nunca publique algo que você mesmo não conferiu (arte e legenda revisadas).
