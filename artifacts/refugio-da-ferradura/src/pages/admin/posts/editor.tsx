import { useParams } from "wouter";
import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { MapPin, Star, Utensils, Home, TreePine, Camera, Palette, Tent, Sparkles, Loader2, Link as LinkIcon, CalendarDays, Paperclip, X, FilePlus2, Store, ClipboardPaste, Archive } from "lucide-react";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[char] || char);
}

function isInstagramPostUrl(url: string) {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

function instagramPermalink(url: string) {
  const match = url.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/i);
  return match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : null;
}

async function archiveInstagramEmbeds(html: string) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const frames = Array.from(holder.querySelectorAll<HTMLIFrameElement>('iframe[data-embed-type="instagram"]'));
  if (!frames.length) return { html, count: 0 };

  for (const frame of frames) {
    const sourceUrl = instagramPermalink(frame.src);
    if (!sourceUrl) throw new Error("Um dos links do Instagram é inválido.");
    const response = await fetch("/api/media/import-instagram", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sourceUrl }),
    });
    const media = await response.json();
    if (!response.ok) throw new Error(media.error || "Não foi possível arquivar uma mídia.");

    const figure = document.createElement("figure");
    const link = document.createElement("a");
    link.href = sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (media.type === "video") {
      figure.className = "instagram-editorial-video";
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = media.url;
      figure.appendChild(video);
      const badge = document.createElement("a");
      badge.className = "instagram-editorial-video-badge";
      badge.href = sourceUrl;
      badge.target = "_blank";
      badge.rel = "noopener noreferrer";
      badge.textContent = "Instagram oficial ↗";
      figure.appendChild(badge);
    } else {
      figure.className = "instagram-editorial-photo";
      const image = document.createElement("img");
      image.src = media.url;
      image.alt = "";
      image.loading = "lazy";
      link.appendChild(image);
      figure.appendChild(link);
    }
    frame.closest(".video-embed-wrap")?.replaceWith(figure);
  }
  return { html: holder.innerHTML, count: frames.length };
}

function formatInlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  return html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function importArticleText(source: string) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (!title && /^#\s+/.test(line)) {
      title = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(`<h2>${formatInlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^>\s*/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${formatInlineMarkdown(line.replace(/^>\s*/, ""))}</blockquote>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      flushParagraph();
      listItems.push(line.replace(/^-\s+/, ""));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();

  return { title, content: blocks.join("") };
}

export default function AdminPostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams();
  const postId = (params as any)?.id as string | undefined;

  const [aiUrl, setAiUrl] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [articleImport, setArticleImport] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPhotos, setAiPhotos] = useState<File[]>([]);
  const [aiCreating, setAiCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingMedia, setArchivingMedia] = useState(false);
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
    },
  });

  const currentStatus = watch("status");
  const selectedTags = (watch("tags") as string[]) || [];

  const archiveArticleMedia = async () => {
    setArchivingMedia(true);
    try {
      const result = await archiveInstagramEmbeds(getValues("content") || "");
      if (!result.count) throw new Error("Não há links do Instagram para arquivar neste artigo.");
      setValue("content", result.html, { shouldDirty: true });
      toast({ title: `${result.count} mídia(s) arquivada(s) no Cloudinary` });
    } catch (error: any) {
      toast({ title: "A mídia não foi arquivada", description: error.message, variant: "destructive" });
    } finally {
      setArchivingMedia(false);
    }
  };

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

  const handleArticleImport = () => {
    const imported = importArticleText(articleImport);
    if (!imported.title || !imported.content) {
      toast({ title: "Cole um artigo com título e conteúdo", variant: "destructive" });
      return;
    }
    const plainText = imported.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    setValue("title", imported.title);
    setValue("content", imported.content);
    setValue("excerpt", plainText.slice(0, 160));
    setValue("metaDescription", plainText.slice(0, 150));
    setValue("slug", slugify(imported.title).slice(0, 60));
    setArticleImport("");
    toast({ title: "Artigo importado — confira e salve como rascunho ou publicado." });
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

        {/* Paste-ready article importer */}
        <div className="bg-emerald-500/5 border border-emerald-400/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-widest">
            <ClipboardPaste className="w-3.5 h-3.5" />
            Colar artigo pronto
          </div>
          <p className="text-white/50 text-[11px] leading-relaxed">
            Cole o artigo em texto simples. Links do Instagram entram como texto, sem virar embed — depois de importar, use o botão do Instagram na barra de ferramentas do editor pra inserir a foto/vídeo de verdade no lugar certo. O botão "Arquivar mídias" abaixo só é útil pra HTML colado que já tenha embeds antigos do Instagram.
          </p>
          <Textarea
            value={articleImport}
            onChange={(event) => setArticleImport(event.target.value)}
            rows={8}
            placeholder={'# Título do artigo\n\nTexto de abertura.\n\nMais texto...'}
            className="bg-black/40 border-white/10 text-sm placeholder:text-white/20"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleArticleImport} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white">
              <ClipboardPaste className="w-4 h-4" /> Importar para o editor
            </Button>
            <Button type="button" onClick={archiveArticleMedia} isLoading={archivingMedia} className="flex items-center gap-2">
              <Archive className="w-4 h-4" /> Arquivar mídias no Cloudinary
            </Button>
          </div>
        </div>

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
