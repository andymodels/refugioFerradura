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
  const [instagram, setInstagram] = React.useState("");
  const [site, setSite] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [endereco, setEndereco] = React.useState("");
  const [tags, setTags] = React.useState("");

  const fontes = data?.fontes || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/fontes/admin"] });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const handle = instagram.trim().replace(/^@/, "");
    if (!nome.trim() || !handle) return;
    try {
      await createMutation.mutateAsync({
        data: {
          nome: nome.trim(),
          url: `https://instagram.com/${handle}`,
          tipo: "instagram_oficial",
          ativo: true,
          instagram: handle,
          site: site.trim() || undefined,
          telefone: telefone.trim() || undefined,
          email: email.trim() || undefined,
          endereco: endereco.trim() || undefined,
          tags: tags.trim() ? JSON.stringify(tags.split(",").map((t) => t.trim()).filter(Boolean)) : undefined,
        },
      });
      setNome("");
      setInstagram("");
      setSite("");
      setTelefone("");
      setEmail("");
      setEndereco("");
      setTags("");
      invalidate();
      toast({ title: "Canal oficial adicionado" });
    } catch {
      toast({ title: "Erro ao adicionar canal", variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (id: number, ativo: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { ativo: !ativo } });
      invalidate();
    } catch {
      toast({ title: "Erro ao atualizar canal", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remover este canal? O histórico de publicações já processadas dele é mantido.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      invalidate();
      toast({ title: "Canal removido" });
    } catch {
      toast({ title: "Erro ao remover canal", variant: "destructive" });
    }
  };

  const canais = fontes.filter((f) => f.tipo === "instagram_oficial");
  const outrasFontes = fontes.filter((f) => f.tipo !== "instagram_oficial");

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Rss className="w-6 h-6" /> Canais Oficiais
          </h1>
          <p className="text-muted-foreground mt-1">
            Perfis oficiais do Instagram monitorados diariamente: o sistema busca publicações novas, seleciona
            mídia aprovada e gera uma matéria curta e factual — nunca reaproveita a mesma publicação duas vezes.
          </p>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="canal-nome">Nome do empreendimento</Label>
            <Input id="canal-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Bosque das Pedras" />
          </div>
          <div>
            <Label htmlFor="canal-instagram">Instagram oficial</Label>
            <Input id="canal-instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@perfil" />
          </div>
          <div>
            <Label htmlFor="canal-site">Site oficial</Label>
            <Input id="canal-site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." type="url" />
          </div>
          <div>
            <Label htmlFor="canal-telefone">Telefone/WhatsApp</Label>
            <Input id="canal-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(27) 99999-9999" />
          </div>
          <div>
            <Label htmlFor="canal-email">E-mail</Label>
            <Input id="canal-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@..." type="email" />
          </div>
          <div>
            <Label htmlFor="canal-endereco">Endereço</Label>
            <Input id="canal-endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Endereço completo ou Plus Code" />
          </div>
          <div>
            <Label htmlFor="canal-tags">Tags (separadas por vírgula)</Label>
            <Input id="canal-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="gastronomia, hospedagem" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={createMutation.isPending} className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar canal
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Nome</th>
                <th className="px-6 py-4 font-medium">Instagram</th>
                <th className="px-6 py-4 font-medium">Contato</th>
                <th className="px-6 py-4 font-medium">Ativo</th>
                <th className="px-6 py-4 font-medium">Última verificação</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : canais.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum canal oficial cadastrado ainda.</td></tr>
              ) : (
                canais.map((fonte) => (
                  <tr key={fonte.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{fonte.nome}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {fonte.instagram ? (
                        <a href={`https://instagram.com/${fonte.instagram}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
                          @{fonte.instagram}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {[fonte.telefone, fonte.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleAtivo(fonte.id, fonte.ativo)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${fonte.ativo ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                      >
                        {fonte.ativo ? "Ativo" : "Inativo"}
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

      {outrasFontes.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-serif font-semibold text-foreground">Fontes legadas (sites monitorados)</h2>
            <p className="text-xs text-muted-foreground mt-1">Mecanismo antigo de vigiar um site — mantido só pelas fontes já cadastradas.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <tbody>
                {outrasFontes.map((fonte) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AdminLayout>
  );
}
