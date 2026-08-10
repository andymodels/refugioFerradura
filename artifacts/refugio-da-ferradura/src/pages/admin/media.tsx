import React, { useCallback, useState, useEffect } from "react";
import { UploadCloud, Image as ImageIcon, Video, Check, Copy, Loader2, Film, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, Button, Input } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";
import { uploadMedia } from "@/lib/media-upload";

interface MediaItem {
  url: string;
  filename: string;
  publicId?: string;
  type: "image" | "video";
}

export default function AdminMedia() {
  const { toast } = useToast();
  const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");

  const loadMedia = async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/media/list", { credentials: "include" });
      const data = await res.json();
      if (data.images) setAllMedia(data.images);
    } catch {
      // silently ignore
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const [uploading, setUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"compressing" | "uploading">("uploading");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [importingInstagram, setImportingInstagram] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        acceptedFiles.map((file) => uploadMedia(file, setUploadPhase))
      );
      const videoCount = uploaded.filter((u) => u.type === "video").length;
      const imageCount = uploaded.length - videoCount;
      const parts = [];
      if (imageCount > 0) parts.push(`${imageCount} imagem(ns)`);
      if (videoCount > 0) parts.push(`${videoCount} vídeo(s)`);
      toast({ title: `${parts.join(" e ")} enviado(s) com sucesso!` });
      setAllMedia((prev) => [...uploaded, ...prev]);
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [toast]);

  const importInstagram = async () => {
    const url = instagramUrl.trim();
    if (!url) return;
    setImportingInstagram(true);
    try {
      const res = await fetch("/api/media/import-instagram", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar mídia");
      setInstagramUrl("");
      await loadMedia();
      toast({ title: data.type === "video" ? "Vídeo arquivado no Cloudinary" : "Foto arquivada no Cloudinary" });
    } catch (e: any) {
      toast({ title: "Não foi possível importar", description: e.message, variant: "destructive" });
    } finally {
      setImportingInstagram(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".heic", ".heif"],
      "video/*": [".mp4", ".webm", ".mov", ".avi", ".m4v"],
    },
    multiple: true,
  });

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({ title: "URL copiada para a área de transferência" });
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (item: MediaItem) => {
    if (!confirm(`Excluir permanentemente "${item.filename}"?\n\nEsta ação não pode ser desfeita.`)) return;
    setDeletingId(item.publicId ?? null);
    try {
      const res = await fetch(`/api/media`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: item.publicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao excluir");
      setAllMedia((prev) => prev.filter((m) => m.publicId !== item.publicId));
      toast({ title: "Arquivo excluído com sucesso" });
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = allMedia.filter((m) => filter === "all" || m.type === filter);
  const imageCount = allMedia.filter((m) => m.type === "image").length;
  const videoCount = allMedia.filter((m) => m.type === "video").length;

  return (
    <AdminLayout>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Mídia</h1>
          <p className="text-muted-foreground mt-1">
            Imagens e vídeos hospedados no Cloudinary — permanentes e acessíveis em qualquer lugar
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-4">
          <Card className="p-6">
            <h3 className="font-medium text-foreground mb-2">Importar do Instagram</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Cole o link de uma foto ou Reel. O arquivo é copiado para o Cloudinary e não depende mais do Instagram.
            </p>
            <div className="space-y-2">
              <Input
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                placeholder="https://www.instagram.com/p/.../"
                disabled={importingInstagram}
              />
              <Button className="w-full" onClick={importInstagram} disabled={!instagramUrl.trim()} isLoading={importingInstagram}>
                Arquivar foto ou vídeo
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-medium text-foreground mb-4">Enviar arquivo</h3>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center mb-4">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="font-medium mb-1">Clique ou arraste os arquivos</p>
              <p className="text-xs text-muted-foreground mb-1">
                <strong>Imagens:</strong> JPG, PNG, WEBP, GIF, HEIC (comprimidas automaticamente se necessário)
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Vídeos:</strong> MP4, WEBM, MOV (compactados automaticamente antes do envio)
              </p>

              {uploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-primary font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadPhase === "compressing" ? "Compactando..." : "Enviando..."}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Passe o mouse sobre um arquivo para copiar a URL e usar no editor.
            </p>
          </Card>

          {/* Stats */}
          <Card className="p-4">
            <div className="flex justify-around text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">{imageCount}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center mt-0.5">
                  <ImageIcon className="w-3 h-3" /> Imagens
                </p>
              </div>
              <div className="border-l border-border" />
              <div>
                <p className="text-2xl font-bold text-foreground">{videoCount}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center mt-0.5">
                  <Film className="w-3 h-3" /> Vídeos
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card className="p-6 min-h-[400px]">
            {/* Filter tabs */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
                Todos os arquivos ({allMedia.length})
              </h3>
              <div className="flex gap-1 bg-muted rounded-lg p-1 text-xs">
                {(["all", "image", "video"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md transition-colors font-medium ${
                      filter === f ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "Todos" : f === "image" ? "Imagens" : "Vídeos"}
                  </button>
                ))}
              </div>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
                {filter === "video" ? "Nenhum vídeo enviado ainda." : "Nenhuma imagem enviada ainda."}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {filtered.map((item, i) => (
                  <div
                    key={i}
                    className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted"
                  >
                    {item.type === "video" ? (
                      <>
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                          onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                        />
                        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 pointer-events-none">
                          <Video className="w-3 h-3" /> Vídeo
                        </div>
                      </>
                    ) : (
                      <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                    )}

                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                      <p className="text-white text-[10px] text-center truncate w-full px-1">{item.filename}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 bg-white text-black hover:bg-gray-100 w-full max-w-[130px]"
                        onClick={() => copyToClipboard(item.url)}
                      >
                        {copiedUrl === item.url ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedUrl === item.url ? "Copiado!" : "Copiar URL"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="gap-1.5 bg-red-600 hover:bg-red-700 text-white w-full max-w-[130px]"
                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                        disabled={deletingId === item.publicId}
                      >
                        {deletingId === item.publicId
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                        {deletingId === item.publicId ? "Excluindo..." : "Excluir"}
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
