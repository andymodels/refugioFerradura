import React, { useCallback, useState } from "react";
import { UploadCloud, Image as ImageIcon, Check, Copy } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, Button } from "@/components/ui-elements";
import { useUploadMedia } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";

export default function AdminMedia() {
  const { toast } = useToast();
  const uploadMutation = useUploadMedia();
  const [recentUploads, setRecentUploads] = useState<{url: string, filename: string}[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    try {
      const res = await uploadMutation.mutateAsync({ data: { file } });
      setRecentUploads(prev => [res, ...prev]);
      toast({ title: "Upload realizado com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    }
  }, [uploadMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const copyToClipboard = (url: string) => {
    // In production, the URL returned might just be a relative path, we want absolute for the editor
    const fullUrl = url.startsWith('http') ? url : window.location.origin + url;
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({ title: "URL copiada para a área de transferência" });
  };

  return (
    <AdminLayout>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Mídia</h1>
          <p className="text-muted-foreground mt-1">Faça upload de imagens para usar nos posts e lugares</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <Card className="p-6">
            <h3 className="font-medium text-foreground mb-4">Enviar nova imagem</h3>
            
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="font-medium mb-1">Clique ou arraste uma imagem</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, WEBP (Max 5MB)</p>
              
              {uploadMutation.isPending && (
                <div className="mt-4 text-sm text-primary font-medium animate-pulse">Enviando...</div>
              )}
            </div>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="p-6 min-h-[400px]">
            <h3 className="font-medium text-foreground mb-6 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-muted-foreground" /> Últimos Uploads
            </h3>
            
            {recentUploads.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
                As imagens que você enviar aparecerão aqui.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {recentUploads.map((item, i) => (
                  <div key={i} className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted">
                    <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="gap-2 bg-white text-black hover:bg-gray-100"
                        onClick={() => copyToClipboard(item.url)}
                      >
                        {copiedUrl === item.url ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedUrl === item.url ? "Copiado" : "Copiar URL"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
