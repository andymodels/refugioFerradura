import React, { useState, useEffect } from "react";
import {
  Settings, Image as ImageIcon, Save, Eye, Layout, AlignLeft,
  Plus, Trash2, ChevronUp, ChevronDown, Monitor, Layers
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, Button } from "@/components/ui-elements";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { SiteSettings, SETTINGS_DEFAULTS, HomeBlock, parseHomeBlocks, getOverlayStyle } from "@/hooks/use-site-settings";

type Tab = "hero" | "header" | "footer" | "blocks";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "hero", label: "Página Inicial", icon: <Monitor className="w-4 h-4" /> },
  { id: "header", label: "Cabeçalho", icon: <Layout className="w-4 h-4" /> },
  { id: "footer", label: "Rodapé", icon: <AlignLeft className="w-4 h-4" /> },
  { id: "blocks", label: "Blocos", icon: <Layers className="w-4 h-4" /> },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-9 rounded border border-border cursor-pointer bg-transparent p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function SliderInput({ value, onChange, min, max, step, label, unit = "" }: {
  value: string; onChange: (v: string) => void; min: number; max: number; step: number; label?: string; unit?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{min}{unit}</span>
        <span className="text-primary font-semibold">{value}{unit}</span>
        <span>{max}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}

function ToggleGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2 text-xs font-medium transition-all ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function newBlock(): HomeBlock {
  return {
    id: Date.now().toString(),
    title: "Novo Bloco",
    subtitle: "",
    description: "",
    image: "",
    bgColor: "#111814",
  };
}

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [settings, setSettings] = useState<SiteSettings>(SETTINGS_DEFAULTS);
  const [blocks, setBlocks] = useState<HomeBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = { ...SETTINGS_DEFAULTS, ...data.settings };
        setSettings(s);
        setBlocks(parseHomeBlocks(s.home_blocks));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof SiteSettings) => (value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...settings, home_blocks: JSON.stringify(blocks) };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: payload }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
      toast({ title: "Configurações salvas com sucesso!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const arr = [...blocks];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setBlocks(arr);
  };

  const updateBlock = (idx: number, field: keyof HomeBlock, value: string) => {
    setBlocks((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: value } : b));
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando...</div>
      </AdminLayout>
    );
  }

  const heroOpacity = parseFloat(settings.hero_overlay_opacity) || 0.4;

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Aparência do Site</h1>
          <p className="text-muted-foreground mt-1 text-sm">Controle visual completo do site</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 shrink-0">
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/40 p-1 rounded-xl border border-border w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─────────────────── HERO TAB ─────────────────── */}
      {activeTab === "hero" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                <h2 className="font-serif text-base font-semibold">Imagem de Fundo</h2>
              </div>
              <Field label="URL da Imagem" hint="Recomendado: mínimo 1920px de largura">
                <TextInput value={settings.hero_image_url} onChange={set("hero_image_url")} placeholder="https://..." />
              </Field>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Altura do Hero</h2>
              <Field label="Altura (% da tela)">
                <SliderInput value={settings.hero_height_vh} onChange={set("hero_height_vh")} min={50} max={100} step={5} unit="vh" />
              </Field>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Sobreposição (Overlay)</h2>
              <Field label="Estilo">
                <ToggleGroup
                  value={settings.hero_style}
                  onChange={set("hero_style")}
                  options={[
                    { value: "gradient", label: "Gradiente" },
                    { value: "solid", label: "Sólido" },
                    { value: "light", label: "Suave" },
                  ]}
                />
              </Field>
              <Field label="Intensidade do Escurecimento">
                <SliderInput
                  value={settings.hero_overlay_opacity}
                  onChange={set("hero_overlay_opacity")}
                  min={0} max={0.9} step={0.05}
                  unit=""
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{Math.round(heroOpacity * 100)}%</p>
              </Field>
            </Card>
          </div>

          {/* Hero Preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-base font-semibold">Pré-visualização</h2>
            </div>
            <div
              className="relative rounded-xl overflow-hidden shadow-2xl border border-border"
              style={{ height: "280px" }}
            >
              <img
                src={settings.hero_image_url}
                alt="Hero preview"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=60";
                }}
              />
              <div className="absolute inset-0" style={getOverlayStyle(settings.hero_style, heroOpacity)} />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <span className="text-white/80 uppercase tracking-widest text-xs font-medium mb-2 drop-shadow-md">
                  Rota da Ferradura · Guarapari – ES
                </span>
                <h3 className="text-white font-serif text-xl drop-shadow-lg leading-tight mb-2">
                  Explore a Rota da Ferradura
                </h3>
                <p className="text-white/70 text-xs max-w-xs drop-shadow">
                  Descubra os melhores lugares, experiências e hospedagens.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Pré-visualização aproximada do hero com as configurações atuais.
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────── HEADER TAB ─────────────────── */}
      {activeTab === "header" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Estilo do Cabeçalho</h2>
              <Field label="Tipo de Fundo">
                <ToggleGroup
                  value={settings.header_style}
                  onChange={set("header_style")}
                  options={[
                    { value: "transparent", label: "Transparente" },
                    { value: "solid", label: "Cor Sólida" },
                  ]}
                />
              </Field>
              {settings.header_style === "solid" && (
                <Field label="Cor de Fundo">
                  <ColorInput value={settings.header_bg_color} onChange={set("header_bg_color")} />
                </Field>
              )}
              <Field label="Sempre visível (sticky)">
                <ToggleGroup
                  value={settings.header_sticky}
                  onChange={set("header_sticky")}
                  options={[
                    { value: "true", label: "Sim (fixo)" },
                    { value: "false", label: "Não (rola)" },
                  ]}
                />
              </Field>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Dimensões</h2>
              <Field label="Altura do cabeçalho">
                <SliderInput value={settings.header_height_px} onChange={set("header_height_px")} min={60} max={160} step={4} unit="px" />
              </Field>
              <Field label="Tamanho do logo">
                <SliderInput value={settings.logo_size_px} onChange={set("logo_size_px")} min={32} max={120} step={4} unit="px" />
              </Field>
            </Card>
          </div>

          {/* Header Preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-base font-semibold">Pré-visualização</h2>
            </div>
            <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-muted/20">
              <div
                className="flex items-center justify-between px-6"
                style={{
                  height: `${settings.header_height_px}px`,
                  background: settings.header_style === "solid"
                    ? settings.header_bg_color
                    : "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-full bg-white/20 flex items-center justify-center text-white/60 text-xs font-bold shrink-0"
                    style={{ width: `${settings.logo_size_px}px`, height: `${settings.logo_size_px}px` }}
                  >
                    LOGO
                  </div>
                </div>
                <nav className="flex items-center gap-5">
                  {["Início", "Lugares", "Buscar"].map((n) => (
                    <span key={n} className="text-xs font-semibold text-white/80">{n}</span>
                  ))}
                </nav>
              </div>
              <div className="h-24 bg-gradient-to-b from-muted/40 to-transparent" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Pré-visualização do cabeçalho. O logo real será exibido no site.
            </p>
          </div>
        </div>
      )}

      {/* ─────────────────── FOOTER TAB ─────────────────── */}
      {activeTab === "footer" && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Textos do Rodapé</h2>
              <Field label="Tagline / Descrição">
                <textarea
                  value={settings.footer_tagline}
                  onChange={(e) => set("footer_tagline")(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </Field>
              <Field label="Endereço">
                <textarea
                  value={settings.footer_address}
                  onChange={(e) => set("footer_address")(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </Field>
              <Field label="Texto de Copyright" hint="Deixe vazio para usar o padrão automático">
                <TextInput value={settings.footer_copyright} onChange={set("footer_copyright")} placeholder="© 2026 Refúgio da Ferradura..." />
              </Field>
            </Card>

            <Card className="p-5 space-y-4">
              <h2 className="font-serif text-base font-semibold">Redes Sociais</h2>
              <Field label="Instagram (URL completa)">
                <TextInput value={settings.footer_instagram} onChange={set("footer_instagram")} placeholder="https://instagram.com/..." />
              </Field>
              <Field label="Facebook (URL completa)">
                <TextInput value={settings.footer_facebook} onChange={set("footer_facebook")} placeholder="https://facebook.com/..." />
              </Field>
            </Card>
          </div>

          {/* Footer Preview */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-base font-semibold">Pré-visualização</h2>
            </div>
            <div className="rounded-xl overflow-hidden border border-border shadow-lg bg-foreground text-muted p-6">
              <div className="space-y-2 mb-4">
                <p className="font-serif font-semibold text-white text-sm">Refúgio da Ferradura</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{settings.footer_tagline}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 mb-4">
                {settings.footer_address.split("\n").map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <div className="pt-4 border-t border-white/10 text-xs text-muted-foreground">
                {settings.footer_copyright || `© ${new Date().getFullYear()} Refúgio da Ferradura. Todos os direitos reservados.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────── BLOCKS TAB ─────────────────── */}
      {activeTab === "blocks" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">Blocos da Página Inicial</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Adicione seções personalizadas que aparecem abaixo do hero na home
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlocks((prev) => [...prev, newBlock()])}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Adicionar Bloco
            </Button>
          </div>

          {blocks.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Layers className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum bloco ainda</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Adicione blocos para criar seções personalizadas na página inicial.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setBlocks([newBlock()])}
              >
                <Plus className="w-4 h-4" /> Criar primeiro bloco
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {blocks.map((block, idx) => (
                <Card key={block.id} className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded border border-border shrink-0"
                        style={{ backgroundColor: block.bgColor }}
                      />
                      <span className="font-medium text-sm text-foreground">Bloco {idx + 1}</span>
                      {block.title && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">— {block.title}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBlock(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(idx, 1)}
                        disabled={idx === blocks.length - 1}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setBlocks((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Título">
                      <TextInput value={block.title} onChange={(v) => updateBlock(idx, "title", v)} placeholder="Título da seção" />
                    </Field>
                    <Field label="Subtítulo">
                      <TextInput value={block.subtitle} onChange={(v) => updateBlock(idx, "subtitle", v)} placeholder="Subtítulo opcional" />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Descrição">
                        <textarea
                          value={block.description}
                          onChange={(e) => updateBlock(idx, "description", e.target.value)}
                          rows={2}
                          placeholder="Texto descritivo da seção..."
                          className="w-full px-3 py-2 rounded-md border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                        />
                      </Field>
                    </div>
                    <Field label="URL da Imagem">
                      <TextInput value={block.image} onChange={(v) => updateBlock(idx, "image", v)} placeholder="https://..." />
                    </Field>
                    <Field label="Cor de Fundo">
                      <ColorInput value={block.bgColor} onChange={(v) => updateBlock(idx, "bgColor", v)} />
                    </Field>
                  </div>

                  {/* Block preview */}
                  {(block.title || block.image) && (
                    <div
                      className="mt-4 rounded-lg overflow-hidden relative flex items-center gap-6 p-5"
                      style={{ backgroundColor: block.bgColor, minHeight: "80px" }}
                    >
                      {block.image && (
                        <img src={block.image} alt="" className="w-20 h-16 object-cover rounded-md shrink-0" />
                      )}
                      <div>
                        {block.title && <p className="font-serif font-semibold text-white text-sm">{block.title}</p>}
                        {block.subtitle && <p className="text-white/70 text-xs mt-0.5">{block.subtitle}</p>}
                        {block.description && (
                          <p className="text-white/60 text-xs mt-1 line-clamp-2">{block.description}</p>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
