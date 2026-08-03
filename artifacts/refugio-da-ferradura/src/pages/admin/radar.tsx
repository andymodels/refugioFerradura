import React from "react";
import { BellRing, ExternalLink, Radar as RadarIcon } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui-elements";

type Novidade = {
  id: number;
  url: string;
  status: string;
  detalhe: string | null;
  criadoEm: string;
  fonteNome: string;
  fonteTipo: string;
};

type Parceiro = { id: number; nome: string; handle: string | null; ultimaVerificacao: string | null; atualizadoEm: string };
type RadarData = { novidades: Novidade[]; parceiros: Parceiro[]; atualizadoEm: string };

function data(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não verificado";
}

export default function AdminRadar() {
  const [radar, setRadar] = React.useState<RadarData | null>(null);
  const [erro, setErro] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/radar/admin")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setRadar)
      .catch(() => setErro(true));
  }, []);

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2"><RadarIcon className="w-7 h-7" /> Radar</h1>
        <p className="text-muted-foreground mt-1">Aqui você confere novidades antes de decidir se quer criar ou publicar algo.</p>
      </div>

      {erro ? <Card className="p-6 text-destructive">Não foi possível carregar o Radar agora.</Card> : !radar ? <Card className="p-6 text-muted-foreground">Carregando o Radar...</Card> : <>
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-3"><BellRing className="w-5 h-5 text-primary mt-0.5" /><div><h2 className="font-semibold">Última atualização</h2><p className="text-sm text-muted-foreground mt-1">{data(radar.atualizadoEm)}. O Radar só reúne informações; nenhuma matéria ou postagem é feita automaticamente.</p></div></div>
        </Card>
        <Card className="overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-border"><h2 className="font-serif font-semibold">Novidades encontradas</h2><p className="text-sm text-muted-foreground mt-1">Abra a fonte, avalie e decida o próximo passo.</p></div>
          {radar.novidades.length === 0 ? <p className="p-6 text-muted-foreground">Nenhuma novidade registrada ainda.</p> : <div className="divide-y divide-border">{radar.novidades.map((item) => <div className="p-5 flex justify-between gap-4" key={item.id}><div><p className="font-medium">{item.fonteNome}</p><p className="text-sm text-muted-foreground">{data(item.criadoEm)}{item.detalhe ? ` · ${item.detalhe}` : ""}</p></div><a className="text-primary text-sm flex items-center gap-1 whitespace-nowrap" href={item.url} target="_blank" rel="noreferrer">Abrir fonte <ExternalLink className="w-4 h-4" /></a></div>)}</div>}
        </Card>
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border"><h2 className="font-serif font-semibold">Parceiros</h2><p className="text-sm text-muted-foreground mt-1">Acompanhe a última verificação registrada para cada parceiro.</p></div>
          <div className="divide-y divide-border">{radar.parceiros.map((p) => <div className="p-5 flex justify-between gap-4" key={p.id}><div><p className="font-medium">{p.nome}</p><p className="text-sm text-muted-foreground">{p.handle ? `@${p.handle}` : "Sem Instagram cadastrado"}</p></div><p className="text-sm text-muted-foreground text-right">{data(p.ultimaVerificacao)}</p></div>)}</div>
        </Card>
      </>}
    </AdminLayout>
  );
}
