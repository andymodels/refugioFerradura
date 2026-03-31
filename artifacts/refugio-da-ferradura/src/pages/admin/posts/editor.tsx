<Card className="p-6 bg-[#1a1a1a] border-white/5 space-y-6">
  <div className="space-y-3">
    <Label className="text-[10px] uppercase text-white/30">Tags</Label>
    <div className="flex flex-wrap gap-2">
      {PREDEFINED_TAGS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => toggleTag(t.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] border transition-all ${selectedTags.includes(t.id) ? "bg-orange-500/20 border-orange-500 text-orange-500" : "bg-white/5 border-transparent text-white/40"}`}
        >
          <t.icon className="w-3 h-3" />
          {t.label}
        </button>
      ))}
    </div>
  </div>

  <div className="space-y-4">
    <Label className="text-[10px] uppercase text-white/30">Status</Label>
    <div className="flex bg-black p-1 rounded-md">
      <button
        type="button"
        onClick={() => setValue("status", "draft")}
        className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "draft" ? "bg-orange-600 text-white" : "text-white/20"}`}
      >
        RASCUNHO
      </button>
      <button
        type="button"
        onClick={() => setValue("status", "published")}
        className={`flex-1 py-2 text-[10px] font-bold rounded ${currentStatus === "published" ? "bg-green-700 text-white" : "text-white/20"}`}
      >
        PUBLICADO
      </button>
    </div>
  </div>

  <div className="space-y-2">
    <Label className="text-[10px] uppercase text-white/30">Slug URL</Label>
    <div className="flex items-center gap-1 bg-black p-2 rounded text-[10px] border border-white/5">
      <span className="opacity-20">/blog/</span>
      <input {...register("slug")} className="bg-transparent outline-none w-full" />
    </div>
  </div>

  <div className="space-y-2">
    <Label className="text-[10px] uppercase text-white/30">Descrição SEO</Label>
    <Textarea
      {...register("metaDescription")}
      className="bg-black text-xs"
      rows={3}
      placeholder="Texto para Google..."
    />
  </div>

  <div className="space-y-2">
    <Label className="text-[10px] uppercase text-white/30">Imagem de capa</Label>
    <input
      {...register("coverImage")}
      placeholder="https://..."
      className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-xs"
    />
  </div>

  <Button type="submit" className="w-full bg-[#c4a484] hover:bg-[#b39373] text-black font-bold py-6">
    Criar Publicação
  </Button>
</Card>