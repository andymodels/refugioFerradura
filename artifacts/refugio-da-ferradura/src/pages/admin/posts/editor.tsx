import { useParams } from "wouter";
import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { MapPin, Star, Utensils, Home, TreePine, Camera, Palette, Tent } from "lucide-react";

const PREDEFINED_TAGS = [
  { id: "lugares", label: "Lugares", icon: MapPin },
  { id: "experiencias", label: "Experiências", icon: Star },
  { id: "gastronomia", label: "Gastronomia", icon: Utensils },
  { id: "hospedagem", label: "Hospedagem", icon: Home },
  { id: "natureza", label: "Natureza", icon: TreePine },
  { id: "turismo", label: "Turismo", icon: Camera },
  { id: "cultura", label: "Cultura", icon: Palette },
  { id: "aventura", label: "Aventura", icon: Tent },
];

export default function AdminPostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams();
  const postId = params?.id;

  const { register, handleSubmit, setValue, control, watch, reset } = useForm({
    defaultValues: {
      title: "",
      subtitle: "",
      content: "",
      excerpt: "",
      metaDescription: "",
      slug: "",
      status: "draft",
      tags: [],
      coverImage: ""
    }
  });

  const currentStatus = watch("status");
  const selectedTags = watch("tags") || [];

  const toggleTag = (id: string) => {
    const next = selectedTags.includes(id)
      ? selectedTags.filter(t => t !== id)
      : [...selectedTags, id];
    setValue("tags", next);
  };

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/posts/admin/${postId}`, { credentials: "include" })
      .then(res => res.json())
      .then(post => {
        reset({
          title: post.title || "",
          subtitle: post.subtitle || "",
          content: post.content || "",
          excerpt: post.excerpt || "",
          metaDescription: post.metaDescription || "",
          slug: post.slug || "",
          status: post.status || "draft",
          tags: post.tags ? JSON.parse(post.tags) : [],
          coverImage: post.coverImage || ""
        });
      });
  }, [postId, reset]);

  const onSubmit = async (data: any) => {
    let rawContent = data.content || "";

    // REMOVE H1 DO INÍCIO (CAUSA DO BUG VISUAL)
    rawContent = rawContent.replace(/^<h1[^>]*>.*?<\/h1>/i, "");

    // REMOVE HTML PARA GERAR TEXTO LIMPO
    const plainText = rawContent.replace(/<[^>]*>?/gm, "");

    const payload = {
      ...data,
      content: rawContent,
      excerpt: data.excerpt || plainText.substring(0, 160),
      metaDescription: data.metaDescription || plainText.substring(0, 150),
      tags: JSON.stringify(data.tags || [])
    };

    await fetch("/api/posts/admin/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    toast({ title: "Salvo" });
    setLocation("/admin/posts");
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          <div className="lg:col-span-2 space-y-8">
            <input {...register("title")} placeholder="Título" />
            <input {...register("subtitle")} placeholder="Subtítulo" />

            <Controller
              name="content"
              control={control}
              render={({ field }) => (
                <RichTextEditor value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          <div>
            <Card className="p-6 bg-[#1a1a1a] border-white/5 space-y-6">
              <div className="space-y-3">
                <Label className="text-[10px] uppercase text-white/30">Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTag(t.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] border transition-all ${selectedTags.includes(t.id) ? "bg-orange-500/20 border-orange-500 text-orange-500" : "bg-white/5 border-transparent text-white/40"}`}
                    >
                      <t.icon className="w-3 h-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] uppercase text-white/30">Status</Label>
                <div className="flex bg-black p-1 rounded-md">
                  <button type="button" onClick={() => setValue("status", "draft")} className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "draft" ? "bg-orange-600 text-white" : "text-white/20"}`}>RASCUNHO</button>
                  <button type="button" onClick={() => setValue("status", "published")} className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "published" ? "bg-green-700 text-white" : "text-white/20"}`}>PUBLICADO</button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Slug URL</Label>
                <div className="flex items-center gap-1 bg-black p-2 rounded text-[10px] border border-white/5">
                  <span className="opacity-20">/blog/</span>
                  <input {...register("slug")} className="bg-transparent outline-none w-full" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Descrição SEO</Label>
                <Textarea {...register("metaDescription")} className="bg-black text-xs" rows={3} />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Imagem de capa</Label>
                <input {...register("coverImage")} className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-xs" />
              </div>

              <Button type="submit">Salvar</Button>
            </Card>

          </div>
        </form>
      </div>
    </AdminLayout>
  );
}