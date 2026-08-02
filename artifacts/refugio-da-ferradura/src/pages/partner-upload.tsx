import React from "react";
import { useParams } from "wouter";
import { Upload, CheckCircle2 } from "lucide-react";
import { useGetPartnerUploadInfo, useSubmitPartnerUpload } from "@workspace/api-client-react";

const logoImg = `${import.meta.env.BASE_URL}images/logo-refugio.png`;

// Página pública, sem login — o parceiro chega aqui pelo link exclusivo que
// o admin manda (WhatsApp, por exemplo) e sobe o Story direto na própria
// fila. Nenhuma automação nesta tela: é sempre uma ação do próprio parceiro.
export default function PartnerUpload() {
  const params = useParams();
  const token = (params as any)?.token as string | undefined;
  const { data: info, isLoading, error } = useGetPartnerUploadInfo(token || "");
  const submitMutation = useSubmitPartnerUpload();

  const [file, setFile] = React.useState<File | null>(null);
  const [sent, setSent] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !file) return;
    try {
      await submitMutation.mutateAsync({ token, data: { file } });
      setSent(true);
      setFile(null);
    } catch {
      // erro já exposto via submitMutation.error abaixo
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src={logoImg} alt="Refúgio da Ferradura" className="h-16 w-auto" />
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm">Carregando...</p>
          ) : error || !info ? (
            <p className="text-center text-muted-foreground text-sm">
              Esse link não está ativo. Confirme com quem te enviou.
            </p>
          ) : !info.autorizacaoStories ? (
            <p className="text-center text-muted-foreground text-sm">
              Esse link não está mais habilitado pra envio de Stories. Confirme com quem te enviou.
            </p>
          ) : sent ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
              <p className="font-medium text-foreground">Recebido!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Seu conteúdo entrou na fila. Pode fechar essa página.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-sm text-primary hover:underline"
              >
                Enviar outro
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-serif font-semibold text-foreground text-center mb-1">
                {info.nomeEstabelecimento}
              </h1>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Envie uma foto ou vídeo pra ir pros Stories do @refugioferradura
              </p>

              <form onSubmit={handleSubmit}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors mb-4"
                >
                  {file ? (
                    <p className="text-sm text-foreground font-medium">{file.name}</p>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Toque pra escolher foto ou vídeo</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />

                {submitMutation.error && (
                  <p className="text-sm text-destructive mb-4 text-center">
                    {(submitMutation.error as any)?.message || "Erro ao enviar. Tente de novo."}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!file || submitMutation.isPending}
                  className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40"
                >
                  {submitMutation.isPending ? "Enviando..." : "Enviar"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
