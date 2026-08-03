import { Layout } from "@/components/layout";
import { useSeo } from "@/hooks/use-seo";

export default function TermsOfUse() {
  useSeo({
    title: "Termos de Uso | Refúgio da Ferradura",
    description: "Regras de uso do site e da conexão voluntária de parceiros via Instagram.",
  });

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-4 py-16 md:py-24">
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: 2 de agosto de 2026</p>

        <div className="post-content text-base leading-relaxed space-y-6">
          <h2>1. Sobre o site</h2>
          <p>
            O Refúgio da Ferradura (refugioferradura.com.br) é um guia informativo e gratuito de turismo da Rota da
            Ferradura, em Guarapari-ES, mantido de forma independente. Ao usar o site, você concorda com estes
            termos.
          </p>

          <h2>2. Conteúdo do blog</h2>
          <p>
            As matérias publicadas têm caráter informativo, com base em pesquisa e, quando aplicável, em conteúdo
            público de perfis oficiais dos estabelecimentos citados. Fazemos o possível pra manter as informações
            (endereço, horário, contato) atualizadas, mas recomendamos sempre confirmar diretamente com o
            estabelecimento antes de uma visita.
          </p>

          <h2>3. Conexão voluntária de parceiros</h2>
          <p>
            Estabelecimentos parceiros podem conectar voluntariamente o próprio perfil profissional do Instagram ao
            Refúgio da Ferradura. Essa conexão:
          </p>
          <ul>
            <li>É sempre iniciativa do próprio parceiro, feita através do login oficial da Meta/Instagram;</li>
            <li>Pode ser desfeita por ele a qualquer momento, sem aviso prévio necessário;</li>
            <li>
              Autoriza o Refúgio da Ferradura a identificar fotos e Reels novos publicados pelo parceiro e
              republicá-los no perfil oficial @refugioferradura, sempre com crédito/marcação do perfil original,
              dentro do escopo (fotos, vídeos/Reels e/ou Stories) previamente combinado e registrado com o parceiro;
            </li>
            <li>Não transfere nenhuma propriedade do conteúdo — o parceiro continua sendo o único dono das suas fotos e vídeos.</li>
          </ul>
          <p>
            Detalhes sobre quais dados são acessados e como são tratados estão na nossa{" "}
            <a href="/politica-de-privacidade">Política de Privacidade</a>.
          </p>

          <h2>4. Propriedade intelectual</h2>
          <p>
            O conteúdo original do blog (textos, curadoria) pertence ao Refúgio da Ferradura. Fotos e vídeos de
            parceiros republicados continuam sendo propriedade deles — nós apenas os divulgamos com autorização e
            crédito.
          </p>

          <h2>5. Limitação de responsabilidade</h2>
          <p>
            O Refúgio da Ferradura não se responsabiliza por mudanças em horários, preços, disponibilidade ou
            fechamento dos estabelecimentos citados, nem por decisões tomadas com base exclusivamente no conteúdo do
            site. Sempre confirme diretamente com o estabelecimento.
          </p>

          <h2>6. Mudanças nestes termos</h2>
          <p>
            Podemos atualizar estes termos quando necessário — a data no topo da página sempre reflete a versão mais
            recente.
          </p>

          <h2>7. Contato</h2>
          <p>
            Dúvidas sobre estes termos: <a href="mailto:refugioferradura@gmail.com">refugioferradura@gmail.com</a>.
          </p>
        </div>
      </article>
    </Layout>
  );
}
