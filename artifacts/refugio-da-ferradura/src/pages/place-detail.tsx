import React from "react";
import { useRoute } from "wouter";
import { MapPin, Phone, Globe, Clock, ArrowLeft, Image as ImageIcon } from "lucide-react";
import { Layout } from "@/components/layout";
import { useGetPlace } from "@workspace/api-client-react";
import { Link } from "wouter";

export default function PlaceDetail() {
  const [, params] = useRoute("/lugares/:slug");
  const { data: place, isLoading, error } = useGetPlace(params?.slug || "");

  if (isLoading) return <Layout><div className="pt-40 text-center text-muted-foreground">Carregando...</div></Layout>;
  if (error || !place) return <Layout><div className="pt-40 text-center text-xl font-serif">Lugar não encontrado</div></Layout>;

  const imagesList = place.images ? place.images.split(',').map(s => s.trim()) : [];

  return (
    <Layout>
      {/* Hero */}
      <div className="relative h-[60vh] min-h-[400px]">
        <img 
          src={place.coverImage || "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1600&auto=format&fit=crop"} 
          alt={place.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 pb-12 pt-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-white">
            <Link href="/lugares" className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors mb-6">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Link>
            <div className="flex gap-3 mb-4">
              <span className="bg-primary px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider">{place.category}</span>
              {place.featured && <span className="bg-white text-black px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider">Destaque</span>}
            </div>
            <h1 className="text-4xl md:text-6xl font-serif font-medium drop-shadow-md mb-4">{place.name}</h1>
            {place.address && (
              <p className="flex items-center gap-2 text-white/90 text-lg">
                <MapPin className="w-5 h-5" /> {place.address}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 lg:gap-16">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h2 className="text-2xl font-serif mb-6 text-primary border-b border-border pb-4">Sobre o lugar</h2>
              <div 
                className="prose prose-stone max-w-none prose-p:text-muted-foreground prose-p:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: place.description }}
              />
            </section>

            {imagesList.length > 0 && (
              <section>
                <h2 className="text-2xl font-serif mb-6 text-primary border-b border-border pb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" /> Galeria de Fotos
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {imagesList.map((url, idx) => (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img src={url} alt={`Galeria ${idx + 1}`} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar Info */}
          <div>
            <div className="bg-muted/30 border border-border p-6 rounded-2xl sticky top-28">
              <h3 className="text-xl font-serif mb-6">Informações</h3>
              <ul className="space-y-6">
                {place.openingHours && (
                  <li className="flex items-start gap-4">
                    <div className="p-2 bg-background rounded-full shrink-0 text-primary shadow-sm border border-border/50">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground mb-1">Horário de Funcionamento</p>
                      <p className="text-muted-foreground text-sm whitespace-pre-line">{place.openingHours}</p>
                    </div>
                  </li>
                )}
                {place.phone && (
                  <li className="flex items-start gap-4">
                    <div className="p-2 bg-background rounded-full shrink-0 text-primary shadow-sm border border-border/50">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground mb-1">Telefone</p>
                      <a href={`tel:${place.phone.replace(/\D/g,'')}`} className="text-primary hover:underline text-sm">{place.phone}</a>
                    </div>
                  </li>
                )}
                {place.website && (
                  <li className="flex items-start gap-4">
                    <div className="p-2 bg-background rounded-full shrink-0 text-primary shadow-sm border border-border/50">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground mb-1">Website / Redes Sociais</p>
                      <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm break-all">
                        {place.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
