import React, { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useGetPlaceAdmin, useCreatePlace, useUpdatePlace } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const placeSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  slug: z.string().min(1, "Slug obrigatório"),
  description: z.string().min(1, "Descrição obrigatória"),
  category: z.string().min(1, "Categoria obrigatória"),
  coverImage: z.string().optional(),
  images: z.string().optional(), // comma separated urls
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  openingHours: z.string().optional(),
  featured: z.boolean().default(false),
  metaDescription: z.string().optional(),
});

type PlaceFormValues = z.infer<typeof placeSchema>;

export default function PlaceEditor() {
  const [, params] = useRoute("/admin/places/:id/editar");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id && params.id !== "novo";
  const placeId = isEditing ? parseInt(params.id!) : 0;

  const { data: place, isLoading } = useGetPlaceAdmin(placeId, { query: { enabled: isEditing } });
  const createMutation = useCreatePlace();
  const updateMutation = useUpdatePlace();

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      category: "Cachoeiras",
      featured: false
    }
  });

  const nameValue = watch("name");

  // Auto-generate slug
  useEffect(() => {
    if (!isEditing && nameValue) {
      setValue("slug", nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
    }
  }, [nameValue, isEditing, setValue]);

  useEffect(() => {
    if (place) {
      reset({
        name: place.name,
        slug: place.slug,
        description: place.description,
        category: place.category,
        coverImage: place.coverImage || "",
        images: place.images || "",
        address: place.address || "",
        phone: place.phone || "",
        website: place.website || "",
        openingHours: place.openingHours || "",
        featured: place.featured,
        metaDescription: place.metaDescription || "",
      });
    }
  }, [place, reset]);

  const onSubmit = async (data: PlaceFormValues) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: placeId, data });
        toast({ title: "Lugar atualizado com sucesso!" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "Lugar criado com sucesso!" });
      }
      setLocation("/admin/places");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  if (isEditing && isLoading) return <AdminLayout><div className="pt-20 text-center">Carregando...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/places" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <h1 className="text-2xl font-serif font-bold">{isEditing ? "Editar Lugar" : "Novo Lugar"}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-6">
            <div>
              <Label>Nome do Estabelecimento / Local</Label>
              <Input {...register("name")} placeholder="Ex: Cachoeira de Buenos Aires" />
              {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
            </div>

            <div>
              <Label>Descrição Detalhada</Label>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <RichTextEditor value={field.value || ""} onChange={field.onChange} />
                )}
              />
              {errors.description && <span className="text-xs text-destructive">{errors.description.message}</span>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Endereço</Label>
                <Input {...register("address")} />
              </div>
              <div>
                <Label>Horário de Funcionamento</Label>
                <Input {...register("openingHours")} placeholder="Ex: Todos os dias, 8h às 17h" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input {...register("phone")} />
              </div>
              <div>
                <Label>Website / Instagram</Label>
                <Input {...register("website")} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-5">
            <div>
              <Label>Categoria</Label>
              <select {...register("category")} className="flex h-11 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary">
                <option value="Cachoeiras">Cachoeiras</option>
                <option value="Trilhas">Trilhas</option>
                <option value="Gastronomia">Gastronomia</option>
                <option value="Hospedagem">Hospedagem</option>
                <option value="Praias">Praias</option>
                <option value="Mirantes">Mirantes</option>
              </select>
            </div>

            <div>
              <Label>Slug da URL</Label>
              <Input {...register("slug")} />
              {errors.slug && <span className="text-xs text-destructive">{errors.slug.message}</span>}
            </div>

            <div className="flex items-center gap-2 p-3 border border-border rounded-sm bg-muted/30">
              <input type="checkbox" id="featured" {...register("featured")} className="w-4 h-4 text-primary focus:ring-primary border-border rounded" />
              <Label htmlFor="featured" className="mb-0 cursor-pointer">Destacar na página inicial</Label>
            </div>

            <div>
              <Label>Imagem de Capa (URL)</Label>
              <Input {...register("coverImage")} placeholder="https://..." />
            </div>

            <div>
              <Label>Galeria de Imagens</Label>
              <Textarea {...register("images")} placeholder="URLs separadas por vírgula..." className="min-h-[100px]" />
              <p className="text-xs text-muted-foreground mt-1">Cole os links das imagens separados por vírgula.</p>
            </div>

            <div className="pt-4 border-t border-border">
              <Button type="submit" className="w-full" isLoading={createMutation.isPending || updateMutation.isPending}>
                {isEditing ? "Salvar Alterações" : "Cadastrar Lugar"}
              </Button>
            </div>
          </Card>
        </div>
      </form>
    </AdminLayout>
  );
}
