import React from "react";
import { BellRing, ExternalLink, Loader2, RefreshCw, Radar as RadarIcon } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui-elements";

type Novidade = {
  id: number;
  tipo: "noticia" | "parceiro_post";
  titulo: string;
  url: string;
  fonte: string | null;
  publicadoEm: string | null;
  encontradoEm: string;
};

type RadarData = { novidades: Novidade[]; parceirosMonitorados: number; atualizadoEm: string };
type ScanResult = { noticiasEncontradas: number; postsEncontrados: number; parceirosVarridos: number };

function data(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Data não informada";
}

export default function AdminRadar() {
  const [radar, setRadar] = React.useState<RadarData | null>(null);
  const [erro, setErro] = React.useState(false);
  const [varrendo, setVarrendo] = React.useState(false);
  const [ultimoResultado, setUltimoResultado] = React.useState<ScanResult | null>(null);
  const [erroVarredura, setErroVarredura] = React.useState<string | null>(null);

  const carregar = React.useCallback(() => {
    setErro(false);
    fetch("/api/radar/admin")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setRadar)
      .catch(() => setErro(true));
  }, []);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function atualizarAgora() {
    setVarrendo(true);
    setErroVarredura(null);
    setUltimoResultado(null);
    try {
      const res = await fetch("/api/radar/admin/scan", { method: "POST" });
      if (!res.ok) throw new Error();
      const result: ScanResult = await res.json();
      setUltimoResultado(result);
      carregar();
    } catch {
      setErroVarredura("Não foi possível concluir a varredura agora. Tente de novo em instantes.");
    } finally {
      setVarrendo(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2"><RadarIcon className="w-7 h-7" /> Radar</h1>
          <p className="text-muted-foreground mt-1">Notícias regionais e posts públicos de parceiros, só o que for novo. Nada aqui vira matéria ou postagem sozinho.</p>
        </div>
        <button
          onClick={atualizarAgora}
          disabled={varrendo}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-60"
        >
          {varrendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {varrendo ? "Varrendo..." : "Atualizar agora"}
        </button>
      </div>

      {erroVarredura && <Card className="p-4 mb-6 text-destructive text-sm">{erroVarredura}</Card>}
      {ultimoResultado && !varrendo && (
        <Card className="p-4 mb-6 text-sm text-muted-foreground">
          Varredura concluída: {ultimoResultado.noticiasEncontradas} notícia(s) e {ultimoResultado.postsEncontrados} post(s) de parceiro novos, entre {ultimoResultado.parceirosVarridos} parceiro(s) verificado(s).
        </Card>
      )}

      {erro ? <Card className="p-6 text-destructive">Não foi possível carregar o Radar agora.</Card> : !radar ? <Card className="p-6 text-muted-foreground">Carregando o Radar...</Card> : <>
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-3">
            <BellRing className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <h2 className="font-semibold">Última atualização</h2>
              <p className="text-sm text-muted-foreground mt-1">{data(radar.atualizadoEm)} · {radar.parceirosMonitorados} parceiro(s) com Instagram monitorado(s). Roda sozinho todo dia às 11h, ou quando você clicar em "Atualizar agora".</p>
            </div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border"><h2 className="font-serif font-semibold">Novidades</h2><p className="text-sm text-muted-foreground mt-1">Abra o link, avalie e decida o que aproveitar.</p></div>
          {radar.novidades.length === 0 ? <p className="p-6 text-muted-foreground">Nenhuma novidade registrada ainda. Clique em "Atualizar agora" pra rodar a primeira varredura.</p> : <div className="divide-y divide-border">{radar.novidades.map((item) => (
            <div className="p-5 flex justify-between gap-4" key={item.id}>
              <div>
                <p className="font-medium">{item.titulo}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.tipo === "noticia" ? "Notícia" : "Post de parceiro"}{item.fonte ? ` · ${item.fonte}` : ""} · {data(item.publicadoEm || item.encontradoEm)}
                </p>
              </div>
              <a className="text-primary text-sm flex items-center gap-1 whitespace-nowrap shrink-0" href={item.url} target="_blank" rel="noreferrer">Abrir <ExternalLink className="w-4 h-4" /></a>
            </div>
          ))}</div>}
        </Card>
      </>}
    </AdminLayout>
  );
}
