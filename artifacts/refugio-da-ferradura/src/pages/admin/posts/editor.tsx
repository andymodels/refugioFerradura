import React, { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Wand2 } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useGetPostAdmin, useCreatePost, useUpdatePost, useGenerateFromUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const postSchema = z.object({
  title: z.string().min(1, "Título obrigatório"),
  slug: z.string().min(1, "Slug obrigatório"),
  excerpt: z.string().optional(),
  content: z.string().min(1, "Conteúdo obrigatório"),
  coverImage: z.string().optional(),
  category: z.string().min(1, "Categoria obrigatória"),
  status: z.string().min(1, "Status obrigatório"),
  metaDescription: z.string().optional(),
});

type PostFormValues = z.infer<typeof postSchema>;

export default function PostEditor() {
  const [, params] = useRoute("/admin/posts/:id/editar");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditing = !!params?.id && params.id !== "novo";
  const postId = isEditing ? parseInt(params.id!) : 0;

  const { data: post, isLoading: isLoadingPost } = useGetPostAdmin(postId, { query: { enabled: isEditing } });
  const createMutation = useCreatePost();
  const updateMutation = useUpdatePost();
  const generateAiMutation = useGenerateFromUrl();

  const [aiUrl, setAiUrl] = React.useState("");

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      status: "draft",
      category: "Turismo"
    }
  });

  const titleValue = watch("title");

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEditing && titleValue) {
      setValue("slug", titleValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
    }
  }, [titleValue, isEditing, setValue]);

  useEffect(() => {
    if (post) {
      reset({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt || "",
        content: post.content,
        coverImage: post.coverImage || "",
        category: post.category,
        status: post.status,
        metaDescription: post.metaDescription || "",
      });
    }
  }, [post, reset]);

  const onSubmit = async (data: PostFormValues) => {
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: postId, data });
        toast({ title: "Postagem atualizada com sucesso!" });
      } else {
        await createMutation.mutateAsync({ data });
        toast({ title: "Postagem criada com sucesso!" });
      }
      setLocation("/admin/posts");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
  };

  const handleAIGeneration = async () => {
    if (!aiUrl) return toast({ title: "Insira uma URL válida", variant: "destructive" });
    try {
      const result = await generateAiMutation.mutateAsync({ data: { url: aiUrl } });
      setValue("title", result.title);
      setValue("excerpt", result.excerpt);
      setValue("content", result.content);
      setValue("category", result.category || "Turismo");
      toast({ title: "Conteúdo gerado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro na geração por IA", description: e.message, variant: "destructive" });
    }
  };

  if (isEditing && isLoadingPost) return <AdminLayout><div className="pt-20 text-center">Carregando...</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/posts" className="p-2 hover:bg-muted rounded-full transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <h1 className="text-2xl font-serif font-bold">{isEditing ? "Editar Postagem" : "Nova Postagem"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <form id="post-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label>Título</Label>
                <Input {...register("title")} placeholder="Título impactante..." />
                {errors.title && <span className="text-xs text-destructive">{errors.title.message}</span>}
              </div>

              <div>
                <Label>Conteúdo</Label>
                <Controller
                  name="content"
                  control={control}
                  render={({ field }) => (
                    <RichTextEditor value={field.value || ""} onChange={field.onChange} />
                  )}
                />
                {errors.content && <span className="text-xs text-destructive">{errors.content.message}</span>}
              </div>

              <div>
                <Label>Resumo (Excerpt)</Label>
                <Textarea {...register("excerpt")} placeholder="Breve resumo para os cards..." />
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-accent/20 border-accent/30">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2 text-primary">
              <Wand2 className="w-4 h-4" /> Geração por IA
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Insira o link de um artigo sobre o lugar e nossa IA criará um rascunho completo para você.</p>
            <div className="space-y-3">
              <Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="https://..." className="bg-background" />
              <Button type="button" onClick={handleAIGeneration} disabled={generateAiMutation.isPending} className="w-full" variant="secondary">
                {generateAiMutation.isPending ? "Gerando..." : "Gerar Rascunho"}
              </Button>
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <Label>Slug da URL</Label>
              <Input {...register("slug")} />
              {errors.slug && <span className="text-xs text-destructive">{errors.slug.message}</span>}
            </div>

            <div>
              <Label>Categoria</Label>
              <select {...register("category")} className="flex h-11 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary">
                <option value="Turismo">Turismo</option>
                <option value="Gastronomia">Gastronomia</option>
                <option value="Natureza">Natureza</option>
                <option value="Cultura">Cultura</option>
                <option value="Aventura">Aventura</option>
              </select>
            </div>

            <div>
              <Label>Status</Label>
              <select {...register("status")} className="flex h-11 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary">
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>

            <div>
              <Label>Imagem de Capa (URL)</Label>
              <Input {...register("coverImage")} placeholder="https://..." />
            </div>

            <div className="pt-4 border-t border-border">
              <Button type="submit" form="post-form" className="w-full" isLoading={createMutation.isPending || updateMutation.isPending}>
                {isEditing ? "Salvar Alterações" : "Publicar Postagem"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
