import React from "react";
import { Link } from "wouter";
import { Plus, Edit, Trash2, Star } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card } from "@/components/ui-elements";
import { useListPlacesAdmin, useDeletePlace } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminPlaces() {
  const { data, isLoading } = useListPlacesAdmin();
  const deleteMutation = useDeletePlace();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const places = data?.places || [];

  const handleDelete = async (id: number) => {
    if (confirm("Tem certeza que deseja excluir este lugar?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast({ title: "Lugar excluído com sucesso" });
        queryClient.invalidateQueries({ queryKey: ["/api/places/admin"] });
      } catch (e) {
        toast({ title: "Erro ao excluir", variant: "destructive" });
      }
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Lugares</h1>
          <p className="text-muted-foreground mt-1">Gerencie os pontos turísticos e estabelecimentos</p>
        </div>
        <Link href="/admin/places/novo">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Lugar
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Nome</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Destaque</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : places.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum lugar encontrado.</td></tr>
              ) : (
                places.map(place => (
                  <tr key={place.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground flex items-center gap-3">
                      <div className="w-10 h-10 rounded-sm overflow-hidden bg-muted">
                         <img src={place.coverImage || ''} alt="" className="w-full h-full object-cover" />
                      </div>
                      {place.name}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{place.category}</td>
                    <td className="px-6 py-4">
                      {place.featured ? <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> : <Star className="w-4 h-4 text-muted" />}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/places/${place.id}/editar`}>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(place.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
