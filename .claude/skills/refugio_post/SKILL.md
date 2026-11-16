---
name: refugio_post
description: Produz e publica um post do Refúgio da Ferradura (blog + Instagram oficial @refugioferradura) a partir de uma PASTA com as fotos/vídeos que o usuário já baixou. O usuário só informa a pasta, o @ do Instagram do parceiro e o formato (Reels, Stories, Carrossel ou Feed). Use quando o usuário invocar "/refugio_post" ou disser algo como "Reels/Stories/Carrossel/Feed + @parceiro + pasta".
---

Responda sempre em português simples, sem jargão (o usuário não é técnico). O usuário NÃO explica nada além de: **pasta + @ do parceiro + formato**. Você descobre o resto sozinho. Não faça perguntas se der para decidir com bom senso.

## O que o usuário garante
- A pasta já tem o material certo para o formato: Reels = vídeo(s) vertical(is); Stories = material vertical; Carrossel = fotos numeradas 1, 2, 3... na ordem dos slides; Feed = 1 foto.
- Mídia sempre vem do usuário. Nunca baixe nada do Instagram de ninguém e nunca contate parceiro.

## ORDEM OBRIGATÓRIA (o usuário exige; não reordene, não pule, não improvise)
**1º BLOG, 2º INSTAGRAM.** Todo post tem os dois. Nunca publique ou agende o Instagram sem a matéria nova do blog criada antes. O `publicar.mjs` recusa rodar sem `--materia`. Se algum passo não puder ser cumprido, PARE e avise o usuário; não contorne.

## Passos
1. **Leia a pasta** (ls). Confira se bate com o formato. Se não bater de forma que impeça o trabalho, diga o que está errado em uma frase e pare.
2. **Olhe as mídias** (Read nas imagens; vídeo: extraia quadros com ffmpeg e olhe). Mantenha a ordem numerada.
3. **Pesquise de verdade, como redator profissional de turismo**, sempre os três: (a) o Instagram público do parceiro (bio, via `meta[name="description"]` no navegador), (b) busca na internet (Google/WebSearch, site oficial, imprensa, fontes oficiais), (c) as matérias que o blog já tem desse parceiro (API `/api/posts?search=`). Só use fato **confirmado e oficial**. Nunca invente nem complete lacuna com suposição; se faltar dado, escreva menos. Sem comentário de hóspede como fonte. Sem nota do Google.
4. **BLOG: escreva uma matéria NOVA e original** (mesmo que o parceiro já tenha matéria: o texto é novo, outro ângulo, jornalístico; não narre o que se vê nas fotos). Regras da skill `refugio_blog` (título começa com o nome do parceiro, sem travessão, Serviço só com dados confirmados). **No blog NÃO entra a arte do carrossel**: entram as fotos e vídeos ORIGINAIS da pasta, na mesma sequência numerada, cada um dentro de uma seção do texto, em qualquer formato (quadrada, horizontal, vertical), sem cortar. Monte o `materia.json`. **REGRA DA CAPA DO BLOG: a capa é sempre uma FOTO, nunca vídeo (vídeo fica sem miniatura no blog). Escolha a foto mais bonita que mostra bem o lugar (vista, fachada, ambiente), mesmo que não seja a 1ª da pasta.** Os vídeos entram dentro das seções, e as demais mídias seguem a sequência numerada (a foto escolhida para capa não precisa repetir numa seção).
5. **Legenda do Instagram**: texto jornalístico, não descritivo, com @ do parceiro, @refugioferradura e o endereço da matéria do blog. Sem travessão, sem inventar telefone ou preço.
6. **Arte do Instagram** (só para o Instagram): monte `spec.json` em `engine-runner/output/post/<data>-<parceiro>/` e rode `node .claude/skills/refugio_post/render.mjs <spec.json>`. Degradê leve no rodapé; topo com site do Refúgio e @ do parceiro; capa com TÍTULO EM CAIXA ALTA + 3 destaques; páginas seguintes com CHAMADA em caixa alta + texto; vídeos entram como slides com a mesma camada. Confira cada slide com Read.
7. **Mostre ao usuário e publique** (autorizado, 1 post por dia no máximo, horário nobre, estoque em dias no fim da saída do script):
   `node .claude/skills/refugio_post/publicar.mjs --arte <pasta-da-arte> --legenda <legenda.txt> --titulo "<título>" --materia <materia.json> --origem <pasta-do-usuário> --quando <ISO> --publicar`
   Rode antes SEM `--publicar` (só confere). O script cria a matéria no blog como rascunho e enfileira o Instagram ligado a ela; na hora marcada o servidor publica o blog e, só depois de confirmar que a página responde, o Instagram.
   - Estoque: se a fila cobrir menos de 5 dias, avise em destaque no fim que é hora de mandar novas pastas.
   - Reel de um vídeo só cabe na fila (.mp4 único), não provado em uso real; **Story ainda não tem agendamento** no servidor: faça blog + legenda + arte e diga que o Instagram ficou pendente.
   - Vídeo de carrossel acima de 60s pode ser recusado: avise, não corte sozinho.
8. **Relate** em poucas linhas, com os links do blog e do Instagram e o que ficou pendente.

## Limites
- **Toda vez que for preciso fazer deploy (colocar mudança do servidor no ar), PRIMEIRO peça ao usuário para conectar o GitHub à Vercel e avise que o envio ao GitHub é o que dispara o deploy.** Só prossiga depois de ele confirmar. (Ordem do usuário.) Use sempre o e-mail privado do GitHub (noreply) nos commits; nunca desligue a proteção de e-mail dele.
- Não commitar, não fazer deploy, não escrever direto no banco, não mexer em código do servidor sem o usuário pedir.
- Se qualquer passo de publicação falhar, pare, mostre o erro em palavras simples e não tente de novo em loop.
- Nunca publique algo que você mesmo não conferiu (arte e legenda revisadas).
