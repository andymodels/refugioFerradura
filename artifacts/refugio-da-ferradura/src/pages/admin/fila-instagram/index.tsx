import React from "react";
import { CalendarClock, ExternalLink, X, Check } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card, Input } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";

interface Item {
  id: number;
  titulo: string;
  scheduledAt: string;
  caption: string;
  imageUrls: string[];
  status: string;
  attempts: number;
  lastError: string | null;
  permalink: string | null;
  publishedAt: string | null;
  pauta: string | null;
  parceiros: string[];
  materia: { titulo: string; status: string; slug: string } | null;
}

const STATUS: Record<string, { label: string; cor: string }> = {
  aguardando: { label: "Aguardando", cor: "bg-amber-100 text-amber-800" },
  publicando: { label: "Publicando", cor: "bg-blue-100 text-blue-800" },
  publicado: { label: "Publicado", cor: "bg-green-100 text-green-800" },
  falhou: { label: "Falhou", cor: "bg-red-100 text-red-800" },
  cancelado: { label: "Cancelado", cor: "bg-gray-100 text-gray-600" },
};

const FILTROS = ["todos", "aguardando", "publicado", "falhou", "cancelado"] as const;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Valor para <input type="datetime-local"> no horário de Brasília.
const paraInput = (iso: string) => {
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return p.replace(" ", "T");
};

export default function AdminFilaInstagram() {
  const { toast } = useToast();
  const [itens, setItens] = React.useState<Item[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [filtro, setFiltro] = React.useState<(typeof FILTROS)[number]>("todos");
  const [editando, setEditando] = React.useState<number | null>(null);
  const [novoHorario, setNovoHorario] = React.useState("");
  const [aberto, setAberto] = React.useState<number | null>(null);

  const carregar = React.useCallback(async () => {
    try {
      const r = await fetch("/api/instagram-queue", { credentials: "include" });
      if (!r.ok) throw new Error();
      setItens(await r.json());
    } catch {
      toast({ title: "Não consegui carregar a fila", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function acao(id: number, caminho: string, corpo?: object, ok = "Feito") {
    const r = await fetch(`/api/instagram-queue/${id}/${caminho}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) toast({ title: d.error || "Não foi possível", variant: "destructive" });
    else toast({ title: ok });
    setEditando(null);
    carregar();
  }

  const lista = itens
    .filter((i) => filtro === "todos" || i.status === filtro)
    .sort((a, b) => {
      // Próximos primeiro; histórico por último.
      const ativo = (s: string) => (s === "aguardando" || s === "publicando" ? 0 : 1);
      return ativo(a.status) - ativo(b.status) || (ativo(a.status) === 0 ? +new Date(a.scheduledAt) - +new Date(b.scheduledAt) : +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
    });

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <CalendarClock className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-serif font-semibold">Fila do Instagram</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Carrosséis prontos que serão publicados sozinhos no horário marcado (horário de Brasília). O site só publica, não altera o conteúdo.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-full text-sm border ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"}`}
            >
              {f === "todos" ? "Todos" : STATUS[f].label}
              {f !== "todos" && ` (${itens.filter((i) => i.status === f).length})`}
            </button>
          ))}
        </div>

        {carregando ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : lista.length === 0 ? (
          <Card className="p-6 text-muted-foreground">Nada por aqui.</Card>
        ) : (
          <div className="space-y-3">
            {lista.map((i) => {
              const st = STATUS[i.status] ?? { label: i.status, cor: "bg-gray-100 text-gray-600" };
              const podeMexer = i.status === "aguardando" || i.status === "falhou" || i.status === "cancelado";
              return (
                <Card key={i.id} className="p-4">
                  <div className="flex gap-4">
                    <img src={i.imageUrls[0]} alt="" className="w-20 h-24 object-cover rounded-md shrink-0 bg-muted" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cor}`}>{st.label}</span>
                        <span className="text-sm font-medium">{i.titulo}</span>
                      </div>
                      {i.pauta && <p className="text-sm">Pauta: {i.pauta}</p>}
                      {i.parceiros.length > 0 && <p className="text-sm text-muted-foreground">Parceiros: {i.parceiros.join(", ")}</p>}
                      {i.materia && (
                        <p className="text-sm text-muted-foreground">
                          Matéria no blog: {i.materia.status === "published" ? "publicada" : "rascunho (será liberada na hora)"} ·{" "}
                          <a href={`/blog/${i.materia.slug}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">ver</a>
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {i.status === "publicado" && i.publishedAt ? `Publicado em ${fmt(i.publishedAt)}` : `Marcado para ${fmt(i.scheduledAt)}`} · {i.imageUrls.length} slides
                        {i.attempts > 0 && i.status !== "publicado" ? ` · tentativa ${i.attempts}` : ""}
                      </p>
                      {i.lastError && i.status !== "publicado" && <p className="text-sm text-red-700 mt-1 break-words">{i.lastError}</p>}
                      <button className="text-xs text-primary underline mt-1" onClick={() => setAberto(aberto === i.id ? null : i.id)}>
                        {aberto === i.id ? "Esconder legenda" : "Ver legenda"}
                      </button>
                      {aberto === i.id && <pre className="whitespace-pre-wrap text-sm mt-2 font-sans bg-muted/40 p-3 rounded-md">{i.caption}</pre>}
                      {i.permalink && (
                        <a href={i.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary mt-2 ml-3">
                          Ver no Instagram <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {editando === i.id ? (
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <Input type="datetime-local" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} className="w-auto" />
                          <Button size="sm" onClick={() => acao(i.id, "horario", { scheduledAt: new Date(novoHorario + ":00-03:00").toISOString() }, "Horário alterado")}>
                            <Check className="w-4 h-4 mr-1" /> Salvar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                            <X className="w-4 h-4 mr-1" /> Voltar
                          </Button>
                        </div>
                      ) : (
                        podeMexer && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setNovoHorario(paraInput(i.scheduledAt));
                                setEditando(i.id);
                              }}
                            >
                              {i.status === "aguardando" ? "Alterar horário" : "Reagendar"}
                            </Button>
                            {i.status !== "cancelado" && (
                              <Button size="sm" variant="outline" onClick={() => window.confirm("Cancelar esta publicação?") && acao(i.id, "cancelar", undefined, "Cancelado")}>
                                Cancelar
                              </Button>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
