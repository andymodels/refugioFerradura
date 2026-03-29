import React from "react";
import { Link } from "wouter";
import { FileText, Plus, ArrowRight } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui-elements";
import { useListPostsAdmin } from "@workspace/api-client-react";

export default function AdminDashboard() {
  const { data: postsData } = useListPostsAdmin();
  const posts = postsData?.posts || [];

  const published = posts.filter(p => p.status === "published").length;
  const drafts = posts.filter(p => p.status === "draft").length;

  return (
    <AdminLayout>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo ao painel de controle do Refúgio da Ferradura.</p>
        </div>
        <Link href="/admin/posts/novo">
          <div className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Nova Publicação
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Card className="p-6 flex items-center gap-6 border-l-4 border-l-primary">
          <div className="p-4 bg-primary/10 text-primary rounded-full">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total de Publicações</p>
            <h3 className="text-3xl font-bold text-foreground">{posts.length}</h3>
          </div>
        </Card>

        <Card className="p-6 flex items-center gap-6 border-l-4 border-l-green-500">
          <div className="p-4 bg-green-500/10 text-green-600 rounded-full">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Publicados</p>
            <h3 className="text-3xl font-bold text-foreground">{published}</h3>
          </div>
        </Card>

        <Card className="p-6 flex items-center gap-6 border-l-4 border-l-amber-400">
          <div className="p-4 bg-amber-400/10 text-amber-600 rounded-full">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Rascunhos</p>
            <h3 className="text-3xl font-bold text-foreground">{drafts}</h3>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-serif font-bold">Publicações Recentes</h3>
          <Link href="/admin/posts" className="text-sm text-primary hover:underline flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          {posts.slice(0, 8).map(post => {
            const tags: string[] = post.tags ? JSON.parse(post.tags) : [];
            return (
              <div key={post.id} className="flex justify-between items-center p-3 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border">
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-foreground truncate">{post.title}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleDateString('pt-BR')}</span>
                    {tags.slice(0, 3).map(t => (
                      <span key={t} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">{t}</span>
                    ))}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${post.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {post.status === 'published' ? 'Publicado' : 'Rascunho'}
                    </span>
                  </div>
                </div>
                <Link href={`/admin/posts/${post.id}/editar`} className="shrink-0 ml-4 text-xs font-medium text-primary hover:underline px-3 py-1.5 bg-primary/10 rounded-md">
                  Editar
                </Link>
              </div>
            );
          })}
          {posts.length === 0 && <p className="text-muted-foreground text-sm py-4">Nenhuma publicação ainda.</p>}
        </div>
      </Card>
    </AdminLayout>
  );
}
