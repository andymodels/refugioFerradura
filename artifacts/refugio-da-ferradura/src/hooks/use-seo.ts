import { useEffect } from 'react';

const SITE_NAME = 'Refúgio da Ferradura';
const SITE_DESCRIPTION =
  'Guia completo de turismo da Rota da Ferradura em Guarapari, Espírito Santo. Descubra lugares, restaurantes, pousadas e experiências únicas.';
const SITE_LOCALE = 'pt_BR';

export interface SeoOptions {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noIndex?: boolean;
}

function upsertMeta(nameOrProp: string, content: string, isProperty = false) {
  if (!content) return;
  const attr = isProperty ? 'property' : 'name';
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${nameOrProp}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, nameOrProp);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

function upsertJsonLd(data: Record<string, unknown> | Record<string, unknown>[]) {
  let el = document.getElementById('seo-json-ld') as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = 'seo-json-ld';
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data, null, 0);
}

function removeJsonLd() {
  document.getElementById('seo-json-ld')?.remove();
}

export function useSeo({
  title,
  description,
  image,
  url,
  type = 'website',
  jsonLd,
  noIndex = false,
}: SeoOptions = {}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const desc = description || SITE_DESCRIPTION;
  const pageUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const jsonLdKey = JSON.stringify(jsonLd ?? null);

  useEffect(() => {
    document.documentElement.lang = 'pt-BR';
    document.title = fullTitle;

    upsertMeta('description', desc);
    upsertMeta('robots', noIndex ? 'noindex,nofollow' : 'index,follow');
    upsertMeta('language', 'Portuguese');

    upsertMeta('og:site_name', SITE_NAME, true);
    upsertMeta('og:locale', SITE_LOCALE, true);
    upsertMeta('og:type', type, true);
    upsertMeta('og:title', fullTitle, true);
    upsertMeta('og:description', desc, true);
    if (pageUrl) upsertMeta('og:url', pageUrl, true);
    if (image) upsertMeta('og:image', image, true);
    if (image) upsertMeta('og:image:width', '1200', true);
    if (image) upsertMeta('og:image:height', '630', true);

    upsertMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    upsertMeta('twitter:title', fullTitle);
    upsertMeta('twitter:description', desc);
    if (image) upsertMeta('twitter:image', image);

    if (pageUrl) upsertCanonical(pageUrl);

    if (jsonLd) upsertJsonLd(jsonLd);
    else removeJsonLd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullTitle, desc, image, pageUrl, type, noIndex, jsonLdKey]);
}
