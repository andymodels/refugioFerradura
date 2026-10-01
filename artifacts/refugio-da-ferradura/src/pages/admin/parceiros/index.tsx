import React from "react";
import { Link } from "wouter";
import { Store, Download, Pencil, X, Check, Plus, Pause, Play, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { Button, Card, Input, Label, Textarea } from "@/components/ui-elements";
import {
  useListInstagramPartners,
  useScanInstagramPartners,
  useUpdateInstagramPartner,
  useCreateInstagramPartner,
  useListPostsAdmin,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS: Record<string, string> = {
  gastronomia: "Gastronomia",
  hospedagem: "Hospedagem",
  atracao: "Atração",
  experiencia: "Experiência",
  servico: "Serviço",
  producao_rural: "Produção rural",
  outra: "Outra",
};

// Vocabulário sugerido — o campo aceita qualquer tag nova digitada.
const TAGS_SUGERIDAS = [
  "café", "almoço", "jantar", "natureza", "experiência", "vista", "família/crianças",
  "pet friendly", "estacionamento", "cachoeira", "produção rural", "romântico", "ao ar livre",
];

const STATUS_LABEL: Record<string, string> = {
  encontrado: "Encontrado",
  conferido: "Conferido",
  seguido_manualmente: "Seguido manualmente",
  autorizado_repost: "Autorizado a repostar",
};

interface EditForm {
  nomeEstabelecimento: string;
  categoria: string;
  regiao: string;
  descricaoCurta: string;
  tags: string[];
  endereco: string;
  googleMapsUrl: string;
  site: string;
  instagramHandle: string;
  telefone: string;
  materiaPrincipalPostId: string; // "" = nenhuma
  fotoReferencia: string; // uma URL por linha
  dadosVerificadosEm: string; // yyyy-mm-dd
  status: string;
  autorizacaoData: string; // yyyy-mm-dd, input[type=date] format
  autorizacaoCanal: string;
  autorizacaoObservacao: string;
  autorizacaoFotos: boolean;
  autorizacaoVideosReels: boolean;
  autorizacaoStories: boolean;
  marcacaoObrigatoria: boolean;
}

function toDateInputValue(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function AdminPartners() {
  const { data, isLoading } = useListInstagramPartners();
  const { data: postsData } = useListPostsAdmin();
  const scanMutation = useScanInstagramPartners();
  const updateMutation = useUpdateInstagramPartner();
  const createMutation = useCreateInstagramPartner();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<EditForm | null>(null);
  const [showAuth, setShowAuth] = React.useState(false);
  const [newTag, setNewTag] = React.useState("");

  const [newNome, setNewNome] = React.useState("");
  const [newCategoria, setNewCategoria] = React.useState("");
  const [newRegiao, setNewRegiao] = React.useState("");
  const [newInstagram, setNewInstagram] = React.useState("");
  const [newTelefone, setNewTelefone] = React.useState("");

  const [search, setSearch] = React.useState("");
  const [filtroCategoria, setFiltroCategoria] = React.useState("");
  const [filtroTag, setFiltroTag] = React.useState("");

  const partners = data?.partners || [];
  const posts = postsData?.posts || [];

  const allTags = React.useMemo(() => {
    const set = new Set<string>(TAGS_SUGERIDAS);
    partners.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [partners]);

  const filtered = partners.filter((p) => {
    if (filtroCategoria && p.categoria !== filtroCategoria) return false;
    if (filtroTag && !(p.tags || []).includes(filtroTag)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${p.nomeEstabelecimento} ${p.regiao || ""} ${p.instagramHandle || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/partners/admin"] });

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNome.trim()) return;
    try {
      await createMutation.mutateAsync({
        data: {
          nomeEstabelecimento: newNome.trim(),
          categoria: (newCategoria || undefined) as any,
          regiao: newRegiao.trim() || undefined,
          instagramHandle: newInstagram.trim().replace(/^@/, "") || undefined,
          telefone: newTelefone.trim() || undefined,
        },
      });
      setNewNome("");
      setNewCategoria("");
      setNewRegiao("");
      setNewInstagram("");
      setNewTelefone("");
      invalidate();
      toast({ title: "Estabelecimento cadastrado" });
    } catch (e: any) {
      toast({ title: "Erro ao cadastrar", description: e?.message, variant: "destructive" });
    }
  };

  const handleTogglePause = async (id: number, pausado: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { pausado: !pausado } });
      invalidate();
      toast({ title: !pausado ? "Estabelecimento pausado" : "Estabelecimento reativado" });
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e?.message, variant: "destructive" });
    }
  };

  const handleScan = async () => {
    try {
      const result = await scanMutation.mutateAsync();
      invalidate();
      toast({
        title: "Importação concluída",
        description: `${result.postsChecked} matérias verificadas, ${result.partnersCreated} novo(s) estabelecimento(s) importado(s).`,
      });
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e?.message, variant: "destructive" });
    }
  };

  const startEdit = (p: (typeof partners)[number]) => {
    setEditingId(p.id);
    setShowAuth(false);
    setNewTag("");
    setForm({
      nomeEstabelecimento: p.nomeEstabelecimento,
      categoria: p.categoria || "",
      regiao: p.regiao || "",
      descricaoCurta: p.descricaoCurta || "",
      tags: p.tags || [],
      endereco: p.endereco || "",
      googleMapsUrl: p.googleMapsUrl || "",
      site: p.site || "",
      instagramHandle: p.instagramHandle || "",
      telefone: p.telefone || "",
      materiaPrincipalPostId: p.materiaPrincipalPostId != null ? String(p.materiaPrincipalPostId) : "",
      fotoReferencia: (p.fotoReferencia || []).join("\n"),
      dadosVerificadosEm: toDateInputValue(p.dadosVerificadosEm),
      status: p.status,
      autorizacaoData: toDateInputValue(p.autorizacaoData),
      autorizacaoCanal: p.autorizacaoCanal || "",
      autorizacaoObservacao: p.autorizacaoObservacao || "",
      autorizacaoFotos: p.autorizacaoFotos,
      autorizacaoVideosReels: p.autorizacaoVideosReels,
      autorizacaoStories: p.autorizacaoStories,
      marcacaoObrigatoria: p.marcacaoObrigatoria,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
  };

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (!t || !form || form.tags.includes(t)) return;
    setForm({ ...form, tags: [...form.tags, t] });
    setNewTag("");
  };

  const saveEdit = async () => {
    if (editingId == null || !form) return;
    try {
      await updateMutation.mutateAsync({
        id: editingId,
        data: {
          nomeEstabelecimento: form.nomeEstabelecimento.trim(),
          categoria: (form.categoria || null) as any,
          regiao: form.regiao.trim() || null,
          descricaoCurta: form.descricaoCurta.trim() || null,
          tags: form.tags,
          endereco: form.endereco.trim() || null,
          googleMapsUrl: form.googleMapsUrl.trim() || null,
          site: form.site.trim() || null,
          instagramHandle: form.instagramHandle.trim().replace(/^@/, "") || null,
          telefone: form.telefone.trim() || null,
          materiaPrincipalPostId: form.materiaPrincipalPostId ? Number(form.materiaPrincipalPostId) : null,
          fotoReferencia: form.fotoReferencia.split("\n").map((u) => u.trim()).filter(Boolean),
          dadosVerificadosEm: form.dadosVerificadosEm ? new Date(form.dadosVerificadosEm).toISOString() : null,
          status: form.status as any,
          autorizacaoData: form.autorizacaoData ? new Date(form.autorizacaoData).toISOString() : null,
          autorizacaoCanal: form.autorizacaoCanal.trim() || null,
          autorizacaoObservacao: form.autorizacaoObservacao.trim() || null,
          autorizacaoFotos: form.autorizacaoFotos,
          autorizacaoVideosReels: form.autorizacaoVideosReels,
          autorizacaoStories: form.autorizacaoStories,
          marcacaoObrigatoria: form.marcacaoObrigatoria,
        },
      });
      toast({ title: "Estabelecimento atualizado" });
      invalidate();
      cancelEdit();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    }
  };

  const selectCls = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm";

  return (
    <AdminLayout>
      <div className="flex justify-between items-start mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <Store className="w-6 h-6" /> Estabelecimentos
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Base de estabelecimentos e serviços da Rota da Ferradura: dados de contato, categoria, características
            e matéria principal de cada um.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleScan}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 shrink-0 text-muted-foreground"
          title="Lê as matérias publicadas e cadastra quem tiver @ do Instagram citado. Só cria registros novos."
        >
          <Download className="w-4 h-4" /> {scanMutation.isPending ? "Importando..." : "Importar das matérias"}
        </Button>
      </div>

      <Card className="p-6 mb-6">
        <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Cadastrar estabelecimento</p>
        <form onSubmit={handleCreateManual} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="lg:col-span-2">
            <Label>Nome</Label>
            <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Ex: Restaurante da Serra" />
          </div>
          <div>
            <Label>Categoria</Label>
            <select className={selectCls} value={newCategoria} onChange={(e) => setNewCategoria(e.target.value)}>
              <option value="">—</option>
              {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label>Região</Label>
            <Input value={newRegiao} onChange={(e) => setNewRegiao(e.target.value)} placeholder="Ex: Ferradura" />
          </div>
          <div>
            <Label>Instagram (sem @)</Label>
            <Input value={newInstagram} onChange={(e) => setNewInstagram(e.target.value)} placeholder="perfil" />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label>Telefone</Label>
            <Input value={newTelefone} onChange={(e) => setNewTelefone(e.target.value)} placeholder="(27) 99999-9999" />
          </div>
          <Button type="submit" disabled={createMutation.isPending || !newNome.trim()} className="flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Adicionar
          </Button>
        </form>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, região ou @..." />
        <select className={selectCls} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className={selectCls} value={filtroTag} onChange={(e) => setFiltroTag(e.target.value)}>
          <option value="">Todas as características</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        {filtered.length} de {partners.length} estabelecimento(s)
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Estabelecimento</th>
                <th className="px-6 py-4 font-medium">Categoria</th>
                <th className="px-6 py-4 font-medium">Características</th>
                <th className="px-6 py-4 font-medium">Contato</th>
                <th className="px-6 py-4 font-medium">Matéria principal</th>
                <th className="px-6 py-4 font-medium">Dados verificados</th>
                <th className="px-6 py-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum estabelecimento encontrado. Cadastre um acima ou use "Importar das matérias".
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const slug = p.materiaSlug || p.postSlug;
                  const titulo = p.materiaTitle || p.postTitle;
                  return (
                  <React.Fragment key={p.id}>
                    <tr className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors ${p.pausado ? "opacity-50" : ""}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">
                          {p.nomeEstabelecimento}
                          {p.pausado && <span className="ml-2 text-xs text-amber-600 font-normal">(pausado)</span>}
                        </div>
                        {p.regiao && <div className="text-xs text-muted-foreground">{p.regiao}</div>}
                        {p.descricaoCurta && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-xs line-clamp-2">{p.descricaoCurta}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {p.categoria ? CATEGORIAS[p.categoria] || p.categoria : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {(p.tags || []).length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            (p.tags || []).map((t) => (
                              <span key={t} className="px-2 py-0.5 rounded-full bg-muted text-xs text-foreground">{t}</span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground space-y-0.5">
                        {p.instagramHandle && (
                          <div>
                            <a href={`https://instagram.com/${p.instagramHandle}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline">
                              @{p.instagramHandle}
                            </a>
                          </div>
                        )}
                        {p.telefone && <div>{p.telefone}</div>}
                        {p.site && (
                          <div>
                            <a href={p.site} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline inline-flex items-center gap-1">
                              site <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                        {p.googleMapsUrl && (
                          <div>
                            <a href={p.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary underline inline-flex items-center gap-1">
                              mapa <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                        {!p.instagramHandle && !p.telefone && !p.site && !p.googleMapsUrl && "—"}
                      </td>
                      <td className="px-6 py-4">
                        {slug ? (
                          <Link href={`/blog/${slug}`} className="text-xs text-primary hover:underline" target="_blank">
                            {titulo}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {p.dadosVerificadosEm ? new Date(p.dadosVerificadosEm).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {editingId === p.id ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600" onClick={saveEdit} disabled={updateMutation.isPending}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground" onClick={cancelEdit}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-amber-600"
                              onClick={() => handleTogglePause(p.id, p.pausado)}
                              title={p.pausado ? "Reativar" : "Pausar"}
                            >
                              {p.pausado ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-primary" onClick={() => startEdit(p)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {editingId === p.id && form && (
                      <tr className="bg-muted/30 border-b border-border">
                        <td colSpan={7} className="px-6 py-5">
                          <p className="text-xs font-medium text-muted-foreground uppercase mb-3">Dados do estabelecimento</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="lg:col-span-2">
                              <Label>Nome</Label>
                              <Input value={form.nomeEstabelecimento} onChange={(e) => setForm({ ...form, nomeEstabelecimento: e.target.value })} />
                            </div>
                            <div>
                              <Label>Categoria principal</Label>
                              <select className={selectCls} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                                <option value="">—</option>
                                {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </div>
                            <div>
                              <Label>Região / localidade</Label>
                              <Input value={form.regiao} onChange={(e) => setForm({ ...form, regiao: e.target.value })} />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <Label>Descrição curta (factual)</Label>
                              <Textarea rows={2} value={form.descricaoCurta} onChange={(e) => setForm({ ...form, descricaoCurta: e.target.value })} />
                            </div>
                          </div>

                          <div className="mb-4">
                            <Label>Características</Label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {form.tags.map((t) => (
                                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-xs">
                                  {t}
                                  <button type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} className="hover:text-destructive">
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {TAGS_SUGERIDAS.filter((t) => !form.tags.includes(t)).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => addTag(t)}
                                  className="px-2 py-0.5 rounded-full border border-border text-xs text-muted-foreground hover:bg-muted"
                                >
                                  + {t}
                                </button>
                              ))}
                            </div>
                            <Input
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addTag(newTag);
                                }
                              }}
                              placeholder="Outra característica (Enter para adicionar)"
                              className="max-w-sm"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="lg:col-span-2">
                              <Label>Endereço</Label>
                              <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                            </div>
                            <div className="lg:col-span-2">
                              <Label>Link do Google Maps</Label>
                              <Input value={form.googleMapsUrl} onChange={(e) => setForm({ ...form, googleMapsUrl: e.target.value })} placeholder="https://maps.app.goo.gl/..." />
                            </div>
                            <div>
                              <Label>Site</Label>
                              <Input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="https://..." />
                            </div>
                            <div>
                              <Label>Instagram (sem @)</Label>
                              <Input value={form.instagramHandle} onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })} />
                            </div>
                            <div>
                              <Label>Telefone</Label>
                              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                            </div>
                            <div>
                              <Label>Dados verificados em</Label>
                              <Input type="date" value={form.dadosVerificadosEm} onChange={(e) => setForm({ ...form, dadosVerificadosEm: e.target.value })} />
                            </div>
                            <div className="lg:col-span-2">
                              <Label>Matéria principal</Label>
                              <select className={selectCls} value={form.materiaPrincipalPostId} onChange={(e) => setForm({ ...form, materiaPrincipalPostId: e.target.value })}>
                                <option value="">{p.postSlug ? "Usar a matéria de origem" : "—"}</option>
                                {posts.map((post) => (
                                  <option key={post.id} value={post.id}>{post.title}</option>
                                ))}
                              </select>
                              <p className="text-xs text-muted-foreground mt-1">
                                As fotos da matéria (capa e galeria) são aproveitadas dela automaticamente.
                              </p>
                            </div>
                            <div className="sm:col-span-2">
                              <Label>Fotos extras (uma URL por linha)</Label>
                              <Textarea rows={2} value={form.fotoReferencia} onChange={(e) => setForm({ ...form, fotoReferencia: e.target.value })} />
                            </div>
                          </div>

                          <div className="border-t border-border pt-4">
                            <button
                              type="button"
                              onClick={() => setShowAuth(!showAuth)}
                              className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase hover:text-foreground"
                            >
                              {showAuth ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              Autorização de uso de conteúdo
                            </button>
                            {showAuth && (
                              <div className="mt-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                                  <div>
                                    <Label>Status</Label>
                                    <select className={selectCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <Label>Data</Label>
                                    <Input type="date" value={form.autorizacaoData} onChange={(e) => setForm({ ...form, autorizacaoData: e.target.value })} />
                                  </div>
                                  <div>
                                    <Label>Canal</Label>
                                    <select className={selectCls} value={form.autorizacaoCanal} onChange={(e) => setForm({ ...form, autorizacaoCanal: e.target.value })}>
                                      <option value="">—</option>
                                      <option value="whatsapp">WhatsApp</option>
                                      <option value="instagram_dm">Instagram DM</option>
                                      <option value="email">E-mail</option>
                                      <option value="presencial">Presencial</option>
                                      <option value="outro">Outro</option>
                                    </select>
                                  </div>
                                  <div>
                                    <Label>Observação</Label>
                                    <Textarea rows={1} value={form.autorizacaoObservacao} onChange={(e) => setForm({ ...form, autorizacaoObservacao: e.target.value })} placeholder="Ex: respondeu sim no WhatsApp dia 02/08" />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-6">
                                  <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.autorizacaoFotos} onChange={(e) => setForm({ ...form, autorizacaoFotos: e.target.checked })} />
                                    Autorizou fotos
                                  </label>
                                  <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.autorizacaoVideosReels} onChange={(e) => setForm({ ...form, autorizacaoVideosReels: e.target.checked })} />
                                    Autorizou vídeos/Reels
                                  </label>
                                  <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.autorizacaoStories} onChange={(e) => setForm({ ...form, autorizacaoStories: e.target.checked })} />
                                    Autorizou Stories
                                  </label>
                                  <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.marcacaoObrigatoria} onChange={(e) => setForm({ ...form, marcacaoObrigatoria: e.target.checked })} />
                                    Marcação do perfil obrigatória
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminLayout>
  );
}
