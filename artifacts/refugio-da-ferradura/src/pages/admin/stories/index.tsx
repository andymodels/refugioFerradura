import React from "react";
import { Sparkles, Upload, Trash2, CalendarClock, Power, Plus, X, Send } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card, Input, Label, Textarea } from "@/components/ui-elements";
import {
  useListInstagramPartners,
  useListPartnerContentItems,
  useCreatePartnerContentItem,
  useUpdatePartnerContentItem,
  useGetScheduleSettings,
  useUpdateScheduleSettings,
  useGetSchedulePreview,
  getGetSchedulePreviewQueryKey,
  useUploadMedia,
  usePublishPartnerContentNow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const DIA_LABEL: Record<string, string> = {
  domingo: "Domingo",
  segunda: "Segunda",
  terca: "Terça",
  quarta: "Quarta",
  quinta: "Quinta",
  sexta: "Sexta",
  sabado: "Sábado",
};

const ALL_DIAS = ["quinta", "sexta", "sabado", "domingo"];

const CONTENT_STATUS_LABEL: Record<string, string> = {
  na_fila: "Na fila",
  agendado: "Agendado",
  publicado: "Publicado",
  cancelado: "Cancelado",
};

const CONTENT_STATUS_COLOR: Record<string, string> = {
  na_fila: "bg-gray-100 text-gray-600",
  agendado: "bg-blue-100 text-blue-800",
  publicado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-700",
};

export default function AdminStories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: partnersData } = useListInstagramPartners();
  const { data: itemsData, isLoading: itemsLoading } = useListPartnerContentItems();
  const { data: settingsData } = useGetScheduleSettings();
  const uploadMutation = useUploadMedia();
  const createItemMutation = useCreatePartnerContentItem();
  const updateItemMutation = useUpdatePartnerContentItem();
  const updateSettingsMutation = useUpdateScheduleSettings();
  const publishNowMutation = usePublishPartnerContentNow();
  const preview = useGetSchedulePreview({ query: { enabled: false, queryKey: getGetSchedulePreviewQueryKey() } });

  const partners = partnersData?.partners || [];
  const authorizedPartners = partners.filter((p) => p.status === "autorizado_repost");
  const items = itemsData?.items || [];

  const invalidateItems = () => queryClient.invalidateQueries({ queryKey: ["/api/partners/admin/content"] });
  const invalidateSettings = () => queryClient.invalidateQueries({ queryKey: ["/api/partners/admin/schedule-settings"] });

  // ── Fila: adicionar conteúdo ──────────────────────────────────────────
  const [selectedPartnerId, setSelectedPartnerId] = React.useState<string>("");
  const [tipoConteudo, setTipoConteudo] = React.useState("story");
  const [notas, setNotas] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const selectedPartner = authorizedPartners.find((p) => String(p.id) === selectedPartnerId);

  const handleAddContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartnerId || !file) return;
    try {
      const uploaded = await uploadMutation.mutateAsync({ data: { file } });
      await createItemMutation.mutateAsync({
        id: Number(selectedPartnerId),
        data: {
          mediaUrl: uploaded.url,
          mediaType: uploaded.type === "video" ? "video" : "foto",
          tipoConteudo: tipoConteudo as any,
          notas: notas.trim() || undefined,
        },
      });
      setFile(null);
      setNotas("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      invalidateItems();
      toast({ title: "Conteúdo adicionado à fila" });
    } catch (e: any) {
      toast({ title: "Erro ao adicionar conteúdo", description: e?.message, variant: "destructive" });
    }
  };

  const handleCancelItem = async (id: number) => {
    if (!confirm("Cancelar este item da fila?")) return;
    try {
      await updateItemMutation.mutateAsync({ id, data: { status: "cancelado" } });
      invalidateItems();
      toast({ title: "Item cancelado" });
    } catch (e: any) {
      toast({ title: "Erro ao cancelar", description: e?.message, variant: "destructive" });
    }
  };

  const handlePublishNow = async (id: number, nomeEstabelecimento: string) => {
    if (!confirm(`Publicar AGORA de verdade no Instagram, conteúdo de "${nomeEstabelecimento}"? Isso é público e não pode ser desfeito por aqui.`)) return;
    try {
      await publishNowMutation.mutateAsync({ id });
      invalidateItems();
      toast({ title: "Publicado no Instagram!" });
    } catch (e: any) {
      toast({ title: "Erro ao publicar", description: e?.message, variant: "destructive" });
    }
  };

  // ── Configuração do agendamento ───────────────────────────────────────
  const [dias, setDias] = React.useState<string[]>(ALL_DIAS);
  const [horarios, setHorarios] = React.useState<string[]>([]);
  const [maxPorDia, setMaxPorDia] = React.useState(6);
  const [maxPorParceiroDia, setMaxPorParceiroDia] = React.useState(1);
  const [novoHorario, setNovoHorario] = React.useState("");

  React.useEffect(() => {
    if (!settingsData) return;
    setDias(settingsData.diasSemana);
    setHorarios(settingsData.horarios);
    setMaxPorDia(settingsData.maxPorDia);
    setMaxPorParceiroDia(settingsData.maxPorParceiroDia);
  }, [settingsData]);

  const toggleDia = (dia: string) => {
    setDias((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  };

  const addHorario = () => {
    if (!novoHorario || horarios.includes(novoHorario)) return;
    setHorarios((prev) => [...prev, novoHorario].sort());
    setNovoHorario("");
  };

  const removeHorario = (h: string) => setHorarios((prev) => prev.filter((x) => x !== h));

  const handleSaveSettings = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        data: { diasSemana: dias, horarios, maxPorDia, maxPorParceiroDia },
      });
      invalidateSettings();
      toast({ title: "Configuração salva" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar configuração", description: e?.message, variant: "destructive" });
    }
  };

  const automacaoAtiva = settingsData?.automacaoAtiva ?? false;

  const handleToggleAutomacao = async (ativar: boolean) => {
    if (ativar && !confirm("Isso liga a publicação automática de Stories de verdade. Confirma que já testou e quer ativar?")) return;
    if (!ativar && !confirm("Isso para toda a automação imediatamente. Confirma?")) return;
    try {
      await updateSettingsMutation.mutateAsync({ data: { automacaoAtiva: ativar } });
      invalidateSettings();
      toast({ title: ativar ? "Automação ativada" : "Automação parada" });
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e?.message, variant: "destructive" });
    }
  };

  // ── Prévia ────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    try {
      await preview.refetch();
    } catch (e: any) {
      toast({ title: "Erro ao gerar prévia", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6" /> Stories de Parceiros
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Fila e agendamento automático de Stories de parceiros autorizados — só quinta a domingo.
            Nenhuma publicação real acontece enquanto a automação abaixo estiver desligada.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold mb-2 ${automacaoAtiva ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}>
            Automação: {automacaoAtiva ? "ATIVA" : "DESLIGADA"}
          </div>
          <br />
          <Button
            onClick={() => handleToggleAutomacao(!automacaoAtiva)}
            disabled={updateSettingsMutation.isPending}
            className={automacaoAtiva ? "bg-red-600 hover:bg-red-700 text-white flex items-center gap-2" : "flex items-center gap-2"}
          >
            <Power className="w-4 h-4" /> {automacaoAtiva ? "Parar tudo agora" : "Ativar automação"}
          </Button>
        </div>
      </div>

      {/* Configuração do agendamento */}
      <Card className="p-6 mb-6">
        <h2 className="font-serif font-semibold text-foreground mb-4 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> Configuração do agendamento
        </h2>

        <div className="mb-4">
          <Label>Dias da semana</Label>
          <div className="flex flex-wrap gap-3 mt-1">
            {Object.keys(DIA_LABEL).map((dia) => (
              <label key={dia} className={`flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border ${dias.includes(dia) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                <input type="checkbox" checked={dias.includes(dia)} onChange={() => toggleDia(dia)} className="sr-only" />
                {DIA_LABEL[dia]}
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <Label>Horários de publicação</Label>
          <div className="flex flex-wrap gap-2 mt-1 mb-2">
            {horarios.map((h) => (
              <span key={h} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-foreground">
                {h}
                <button type="button" onClick={() => removeHorario(h)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 max-w-xs">
            <Input type="time" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} />
            <Button type="button" variant="ghost" onClick={addHorario} className="shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 max-w-md">
          <div>
            <Label>Máximo de Stories por dia (total)</Label>
            <Input type="number" min={1} value={maxPorDia} onChange={(e) => setMaxPorDia(Number(e.target.value))} />
          </div>
          <div>
            <Label>Máximo por parceiro, por dia</Label>
            <Input type="number" min={1} value={maxPorParceiroDia} onChange={(e) => setMaxPorParceiroDia(Number(e.target.value))} />
          </div>
        </div>

        <Button onClick={handleSaveSettings} disabled={updateSettingsMutation.isPending}>
          Salvar configuração
        </Button>
      </Card>

      {/* Adicionar conteúdo à fila */}
      <Card className="p-6 mb-6">
        <h2 className="font-serif font-semibold text-foreground mb-1">Adicionar conteúdo à fila</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Suba aqui o arquivo que o parceiro te mandou. Entrar na fila já conta como aprovado — a autorização foi dada
          uma vez, no cadastro do parceiro. Só aparecem parceiros com status "Autorizado a repostar".
        </p>
        <form onSubmit={handleAddContent} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <Label>Parceiro</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {authorizedPartners.map((p) => (
                <option key={p.id} value={p.id}>{p.nomeEstabelecimento}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Tipo de conteúdo</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={tipoConteudo}
              onChange={(e) => setTipoConteudo(e.target.value)}
            >
              <option value="story" disabled={selectedPartner ? !selectedPartner.autorizacaoStories : false}>Story</option>
              <option value="reel" disabled={selectedPartner ? !selectedPartner.autorizacaoVideosReels : false}>Reel/Vídeo</option>
              <option value="feed" disabled={selectedPartner ? !selectedPartner.autorizacaoFotos : false}>Foto/Feed</option>
            </select>
          </div>
          <div>
            <Label>Arquivo</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.heic,.heif"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Notas (opcional)</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ex: enviado por WhatsApp dia 02/08" />
            </div>
            <Button
              type="submit"
              disabled={!selectedPartnerId || !file || uploadMutation.isPending || createItemMutation.isPending}
              className="flex items-center gap-2 shrink-0"
            >
              <Upload className="w-4 h-4" /> {uploadMutation.isPending ? "Enviando..." : "Adicionar"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Fila de conteúdo */}
      <Card className="overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-serif font-semibold text-foreground">Fila de conteúdo</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Parceiro</th>
                <th className="px-6 py-4 font-medium">Origem</th>
                <th className="px-6 py-4 font-medium">Tipo</th>
                <th className="px-6 py-4 font-medium">Mídia</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Agendado / Publicado</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Fila vazia.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{item.nomeEstabelecimento}</td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {item.origem === "conexao" ? "Conexão automática" : item.origem === "link_parceiro" ? "Link do parceiro" : "Manual"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs capitalize">{item.tipoConteudo}</td>
                    <td className="px-6 py-4">
                      <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        Ver arquivo
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${CONTENT_STATUS_COLOR[item.status] || "bg-muted text-muted-foreground"}`}>
                        {CONTENT_STATUS_LABEL[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {item.status === "publicado" && item.publishedAt
                        ? new Date(item.publishedAt).toLocaleString("pt-BR")
                        : item.scheduledFor
                          ? new Date(item.scheduledFor).toLocaleString("pt-BR")
                          : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        {(item.status === "na_fila" || item.status === "agendado") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-green-600"
                            onClick={() => handlePublishNow(item.id, item.nomeEstabelecimento || "este parceiro")}
                            disabled={publishNowMutation.isPending}
                            title="Publicar agora no Instagram"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        {item.status === "na_fila" && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleCancelItem(item.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Prévia da grade */}
      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-serif font-semibold text-foreground">Prévia da grade semanal</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Simulação apenas — não publica nada, não altera a fila. Mostra o que seria publicado, e quando.
            </p>
          </div>
          <Button onClick={handlePreview} disabled={preview.isFetching} variant="ghost">
            {preview.isFetching ? "Gerando..." : "Gerar prévia"}
          </Button>
        </div>

        {preview.data && (
          preview.data.slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum conteúdo elegível pra agendar agora.</p>
          ) : (
            <div className="space-y-2">
              {preview.data.slots.map((slot, i) => (
                <div key={i} className="flex items-center gap-3 text-sm border border-border rounded-lg px-4 py-2">
                  <span className="font-medium text-foreground w-28 shrink-0">
                    {DIA_LABEL[slot.diaSemana] || slot.diaSemana} {slot.horario}
                  </span>
                  <span className="text-muted-foreground">{slot.nomeEstabelecimento}</span>
                  {slot.instagramHandle && <span className="text-xs text-primary">@{slot.instagramHandle}</span>}
                  <span className="text-xs text-muted-foreground ml-auto capitalize">{slot.tipoConteudo}</span>
                </div>
              ))}
            </div>
          )
        )}
      </Card>
    </AdminLayout>
  );
}
