import React, { useEffect, useState, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft, Wand2, X, Plus, Video, Images, Eye, EyeOff,
  Check, Tag, ExternalLink, CheckCircle2, Circle, AlertCircle,
  Loader2, Youtube, GripVertical, ChevronUp, ChevronDown
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea, cn } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useGetPostAdmin, useCreatePost, useUpdatePost, useGenerateFromUrl } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ALL_TAGS = [
  { value: "lugares", label: "Lugares", emoji: "📍" },
  { value: "experiencias", label: "Experiências", emoji: "🏃" },
  { value: "gastronomia", label: "Gastronomia", emoji: "🍽️" },
  { value: "hospedagem", label: "Hospedagem", emoji: "🏡" },
  { value: "natureza", label: "Natureza", emoji: "🌿" },
  { value: "turismo", label: "Turismo", emoji: "🗺️" },
  { value: "cultura", label: "Cultura", emoji: "🎭" },
  { value: "aventura", label: "Aventura", emoji: "⛰️" },
];

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

function convertToEmbedUrl(input: string): string | null {
  if (!input.trim()) return null;
  try {
    const url = new URL(input.trim());
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) return input.trim();
      const v = url.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      const shortV = url.pathname.replace('/shorts/', '').replace('/watch/', '');
      if (shortV) return `https://www.youtube.com/embed/${shortV.split('/')[0]}`;
    }
    if (url.hostname === 'youtu.be') {
      const videoId = url.pathname.slice(1);
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    if (url.hostname.includes('vimeo.com')) {
      const vId = url.pathname.split('/').filter(Boolean)[0];
      if (vId && /^\d+$/.test(vId)) return `https://player.vimeo.com/video/${vId}`;
    }
    return input.trim();
  } catch {
    return input.trim();
  }
}

function GalleryItem({ url, idx, total, onRemove, onMoveUp, onMoveDown }: {
  url: string; idx: number; total: number;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="relative group rounded-xl overflow-hidden bg-muted aspect-square border border-border">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <span className="text-xs">Imagem inválida</span>
        </div>
      ) : (
        <img
          src={url}
          alt=""
          className={cn("w-full h-full object-cover transition-all duration-300", loaded ? "opacity-100" : "opacity-0")}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={onRemove} className="bg-destructive text-white rounded-full p-1 shadow-md hover:bg-destructive/90 transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="absolute bottom-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" onClick={onMoveUp} disabled={idx === 0} className="bg-background/80 text-foreground rounded-full p-1 disabled:opacity-30 hover:bg-background transition-colors shadow-sm">
          <ChevronUp className="w-3 h-3" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={idx === total - 1} className="bg-background/80 text-foreground rounded-full p-1 disabled:opacity-30 hover:bg-background transition-colors shadow-sm">
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {idx + 1}/{total}
      </div>
    </div>
  );
}

function VideoItem({ url, idx, total, onRemove, onMoveUp, onMoveDown }: {
  url: string; idx: number; total: number;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center gap-3 p-3">
        <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
          <Youtube className="w-4 h-4 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{url}</p>
          <p className="text-xs text-muted-foreground">Vídeo {idx + 1}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview(p => !p)}
            className={cn("p-1.5 rounded-md text-xs transition-colors", showPreview ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
            title="Visualizar"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveUp} disabled={idx === 0} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={idx === total - 1} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {showPreview && (
        <div className="aspect-video bg-black">
          <iframe src={url} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      )}
    </div>
  );
}

