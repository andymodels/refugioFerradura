import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Wand2, ArrowLeft, Eye, MapPin, Star, Utensils, Home, TreePine, Camera, Palette, Tent } from "lucide-react";
import { Link, useLocation } from "wouter";

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

export default function PostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInput, setAiInput] = useState("");
  
  const { register, handleSubmit, setValue, control, watch } = useForm({
    defaultValues: { 
      title: "", subtitle: "", content: "", excerpt: "", 
      metaDescription: "", slug: "", status: "draft", 
      tags: [] as string[], coverImage: "https://images.unsplash.com/photo-1501785888041-af3ef285b470" 
    }
  });

  const currentStatus = watch("status");
  const selectedTags = watch("tags") || [];

  const toggleTag = (id: string) => {
    const next = selectedTags.includes(id) ? selectedTags.filter(t => t !== id) : [...selectedTags, id];
    setValue("tags", next);
  };

  const handleAIGeneration = async () => {
    if (!aiInput.trim()) return toast({ title: "Digite algo para a IA" });
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-from-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aiInput })
      });
      const data = await res.json();
      setValue("title", data.title || "");
      setValue("subtitle", data.subtitle || "");
      setValue("content", data.content || "");
      setValue("slug", (data.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50));
      toast({ title: "Conteúdo gerado!" });
    } catch (e) { toast({ title: "Erro na geração" }); }
    finally { setIsGenerating(false); }
  };

  const onSubmit = async (data: any) => {
    const payload = { ...data, authorId: 1, slug: data.slug || "post-" + Date.now() };
    try {
      const res = await fetch("/api/posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) { toast({ title: "Criado!" }); setLocation("/admin/posts"); }
      else { toast({ title: "Erro ao salvar", variant: "destructive" }); }
    } catch (e) { toast({ title: "Erro de rede" }); }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 bg-[#0a0a0a] min-h-screen text-white">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 opacity-50 cursor-pointer" /></Link>
            <div>
              <h1 className="text-2xl font-serif">Nova Publicação</h1>
              <p className="text-[10px] opacity-40 uppercase tracking-widest">Tags: {selectedTags.join(", ")}</p>
            </div>
          </div>
          <Button variant="outline" className="bg-white/5 border-white/10 gap-2 text-xs"><Eye className="w-4 h-4" /> Pré-visualizar</Button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
          <div className="lg:col-span-2 space-y-8">
            <div className="border-b border-white/5 pb-2">
              <Label className="text-[10px] uppercase text-white/30">Título *</Label>
              <input {...register("title")} required className="w-full bg-transparent py-2 text-3xl font-serif outline-none" />
            </div>
            <div className="border-b border-white/5 pb-2">
              <Label className="text-[10px] uppercase text-white/30">Subtítulo</Label>
              <input {...register("subtitle")} className="w-full bg-transparent py-2 text-lg italic text-white/50 outline-none" placeholder="Uma frase complementar e poética..." />
            </div>
            <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
          </div>

          <div className="space-y-6 text-left">
            <Card className="p-6 bg-[#1a1a1a] border-white/5 space-y-6">
              <div className="space-y-3">
                <Label className="text-[10px] uppercase text-white/30">Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_TAGS.map(t => (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] border transition-all ${selectedTags.includes(t.id) ? "bg-orange-500/20 border-orange-500 text-orange-500" : "bg-white/5 border-transparent text-white/40"}`}><t.icon className="w-3 h-3" />{t.label}</button>
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
                <div className="flex items-center gap-1 bg-black p-2 rounded text-[10px] border border-white/5"><span className="opacity-20">/blog/</span><input {...register("slug")} className="bg-transparent outline-none w-full" /></div>
              </div>

              <Button type="submit" className="w-full bg-[#c4a484] hover:bg-[#b39373] text-black font-bold py-6">Criar Publicação</Button>
            </Card>

            <Card className="p-6 bg-primary/5 border-white/5 space-y-4">
              <Label className="flex items-center gap-2 text-primary text-[10px] font-bold uppercase"><Wand2 className="w-3 h-3" /> IA</Label>
              <Textarea value={aiInput} onChange={e => setAiInput(e.target.value)} className="bg-black text-xs" rows={4} placeholder="Link ou texto..." />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full text-[10px] uppercase">{isGenerating ? "Gerando..." : "Gerar com IA"}</Button>
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
