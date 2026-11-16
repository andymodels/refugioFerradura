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
7. **Publique** (fluxo do usuário: **blog primeiro, depois Instagram, tudo AGENDADO**; ele mantém um estoque de posts prontos, em média 1 por dia):
   - Monte `materia.json` (matéria do blog com as fotos/vídeos originais, qualquer formato, sem cortar; `capa` e `midia` por seção) e rode
     `node .claude/skills/refugio_post/publicar.mjs --arte <pasta-da-arte> --legenda <legenda.txt> --titulo "<título>" --materia <materia.json> --origem <pasta-do-usuário> --quando <data-hora-ISO> --publicar`
     Sem `--publicar` só confere (rode assim primeiro e leia o resultado).
   - O script cria a matéria como rascunho, enfileira o Instagram ligado a ela, e na hora marcada o servidor publica o blog e DEPOIS o Instagram (se o blog não confirmar, o Instagram não sai).
   - **Datas**: use no máximo 1 post por dia (horário nobre, ex. 19h). Antes, veja o estoque no final da saída do script e escolha o próximo dia livre depois do último agendado.
   - **Estoque**: o script imprime quantos dias a fila cobre. Se for menos de 5, avise o usuário em destaque no fim da resposta que é hora de criar novos posts.
   - **Reels e Stories**: Reel de um vídeo só já cabe na fila (.mp4 único), mas não foi provado em uso real; **Story ainda não tem agendamento** no servidor. Em Story, faça blog + legenda + arte e **diga claramente que a publicação ficou pendente**.
   - Vídeo de carrossel com mais de 60s pode ser recusado pelo Instagram: avise o usuário em vez de cortar sozinho.
8. **Relate** em poucas linhas: o que foi publicado (link), o que ficou rascunho/pendente e por quê.

## Limites
- Não commitar, não fazer deploy, não escrever direto no banco, não mexer em código do servidor sem o usuário pedir.
- Se qualquer passo de publicação falhar, pare, mostre o erro em palavras simples e não tente de novo em loop.
- Nunca publique algo que você mesmo não conferiu (arte e legenda revisadas).
