import React from "react";
import { Link } from "wouter";
import { Plus, Edit, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPostsAdmin, useDeletePost } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminPosts() {
  const { data, isLoading } = useListPostsAdmin();
  const deleteMutation = useDeletePost();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Título</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Data</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma postagem encontrada.</td></tr>
              ) : (
                posts.map(post => (
                  <tr key={post.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{post.title}</td>
                    <td className="px-6 py-4 text-muted-foreground">{post.category}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{new Date(post.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
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
