import React from "react";
import { Link } from "wouter";
import { Users, ScanSearch, Pencil, X, Check, Plus, Pause, Play } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card, Input, Label, Textarea } from "@/components/ui-elements";
import {
  useListInstagramPartners,
  useScanInstagramPartners,
  useUpdateInstagramPartner,
  useCreateInstagramPartner,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<string, string> = {
  encontrado: "Encontrado",
  conferido: "Conferido",
  seguido_manualmente: "Seguido manualmente",
  autorizado_repost: "Autorizado a repostar",
};

const STATUS_COLOR: Record<string, string> = {
  encontrado: "bg-gray-100 text-gray-600",
  conferido: "bg-blue-100 text-blue-800",
  seguido_manualmente: "bg-amber-100 text-amber-800",
  autorizado_repost: "bg-green-100 text-green-800",
};

interface EditForm {
  nomeEstabelecimento: string;
  instagramHandle: string;
  telefone: string;
  status: string;
  autorizacaoData: string; // yyyy-mm-dd, input[type=date] format
  autorizacaoCanal: string;
  autorizacaoObservacao: string;
  autorizacaoFotos: boolean;
  autorizacaoVideosReels: boolean;
  autorizacaoStories: boolean;
  marcacaoObrigatoria: boolean;
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function AdminPartners() {
  const { data, isLoading } = useListInstagramPartners();
  const scanMutation = useScanInstagramPartners();
  const updateMutation = useUpdateInstagramPartner();
  const createMutation = useCreateInstagramPartner();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<EditForm | null>(null);

  const [newNome, setNewNome] = React.useState("");
  const [newInstagram, setNewInstagram] = React.useState("");
  const [newTelefone, setNewTelefone] = React.useState("");

  const partners = data?.partners || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/partners/admin"] });

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNome.trim()) return;
    try {
      await createMutation.mutateAsync({
        data: {
          nomeEstabelecimento: newNome.trim(),
          instagramHandle: newInstagram.trim().replace(/^@/, "") || undefined,
          telefone: newTelefone.trim() || undefined,
        },
      });
      setNewNome("");
      setNewInstagram("");
      setNewTelefone("");
      invalidate();
      toast({ title: "Parceiro cadastrado" });
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e?.message, variant: "destructive" });
    }
  };

  const handleTogglePause = async (id: number, pausado: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { pausado: !pausado } });
      invalidate();
      toast({ title: !pausado ? "Parceiro pausado" : "Parceiro reativado" });
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e?.message, variant: "destructive" });
    }
  };

  const handleScan = async () => {
    try {
      const result = await scanMutation.mutateAsync();
      invalidate();
      toast({
        title: "Varredura concluída",
        description: `${result.postsChecked} posts verificados, ${result.partnersCreated} novo(s) parceiro(s) encontrado(s).`,
      });
    } catch (e: any) {
      toast({ title: "Erro na varredura", description: e?.message, variant: "destructive" });
    }
  };

  const startEdit = (p: (typeof partners)[number]) => {
    setEditingId(p.id);
    setForm({
      nomeEstabelecimento: p.nomeEstabelecimento,
      instagramHandle: p.instagramHandle || "",
      telefone: p.telefone || "",
      status: p.status,
      autorizacaoData: toDateInputValue(p.autorizacaoData),
      autorizacaoCanal: p.autorizacaoCanal || "",
      autorizacaoObservacao: p.autorizacaoObservacao || "",
      autorizacaoFotos: p.autorizacaoFotos,
      autorizacaoVideosReels: p.autorizacaoVideosReels,
      autorizacaoStories: p.autorizacaoStories,
      marcacaoObrigatoria: p.marcacaoObrigatoria,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
  };

  const saveEdit = async () => {
    if (editingId == null || !form) return;
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        data: {
          nomeEstabelecimento: form.nomeEstabelecimento.trim(),
          instagramHandle: form.instagramHandle.trim() || null,
          telefone: form.telefone.trim() || null,
          status: form.status as any,
          autorizacaoData: form.autorizacaoData ? new Date(form.autorizacaoData).toISOString() : null,
          autorizacaoCanal: form.autorizacaoCanal.trim() || null,
          autorizacaoObservacao: form.autorizacaoObservacao.trim() || null,
          autorizacaoFotos: form.autorizacaoFotos,
          autorizacaoVideosReels: form.autorizacaoVideosReels,
          autorizacaoStories: form.autorizacaoStories,
          marcacaoObrigatoria: form.marcacaoObrigatoria,
        },
      });
      toast({ title: "Parceiro atualizado" });
      invalidate();
      cancelEdit();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6" /> Parceiros
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Perfis de Instagram citados nas matérias do blog. A varredura só lê e organiza — nunca segue,
            baixa mídia, reposta ou altera os posts. Aprovação e autorização de repost são sempre manuais.
          </p>
        </div>
        <Button onClick={handleScan} disabled={scanMutation.isPending} className="flex items-center gap-2 shrink-0">
          <ScanSearch className="w-4 h-4" /> {scanMutation.isPending ? "Varrendo..." : "Rodar varredura"}
        </Button>
      </div>

      <Card className="p-6 mb-6">
        <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Cadastrar parceiro manualmente</p>
        <form onSubmit={handleCreateManual} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Nome do estabelecimento</Label>
            <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex: Restaurante da Serra" />
          </div>
          <div>
            <Label>Instagram (sem @)</Label>
            <Input value={newInstagram} onChange={(e) => setNewInstagram(e.target.value)} placeholder="perfil" />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>Telefone</Label>
              <Input value={newTelefone} onChange={(e) => setNewTelefone(e.target.value)} placeholder="(27) 99999-9999" />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !newNome.trim()} className="flex items-center gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Adicionar
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Estabelecimento</th>
                <th className="px-6 py-4 font-medium">Origem</th>
                <th className="px-6 py-4 font-medium">Instagram</th>
                <th className="px-6 py-4 font-medium">Telefone</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : partners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum parceiro encontrado ainda. Clique em "Rodar varredura" ou cadastre um manualmente.
                  </td>
                </tr>
              ) : (
                partners.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${p.pausado ? "opacity-50" : ""}`}>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {p.nomeEstabelecimento}
                        {p.pausado && <span className="ml-2 text-xs text-amber-600 font-normal">(pausado)</span>}
                      </td>
                      <td className="px-6 py-4">
                        {p.origem === "manual" ? (
                          <span className="text-xs text-muted-foreground">Manual</span>
                        ) : p.postSlug ? (
                          <Link href={`/blog/${p.postSlug}`} className="text-xs text-primary hover:underline" target="_blank">
                            {p.postTitle}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Blog</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {p.instagramHandle ? (
                          <a
                            href={`https://instagram.com/${p.instagramHandle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary underline"
                          >
                            @{p.instagramHandle}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">{p.telefone || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[p.status] || "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABEL[p.status] || p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingId === p.id ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600" onClick={saveEdit} disabled={updateMutation.isPending}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={cancelEdit}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-600"
                              onClick={() => handleTogglePause(p.id, p.pausado)}
                              title={p.pausado ? "Reativar parceiro" : "Pausar parceiro"}
                            >
                              {p.pausado ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={() => startEdit(p)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {editingId === p.id && form && (
                      <tr className="bg-muted/30 border-b border-border">
                        <td colSpan={6} className="px-6 py-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div>
                              <Label>Nome do estabelecimento</Label>
                              <Input
                                value={form.nomeEstabelecimento}
                                onChange={(e) => setForm({ ...form, nomeEstabelecimento: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Instagram (sem @)</Label>
                              <Input
                                value={form.instagramHandle}
                                onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Telefone</Label>
                              <Input
                                value={form.telefone}
                                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label>Status</Label>
                              <select
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                              >
                                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="border-t border-border pt-4">
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Registro de autorização</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                              <div>
                                <Label>Data</Label>
                                <Input
                                  type="date"
                                  value={form.autorizacaoData}
                                  onChange={(e) => setForm({ ...form, autorizacaoData: e.target.value })}
                                />
                              </div>
                              <div>
                                <Label>Canal</Label>
                                <select
                                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                                  value={form.autorizacaoCanal}
                                  onChange={(e) => setForm({ ...form, autorizacaoCanal: e.target.value })}
                                >
                                  <option value="">—</option>
                                  <option value="whatsapp">WhatsApp</option>
                                  <option value="instagram_dm">Instagram DM</option>
                                  <option value="email">E-mail</option>
                                  <option value="presencial">Presencial</option>
                                  <option value="outro">Outro</option>
                                </select>
                              </div>
                              <div className="lg:col-span-2">
                                <Label>Observação</Label>
                                <Textarea
                                  rows={1}
                                  value={form.autorizacaoObservacao}
                                  onChange={(e) => setForm({ ...form, autorizacaoObservacao: e.target.value })}
                                  placeholder="Ex: respondeu sim no WhatsApp dia 02/08"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-6">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.autorizacaoFotos}
                                  onChange={(e) => setForm({ ...form, autorizacaoFotos: e.target.checked })}
                                />
                                Autorizou fotos
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.autorizacaoVideosReels}
                                  onChange={(e) => setForm({ ...form, autorizacaoVideosReels: e.target.checked })}
                                />
                                Autorizou vídeos/Reels
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.autorizacaoStories}
                                  onChange={(e) => setForm({ ...form, autorizacaoStories: e.target.checked })}
                                />
                                Autorizou Stories
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={form.marcacaoObrigatoria}
                                  onChange={(e) => setForm({ ...form, marcacaoObrigatoria: e.target.checked })}
                                />
                                Marcação do perfil obrigatória
                              </label>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminLayout>
  );
}
