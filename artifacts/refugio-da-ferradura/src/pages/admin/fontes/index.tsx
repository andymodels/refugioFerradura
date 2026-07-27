import React from "react";
import { Plus, Trash2, Rss } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card, Input, Label } from "@/components/ui-elements";
import { useListFontes, useCreateFonte, useUpdateFonte, useDeleteFonte } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminFontes() {
  const { data, isLoading } = useListFontes();
  const createMutation = useCreateFonte();
  const updateMutation = useUpdateFonte();
  const deleteMutation = useDeleteFonte();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [nome, setNome] = React.useState("");
  const [url, setUrl] = React.useState("");

  const fontes = data?.fontes || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/fontes/admin"] });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !url.trim()) return;
    try {
      await createMutation.mutateAsync({ data: { nome: nome.trim(), url: url.trim(), tipo: "site", ativo: true } });
      setNome("");
      setUrl("");
      invalidate();
      toast({ title: "Fonte adicionada" });
    } catch {
      toast({ title: "Erro ao adicionar fonte", variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (id: number, ativo: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { ativo: !ativo } });
      invalidate();
    } catch {
      toast({ title: "Erro ao atualizar fonte", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover esta fonte? O histórico de artigos já processados dela é mantido.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      invalidate();
      toast({ title: "Fonte removida" });
    } catch {
      toast({ title: "Erro ao remover fonte", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Rss className="w-6 h-6" /> Fontes
          </h1>
          <p className="text-muted-foreground mt-1">
            Sites que o pipeline automático de publicação vigia diariamente em busca de conteúdo novo.
          </p>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <div className="flex-1">
            <Label htmlFor="fonte-nome">Nome</Label>
            <Input
              id="fonte-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Prefeitura de Guarapari — Turismo"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="fonte-url">URL</Label>
            <Input
              id="fonte-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              type="url"
            />
          </div>
          <Button type="submit" disabled={createMutation.isPending} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Nome</th>
                <th className="px-6 py-4 font-medium">URL</th>
                <th className="px-6 py-4 font-medium">Ativa</th>
                <th className="px-6 py-4 font-medium">Última verificação</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : fontes.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma fonte cadastrada ainda.</td></tr>
              ) : (
                fontes.map((fonte) => (
                  <tr key={fonte.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{fonte.nome}</td>
                    <td className="px-6 py-4 text-muted-foreground max-w-xs truncate">
                      <a href={fonte.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
                        {fonte.url}
                      </a>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleAtivo(fonte.id, fonte.ativo)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${fonte.ativo ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                      >
                        {fonte.ativo ? "Ativa" : "Inativa"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {fonte.ultimaVerificacao ? new Date(fonte.ultimaVerificacao).toLocaleString("pt-BR") : "Nunca"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(fonte.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminLayout>
  );
}
