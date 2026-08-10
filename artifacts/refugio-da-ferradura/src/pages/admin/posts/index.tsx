import React, { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Plus, Edit, Trash2, FileEdit, Instagram, GripVertical, Pin, PinOff } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPostsAdmin, useDeletePost, usePublishPostInstagram, useUpdatePost, useReorderPosts, type Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const NEW_DRAFT_KEY = "refugio-editor-draft-new";
const PIN_DAYS = 7;

function isPinned(post: Post) {
  return !!post.pinnedUntil && new Date(post.pinnedUntil).getTime() > Date.now();
}

function pinDaysLeft(post: Post) {
  const ms = new Date(post.pinnedUntil as string).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function AdminPosts() {
  const { data, isLoading } = useListPostsAdmin();
  const deleteMutation = useDeletePost();
  const publishInstagramMutation = usePublishPostInstagram();
  const updateMutation = useUpdatePost();
  const reorderMutation = useReorderPosts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDraft, setPendingDraft] = React.useState<{ title?: string } | null>(null);

  // Lista local reordenável por arrastar — sincroniza com o servidor sempre
  // que a busca original muda, mas durante o arraste o reordenamento é só
  // local (instantâneo) até soltar, quando persiste de uma vez.
  const [orderedPosts, setOrderedPosts] = useState<Post[]>([]);
  useEffect(() => {
    setOrderedPosts(data?.posts || []);
  }, [data]);
  const dragIdRef = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const handleDragStart = (id: number) => {
    dragIdRef.current = id;
    setDraggingId(id);
  };

  const handleDragOverRow = (e: React.DragEvent, overId: number) => {
    e.preventDefault();
    const draggedId = dragIdRef.current;
    if (draggedId === null || draggedId === overId) return;
    setOrderedPosts((prev) => {
      const from = prev.findIndex((p) => p.id === draggedId);
      const to = prev.findIndex((p) => p.id === overId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleDragEnd = async () => {
    dragIdRef.current = null;
    setDraggingId(null);
    try {
      await reorderMutation.mutateAsync({ data: { ids: orderedPosts.map((p) => p.id) } });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/admin"] });
    } catch {
      toast({ title: "Erro ao salvar a nova ordem", variant: "destructive" });
    }
  };

  const handleTogglePin = async (post: Post) => {
    const pinned = isPinned(post);
    const pinnedUntil = pinned ? null : new Date(Date.now() + PIN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    try {
      await updateMutation.mutateAsync({ id: post.id, data: { pinnedUntil } });
      queryClient.invalidateQueries({ queryKey: ["/api/posts/admin"] });
      toast({ title: pinned ? "Post desafixado" : `Post fixado no topo por ${PIN_DAYS} dias` });
    } catch {
      toast({ title: "Erro ao fixar postagem", variant: "destructive" });
    }
  };

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

  const posts = orderedPosts;

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

  const handlePublishInstagram = async (id: number, title: string, alreadyPosted: boolean) => {
    const message = alreadyPosted
      ? `Publicar "${title}" de novo no feed do Instagram @refugioferradura? A publicação anterior continua no ar — isso cria uma nova, não substitui.`
      : `Publicar "${title}" no feed do Instagram @refugioferradura agora? Essa ação é pública e não pode ser desfeita por aqui.`;
    if (!confirm(message)) return;
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Postagens</h1>
          <p className="text-muted-foreground mt-1">Gerencie o conteúdo do blog</p>
        </div>
        <Link href="/admin/posts/novo">
          <Button className="flex items-center gap-2 w-full sm:w-auto justify-center">
            <Plus className="w-4 h-4" /> Nova Postagem
          </Button>
        </Link>
      </div>

      {pendingDraft && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
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

      {/* Lista em cartões — celular/tablet, toque em vez de ícones minúsculos */}
      <Card className="overflow-hidden md:hidden">
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Carregando...</p>
        ) : posts.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhuma postagem encontrada.</p>
        ) : (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-foreground leading-snug">{post.title}</p>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                    </span>
                    {isPinned(post) && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 flex items-center gap-1">
                        <Pin className="w-3 h-3" /> Fixado ({pinDaysLeft(post)}d)
                      </span>
                    )}
                  </div>
                </div>

                {(post.tags ? JSON.parse(post.tags) : []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(post.tags ? JSON.parse(post.tags) : []).slice(0, 3).map((t: string) => (
                      <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full capitalize">{t}</span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(post.createdAt).toLocaleDateString('pt-BR')}</span>
                  {post.instagramPostedAt ? (
                    <span className="text-green-700 font-medium">
                      IG em {new Date(post.instagramPostedAt).toLocaleDateString('pt-BR')}
                    </span>
                  ) : post.status === 'published' ? (
                    <span className="text-gray-500">IG pendente</span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {post.status === 'published' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => handlePublishInstagram(post.id, post.title, !!post.instagramPostedAt)}
                      disabled={publishInstagramMutation.isPending}
                    >
                      <Instagram className="w-4 h-4" /> Instagram
                    </Button>
                  )}
                  <Link href={`/admin/posts/${post.id}/editar`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      <Edit className="w-4 h-4" /> Editar
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1.5 px-3 ${isPinned(post) ? "text-orange-600 border-orange-300" : ""}`}
                    onClick={() => handleTogglePin(post)}
                    disabled={updateMutation.isPending}
                    aria-label={isPinned(post) ? "Desafixar" : "Fixar no topo"}
                    title={isPinned(post) ? "Desafixar" : `Fixar no topo por ${PIN_DAYS} dias`}
                  >
                    {isPinned(post) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 gap-1.5 px-3"
                    onClick={() => handleDelete(post.id)}
                    disabled={deleteMutation.isPending}
                    aria-label="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tabela — telas médias/grandes */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="w-8 px-2 py-4" aria-label="Arrastar para reordenar" />
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
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : posts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma postagem encontrada.</td></tr>
              ) : (
                posts.map(post => (
                  <tr
                    key={post.id}
                    draggable
                    onDragStart={() => handleDragStart(post.id)}
                    onDragOver={(e) => handleDragOverRow(e, post.id)}
                    onDragEnd={handleDragEnd}
                    className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${draggingId === post.id ? "opacity-40" : ""}`}
                  >
                    <td className="px-2 py-4 text-muted-foreground cursor-grab active:cursor-grabbing" title="Arrastar para reordenar">
                      <GripVertical className="w-4 h-4" />
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{post.title}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(post.tags ? JSON.parse(post.tags) : []).slice(0, 3).map((t: string) => (
                          <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full capitalize">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                        </span>
                        {isPinned(post) && (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 flex items-center gap-1">
                            <Pin className="w-3 h-3" /> Fixado ({pinDaysLeft(post)}d)
                          </span>
                        )}
                      </div>
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
                      {post.status === 'published' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-pink-600"
                          onClick={() => handlePublishInstagram(post.id, post.title, !!post.instagramPostedAt)}
                          disabled={publishInstagramMutation.isPending}
                          title={post.instagramPostedAt ? "Publicar de novo no Instagram" : "Publicar no Instagram"}
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
                        className={`h-8 w-8 p-0 ${isPinned(post) ? "text-orange-600" : "text-muted-foreground hover:text-orange-600"}`}
                        onClick={() => handleTogglePin(post)}
                        disabled={updateMutation.isPending}
                        title={isPinned(post) ? "Desafixar" : `Fixar no topo por ${PIN_DAYS} dias`}
                      >
                        {isPinned(post) ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </Button>
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
