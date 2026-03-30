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
  const [isSaving, setIsSaving] = useState(false);
  const [aiInput, setAiInput] = useState("");
  
  const { register, handleSubmit, setValue, control, watch } = useForm({
    defaultValues: { 
      title: "", subtitle: "", content: "", excerpt: "", 
      metaDescription: "", slug: "", status: "draft", 
      tags: ["turismo", "natureza"], coverImage: "" 
    }
  });

  const currentStatus = watch("status");
  const currentTags = watch("tags") || [];

  const handleAIGeneration = async () => {
    if (!aiInput.trim()) return toast({ title: "Digite algo para a IA" });
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aiInput })
      });
      const data = await res.json();
      setValue("title", data.title || "");
      setValue("subtitle", data.subtitle || "");
      setValue("content", data.content || "");
      setValue("metaDescription", data.metaDescription || "");
      const newSlug = (data.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50);
      setValue("slug", newSlug);
      toast({ title: "Conteúdo gerado!" });
    } catch (e) {
      toast({ title: "Erro na geração", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const onSubmit = async (data: any) => {
    setIsSaving(true);
    // Validação de segurança: se não tem slug ou imagem, a gente inventa uma para não travar
    const payload = {
      ...data,
      authorId: 1,
      coverImage: data.coverImage || "https://images.unsplash.com/photo-1501785888041-af3ef285b470",
      slug: data.slug || data.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50),
      publishedAt: data.status === "published" ? new Date().toISOString() : null
    };

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast({ title: "Sucesso!", description: "Matéria salva com sucesso." });
        setLocation("/admin/posts");
      } else {
        const errData = await res.json();
        toast({ title: "Erro no Servidor", description: errData.error || "Erro desconhecido", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro de Conexão", variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 cursor-pointer opacity-50 hover:opacity-100" /></Link>
            <div>
              <h1 className="text-2xl font-semibold">Nova Publicação</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Tags: {currentTags.join(", ")}</p>
            </div>
          </div>
          <Button type="button" variant="outline" className="bg-white/5 border-white/10 gap-2 text-xs">
            <Eye className="w-4 h-4" /> Pré-visualizar
          </Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="border-b border-white/5 pb-2">
              <Label className="text-[10px] uppercase text-white/30">Título *</Label>
              <input {...register("title")} required className="w-full bg-transparent py-2 text-3xl font-serif outline-none" placeholder="Título..." />
            </div>
            <div className="border-b border-white/5 pb-2">
              <Label className="text-[10px] uppercase text-white/30">Subtítulo</Label>
              <input {...register("subtitle")} className="w-full bg-transparent py-2 text-lg italic text-white/50 outline-none" placeholder="Uma frase poética..." />
            </div>
            <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-[#141414] border-white/5 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Status</Label>
                <div className="flex bg-black p-1 rounded-md">
                  <button type="button" onClick={() => setValue("status", "draft")} className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "draft" ? "bg-orange-500" : "text-white/30"}`}>RASCUNHO</button>
                  <button type="button" onClick={() => setValue("status", "published")} className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "published" ? "bg-green-600" : "text-white/30"}`}>PUBLICADO</button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">URL (Slug)</Label>
                <Input {...register("slug")} className="bg-black border-white/5 text-xs" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-white/30">Imagem de Capa (URL)</Label>
                <Input {...register("coverImage")} placeholder="https://..." className="bg-black border-white/5 text-xs" />
              </div>
              <Button type="submit" disabled={isSaving} className="w-full bg-[#c4a484] hover:bg-[#b39373] text-black font-bold py-6">
                {isSaving ? "SALVANDO..." : "CRIAR PUBLICAÇÃO"}
              </Button>
            </Card>

            <Card className="p-6 bg-primary/5 border-white/5">
              <Label className="flex items-center gap-2 text-primary text-[10px] uppercase font-bold mb-4"><Wand2 className="w-3 h-3" /> IA</Label>
              <Textarea value={aiInput} onChange={e => setAiInput(e.target.value)} className="bg-black border-white/5 text-xs" rows={4} />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full text-xs uppercase py-4">Gerar</Button>
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
