import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Wand2, ArrowLeft, Eye } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function PostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInput, setAiInput] = useState("");
  
  const { register, handleSubmit, setValue, control, watch } = useForm({
    defaultValues: { 
      title: "", subtitle: "", content: "", excerpt: "", 
      metaDescription: "", slug: "", status: "draft", 
      tags: ["turismo", "natureza"], coverImage: "" 
    }
  });

  const currentStatus = watch("status");
  const currentTags = watch("tags");

  const handleAIGeneration = async () => {
    if (!aiInput.trim()) return toast({ title: "Digite algo para a IA" });
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {
  title: data.title,
  content: data.content,
  excerpt: data.excerpt,
  slug: data.slug,
  authorId: 1
}})
      });
      const data = await res.json();
      setValue("title", data.title || "");
      setValue("subtitle", data.subtitle || "");
      setValue("content", data.content || "");
      setValue("metaDescription", data.metaDescription || "");
      setValue("slug", (data.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50));
      toast({ title: "Conteúdo gerado!" });
    } catch (e) {
      toast({ title: "Erro na geração" });
    } finally { setIsGenerating(false); }
  };

  const onSubmit = async (data: any) => {
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: {
  title: data.title,
  content: data.content,
  excerpt: data.excerpt,
  slug: data.slug,
  authorId: 1
}})
      });
      if (res.ok) {
        toast({ title: "Publicação criada!" });
        setLocation("/admin/posts");
      }
    } catch (e) {
      toast({ title: "Erro ao salvar" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 cursor-pointer opacity-50 hover:opacity-100" /></Link>
            <div>
              <h1 className="text-2xl font-semibold">Nova Publicação</h1>
              <p className="text-xs text-white/40">Tags: {currentTags.join(", ")}</p>
            </div>
          </div>
          <Button variant="outline" className="bg-white/5 border-white/10 gap-2">
            <Eye className="w-4 h-4" /> Pré-visualizar
          </Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <Label className="text-[10px] uppercase tracking-widest text-white/40 mb-2 block">Título *</Label>
              <input {...register("title")} className="w-full bg-transparent border-b border-white/10 py-2 text-3xl font-serif focus:border-primary outline-none" placeholder="Título da matéria" />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-widest text-white/40 mb-2 block">Subtítulo</Label>
              <input {...register("subtitle")} className="w-full bg-transparent border-b border-white/10 py-2 text-lg italic text-white/60 outline-none" placeholder="Uma frase complementar e poética..." />
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-widest text-white/40 mb-4 block">Conteúdo *</Label>
              <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-[#1a1a1a] border-white/5 space-y-6">
              <h3 className="text-sm font-medium">Publicação</h3>
              
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/40">Status</Label>
                <div className="flex bg-black/40 p-1 rounded-md">
                  <button type="button" onClick={() => setValue("status", "draft")} className={`flex-1 py-2 text-xs rounded transition-all ${currentStatus === "draft" ? "bg-orange-500 text-white" : "text-white/40"}`}>● Rascunho</button>
                  <button type="button" onClick={() => setValue("status", "published")} className={`flex-1 py-2 text-xs rounded transition-all ${currentStatus === "published" ? "bg-green-600 text-white" : "text-white/40"}`}>✓ Publicado</button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/40">Slug da URL</Label>
                <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded text-[11px] border border-white/5">
                  <span className="opacity-30">/blog/</span>
                  <input {...register("slug")} className="bg-transparent outline-none w-full" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/40">Descrição SEO</Label>
                <Textarea {...register("metaDescription")} className="bg-black/40 border-white/10 text-xs" rows={3} placeholder="Para aparecer no Google..." />
              </div>

              <Button type="submit" className="w-full bg-[#b3937a] hover:bg-[#a28269] text-black font-bold py-6">Criar Publicação</Button>
            </Card>

            <Card className="p-6 bg-[#c4a484]/5 border-[#c4a484]/20 space-y-4">
              <Label className="flex items-center gap-2 text-[#c4a484] text-xs uppercase tracking-tighter"><Wand2 className="w-4 h-4" /> Geração por IA</Label>
              <Textarea value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="Cole o link ou contexto..." className="bg-black/40 border-white/5 text-xs" rows={4} />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs uppercase">
                {isGenerating ? "Processando..." : "Gerar com IA"}
              </Button>
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
