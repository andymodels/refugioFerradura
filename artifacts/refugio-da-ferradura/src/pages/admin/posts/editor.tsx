import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Wand2, ArrowLeft, MapPin, Star, Utensils, Home, TreePine, Camera, Tent, Palette } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"url" | "text">("url");
  
  const { register, handleSubmit, setValue, control, watch } = useForm({
    defaultValues: { 
      title: "", subtitle: "", content: "", excerpt: "", 
      metaDescription: "", slug: "", status: "draft", 
      tags: [] as string[], coverImage: "https://images.unsplash.com/photo-1501785888041-af3ef285b470" 
    }
  });

  const selectedTags = watch("tags") || [];

  const toggleTag = (tagId: string) => {
    const current = [...selectedTags];
    const index = current.indexOf(tagId);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(tagId);
    }
    setValue("tags", current);
  };

  const handleAIGeneration = async () => {
    if (!aiInput.trim()) return toast({ title: "Preencha o campo de IA" });
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
      setValue("excerpt", data.excerpt || "");
      setValue("metaDescription", data.metaDescription || "");
      if (data.tags) setValue("tags", data.tags);
      
      const generatedSlug = (data.title || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 50);
      setValue("slug", generatedSlug);
      
      toast({ title: "Conteúdo gerado!" });
    } catch (e) {
      toast({ title: "Erro ao gerar", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const onSubmit = async (data: any) => {
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, authorId: 1 })
      });
      if (res.ok) {
        toast({ title: "Publicação criada!" });
        setLocation("/admin/posts");
      }
    } catch (e) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 cursor-pointer" /></Link>
          <h1 className="text-2xl font-bold font-serif text-primary">Nova Publicação</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 space-y-4 bg-[#1a1a1a] border-white/5">
            <Label className="text-white/60 uppercase text-xs tracking-widest">Título *</Label>
            <Input {...register("title")} className="bg-black/20 border-white/10" required />
            <Label className="text-white/60 uppercase text-xs tracking-widest">Conteúdo *</Label>
            <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
            <Label className="text-white/60 uppercase text-xs tracking-widest">Resumo</Label>
            <Textarea {...register("excerpt")} rows={2} className="bg-black/20 border-white/10" />
          </Card>
          <div className="space-y-6">
            <Card className="p-6 space-y-4 bg-[#1a1a1a] border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-tighter text-white/40">Tags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_TAGS.map((tag) => {
                  const Icon = tag.icon;
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-all ${
                        isSelected ? "bg-primary/20 text-primary border-primary/50" : "bg-white/5 text-white/60 border-transparent hover:bg-white/10"
                      } border`}
                    >
                      <Icon className="w-3 h-3" />
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              <Button type="submit" className="w-full mt-4 bg-[#c4a484] hover:bg-[#b39373] text-black font-bold">Criar Publicação</Button>
            </Card>

            <Card className="p-6 bg-primary/5 border-primary/20">
              <Label className="flex items-center gap-2 text-primary mb-4 font-serif italic"><Wand2 className="w-4 h-4" /> Geração por IA</Label>
              <div className="flex gap-2 mb-4 bg-black/40 p-1 rounded-lg">
                <button type="button" onClick={() => setActiveTab("url")} className={`flex-1 py-1 text-[10px] rounded ${activeTab === "url" ? "bg-primary/20 text-primary" : "text-white/40"}`}>Via URL</button>
                <button type="button" onClick={() => setActiveTab("text")} className={`flex-1 py-1 text-[10px] rounded ${activeTab === "text" ? "bg-primary/20 text-primary" : "text-white/40"}`}>Colar Texto</button>
              </div>
              <Textarea 
                value={aiInput} 
                onChange={e => setAiInput(e.target.value)} 
                placeholder={activeTab === "url" ? "Cole a URL aqui..." : "Descreva o contexto..."} 
                className="mb-4 bg-black/40 border-white/5" 
                rows={4} 
              />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full" variant="secondary">
                {isGenerating ? "Gerando..." : "Gerar com IA"}
              </Button>
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
