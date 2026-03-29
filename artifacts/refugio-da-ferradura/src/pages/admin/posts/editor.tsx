import React, { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Wand2, X, Plus, Video, Images } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useGetPostAdmin, useCreatePost, useUpdatePost, useGenerateFromUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { cn } from "@/components/ui-elements";

const ALL_TAGS = ["lugares", "experiencias", "gastronomia", "hospedagem", "natureza", "turismo", "cultura", "aventura"];

const postSchema = z.object({
  title: z.string().min(1, "Título obrigatório"),
  subtitle: z.string().optional(),
  slug: z.string().min(1, "Slug obrigatório"),
  excerpt: z.string().optional(),
  content: z.string().min(1, "Conteúdo obrigatório"),
  coverImage: z.string().optional(),
  gallery: z.string().optional(),
  videoEmbeds: z.string().optional(),
  tags: z.string().optional(),
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

  const [aiUrl, setAiUrl] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: { status: "draft" }
  });

  const titleValue = watch("title");

  useEffect(() => {
    if (!isEditing && titleValue) {
      setValue("slug", titleValue.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
    }
  }, [titleValue, isEditing, setValue]);

  useEffect(() => {
    if (post) {
      const tags = post.tags ? JSON.parse(post.tags) : [];
      const gallery = post.gallery ? JSON.parse(post.gallery) : [];
      const videos = post.videoEmbeds ? JSON.parse(post.videoEmbeds) : [];
      setSelectedTags(tags);
      setGalleryUrls(gallery);
      setVideoUrls(videos);
      reset({
        title: post.title,
        subtitle: post.subtitle || "",
        slug: post.slug,
        excerpt: post.excerpt || "",
        content: post.content,
        coverImage: post.coverImage || "",
        status: post.status,
        metaDescription: post.metaDescription || "",
      });
    }
  }, [post, reset]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addGalleryUrl = () => {
    if (newGalleryUrl.trim()) {
      setGalleryUrls(prev => [...prev, newGalleryUrl.trim()]);
      setNewGalleryUrl("");
    }
  };

  const addVideoUrl = () => {
    if (newVideoUrl.trim()) {
      setVideoUrls(prev => [...prev, newVideoUrl.trim()]);
      setNewVideoUrl("");
    }
  };

  const onSubmit = async (data: PostFormValues) => {
    const payload = {
      ...data,
      tags: selectedTags.length > 0 ? JSON.stringify(selectedTags) : null,
      gallery: galleryUrls.length > 0 ? JSON.stringify(galleryUrls) : null,
      videoEmbeds: videoUrls.length > 0 ? JSON.stringify(videoUrls) : null,
    };
    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: postId, data: payload });
        toast({ title: "Publicação atualizada com sucesso!" });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: "Publicação criada com sucesso!" });
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
      if (result.tags) {
        try { setSelectedTags(JSON.parse(result.tags)); } catch { setSelectedTags(["turismo"]); }
      }
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
        <h1 className="text-2xl font-serif font-bold">{isEditing ? "Editar Publicação" : "Nova Publicação"}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <form id="post-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <Label>Título *</Label>
                <Input {...register("title")} placeholder="Título impactante..." className="text-lg" />
                {errors.title && <span className="text-xs text-destructive">{errors.title.message}</span>}
              </div>

              <div>
                <Label>Subtítulo</Label>
                <Input {...register("subtitle")} placeholder="Uma frase complementar ao título..." />
              </div>

              <div>
                <Label>Conteúdo *</Label>
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
                <Textarea {...register("excerpt")} placeholder="Breve resumo para os cards e SEO..." rows={3} />
              </div>
            </form>
          </Card>

          {/* Gallery Section */}
          <Card className="p-6">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2 text-foreground">
              <Images className="w-4 h-4 text-primary" /> Galeria de Fotos
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Adicione URLs de imagens para a galeria do post.</p>
            <div className="flex gap-2 mb-4">
              <Input
                value={newGalleryUrl}
                onChange={e => setNewGalleryUrl(e.target.value)}
                placeholder="https://... URL da imagem"
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addGalleryUrl())}
              />
              <Button type="button" variant="outline" onClick={addGalleryUrl} size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {galleryUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {galleryUrls.map((url, idx) => (
                  <div key={idx} className="relative group aspect-square">
                    <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => setGalleryUrls(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Video Embeds Section */}
          <Card className="p-6">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2 text-foreground">
              <Video className="w-4 h-4 text-primary" /> Vídeos Incorporados
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Adicione URLs de embed de vídeos (YouTube, Vimeo, etc.).</p>
            <div className="flex gap-2 mb-4">
              <Input
                value={newVideoUrl}
                onChange={e => setNewVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
                className="flex-1"
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addVideoUrl())}
              />
              <Button type="button" variant="outline" onClick={addVideoUrl} size="sm">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {videoUrls.length > 0 && (
              <div className="space-y-3">
                {videoUrls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                    <Video className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground truncate flex-1">{url}</span>
                    <button type="button" onClick={() => setVideoUrls(prev => prev.filter((_, i) => i !== idx))}>
                      <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* AI Generation */}
          <Card className="p-6 bg-accent/20 border-accent/30">
            <h3 className="font-serif font-medium mb-4 flex items-center gap-2 text-primary">
              <Wand2 className="w-4 h-4" /> Geração por IA
            </h3>
            <p className="text-xs text-muted-foreground mb-4">Insira o link de um artigo e nossa IA criará um rascunho completo.</p>
            <div className="space-y-3">
              <Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="https://..." className="bg-background" />
              <Button type="button" onClick={handleAIGeneration} disabled={generateAiMutation.isPending} className="w-full" variant="secondary">
                {generateAiMutation.isPending ? "Gerando..." : "Gerar Rascunho"}
              </Button>
            </div>
          </Card>

          {/* Meta & Status */}
          <Card className="p-6 space-y-5">
            <div>
              <Label>Slug da URL *</Label>
              <Input {...register("slug")} />
              {errors.slug && <span className="text-xs text-destructive">{errors.slug.message}</span>}
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
              {watch("coverImage") && (
                <img src={watch("coverImage")} alt="" className="mt-2 w-full h-32 object-cover rounded-lg" />
              )}
            </div>

            <div>
              <Label>Descrição SEO</Label>
              <Textarea {...register("metaDescription")} placeholder="Para mecanismos de busca..." rows={2} />
            </div>

            <div className="pt-4 border-t border-border">
              <Button type="submit" form="post-form" className="w-full" isLoading={createMutation.isPending || updateMutation.isPending}>
                {isEditing ? "Salvar Alterações" : "Publicar"}
              </Button>
            </div>
          </Card>

          {/* Tags */}
          <Card className="p-6">
            <Label className="mb-3 block">Tags</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize",
                    selectedTags.includes(tag)
                      ? "bg-primary text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                Selecionados: {selectedTags.join(", ")}
              </p>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
