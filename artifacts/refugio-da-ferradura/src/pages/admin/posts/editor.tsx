import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Wand2, ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function PostEditor() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInput, setAiInput] = useState("");
  
  const { register, handleSubmit, setValue, control } = useForm({
    defaultValues: { 
      title: "", subtitle: "", content: "", excerpt: "", 
      metaDescription: "", slug: "", status: "draft", 
      tags: [] as string[], coverImage: "https://images.unsplash.com/photo-1501785888041-af3ef285b470" 
    }
  });

  const handleAIGeneration = async () => {
    if (!aiInput.trim()) return toast({ title: "Digite um link ou contexto" });
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
      
      toast({ title: "Conteúdo gerado com sucesso!" });
    } catch (e) {
      toast({ title: "Erro ao gerar", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  const onSubmit = async (data: any) => {
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          authorId: 1 
        })
      });
      if (res.ok) {
        toast({ title: "Publicação criada!" });
        setLocation("/admin/posts");
      } else {
        const errorData = await res.json();
        toast({ title: "Erro ao salvar", description: errorData.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro na conexão", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 cursor-pointer" /></Link>
          <h1 className="text-2xl font-bold">Nova Publicação</h1>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 space-y-4">
            <Label>Título *</Label>
            <Input {...register("title")} required />
            <Label>Subtítulo</Label>
            <Input {...register("subtitle")} />
            <Label>Conteúdo *</Label>
            <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
            <Label>Resumo</Label>
            <Textarea {...register("excerpt")} rows={2} />
          </Card>
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <Label>Status</Label>
              <select {...register("status")} className="w-full border rounded p-2 bg-background">
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
              <Label>Tags (lugares, experiencias, gastronomia)</Label>
              <Controller
                name="tags"
                control={control}
                render={({ field }) => (
                  <Input 
                    value={Array.isArray(field.value) ? field.value.join(", ") : ""} 
                    onChange={(e) => field.onChange(e.target.value.split(",").map(t => t.trim()))}
                    placeholder="Ex: lugares, gastronomia"
                  />
                )}
              />
              <Label>Slug (URL)</Label>
              <Input {...register("slug")} required />
              <Button type="submit" className="w-full">Criar Publicação</Button>
            </Card>
            <Card className="p-6 bg-primary/5 border-primary/20">
              <Label className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Gerar com IA</Label>
              <Textarea value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="Cole um link ou contexto..." className="my-2" rows={4} />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full" variant="secondary">
                {isGenerating ? "Gerando..." : "Gerar Matéria"}
              </Button>
            </Card>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
