import { useParams } from "wouter";
import React, { useState, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MapPin, Star, Utensils, Home, TreePine, Camera, Palette, Tent, Sparkles, Loader2, Link as LinkIcon, CalendarDays, Paperclip, X, FilePlus2, Store } from "lucide-react";
import { isVideoUrl, videoPosterUrl } from "@/lib/utils";

const POSITION_KEYWORD_X: Record<string, number> = { left: 0, center: 50, right: 100 };
const POSITION_KEYWORD_Y: Record<string, number> = { top: 0, center: 50, bottom: 100 };

// Aceita tanto o formato antigo (palavras-chave: "left top", "center center")
// quanto o novo (percentuais livres: "37% 82%"), pra não quebrar posts que já
// tinham um valor salvo antes desta mudança.
function parseCoverPosition(value: string): { x: number; y: number } {
  const [xRaw, yRaw] = (value || "center center").trim().split(/\s+/);
  const x = xRaw?.endsWith("%") ? parseFloat(xRaw) : POSITION_KEYWORD_X[xRaw];
  const y = yRaw?.endsWith("%") ? parseFloat(yRaw) : POSITION_KEYWORD_Y[yRaw];
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
}

// Enquadramento da capa (foto ou vídeo): o corte é sempre feito no CSS
// (object-position), nunca no Cloudinary — um vídeo nunca é recortado lá, só
// redimensionado. Por isso o mesmo valor resolve o corte pra foto e pra
// vídeo ao mesmo tempo. Marcador arrastável (percentual livre) em vez de
// posições fixas, porque 9 pontos fixos cortavam demais nos extremos.
function CoverPositionPicker({ coverUrl, value, onChange }: { coverUrl: string; value: string; onChange: (v: string) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  if (!coverUrl.trim()) return null;
  const video = isVideoUrl(coverUrl);
  const previewSrc = video ? videoPosterUrl(coverUrl) : coverUrl;
  const { x, y } = parseCoverPosition(value);

  const setFromPoint = (clientX: number, clientY: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const nx = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
    const ny = Math.min(100, Math.max(0, Math.round(((clientY - rect.top) / rect.height) * 100)));
    onChange(`${nx}% ${ny}%`);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setFromPoint(e.clientX, e.clientY);
    const onMove = (me: MouseEvent) => setFromPoint(me.clientX, me.clientY);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">
        Enquadramento da capa {video && "(vídeo)"}
      </label>
      <div
        ref={boxRef}
        onMouseDown={onMouseDown}
        className="relative w-full max-w-xs aspect-video rounded-lg overflow-hidden border border-white/10 bg-black/40 cursor-crosshair select-none"
      >
        {video && !previewSrc ? (
          <video src={coverUrl} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" style={{ objectPosition: `${x}% ${y}%` }} />
        ) : (
          <img src={previewSrc!} alt="Prévia da capa" className="w-full h-full object-cover pointer-events-none" style={{ objectPosition: `${x}% ${y}%` }} draggable={false} />
        )}
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-orange-500 bg-white/90 shadow-md pointer-events-none"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>
      <p className="text-[10px] text-white/30">Clique e arraste o ponto até enquadrar certinho o que vai aparecer nos cards e na página do post.</p>
    </div>
  );
}

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
  { id: "empreendimentos", label: "Empreendimentos / Serviços", icon: Store },
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

function isInstagramPostUrl(url: string) {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
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
  const [pendingLocalDraft, setPendingLocalDraft] = useState<Record<string, any> | null>(null);

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
      coverImageDisplayMode: "natural" as "cover" | "natural",
      coverImagePosition: "center center",
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
          // Posts opened in this manual editor should preserve any cover image
          // supplied by the administrator, including posts created before this
          // setting existed. Automated publishing never passes through here.
          coverImageDisplayMode: post.coverImage ? "natural" : "cover",
          coverImagePosition: post.coverImagePosition || "center center",
        };
        // Server content always wins by default — a stale local draft must never
        // silently overwrite newer edits saved by someone else (or by an earlier
        // session). If a differing draft exists, offer it as an opt-in choice
        // instead of applying it automatically.
        reset(serverData);
        try {
          const raw = localStorage.getItem(draftKey(postId));
          if (raw) {
            const draft = JSON.parse(raw);
            if ((draft.title || draft.content) &&
                (draft.title !== serverData.title || draft.content !== serverData.content)) {
              setPendingLocalDraft(draft);
              setDraftRestored(true);
            } else {
              localStorage.removeItem(draftKey(postId));
            }
          }
        } catch {}
      })
      .catch(() => {
        toast({ title: "Erro ao carregar post", variant: "destructive" });
      });
  }, [postId, reset]);

  // Dismisses the "local draft available" offer — server content (already
  // loaded into the form) is kept as-is, and the stale draft is deleted so it
  // stops being offered on every future visit to this post.
  const discardDraft = () => {
    try { localStorage.removeItem(draftKey(postId)); } catch {}
    setDraftRestored(false);
    setPendingLocalDraft(null);
    if (!postId) {
      reset({ title: "", subtitle: "", content: "", excerpt: "", metaDescription: "", slug: "", status: "draft", tags: [], coverImage: "", coverImageDisplayMode: "natural" });
    }
  };

  // Explicit opt-in: the admin decided the local draft (unsaved edits from a
  // previous session on this device) should replace what's currently loaded.
  const applyLocalDraft = () => {
    if (!pendingLocalDraft) return;
    reset(pendingLocalDraft);
    setDraftRestored(false);
    setPendingLocalDraft(null);
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
      const content = data.content || "";
      // Strip plain text for auto-filling SEO fields
      const plainText = content.replace(/<[^>]*>/gm, "").replace(/\s+/g, " ").trim();
      const directCoverImage = isInstagramPostUrl(data.coverImage || "") ? "" : (data.coverImage || "");

      const payload = {
        title: data.title,
        subtitle: data.subtitle || "",
        content,
        excerpt: data.excerpt || plainText.substring(0, 160),
        metaDescription: data.metaDescription || plainText.substring(0, 150),
        slug: data.slug || slugify(data.title || "post") + "-" + Date.now(),
        status: data.status || "draft",
        coverImage: directCoverImage,
        coverImageDisplayMode: directCoverImage ? data.coverImageDisplayMode || "natural" : "cover",
        coverImagePosition: data.coverImagePosition || "center center",
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
      <div className="p-4 sm:p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">

        {/* Local draft available banner — never applied automatically, to avoid
            a stale browser draft silently overwriting newer content saved by
            someone else (or by an earlier session on the same post). */}
        {draftRestored && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-300">
            <span>
              <span className="font-semibold">Rascunho local encontrado</span> — há edições não salvas deste navegador, diferentes do que está publicado. O conteúdo atual do servidor está carregado.
            </span>
            <span className="ml-4 flex items-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={applyLocalDraft}
                className="text-amber-400 hover:text-amber-200 underline text-xs transition-colors"
              >
                Usar rascunho local
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="text-amber-400 hover:text-amber-200 underline text-xs transition-colors"
              >
                Descartar
              </button>
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* A capa aceita apenas uma imagem direta. Links de posts/reels do
              Instagram devem ficar no artigo, onde viram embed. */}
          <div className="lg:col-span-3 space-y-1">
            <label className="text-[10px] uppercase text-white/30 font-bold tracking-widest">Imagem de capa (opcional — URL direta .jpg/.png)</label>
            <input
              {...register("coverImage")}
              placeholder="Deixe vazio para links do Instagram; eles entram como mídia dentro do artigo"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-orange-500/50 transition-colors"
            />
            <CoverPositionPicker
              coverUrl={watch("coverImage") || ""}
              value={watch("coverImagePosition") || "center center"}
              onChange={(v) => setValue("coverImagePosition", v)}
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
