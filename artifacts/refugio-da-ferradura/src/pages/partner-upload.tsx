import React from "react";
import { useParams } from "wouter";
import { Upload, CheckCircle2, Instagram, ShieldCheck } from "lucide-react";
import { useGetPartnerUploadInfo, useSubmitPartnerUpload } from "@workspace/api-client-react";

const logoImg = `${import.meta.env.BASE_URL}images/logo-refugio.png`;

// Página pública, sem login — convite de conexão + envio de Stories, tudo
// num link só que o parceiro usa quando quiser. Nenhuma automação daqui:
// cada ação nesta página (conectar, enviar) é sempre iniciativa dele.
export default function PartnerUpload() {
  const params = useParams();
  const token = (params as any)?.token as string | undefined;
  const { data: info, isLoading, error, refetch } = useGetPartnerUploadInfo(token || "");
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

  // Ao voltar da autorização do Instagram, reconfirma o estado (o link
  // continua o mesmo, só o status de conexão muda).
  React.useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src={logoImg} alt="Refúgio da Ferradura" className="h-16 w-auto" />
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm">Carregando...</p>
          ) : error || !info ? (
            <p className="text-center text-muted-foreground text-sm">
              Esse link não está ativo. Confirme com quem te enviou.
            </p>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-serif font-semibold text-foreground text-center mb-1">
                  {info.nomeEstabelecimento}
                </h1>
                <p className="text-sm text-muted-foreground text-center">
                  Parceria com o Refúgio da Ferradura no Instagram
                </p>
              </div>

              {(info.autorizacaoFotos || info.autorizacaoVideosReels) && (
                <div className="border-t border-border pt-5">
                  <div className="flex items-start gap-2 mb-3">
                    <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Você já autorizou o Refúgio da Ferradura a divulgar fotos e/ou vídeos do seu Instagram, sempre
                      marcando o seu perfil. Falta só esse passo técnico: conectar sua conta pra a gente conseguir ver
                      as publicações novas automaticamente.
                    </p>
                  </div>

                  {info.conectado ? (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-700 bg-green-50 rounded-md py-2.5">
                      <CheckCircle2 className="w-4 h-4" /> Instagram conectado
                    </div>
                  ) : info.connectUrl ? (
                    <a
                      href={info.connectUrl}
                      className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2"
                    >
                      <Instagram className="w-4 h-4" /> Conectar meu Instagram
                    </a>
                  ) : null}
                </div>
              )}

              {info.autorizacaoStories && (
                <div className="border-t border-border pt-5">
                  <p className="text-xs text-muted-foreground mb-3">
                    Pra Stories, envie o arquivo aqui sempre que quiser — a API do Instagram não deixa a gente buscar
                    Stories sozinho, então esse envio é sempre por sua conta.
                  </p>

                  {sent ? (
                    <div className="text-center py-4">
                      <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">Recebido!</p>
                      <button onClick={() => setSent(false)} className="mt-2 text-sm text-primary hover:underline">
                        Enviar outro
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors mb-3"
                      >
                        {file ? (
                          <p className="text-sm text-foreground font-medium">{file.name}</p>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
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
                        <p className="text-sm text-destructive mb-3 text-center">
                          {(submitMutation.error as any)?.message || "Erro ao enviar. Tente de novo."}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={!file || submitMutation.isPending}
                        className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40"
                      >
                        {submitMutation.isPending ? "Enviando..." : "Enviar Story"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
