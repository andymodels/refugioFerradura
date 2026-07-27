export interface ContentTag {
  id: string;
  label: string;
  keywords: string[];
}

export const CONTENT_TAGS: ContentTag[] = [
  {
    id: "lugares",
    label: "Lugares",
    keywords: ["mirante", "ponto turístico", "vila", "distrito", "região", "localidade"],
  },
  {
    id: "experiencias",
    label: "Experiências",
    keywords: ["experiência", "vivência", "roteiro", "passeio"],
  },
  {
    id: "gastronomia",
    label: "Gastronomia",
    keywords: ["restaurante", "cervejaria", "prato", "receita", "sabor", "culinária", "comida", "gastronomia", "self-service", "cardápio"],
  },
  {
    id: "hospedagem",
    label: "Hospedagem",
    keywords: ["pousada", "hotel", "chalé", "hospedagem", "diária", "reserva"],
  },
  {
    id: "natureza",
    label: "Natureza",
    keywords: ["cachoeira", "trilha", "mata", "floresta", "montanha", "serra", "natureza", "rio", "nascente"],
  },
  {
    id: "turismo",
    label: "Turismo",
    keywords: ["turismo", "turista", "visitante", "destino", "viagem"],
  },
  {
    id: "cultura",
    label: "Cultura",
    keywords: ["cultura", "história", "tradição", "artesanato", "festa"],
  },
  {
    id: "aventura",
    label: "Aventura",
    keywords: ["rapel", "quadriciclo", "buggy", "trilha", "adrenalina", "aventura", "radical"],
  },
  {
    id: "eventos",
    label: "Eventos",
    keywords: ["evento", "festival", "programação", "agenda", "show"],
  },
  {
    id: "empreendimentos",
    label: "Empreendimentos / Serviços",
    keywords: ["empreendimento", "propriedade", "sítio", "proprietário", "serviço", "negócio"],
  },
];
