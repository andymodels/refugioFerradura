import { useParams } from "wouter";
import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MapPin, Star, Utensils, Home, TreePine, Camera, Palette, Tent, Sparkles, Loader2, Link as LinkIcon, CalendarDays, Paperclip, X, FilePlus2 } from "lucide-react";

const PREDEFINED_TAGS = [
  { id: "lugares", label: "Lugares", icon: MapPin },
  { id: "experiencias", label: "Experiências", icon: Star },
  { id: "gastronomia", label: "Gastronomia", icon: Utensils },
  { id: "hospedagem", label: "Hospedagem", icon: Home },
  { id: "natureza", label: "Natureza", icon: TreePine },
  { id: "turismo", label: "Turismo", icon: Camera },
  { id: "cultura", label: "Cultura", icon: Palette },
  { id: "aventura", label: "Aventura", icon: Tent },
  { id: "eventos", label: "Eventos", icon: CalendarDays },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

const DRAFT_PREFIX = "refugio-editor-draft-";

function draftKey(id: string | undefined) {
  return DRAFT_PREFIX + (id || "new");
}

export default function AdminPostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams();
  const postId = (params as any)?.id as string | undefined;

  const [aiUrl, setAiUrl] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPhotos, setAiPhotos] = useState<File[]>([]);
  const [aiCreating, setAiCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const { register, handleSubmit, setValue, control, watch, reset, getValues } = useForm({
    defaultValues: {
      title: "",
      subtitle: "",
      content: "",
      excerpt: "",
      metaDescription: "",
      slug: "",
      status: "draft" as "draft" | "published",
      tags: [] as string[],
      coverImage: "",
    },
  });

  const currentStatus = watch("status");
  const selectedTags = (watch("tags") as string[]) || [];

  const toggleTag = (id: string) => {
    const next = selectedTags.includes(id)
      ? selectedTags.filter((t) => t !== id)
      : [...selectedTags, id];
    setValue("tags", next);
  };

  // ── Draft persistence ──────────────────────────────────────────────────────
  // Uses watch(callback) subscription — fires on every field change immediately,
  // no debounce, no re-render dependency. On unmount we read getValues() directly.
  const formValues = watch(); // still needed for tags/status display

  useEffect(() => {
    const writeDraft = (values: Record<string, any>) => {
      if (!values.title && !values.content) return;
      try { localStorage.setItem(draftKey(postId), JSON.stringify(values)); } catch {}
    };

    // Subscribe: fires immediately on every change, no timing issues
    const { unsubscribe } = watch((values) => writeDraft(values as any));

    return () => {
      unsubscribe();
      // Final flush on unmount using getValues() — guaranteed to be the latest snapshot
      writeDraft(getValues());
    };
  }, [postId]); // eslint-disable-line

  // ── Load post for edit mode, then check for a local draft ─────────────────
  useEffect(() => {
    if (!postId) {
      // New post — try to restore draft immediately
      try {
        const raw = localStorage.getItem(draftKey(undefined));
        if (raw) {
          const draft = JSON.parse(raw);
          if (draft.title || draft.content) {
            reset(draft);
            setDraftRestored(true);
          }
        }
      } catch {}
      return;
    }

    fetch(`/api/posts/admin/${postId}`, { credentials: "include" })
      .then((res) => res.json())
      .then((post) => {
        if (post.error) {
          toast({ title: "Erro ao carregar post", variant: "destructive" });
          return;
        }
        const serverData = {
          title: post.title || "",
          subtitle: post.subtitle || "",
          content: post.content || "",
          excerpt: post.excerpt || "",
          metaDescription: post.metaDescription || "",
          slug: post.slug || "",
          status: post.status || "draft",
          tags: post.tags ? JSON.parse(post.tags) : [],
          coverImage: post.coverImage || "",
        };
        // Check if there's a local draft with more recent edits
        try {
          const raw = localStorage.getItem(draftKey(postId));
          if (raw) {
            const draft = JSON.parse(raw);
            // If draft has meaningful content different from server, restore it
            if ((draft.title || draft.content) &&
                (draft.title !== serverData.title || draft.content !== serverData.content)) {
              reset(draft);
              setDraftRestored(true);
              return;
            }
          }
        } catch {}
        reset(serverData);
      })
      .catch(() => {
        toast({ title: "Erro ao carregar post", variant: "destructive" });
      });
  }, [postId, reset]);

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey(postId)); } catch {}
    setDraftRestored(false);
    // Reload from server
    if (postId) {
      fetch(`/api/posts/admin/${postId}`, { credentials: "include" })
        .then((r) => r.json())
        .then((post) => {
          if (!post.error) {
            reset({
              title: post.title || "",
              subtitle: post.subtitle || "",
              content: post.content || "",
              excerpt: post.excerpt || "",
              metaDescription: post.metaDescription || "",
              slug: post.slug || "",
              status: post.status || "draft",
              tags: post.tags ? JSON.parse(post.tags) : [],
              coverImage: post.coverImage || "",
            });
          }
        });
    } else {
      reset({ title: "", subtitle: "", content: "", excerpt: "", metaDescription: "", slug: "", status: "draft", tags: [], coverImage: "" });
    }
  };

  // AI generation from URL or text
  const handleAIGeneration = async () => {
    if (!aiUrl.trim()) {
      toast({ title: "Informe uma URL ou texto para gerar o artigo", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: aiUrl.trim(), instructions: aiInstructions.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || `Erro ${res.status}`);
        return;
      }
      // IA retornou aviso de conteúdo fora do escopo da região
      if (data.error === "fora_de_escopo") {
        setAiError(data.message || "Conteúdo fora do escopo da Rota da Ferradura.");
        return;
      }
      if (data.title) setValue("title", data.title);
      if (data.subtitle) setValue("subtitle", data.subtitle);
      if (data.content) setValue("content", data.content);
      if (data.excerpt) setValue("excerpt", data.excerpt);
      if (data.metaDescription) setValue("metaDescription", data.metaDescription);
      if (data.title && !watch("slug")) {
        setValue("slug", slugify(data.title).slice(0, 60));
      }
      if (data.tags && Array.isArray(data.tags)) {
        const valid = data.tags.filter((t: string) =>
          PREDEFINED_TAGS.some((p) => p.id === t)
        );
        if (valid.length) setValue("tags", valid);
      }
      toast({ title: "Artigo gerado com sucesso!" });
      setAiUrl("");
    } catch (e: any) {
      setAiError("Erro de conexão ao tentar gerar o artigo. Tente novamente.");
    } finally {
      setAiLoading(false);
    }
  };

  // Cola o link + fotos anexadas e já cria o post como rascunho (sem revisar o formulário antes).
  const handleAIGenerateAndCreate = async () => {
    if (!aiUrl.trim().startsWith("http")) {
      toast({ title: "Informe uma URL de artigo válida", variant: "destructive" });
      return;
    }
    setAiCreating(true);
    setAiError(null);
    try {
      const formData = new FormData();
      formData.append("url", aiUrl.trim());
      formData.append("instructions", aiInstructions.trim());
      aiPhotos.forEach((file) => formData.append("photos", file));

      const res = await fetch("/api/ai/generate-and-create", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || `Erro ${res.status}`);
        return;
      }
      toast({ title: "Post criado como rascunho!" });
      try { localStorage.removeItem(draftKey(postId)); } catch {}
      setLocation(`/admin/posts/${data.id}/editar`);
    } catch (e: any) {
      setAiError("Erro de conexão ao tentar criar o post. Tente novamente.");
    } finally {
      setAiCreating(false);
    }
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      // Strip plain text for auto-filling SEO fields
      const plainText = (data.content || "").replace(/<[^>]*>/gm, "").replace(/\s+/g, " ").trim();

      const payload = {
        title: data.title,
        subtitle: data.subtitle || "",
        content: data.content || "",
        excerpt: data.excerpt || plainText.substring(0, 160),
        metaDescription: data.metaDescription || plainText.substring(0, 150),
        slug: data.slug || slugify(data.title || "post") + "-" + Date.now(),
        status: data.status || "draft",
        coverImage: data.coverImage || "",
        tags: JSON.stringify(data.tags || []),
      };

      const url = postId
        ? `/api/posts/admin/${postId}`
        : "/api/posts/admin/create";
      const method = postId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      // Clear local draft on successful save
      try { localStorage.removeItem(draftKey(postId)); } catch {}
      toast({ title: postId ? "Post atualizado!" : "Post criado!" });
      setLocation("/admin/posts");
    } catch (e: any) {
      toast({ title: e.message || "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">

        {/* Draft restored banner */}
        {draftRestored && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
            <span>
              <span className="font-semibold">Rascunho recuperado</span> — suas edições anteriores foram restauradas automaticamente.
            </span>
            <button
              type="button"
              onClick={discardDraft}
              className="ml-4 text-amber-400 hover:text-amber-200 underline text-xs whitespace-nowrap transition-colors"
            >
              Descartar e recarregar
            </button>
          </div>
        )}

        {/* AI Generation Panel */}
        <div className="bg-[#111] border border-white/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            Gerar com IA
          </div>
          <p className="text-white/40 text-[11px]">
            Digite um <span className="text-white/60">tema ou tópico</span> (ex: "bares da Rota da Ferradura"), cole uma URL de artigo, um link de foto (.jpg/.png) ou o próprio texto copiado — a IA gera o artigo automaticamente.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-black/50 border border-white/10 rounded-lg px-3 py-2">
              <LinkIcon className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <input
                type="text"
                value={aiUrl}
                onChange={(e) => { setAiUrl(e.target.value); setAiError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleAIGeneration()}
                placeholder="tema, https://artigo.com, https://foto.jpg ou cole o texto aqui"
                className="bg-transparent outline-none w-full text-sm text-white placeholder:text-white/20"
              />
            </div>
            <button
              type="button"
              onClick={handleAIGeneration}
              disabled={aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {aiLoading ? "Gerando..." : "Gerar"}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase text-white/25 font-bold tracking-widest">
              Instruções adicionais <span className="normal-case font-normal text-white/20">(opcional)</span>
            </label>
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              rows={2}
              placeholder="Ex: foque nos restaurantes mencionados, use tom mais descontraído, destaque a vista para o mar..."
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none resize-none focus:border-white/20 transition-colors"
            />
          </div>

          <div className="border-t border-white/10 pt-3 space-y-2">
            <label className="text-[10px] uppercase text-white/25 font-bold tracking-widest">
              Fotos anexadas <span className="normal-case font-normal text-white/20">(opcional — usadas junto com as da fonte)</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-sm text-white/60 hover:text-white hover:border-white/20 cursor-pointer transition-colors">
                <Paperclip className="w-3.5 h-3.5" />
                Anexar fotos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setAiPhotos((prev) => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
              </label>
              {aiPhotos.map((file, i) => (
                <span key={i} className="flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-white/50">
                  {file.name.length > 20 ? file.name.slice(0, 17) + "..." : file.name}
                  <button
                    type="button"
                    onClick={() => setAiPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-white/30 hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAIGenerateAndCreate}
              disabled={aiCreating || aiLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors"
            >
              {aiCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
              {aiCreating ? "Criando post..." : "Gerar e Criar Post (rascunho)"}
            </button>
          </div>

          {aiError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300 leading-relaxed">
              <span className="font-semibold block mb-2">⚠ Erro na geração</span>
              {aiError.split("\n\n").map((paragraph, i) => (
                <p key={i} className={i > 0 ? "mt-2" : ""}>{paragraph}</p>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Cover image — full width, right below AI panel */}
          <div className="lg:col-span-3 space-y-1">
            <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Imagem de capa (URL)</label>
            <input
              {...register("coverImage")}
              placeholder="https://... cole aqui o link da imagem de capa"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Main content column */}
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Título</label>
              <input
                {...register("title", { required: true })}
                placeholder="Título do artigo"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-xl font-serif text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Subtítulo</label>
              <input
                {...register("subtitle")}
                placeholder="Subtítulo ou chamada do artigo"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Conteúdo</label>
              <Controller
                name="content"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Resumo (excerpt)</label>
              <Textarea
                {...register("excerpt")}
                rows={3}
                placeholder="Resumo exibido nas listagens de posts"
                className="bg-black/40 border border-white/10 text-sm placeholder:text-white/20"
              />
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <Card className="p-6 bg-[#1a1a1a] border-white/5 space-y-6 sticky top-6">

              {/* Status */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Status</Label>
                <div className="flex bg-black p-1 rounded-md">
                  <button
                    type="button"
                    onClick={() => setValue("status", "draft")}
                    className={`flex-1 py-2 text-[10px] font-bold rounded transition-colors ${currentStatus === "draft" ? "bg-orange-600 text-white" : "text-white/20 hover:text-white/40"}`}
                  >
                    RASCUNHO
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue("status", "published")}
                    className={`flex-1 py-2 text-[10px] font-bold rounded transition-colors ${currentStatus === "published" ? "bg-green-700 text-white" : "text-white/20 hover:text-white/40"}`}
                  >
                    PUBLICADO
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <Label className="text-[10px] uppercase text-white/30">Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border transition-all ${
                        selectedTags.includes(t.id)
                          ? "bg-orange-500/20 border-orange-500 text-orange-400"
                          : "bg-white/5 border-white/10 text-white/40 hover:border-white/20"
                      }`}
                    >
                      <t.icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Slug URL</Label>
                <div className="flex items-center gap-1 bg-black p-2 rounded text-[10px] border border-white/5">
                  <span className="opacity-20 shrink-0">/blog/</span>
                  <input
                    {...register("slug")}
                    className="bg-transparent outline-none w-full text-white/70"
                  />
                </div>
              </div>

              {/* SEO */}
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Descrição SEO</Label>
                <Textarea
                  {...register("metaDescription")}
                  className="bg-black border-white/5 text-xs placeholder:text-white/20"
                  rows={3}
                  placeholder="Até 160 caracteres para buscadores"
                />
              </div>

              {/* Save */}
              <Button
                type="submit"
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </span>
                ) : postId ? "Atualizar Post" : "Criar Post"}
              </Button>

              {postId && (
                <button
                  type="button"
                  onClick={() => setLocation("/admin/posts")}
                  className="w-full py-2 text-[10px] text-white/30 hover:text-white/50 transition-colors"
                >
                  Cancelar edição
                </button>
              )}
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
