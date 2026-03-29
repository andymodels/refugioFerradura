import React, { useState, useEffect } from "react";
import { Settings, Image as ImageIcon, Save, Eye } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, Button } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";

const HERO_STYLES = [
  {
    id: "gradient",
    label: "Gradiente Escuro",
    description: "Gradiente de cima para baixo com escurecimento progressivo",
    overlay: "bg-black/40 bg-gradient-to-t from-black/80 via-black/30 to-black/50",
  },
  {
    id: "dark",
    label: "Escuro Uniforme",
    description: "Sobreposição escura uniforme sobre a imagem",
    overlay: "bg-black/60",
  },
  {
    id: "light",
    label: "Escuro Suave",
    description: "Sobreposição mais leve, destaca mais a imagem de fundo",
    overlay: "bg-black/25",
  },
];

interface SiteSettings {
  hero_image_url: string;
  hero_overlay_opacity: string;
  hero_style: string;
}

const DEFAULT: SiteSettings = {
  hero_image_url: "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1920&q=85&auto=format&fit=crop",
  hero_overlay_opacity: "0.4",
  hero_style: "gradient",
};

function getOverlayStyle(style: string, opacity: number): React.CSSProperties {
  if (style === "gradient") {
    return { background: `linear-gradient(to top, rgba(0,0,0,${Math.min(opacity + 0.3, 1)}) 0%, rgba(0,0,0,${opacity * 0.5}) 50%, rgba(0,0,0,${opacity}) 100%)` };
  }
  return { background: `rgba(0,0,0,${opacity})` };
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT);
  const [preview, setPreview] = useState<SiteSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = { ...DEFAULT, ...data.settings };
        setSettings(s);
        setPreview(s);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key: keyof SiteSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setPreview((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Configurações salvas com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
      </AdminLayout>
    );
  }

  const opacity = parseFloat(preview.hero_overlay_opacity) || 0.4;

  return (
    <AdminLayout>
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Configurações Visuais</h1>
          <p className="text-muted-foreground mt-1">Controle limitado do visual da página inicial</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Controls */}
        <div className="space-y-6">
          {/* Hero Image */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <h2 className="font-serif text-lg font-medium text-foreground">Imagem de Fundo do Hero</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Cole a URL de qualquer imagem. Use o módulo de Mídia para fazer upload de suas próprias imagens.
            </p>
            <input
              type="url"
              value={settings.hero_image_url}
              onChange={(e) => updateField("hero_image_url", e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="text-xs text-muted-foreground">
              Recomendado: imagem em alta resolução (mínimo 1920px de largura)
            </p>
          </Card>

          {/* Overlay Style */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="font-serif text-lg font-medium text-foreground">Estilo de Sobreposição</h2>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {HERO_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => updateField("hero_style", style.id)}
                  className={`text-left p-4 rounded-lg border-2 transition-all ${
                    settings.hero_style === style.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="font-medium text-sm text-foreground">{style.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Overlay Intensity */}
          <Card className="p-6 space-y-4">
            <h2 className="font-serif text-lg font-medium text-foreground">Intensidade do Escurecimento</h2>
            <p className="text-sm text-muted-foreground">
              Controla o quanto a imagem é escurecida para melhorar a legibilidade do texto.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Mais clara</span>
                <span className="text-primary font-medium">{Math.round(opacity * 100)}%</span>
                <span>Mais escura</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={settings.hero_overlay_opacity}
                onChange={(e) => updateField("hero_overlay_opacity", e.target.value)}
                className="w-full accent-primary"
              />
            </div>
          </Card>
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h2 className="font-serif text-lg font-medium text-foreground">Pré-visualização</h2>
          </div>
          <div className="relative rounded-xl overflow-hidden aspect-video shadow-2xl border border-border">
            <img
              src={preview.hero_image_url}
              alt="Hero preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=60&auto=format&fit=crop";
              }}
            />
            <div className="absolute inset-0" style={getOverlayStyle(preview.hero_style, opacity)} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <span className="text-white/80 uppercase tracking-widest text-xs font-medium mb-3 drop-shadow-md">
                Rota da Ferradura · Guarapari – ES
              </span>
              <h3 className="text-white font-serif text-2xl md:text-3xl drop-shadow-lg leading-tight mb-3">
                Explore a Rota da Ferradura
              </h3>
              <p className="text-white/80 text-xs max-w-xs drop-shadow">
                Descubra os melhores lugares, experiências e hospedagens.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Esta é uma prévia aproximada. O resultado final pode variar ligeiramente.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
