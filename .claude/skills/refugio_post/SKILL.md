---
name: refugio_post
description: Produz e publica/agenda post do Instagram oficial @refugioferradura (e blog, só quando o formato pede) a partir de uma PASTA com fotos/vídeos que o usuário já baixou. O usuário informa só a pasta, o @ do parceiro e o formato (Reels, Stories, Carrossel ou Feed), e às vezes "agora". Use quando o usuário invocar "/refugio_post" ou disser "Reels/Stories/Carrossel/Feed + @parceiro + pasta".
---

Responda sempre em português simples, sem jargão (o usuário não é técnico). O usuário NÃO explica nada além de **pasta + @ do parceiro + formato** (e "agora", se for o caso). Você descobre o resto sozinho e não faz perguntas quando der para decidir com bom senso.

## O que o usuário garante
- A pasta já tem o material certo para o formato. Carrossel = fotos/vídeos numerados 001, 002... na ordem dos slides. Reels e Stories = material vertical. Feed = 1 foto.
- **O nome da pasta é o `@` do parceiro** (ex.: pasta `chales_bermond` → `@chales_bermond`). Identifique sozinho a partir do nome da pasta; não precisa perguntar nem confirmar.
- **Reels: a pasta pode trazer 1 vídeo já pronto, OU vários vídeos brutos.** Se for 1 vídeo só, ele já está pronto e é só publicar direto. Se forem vários, é para você montar um único vídeo de Reel com eles (cortes dos melhores trechos, formato vertical 9:16, ~15-60s), antes de seguir para a legenda e publicação.
- Mídia sempre vem do usuário. Nunca baixe do Instagram de ninguém e nunca contate parceiro.
- Mídia de criadores de conteúdo/influenciadores: já autorizada pelo usuário (decisão de 15/11/2026). Não alerte de novo; só credite o `@` do criador na legenda (ex.: "Vídeo: @criador") e no blog, se houver blog.

## O QUE VAI PARA ONDE (regra do usuário)
| Formato | Instagram | Blog |
|---|---|---|
| **Carrossel** (fotos e vídeos misturados) | sim | **sim, matéria nova ANTES** |
| **Feed** (1 foto) | sim | sim, matéria nova ANTES |
| **Reels** | sim | **NÃO** (só se o usuário pedir matéria) |
| **Stories** | sim | **NÃO** (só se o usuário pedir matéria) |

Nos formatos com blog a ordem é **1º BLOG, 2º INSTAGRAM**: o servidor publica a matéria, confere que a página responde e só então publica no Instagram. O `publicar.mjs` recusa carrossel/feed sem `--materia`. Se algum passo não puder ser cumprido, PARE e avise; não contorne.

## QUANDO PUBLICAR
- **Padrão: SEMPRE às 07h da manhã (Brasília)**, no próximo dia livre, no máximo 1 post por dia. Ex.: `--quando 2026-11-17T07:00:00-03:00`. Nunca 19h.
- **Se o usuário disser "agora"**: `--minutos 1`, e em seguida chame a fila à mão (veja "Publicar agora").
- O despertador da Vercel (plano gratuito) roda 1x por dia às 07h (10h UTC) e publica o que venceu. Itens de outro horário só saem quando alguém chamar a fila.
- Estoque: o script imprime quantos dias a fila cobre. Abaixo de 5 dias, avise em destaque no fim que é hora de o usuário mandar novas pastas.

## PASSOS
1. **Leia a pasta** (ls) e confira se bate com o formato. Se não bater de modo que impeça o trabalho, diga em uma frase e pare.
2. **Olhe as mídias** (Read nas imagens; vídeo: extraia quadros com ffmpeg e olhe). Mantenha a ordem numerada.
3. **Pesquise como redator profissional de turismo, nos três lugares**: (a) Instagram público do parceiro (bio via `meta[name="description"]` no navegador e legendas dos posts via `og:description`), (b) busca na internet (site oficial, imprensa, fontes oficiais), (c) matérias que o blog já tem dele (`/api/posts?search=`). Só use fato **confirmado e oficial**. Nunca invente nem preencha lacuna com suposição; se faltar dado, escreva menos. Sem comentário de hóspede como fonte, sem nota do Google, sem preço (muda), sem telefone não confirmado.
4. **Texto jornalístico, nunca narração da foto.** Nada de "vemos uma piscina...". Sem travessão (—) em lugar nenhum.
5. **Legenda do Instagram**: gancho, `@` do parceiro, `@refugioferradura`. Em carrossel/feed, termina com o endereço da matéria do blog. Em Reel/Story, **sem link de blog**.
6. **Marque sempre o @ do parceiro** (principalmente no blog, quando houver): no corpo da matéria como link (`<a href="https://www.instagram.com/<handle>/" target="_blank" rel="noopener noreferrer">@<handle></a>`) no 1º parágrafo e onde falar de reservas/contato, além do Serviço. Vale também para outros negócios citados com perfil confirmado.