function PostPreviewOverlay({ post, tags, gallery, videoEmbeds, onClose }: {
  post: Partial<PostFormValues>;
  tags: string[];
  gallery: string[];
  videoEmbeds: string[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pré-visualização</span>
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Rascunho</span>
        </div>
        <button type="button" onClick={onClose} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-muted">
          <X className="w-4 h-4" /> Fechar preview
        </button>
      </div>

      <article className="pt-16 pb-24 max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <header className="text-center mb-12">
          {tags.length > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
              {tags.map(t => {
                const info = ALL_TAGS.find(x => x.value === t);
                return (
                  <span key={t} className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">
                    {info?.emoji} {t}
                  </span>
                );
              })}
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(), "dd 'de' MMMM, yyyy", { locale: ptBR })}
              </span>
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-serif text-foreground leading-tight mb-4">
            {post.title || <em className="text-muted-foreground">Sem título</em>}
          </h1>
          {post.subtitle && (
            <p className="text-xl text-primary/70 font-light italic mb-4">{post.subtitle}</p>
          )}
          {post.excerpt && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">{post.excerpt}</p>
          )}
        </header>

        {/* Cover Image */}
        {post.coverImage && (
          <div className="aspect-[21/9] rounded-2xl overflow-hidden shadow-lg mb-16">
            <img src={post.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        {post.content && (
          <div
            className="prose prose-stone prose-lg max-w-none prose-headings:font-serif prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary mb-16"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}

        {/* Gallery */}
        {gallery.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-serif text-foreground mb-8 flex items-center gap-3">
              <Images className="w-6 h-6 text-primary" /> Galeria de Fotos
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((url, i) => (
                <div key={i} className={cn("overflow-hidden rounded-xl bg-muted", i === 0 && gallery.length >= 3 ? "col-span-2 row-span-2" : "")}>
                  <img src={url} alt="" className="w-full h-full object-cover" style={{ minHeight: i === 0 && gallery.length >= 3 ? "320px" : "180px" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Videos */}
        {videoEmbeds.length > 0 && (
          <section>
            <h2 className="text-2xl font-serif text-foreground mb-8">Vídeos</h2>
            <div className="space-y-8">
              {videoEmbeds.map((url, i) => (
                <div key={i} className="aspect-video rounded-2xl overflow-hidden shadow-lg bg-muted">
                  <iframe src={url} title={`Video ${i + 1}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}

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
  const [aiMode, setAiMode] = useState<"url" | "text">("url");
  const [aiText, setAiText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { register, handleSubmit, control, reset, setValue, watch, formState: { errors } } = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: { status: "draft" }
  });

  const titleValue = watch("title");
  const watchedValues = watch();

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
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const addGalleryUrl = useCallback(() => {
    const url = newGalleryUrl.trim();
    if (url && !galleryUrls.includes(url)) {
      setGalleryUrls(prev => [...prev, url]);
      setNewGalleryUrl("");
    }
  }, [newGalleryUrl, galleryUrls]);

  const addVideoUrl = useCallback(() => {
    const raw = newVideoUrl.trim();
    if (!raw) return;
    const embed = convertToEmbedUrl(raw);
    if (embed) {
      setVideoUrls(prev => [...prev, embed]);
      setNewVideoUrl("");
    }
  }, [newVideoUrl]);

  const moveGallery = (idx: number, dir: -1 | 1) => {
    const newArr = [...galleryUrls];
    const swap = idx + dir;
    if (swap < 0 || swap >= newArr.length) return;
    [newArr[idx], newArr[swap]] = [newArr[swap], newArr[idx]];
    setGalleryUrls(newArr);
  };

  const moveVideo = (idx: number, dir: -1 | 1) => {
    const newArr = [...videoUrls];
    const swap = idx + dir;
    if (swap < 0 || swap >= newArr.length) return;
    [newArr[idx], newArr[swap]] = [newArr[swap], newArr[idx]];
    setVideoUrls(newArr);
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
    const source = aiMode === "url" ? aiUrl.trim() : aiText.trim();
    if (!source) {
      return toast({ title: aiMode === "url" ? "Insira uma URL válida" : "Cole o texto antes de gerar", variant: "destructive" });
    }
    try {
      const payload = aiMode === "url" ? { url: source } : { url: source };
      const result = await generateAiMutation.mutateAsync({ data: payload });
      setValue("title", result.title, { shouldDirty: true });
      setValue("excerpt", result.excerpt, { shouldDirty: true });
      setValue("content", result.content, { shouldDirty: true });
      if (result.tags) {
        try { setSelectedTags(JSON.parse(result.tags)); } catch { setSelectedTags(["turismo"]); }
      }
      toast({ title: "Conteúdo gerado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro na geração por IA", description: e.message, variant: "destructive" });
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  if (isEditing && isLoadingPost) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center pt-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      {showPreview && (
        <PostPreviewOverlay
          post={watchedValues}
          tags={selectedTags}
          gallery={galleryUrls}
          videoEmbeds={videoUrls}
          onClose={() => setShowPreview(false)}
        />
      )}

      <AdminLayout>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/posts" className="p-2 hover:bg-muted rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Link>
            <div>
              <h1 className="text-2xl font-serif font-bold">{isEditing ? "Editar Publicação" : "Nova Publicação"}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedTags.length > 0 ? `Tags: ${selectedTags.join(", ")}` : "Nenhuma tag selecionada"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" /> Pré-visualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Title & Content Card */}
            <Card className="p-6">
              <form id="post-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Título *</Label>
                  <input
                    {...register("title")}
                    placeholder="Escreva um título impactante..."
                    className="w-full text-2xl font-serif font-medium bg-transparent border-0 border-b-2 border-border focus:border-primary focus:outline-none pb-2 transition-colors placeholder:text-muted-foreground/50"
                  />
                  {errors.title && <span className="text-xs text-destructive mt-1 block">{errors.title.message}</span>}
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Subtítulo</Label>
                  <input
                    {...register("subtitle")}
                    placeholder="Uma frase complementar e poética..."
                    className="w-full text-lg font-light italic text-muted-foreground bg-transparent border-0 border-b border-border/50 focus:border-primary/50 focus:outline-none pb-2 transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conteúdo *</Label>
                  </div>
                  <Controller
                    name="content"
                    control={control}
                    render={({ field }) => (
                      <RichTextEditor value={field.value || ""} onChange={field.onChange} />
                    )}
                  />
                  {errors.content && <span className="text-xs text-destructive mt-1 block">{errors.content.message}</span>}
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Resumo</Label>
                  <Textarea {...register("excerpt")} placeholder="Breve resumo que aparece nos cards e nos resultados de busca..." rows={3} className="resize-none" />
                </div>
              </form>
            </Card>

            {/* Gallery Card */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Images className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="font-serif font-medium text-foreground">Galeria de Fotos</h3>
                  {galleryUrls.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{galleryUrls.length}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mb-5">
                <div className="relative flex-1">
                  <input
                    value={newGalleryUrl}
                    onChange={e => setNewGalleryUrl(e.target.value)}
                    onPaste={e => {
                      const text = e.clipboardData.getData('text');
                      if (text.startsWith('http') && (text.includes('.jpg') || text.includes('.jpeg') || text.includes('.png') || text.includes('.webp') || text.includes('.gif'))) {
                        e.preventDefault();
                        setNewGalleryUrl(text);
                        setTimeout(() => {
                          if (text.trim()) {
                            setGalleryUrls(prev => prev.includes(text.trim()) ? prev : [...prev, text.trim()]);
                            setNewGalleryUrl("");
                          }
                        }, 50);
                      }
                    }}
                    placeholder="Cole a URL de uma imagem (https://...)"
                    className="w-full h-10 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addGalleryUrl())}
                  />
                </div>
                <Button type="button" onClick={addGalleryUrl} disabled={!newGalleryUrl.trim()} className="h-10 gap-1.5 shrink-0 text-sm">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>

              {galleryUrls.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                  <Images className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma imagem na galeria ainda.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Cole URLs de imagens ou adicione uma por uma.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {galleryUrls.map((url, idx) => (
                    <GalleryItem
                      key={`${url}-${idx}`}
                      url={url}
                      idx={idx}
                      total={galleryUrls.length}
                      onRemove={() => setGalleryUrls(prev => prev.filter((_, i) => i !== idx))}
                      onMoveUp={() => moveGallery(idx, -1)}
                      onMoveDown={() => moveGallery(idx, 1)}
                    />
                  ))}
                </div>
              )}
            </Card>

            {/* Video Embeds Card */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
                  <Youtube className="w-3.5 h-3.5 text-red-600" />
                </div>
                <h3 className="font-serif font-medium text-foreground">Vídeos</h3>
                {videoUrls.length > 0 && (
                  <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">{videoUrls.length}</span>
                )}
              </div>

              <div className="flex gap-2 mb-2">
                <div className="flex-1 relative">
                  <input
                    value={newVideoUrl}
                    onChange={e => setNewVideoUrl(e.target.value)}
                    placeholder="Cole link do YouTube, Vimeo ou URL de embed..."
                    className="w-full h-10 rounded-lg border border-border bg-muted/30 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addVideoUrl())}
                  />
                </div>
                <Button type="button" onClick={addVideoUrl} disabled={!newVideoUrl.trim()} className="h-10 gap-1.5 shrink-0 text-sm">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Links do YouTube são convertidos automaticamente para embed. Clique em <Eye className="inline w-3 h-3" /> para pré-visualizar.</p>

              {videoUrls.length === 0 ? (
                <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
                  <Video className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum vídeo adicionado ainda.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Suporta YouTube, Vimeo e outros links de embed.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {videoUrls.map((url, idx) => (
                    <VideoItem
                      key={`${url}-${idx}`}
                      url={url}
                      idx={idx}
                      total={videoUrls.length}
                      onRemove={() => setVideoUrls(prev => prev.filter((_, i) => i !== idx))}
                      onMoveUp={() => moveVideo(idx, -1)}
                      onMoveDown={() => moveVideo(idx, 1)}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            {/* Publish Card */}
            <Card className="p-5 border-primary/20 shadow-sm">
              <h3 className="font-serif font-medium mb-4 text-foreground">Publicação</h3>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Status</Label>
                  <div className="flex rounded-lg overflow-hidden border border-border">
                    {["draft", "published"].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setValue("status", s)}
                        className={cn(
                          "flex-1 py-2 text-xs font-medium transition-all",
                          watchedValues.status === s
                            ? s === "published" ? "bg-green-600 text-white" : "bg-amber-500 text-white"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {s === "published" ? "✓ Publicado" : "◐ Rascunho"}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" {...register("status")} />
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Slug da URL</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground shrink-0">/blog/</span>
                    <Input {...register("slug")} className="text-xs h-8" />
                  </div>
                  {errors.slug && <span className="text-xs text-destructive">{errors.slug.message}</span>}
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Descrição SEO</Label>
                  <Textarea {...register("metaDescription")} placeholder="Para aparecer nos resultados do Google..." rows={2} className="text-xs resize-none" />
                </div>

                <div className="pt-2 border-t border-border">
                  <Button type="submit" form="post-form" className="w-full" isLoading={isLoading}>
                    {isLoading ? "Salvando..." : isEditing ? "Salvar Alterações" : "Criar Publicação"}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Cover Image Card */}
            <Card className="p-5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">Imagem de Capa</Label>
              <Input {...register("coverImage")} placeholder="https://..." className="text-sm mb-3" />
              {watchedValues.coverImage ? (
                <div className="relative">
                  <img src={watchedValues.coverImage} alt="" className="w-full h-36 object-cover rounded-lg border border-border" />
                  <div className="absolute top-2 right-2">
                    <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> OK
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                  Pré-visualização da capa
                </div>
              )}
            </Card>

            {/* Tags Card */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Tags
                </Label>
                {selectedTags.length > 0 && (
                  <button type="button" onClick={() => setSelectedTags([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                    Limpar tudo
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {ALL_TAGS.map(tag => {
                  const selected = selectedTags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleTag(tag.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                        selected
                          ? "bg-primary border-primary text-primary-foreground shadow-sm scale-105"
                          : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      <span>{tag.emoji}</span>
                      <span>{tag.label}</span>
                      {selected && <Check className="w-3 h-3" />}
                    </button>
                  );
                })}
              </div>
              {selectedTags.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                  <strong className="text-foreground">{selectedTags.length}</strong> tag{selectedTags.length !== 1 ? "s" : ""} selecionada{selectedTags.length !== 1 ? "s" : ""}
                </p>
              )}
            </Card>

            {/* AI Generation Card */}
            <Card className="p-5 bg-gradient-to-br from-accent/30 to-background border-accent/40">
              <h3 className="font-serif font-medium mb-1 flex items-center gap-2 text-primary">
                <Wand2 className="w-4 h-4" /> Geração por IA
              </h3>
              <p className="text-xs text-muted-foreground mb-3">A IA reescreve o conteúdo e gera um artigo original para o site.</p>

              {/* Mode toggle */}
              <div className="flex rounded-lg overflow-hidden border border-border mb-3">
                <button
                  type="button"
                  onClick={() => setAiMode("url")}
                  className={cn("flex-1 py-1.5 text-xs font-medium transition-all", aiMode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  Via URL
                </button>
                <button
                  type="button"
                  onClick={() => setAiMode("text")}
                  className={cn("flex-1 py-1.5 text-xs font-medium transition-all", aiMode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  Colar Texto
                </button>
              </div>

              <div className="space-y-2">
                {aiMode === "url" ? (
                  <Input
                    value={aiUrl}
                    onChange={e => setAiUrl(e.target.value)}
                    placeholder="https://exemplo.com/artigo"
                    className="bg-background text-sm"
                    onKeyDown={e => e.key === "Enter" && handleAIGeneration()}
                  />
                ) : (
                  <textarea
                    value={aiText}
                    onChange={e => setAiText(e.target.value)}
                    placeholder="Cole aqui o texto do artigo que deseja reescrever..."
                    rows={5}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary resize-none transition-all"
                  />
                )}
                <Button
                  type="button"
                  onClick={handleAIGeneration}
                  disabled={generateAiMutation.isPending || (aiMode === "url" ? !aiUrl.trim() : !aiText.trim())}
                  className="w-full gap-2"
                  variant="secondary"
                >
                  {generateAiMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Gerando rascunho...</>
                  ) : (
                    <><Wand2 className="w-4 h-4" /> Gerar com IA</>
                  )}
                </Button>
                {aiMode === "url" && (
                  <p className="text-xs text-muted-foreground text-center">
                    Se a URL não funcionar, use "Colar Texto"
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </AdminLayout>
    </>
  );
}
