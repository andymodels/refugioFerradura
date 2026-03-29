import React from "react";
import { Link } from "wouter";
import { FileText, Map as MapIcon, Plus, ArrowRight } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/ui-elements";
import { useListPostsAdmin, useListPlacesAdmin } from "@workspace/api-client-react";

export default function AdminDashboard() {
  const { data: postsData } = useListPostsAdmin();
  const { data: placesData } = useListPlacesAdmin();

  const posts = postsData?.posts || [];
  const places = placesData?.places || [];

  return (
    <AdminLayout>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo ao painel de controle do Refúgio da Ferradura.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Stats Card - Posts */}
        <Card className="p-6 flex items-center gap-6 border-l-4 border-l-primary">
          <div className="p-4 bg-primary/10 text-primary rounded-full">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Postagens no Blog</p>
            <h3 className="text-3xl font-bold text-foreground">{posts.length}</h3>
          </div>
          <Link href="/admin/posts/novo" className="ml-auto p-2 bg-muted hover:bg-muted/80 rounded-full transition-colors" title="Nova Postagem">
            <Plus className="w-5 h-5 text-foreground" />
          </Link>
        </Card>

        {/* Stats Card - Places */}
        <Card className="p-6 flex items-center gap-6 border-l-4 border-l-secondary">
          <div className="p-4 bg-secondary/10 text-secondary rounded-full">
            <MapIcon className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Lugares Cadastrados</p>
            <h3 className="text-3xl font-bold text-foreground">{places.length}</h3>
          </div>
          <Link href="/admin/places/novo" className="ml-auto p-2 bg-muted hover:bg-muted/80 rounded-full transition-colors" title="Novo Lugar">
            <Plus className="w-5 h-5 text-foreground" />
          </Link>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Posts */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-serif font-bold">Últimas Postagens</h3>
            <Link href="/admin/posts" className="text-sm text-primary hover:underline flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-4">
            {posts.slice(0, 4).map(post => (
              <div key={post.id} className="flex justify-between items-center p-3 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{post.title}</span>
                  <span className="text-xs text-muted-foreground">{new Date(post.createdAt).toLocaleDateString('pt-BR')} • {post.status}</span>
                </div>
                <Link href={`/admin/posts/${post.id}/editar`} className="text-xs font-medium text-primary hover:underline px-3 py-1.5 bg-primary/10 rounded-md">
                  Editar
                </Link>
              </div>
            ))}
            {posts.length === 0 && <p className="text-muted-foreground text-sm py-4">Nenhuma postagem ainda.</p>}
          </div>
        </Card>

        {/* Recent Places */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-serif font-bold">Últimos Lugares</h3>
            <Link href="/admin/places" className="text-sm text-primary hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-4">
            {places.slice(0, 4).map(place => (
              <div key={place.id} className="flex justify-between items-center p-3 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0">
                    <img src={place.coverImage || ''} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{place.name}</span>
                    <span className="text-xs text-muted-foreground">{place.category}</span>
                  </div>
                </div>
                <Link href={`/admin/places/${place.id}/editar`} className="text-xs font-medium text-primary hover:underline px-3 py-1.5 bg-primary/10 rounded-md">
                  Editar
                </Link>
              </div>
            ))}
            {places.length === 0 && <p className="text-muted-foreground text-sm py-4">Nenhum lugar ainda.</p>}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
