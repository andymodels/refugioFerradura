import React, { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { AdminLayout } from "@/components/admin-layout";
import { Input, Button, Label, Card, Textarea } from "@/components/ui-elements";
import { RichTextEditor } from "@/components/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import { Wand2, Loader2, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PostEditor() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiUrl, setAiUrl] = useState("");
  const { register, handleSubmit, setValue, control } = useForm({
    defaultValues: { title: "", subtitle: "", content: "", excerpt: "", metaDescription: "", slug: "", status: "draft" }
  });

  const handleAIGeneration = async () => {
    if (!aiUrl.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aiUrl })
      });
      const data = await res.json();
      setValue("title", data.title || "");
      setValue("subtitle", data.subtitle || "");
      setValue("content", data.content || "");
      setValue("excerpt", data.excerpt || "");
      setValue("metaDescription", data.metaDescription || "");
      setValue("slug", (data.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50));
      toast({ title: "Conteúdo gerado!" });
    } catch (e) {
      toast({ title: "Erro ao gerar", variant: "destructive" });
    } finally { setIsGenerating(false); }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/posts"><ArrowLeft className="w-5 h-5 cursor-pointer" /></Link>
          <h1 className="text-2xl font-bold">Nova Publicação</h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 space-y-4">
            <Label>Título</Label>
            <Input {...register("title")} />
            <Label>Subtítulo</Label>
            <Input {...register("subtitle")} />
            <Label>Conteúdo</Label>
            <Controller name="content" control={control} render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
          </Card>
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <Label>Descrição SEO</Label>
              <Textarea {...register("metaDescription")} rows={3} />
              <Button className="w-full">Salvar Publicação</Button>
            </Card>
            <Card className="p-6 bg-accent/10 border-accent">
              <Label className="flex items-center gap-2"><Wand2 className="w-4 h-4" /> Gerar com IA</Label>
              <Input value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="Link do artigo..." className="my-2" />
              <Button type="button" onClick={handleAIGeneration} disabled={isGenerating} className="w-full">
                {isGenerating ? <Loader2 className="animate-spin" /> : "Gerar Agora"}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
