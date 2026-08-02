import React from "react";
import { Link } from "wouter";
import { Plus, Edit, Trash2, FileEdit, Instagram } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPostsAdmin, useDeletePost, usePublishPostInstagram } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const NEW_DRAFT_KEY = "refugio-editor-draft-new";

export default function AdminPosts() {
  const { data, isLoading } = useListPostsAdmin();
  const deleteMutation = useDeletePost();
  const publishInstagramMutation = usePublishPostInstagram();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDraft, setPendingDraft] = React.useState<{ title?: string } | null>(null);

  // Check for unsaved new-post draft on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(NEW_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.title || draft.content) setPendingDraft(draft);
      }
    } catch {}
  }, []);

  const discardDraft = () => {
    localStorage.removeItem(NEW_DRAFT_KEY);
    setPendingDraft(null);
  };

  const posts = data?.posts || [];

  const handleDelete = async (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta postagem?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast({ title: "Postagem excluída com sucesso" });
        queryClient.invalidateQueries({ queryKey: ["/api/posts/admin"] });
      } catch (e) {
        toast({ title: "Erro ao excluir", variant: "destructive" });
      }
    }
  };

  const handlePublishInstagram = async (id: number, title: string) => {
    if (!confirm(`Publicar "${title}" no feed do Instagram @refugioferradura agora? Essa ação é pública e não pode ser desfeita por aqui.`)) return;
    try {
      await publishInstagramMutation.mutateAsync({ id });
      toast({ title: "Publicado no Instagram com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/admin"] });
    } catch (e: any) {
      toast({ title: "Erro ao publicar no Instagram", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Postagens</h1>
          <p className="text-muted-foreground mt-1">Gerencie o conteúdo do blog</p>
        </div>
        <Link href="/admin/posts/novo">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nova Postagem
          </Button>
        </Link>
      </div>

      {pendingDraft && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-amber-800">
            <FileEdit className="w-4 h-4 shrink-0" />
            <span>
              Você tem um rascunho não salvo
              {pendingDraft.title ? <strong> — "{pendingDraft.title}"</strong> : ""}.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin/posts/novo">
              <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                Continuar rascunho
              </Button>
            </Link>
            <button
              onClick={discardDraft}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Tags</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Instagram</th>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma postagem encontrada.</td></tr>
              ) : (
                posts.map(post => (
                  <tr key={post.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{post.title}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(post.tags ? JSON.parse(post.tags) : []).slice(0, 3).map((t: string) => (
                          <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full capitalize">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {post.instagramPostedAt ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Publicado em {new Date(post.instagramPostedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : post.status === 'published' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Pendente</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(post.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      {post.status === 'published' && !post.instagramPostedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-pink-600"
                          onClick={() => handlePublishInstagram(post.id, post.title)}
                          disabled={publishInstagramMutation.isPending}
                          title="Publicar no Instagram"
                        >
                          <Instagram className="w-4 h-4" />
                        </Button>
                      )}
                      <Link href={`/admin/posts/${post.id}/editar`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(post.id)}
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