### Carrossel e Feed (com blog)
7. **Matéria NOVA e original no blog** (mesmo que o parceiro já tenha matéria: outro ângulo). Regras da skill `refugio_blog` (título começa com o nome do parceiro; Serviço só com dados confirmados). **A arte do carrossel NÃO entra no blog**: entram as fotos e vídeos ORIGINAIS, na sequência numerada, cada um numa seção, em qualquer formato, sem cortar. **A capa do blog é sempre uma FOTO, nunca vídeo** (vídeo fica sem miniatura): a foto mais bonita que mostra o lugar; se não houver foto, um quadro bonito do vídeo SEM texto por cima. Monte o `materia.json`.
8. **Arte do carrossel**: monte `spec.json` em `engine-runner/output/post/<data>-<parceiro>/` e rode `node .claude/skills/refugio_post/render.mjs <spec.json>`. Degradê leve no rodapé; topo com site do Refúgio e @ do parceiro; capa com TÍTULO EM CAIXA ALTA + 3 destaques; demais páginas com CHAMADA em caixa alta + texto; vídeos entram como slides com a mesma camada. Confira cada slide com Read. Vídeo de carrossel acima de 60s pode ser recusado: avise, não corte sozinho.
9. Rode primeiro SEM `--publicar` (só confere), depois com:
   `node .claude/skills/refugio_post/publicar.mjs --arte <pasta-da-arte> --legenda <legenda.txt> --titulo "<título>" --materia <materia.json> --origem <pasta-das-mídias> --quando <ISO> --publicar`
   O script cria a matéria como rascunho e enfileira o Instagram ligado a ela.

### Reels (sem blog)
10. **Se a pasta tiver só 1 vídeo**: já está pronto, sem arte por cima. **Se tiver mais de 1 vídeo (brutos)**: monte você mesmo um único vídeo com ffmpeg antes de publicar — escolha os melhores trechos de cada clipe, encadeie com cortes ou transições simples (fade), mantenha vertical 9:16 e duração total entre ~15 e 60s. Salve o resultado montado numa subpasta (ex.: `review/`) e confira quadro a quadro (ffmpeg para extrair quadros + Read) antes de seguir. Legenda sem link de blog. `node .claude/skills/refugio_post/publicar.mjs --reel <video.mp4> --legenda <legenda.txt> --titulo "<título>" --quando <ISO> --publicar` (sem `--materia`). Reel provado em uso real.

### Stories (sem blog)
11. Gere a arte 1080x1920 com `render.mjs` (`formato: "story"`, vídeo ou foto). A API de Story não tem legenda: o site, o `@` e os textos vão desenhados na arte. Se o vídeo já tem legenda escrita nele, use `"posicao": "topo"` no spec para o texto não cobrir. Confira com Read. Publique com `--story <arquivo> --titulo "<título>" --quando <ISO> --publicar` (sem `--materia`). Story provado em uso real; o Instagram pode demorar a processar o vídeo e a 1ª tentativa falhar, o servidor repete sozinho após 10 min.

## PUBLICAR AGORA ("agora")
Depois de enfileirar com `--minutos 1`, espere ~65 s e chame a fila com a chave do Keychain: `POST https://refugioferradura.com.br/api/cron/instagram-queue/run` (timeout de até 290 s; vídeo demora). Consulte o resultado em `GET .../instagram-queue/list` (mostra `status`, `lastError`, `nextAttemptAt`). Se falhar por demora do Instagram, espere o `nextAttemptAt` e chame `/run` de novo. Rotas úteis (todas com `Authorization: Bearer <chave>`): `/reagendar {id, scheduledAt}`, `/cancelar {id}`, `/set-post-cover {postId, coverImage}`.

## DEPOIS DE PUBLICAR
Confira que os links respondem (blog: `/api/posts/<slug>`; Instagram: o permalink) e **relate em poucas linhas**: links do blog (se houver) e do Instagram, o que ficou pendente e o estoque da fila.

## LIMITES (ordens do usuário)
- **Toda vez que for preciso fazer deploy** (colocar mudança do servidor no ar), PRIMEIRO peça ao usuário que confirme que o GitHub está conectado à Vercel e avise que o envio ao GitHub é o que dispara o deploy. Só prossiga depois de ele confirmar. Commits sempre com o e-mail privado do GitHub (noreply); nunca desligue a proteção de e-mail dele.
- Não escreva direto no banco nem mexa em código do servidor sem o usuário pedir.
- Se um passo de publicação falhar, pare, mostre o erro em palavras simples; não tente de novo em loop (a repetição do `/run` após o `nextAttemptAt` não é loop).
- Nunca publique algo que você mesmo não conferiu (arte e legenda revisadas).
