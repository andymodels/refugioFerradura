import { Layout } from "@/components/layout";
import { useSeo } from "@/hooks/use-seo";

export default function PrivacyPolicy() {
  useSeo({
    title: "Política de Privacidade | Refúgio da Ferradura",
    description: "Como o Refúgio da Ferradura trata os dados de visitantes e parceiros conectados via Instagram.",
  });

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-4 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-primary mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: 2 de agosto de 2026</p>

        <div className="post-content text-base leading-relaxed space-y-6">
          <p>
            O Refúgio da Ferradura é um guia de turismo da Rota da Ferradura, em Guarapari-ES, operado pela{" "}
            <strong>Mega Studio Ltda.</strong> (CNPJ 01.553.737/0001-02), responsável pelo site, pelo aplicativo de
            integração com o Instagram e pelo tratamento dos dados dos parceiros que conectarem voluntariamente suas
            contas. Esta página explica, em linguagem simples, quais dados coletamos, por que coletamos e o que
            fazemos (e não fazemos) com eles.
          </p>

          <h2>Visitantes do site</h2>
          <p>
            Para navegar no blog, ver matérias e usar a busca, não pedimos nem coletamos nenhum dado pessoal seu.
            Não usamos cookies de rastreamento de terceiros nem ferramentas de publicidade.
          </p>

          <h2>Parceiros que conectam o Instagram</h2>
          <p>
            Estabelecimentos parceiros da Rota da Ferradura podem, de forma <strong>voluntária</strong>, conectar o
            próprio perfil profissional do Instagram (Business ou Creator) ao Refúgio da Ferradura. Essa conexão só
            acontece se o próprio parceiro clicar em "Conectar meu Instagram" e autorizar pelo login oficial da Meta
            — nunca fazemos isso sem essa autorização direta dele.
          </p>
          <p>Ao conectar, o parceiro nos autoriza a:</p>
          <ul>
            <li>Ler informações básicas do perfil profissional dele (nome de usuário e identificador da conta);</li>
            <li>Identificar automaticamente fotos e Reels novos publicados no feed dele;</li>
            <li>
              Republicar esse conteúdo no perfil oficial <a href="https://instagram.com/refugioferradura" target="_blank" rel="noopener noreferrer">@refugioferradura</a>,
              sempre marcando/creditando o perfil original do parceiro, e sempre dentro do tipo de conteúdo
              (fotos, vídeos/Reels e/ou Stories) que ele autorizou previamente.
            </li>
          </ul>
          <p>
            A API oficial do Instagram não permite, sob nenhuma hipótese, que a gente leia Stories de nenhuma conta
            — nem da própria conta conectada. Por isso, conteúdo de Stories só entra em nosso sistema quando o
            próprio parceiro envia diretamente, pelo link pessoal que disponibilizamos a ele.
          </p>
          <p>
            Em resumo: os dados e conteúdos do parceiro são usados <strong>somente</strong> para organizar e
            divulgar, no Refúgio da Ferradura, o conteúdo que ele mesmo autorizou — sempre com crédito ao perfil
            original, nunca pra qualquer outra finalidade.
          </p>

          <h2>O que NÃO fazemos</h2>
          <ul>
            <li>Não vendemos, alugamos ou compartilhamos esses dados com nenhum terceiro;</li>
            <li>Não usamos esses dados pra qualquer finalidade além de identificar e republicar o conteúdo autorizado;</li>
            <li>Não seguimos, curtimos ou comentamos em nome do parceiro — a API do Instagram nem permite isso;</li>
            <li>Não publicamos nada de um parceiro fora do que foi combinado e autorizado por ele.</li>
          </ul>

          <h2>Por quanto tempo guardamos esses dados</h2>
          <p>
            O token de acesso da conta conectada fica guardado apenas enquanto a conexão estiver ativa. O parceiro
            pode desconectar a própria conta a qualquer momento, direto no link pessoal dele ou solicitando ao
            Refúgio da Ferradura — nesse caso, o token é apagado imediatamente.
          </p>

          <h2>Segurança</h2>
          <p>
            Tokens de acesso são armazenados de forma restrita, nunca expostos em nenhuma resposta pública do nosso
            sistema, e usados exclusivamente pelos processos automáticos descritos acima.
          </p>

          <h2>Seus direitos</h2>
          <p>Qualquer parceiro conectado pode, a qualquer momento e sem custo:</p>
          <ul>
            <li>Desconectar a própria conta do Instagram;</li>
            <li>Pedir a exclusão de todos os dados que temos sobre a conexão;</li>
            <li>Pedir esclarecimentos sobre quais dados especificamente estão armazenados.</li>
          </ul>
          <p>
            Pra qualquer um desses pedidos, escreva pra{" "}
            <a href="mailto:refugioferradura@gmail.com">refugioferradura@gmail.com</a>. Respondemos e concluímos o
            pedido em até 15 dias.
          </p>

          <h2>Mudanças nesta política</h2>
          <p>
            Se atualizarmos esta política, a data no topo da página muda. Mudanças relevantes pra parceiros
            conectados serão avisadas diretamente a eles.
          </p>

          <h2>Contato</h2>
          <p>
            Mega Studio Ltda. (CNPJ 01.553.737/0001-02) — dúvidas sobre esta política:{" "}
            <a href="mailto:refugioferradura@gmail.com">refugioferradura@gmail.com</a>.
          </p>
        </div>
      </article>
    </Layout>
  );
}
