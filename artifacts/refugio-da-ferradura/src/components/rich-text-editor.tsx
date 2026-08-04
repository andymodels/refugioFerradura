import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Image as TiptapImage } from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Youtube from '@tiptap/extension-youtube';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { mergeAttributes, Node, Extension } from '@tiptap/core';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Minus, Code, Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Youtube as YoutubeIcon, LayoutGrid, Palette, X, GalleryHorizontal, Film,
  ChevronLeft, ChevronRight, Plus, Trash2, Eraser, Upload, Video, Loader2, Instagram,
} from 'lucide-react';
import { cn } from './ui-elements';
import { compressImageFile } from '@/lib/image-compression';

// ─── FontSize extension ────────────────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: Element) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs: Record<string, unknown>) => {
            if (!attrs.fontSize) return {};
            return { style: `font-size: ${attrs.fontSize}` };
          },
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
    } as any;
  },
});

// ─── Resizable Image NodeView ─────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  // Mesmo motivo do vídeo: só re-renderiza local durante o arraste, sem
  // gerar uma transação do ProseMirror (e a serialização do artigo inteiro
  // que vem junto) a cada pixel — commit único no mouseup.
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const onMouseDownHandle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = imgRef.current?.offsetWidth ?? (node.attrs.width as number) ?? 400;
    startRef.current = { x: startX, w: startW };

    const onMove = (me: MouseEvent) => {
      if (!startRef.current) return;
      const delta = me.clientX - startRef.current.x;
      const newW = Math.max(80, Math.round(startRef.current.w + delta));
      setDragWidth(newW);
    };
    const onUp = () => {
      startRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragWidth((finalWidth) => {
        if (finalWidth !== null) updateAttributes({ width: finalWidth });
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [node.attrs.width, updateAttributes]);

  const widthVal = dragWidth ?? node.attrs.width;
  const style: React.CSSProperties = widthVal
    ? { width: widthVal, maxWidth: '100%', display: 'block' }
    : { maxWidth: '100%', display: 'block' };

  return (
    <NodeViewWrapper className="relative my-4 inline-block" style={{ display: 'block' }} data-drag-handle>
      <div className={cn('relative inline-block', selected && 'outline outline-2 outline-blue-500 rounded-lg')}>
        <img ref={imgRef} src={node.attrs.src} alt={node.attrs.alt ?? ''} title={node.attrs.title ?? undefined}
          style={style} className="rounded-lg" draggable={false} />
        {selected && (
          <div onMouseDown={onMouseDownHandle}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex items-center justify-center cursor-ew-resize"
            style={{ width: 16, height: 40 }}>
            <div className="w-2 h-8 bg-white border border-blue-500 rounded shadow-md" />
          </div>
        )}
        {selected && widthVal && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
            {widthVal}px
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Fotos editoriais de Instagram/site oficial (mediaPipeline / reconciliação)
// chegam como <figure class="instagram-editorial-photo"><a href="ORIGEM">
// <img></a></figure> — sem esses dois atributos capturados aqui, abrir e
// salvar o post no editor perde silenciosamente o link de clique e o hover
// "Instagram oficial" (o <img> é reconhecido, mas a moldura ao redor não).
const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width') || el.style.width;
          return w ? parseInt(w) : null;
        },
        renderHTML: (attrs) =>
          attrs.width ? { width: attrs.width, style: `width:${attrs.width}px;max-width:100%` } : {},
      },
      // true pra qualquer imagem enviada pelo botão "Foto editorial" (com ou
      // sem origem do Instagram) e pra qualquer foto já vinda do pipeline —
      // controla só o estilo (máx. 640px, alinhado à esquerda, sem crédito
      // visível), independente de ter link de clique ou não.
      editorial: {
        default: false,
        parseHTML: (el) => !!el.closest('figure.instagram-editorial-photo'),
        renderHTML: () => ({}),
      },
      editorialHref: {
        default: null,
        parseHTML: (el) => el.closest('figure.instagram-editorial-photo')?.querySelector('a[href]')?.getAttribute('href') || null,
        renderHTML: () => ({}),
      },
      editorialAriaLabel: {
        default: null,
        parseHTML: (el) => el.closest('figure.instagram-editorial-photo')?.querySelector('a[href]')?.getAttribute('aria-label') || null,
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ HTMLAttributes, node }) {
    const img = ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
    if (!node.attrs.editorial) return img as any;
    if (node.attrs.editorialHref) {
      return [
        'figure',
        { class: 'instagram-editorial-photo' },
        [
          'a',
          {
            href: node.attrs.editorialHref,
            target: '_blank',
            rel: 'noopener noreferrer',
            'aria-label': node.attrs.editorialAriaLabel || 'Ver origem oficial',
          },
          img,
        ],
      ] as any;
    }
    // Upload direto, sem origem — mesmo tratamento visual (640px, esquerda),
    // sem link de clique nem badge (não existe origem oficial pra apontar).
    return ['figure', { class: 'instagram-editorial-photo' }, img] as any;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
}).configure({
  HTMLAttributes: { class: 'rounded-lg' },
  inline: false,
});

// ─── Direct Video / Instagram Embed Node ─────────────────────────────────────

function toInstagramEmbedUrl(_url: string): string | null {
  // Disabled on purpose: the official Instagram embed iframe always shows
  // Instagram's own white header/footer chrome, which cannot be removed
  // with CSS from here. Every call site below (paste transform, paste
  // handler, onUpdate normalizer, and the "add video" toolbar button) treats
  // a null return as "not an Instagram embed", so returning null here is a
  // single switch that turns the whole auto-embed feature off. Re-enable by
  // restoring the regex match once a real media-archiving pipeline (that
  // downloads the photo/video instead of embedding Instagram's UI) exists.
  return null;
}

// Converts a paragraph containing only an Instagram post/reel URL into the
// editor's native embed node. This intentionally runs after paste as well:
// Safari and the editor may turn a plain pasted URL into a link only after the
// initial clipboard transform has already happened.
function normalizeInstagramEmbeds(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('p').forEach((paragraph) => {
    const anchor = paragraph.querySelector('a[href]');
    const text = paragraph.textContent?.trim() || '';
    const linkText = anchor?.textContent?.trim() || '';
    const isOnlyLink = anchor ? text === linkText : true;
    const sourceUrl = anchor?.getAttribute('href') || text;
    const embedUrl = isOnlyLink ? toInstagramEmbedUrl(sourceUrl) : null;
    if (!embedUrl) return;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-video-embed', '');
    iframe.setAttribute('data-embed-type', 'instagram');
    iframe.setAttribute('src', embedUrl);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('allowtransparency', 'true');
    paragraph.replaceWith(iframe);
  });

  return div.innerHTML;
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel|tv)\//i.test(url);
}

function isDirectVideoUrl(url: string): boolean {
  return (
    /\.(mp4|webm|mov|avi|m4v|ogv)(\?.*)?$/i.test(url) ||
    url.includes('res.cloudinary.com') ||
    url.includes('/video/upload/')
  );
}

// Nível do módulo (não só dentro de RichTextEditor) porque a grade e o
// carrossel de imagens também precisam fazer upload de arquivo, não só
// aceitar URL colada.
async function uploadMediaFile(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/media/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 413) {
      throw new Error('Arquivo grande demais para a hospedagem (máx. ~4MB). Tente uma foto/vídeo menor.');
    }
    throw new Error(body?.error || `Falha no upload (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.url as string;
}

type VideoAlign = 'left' | 'center' | 'right';

function alignWrapperStyle(align: VideoAlign, width: number | null): React.CSSProperties {
  const base: React.CSSProperties = width ? { width, maxWidth: '100%' } : { width: '100%' };
  if (!width) return base; // full-width: alignment has no visual effect
  if (align === 'left')   return { ...base, marginRight: 'auto', marginLeft: 0 };
  if (align === 'right')  return { ...base, marginLeft: 'auto', marginRight: 0 };
  return { ...base, marginLeft: 'auto', marginRight: 'auto' }; // center
}

function VideoEmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, embedType, width, align } = node.attrs as {
    src: string; embedType: string; width: number | null; align: VideoAlign;
  };
  const isInsta = embedType === 'instagram';
  const wrapperRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; w: number } | null>(null);
  // Enquanto arrasta, só atualiza este estado local (re-render leve, sem
  // tocar o documento do editor). updateAttributes só é chamado 1x no
  // mouseup — chamá-lo a cada pixel disparava uma transação do ProseMirror
  // por movimento, e cada uma serializa o artigo inteiro de novo (onUpdate),
  // travando a tela durante o arraste.
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const displayWidth = dragWidth ?? width;

  const onMouseDownHandle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = wrapperRef.current?.offsetWidth ?? (width ?? 640);
    startRef.current = { x: startX, w: startW };

    const onMove = (me: MouseEvent) => {
      if (!startRef.current) return;
      const delta = me.clientX - startRef.current.x;
      const newW = Math.max(200, Math.round(startRef.current.w + delta));
      setDragWidth(newW);
    };
    const onUp = () => {
      startRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setDragWidth((finalWidth) => {
        if (finalWidth !== null) updateAttributes({ width: finalWidth });
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width, updateAttributes]);

  return (
    <NodeViewWrapper data-drag-handle className="my-4">
      {/* Alignment + resize controls toolbar — shown when selected */}
      {selected && (
        <div className="flex items-center gap-1 mb-1.5">
          <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg px-1 py-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => updateAttributes({ align: 'left' })}
              title="Alinhar à esquerda"
              className={cn(
                'p-1 rounded transition-colors',
                (align ?? 'left') === 'left' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ align: 'center' })}
              title="Centralizar"
              className={cn(
                'p-1 rounded transition-colors',
                align === 'center' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ align: 'right' })}
              title="Alinhar à direita"
              className={cn(
                'p-1 rounded transition-colors',
                align === 'right' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {displayWidth && (
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {displayWidth}px — arraste a borda direita para redimensionar
            </span>
          )}
          {!displayWidth && (
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              Largura total — arraste a borda direita para definir uma largura
            </span>
          )}
        </div>
      )}

      <div ref={wrapperRef} style={alignWrapperStyle(align ?? 'left', displayWidth)} className="relative">
        <div className={cn(
          'relative rounded-xl overflow-hidden',
          isInsta ? 'bg-white' : 'bg-black',
          selected && 'outline outline-2 outline-blue-500 rounded-xl'
        )}>
          {isInsta ? (
            <iframe
              src={src}
              className="w-full rounded-xl border-0"
              style={{ minHeight: 540, maxHeight: 700 }}
              allowTransparency
              scrolling="no"
              frameBorder="0"
              title="Instagram embed"
            />
          ) : (
            <video
              src={src}
              controls
              playsInline
              className="w-full rounded-xl"
              style={{ maxHeight: 480 }}
            />
          )}

          {/* Overlay for iframes — captures click to select node */}
          {isInsta && !selected && (
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              title="Clique para selecionar"
            />
          )}
        </div>

        {/* Resize handle — right edge */}
        {selected && (
          <div
            onMouseDown={onMouseDownHandle}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30 flex items-center justify-center cursor-ew-resize"
            style={{ width: 20, height: 56 }}
          >
            <div className="w-2.5 h-12 bg-white border-2 border-blue-500 rounded-full shadow-lg" />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: '',
        renderHTML: (attrs) => ({ src: attrs.src || '' }),
        parseHTML: (el) => (el as HTMLElement).getAttribute('src') || '',
      },
      embedType: {
        default: 'video',
        renderHTML: (attrs) => ({ 'data-embed-type': attrs.embedType || 'video' }),
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-embed-type') || 'video',
      },
      width: {
        default: null,
        renderHTML: (attrs) =>
          attrs.width ? { 'data-width': String(attrs.width) } : {},
        parseHTML: (el) => {
          const w = (el as HTMLElement).getAttribute('data-width');
          return w ? parseInt(w) : null;
        },
      },
      align: {
        default: 'left',
        renderHTML: (attrs) => ({ 'data-align': attrs.align || 'left' }),
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-align') || 'left',
      },
      // Vídeo real editorial (mediaPipeline / reconciliação), sem faixa
      // branca do Instagram — <figure class="instagram-editorial-video">
      // <video>...</video><a class="instagram-editorial-video-badge">...
      // Sem capturar isso aqui, abrir e salvar o post no editor apaga o
      // vídeo inteiro (a tag <video> sem data-video-embed não batia com
      // nenhuma regra de parseHTML) e perde o link/hover "Instagram oficial".
      // true pra qualquer vídeo enviado pelo botão "Vídeo editorial" (com ou
      // sem origem do Instagram) — controla o estilo (máx. 640px, esquerda,
      // sem crédito visível), independente de ter link de clique ou não.
      editorial: {
        default: false,
        parseHTML: (el) => !!(el as HTMLElement).closest('figure.instagram-editorial-video'),
        renderHTML: () => ({}),
      },
      editorialBadgeHref: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).closest('figure.instagram-editorial-video')?.querySelector('a[href]')?.getAttribute('href') || null,
        renderHTML: () => ({}),
      },
      // Frame estático mostrado antes do play — sem isso o vídeo aparece com
      // tela preta até o usuário clicar.
      poster: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('poster') || null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'video[data-video-embed]' },
      { tag: 'iframe[data-video-embed]' },
      { tag: 'figure.instagram-editorial-video video' },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = HTMLAttributes as Record<string, string>;
    const embedType = attrs['data-embed-type'] || 'video';
    const src = attrs.src || '';
    const w = attrs['data-width'];
    const align = attrs['data-align'] || 'left';

    if (node.attrs.editorial) {
      const videoAttrs: Record<string, string> = { controls: '', playsinline: '', preload: 'metadata', src };
      if (node.attrs.poster) videoAttrs.poster = node.attrs.poster as string;
      const figureChildren: any[] = ['figure', { class: 'instagram-editorial-video' }, ['video', videoAttrs]];
      // Upload direto, sem origem — mesmo tratamento visual, sem badge de
      // clique (não existe origem oficial pra apontar).
      if (node.attrs.editorialBadgeHref) {
        figureChildren.push([
          'a',
          {
            class: 'instagram-editorial-video-badge',
            href: node.attrs.editorialBadgeHref as string,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          'Instagram oficial ↗',
        ]);
      }
      return figureChildren as any;
    }

    let wrapStyle = w ? `width:${w}px;max-width:100%` : 'width:100%';
    if (w) {
      if (align === 'center') wrapStyle += ';margin-left:auto;margin-right:auto';
      else if (align === 'right') wrapStyle += ';margin-left:auto;margin-right:0';
      else wrapStyle += ';margin-right:auto;margin-left:0';
    }

    if (embedType === 'instagram') {
      return [
        'div',
        { style: wrapStyle, class: 'video-embed-wrap' },
        [
          'iframe',
          mergeAttributes(HTMLAttributes, {
            'data-video-embed': '',
            class: 'video-embed-instagram',
            frameborder: '0',
            scrolling: 'no',
            allowtransparency: 'true',
            style: 'width:100%;min-height:540px;border-radius:12px',
            src,
          }),
        ],
      ];
    }
    return [
      'div',
      { style: wrapStyle, class: 'video-embed-wrap' },
      [
        'video',
        mergeAttributes(HTMLAttributes, {
          'data-video-embed': '',
          controls: '',
          playsinline: '',
          class: 'video-embed',
          src,
        }),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedView);
  },
});

// ─── Two-Column Image Grid Node ───────────────────────────────────────────────
// IMPORTANT: renderHTML is defined INSIDE each addAttributes() entry so that
// Tiptap correctly transforms attrs → HTML attributes in the output.
// HTMLAttributes in the node's renderHTML will then contain 'data-images' (not 'images').

interface GridData { src1: string; src2: string; alt1: string; alt2: string }
const EMPTY_GRID: GridData = { src1: '', src2: '', alt1: '', alt2: '' };

function parseGridData(raw: string | null | undefined): GridData {
  if (!raw) return { ...EMPTY_GRID };
  try { return { ...EMPTY_GRID, ...JSON.parse(raw) }; } catch { return { ...EMPTY_GRID }; }
}

function ImageGridView({ node, updateAttributes, selected }: NodeViewProps) {
  const data = parseGridData(node.attrs.images as string);
  const fileInputRefs = useRef<Record<1 | 2, HTMLInputElement | null>>({ 1: null, 2: null });
  const [uploadingSlot, setUploadingSlot] = useState<1 | 2 | null>(null);

  const setSlotSrc = (slot: 1 | 2, url: string) => {
    const next: GridData = { ...data };
    if (slot === 1) next.src1 = url; else next.src2 = url;
    updateAttributes({ images: JSON.stringify(next) });
  };

  const onFileSelected = async (slot: 1 | 2, file: File | undefined) => {
    if (!file) return;
    setUploadingSlot(slot);
    try {
      const compressed = await compressImageFile(file);
      const url = await uploadMediaFile(compressed);
      setSlotSrc(slot, url);
    } catch (err) {
      alert('Erro ao enviar a foto: ' + (err as Error).message);
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <NodeViewWrapper data-drag-handle className="my-4">
      <div className={cn('grid grid-cols-2 gap-3 rounded-lg', selected && 'outline outline-2 outline-blue-500 rounded-lg')}>
        {([1, 2] as const).map((slot) => {
          const src = slot === 1 ? data.src1 : data.src2;
          const alt = slot === 1 ? data.alt1 : data.alt2;
          const uploading = uploadingSlot === slot;
          return (
            <div key={slot} className="space-y-1">
              <div
                onClick={() => !uploading && fileInputRefs.current[slot]?.click()}
                className={cn(
                  'relative overflow-hidden rounded-lg aspect-[4/3] cursor-pointer group',
                  !src && 'border-2 border-dashed border-border bg-muted flex items-center justify-center'
                )}
              >
                {uploading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : src ? (
                  <>
                    <img src={src} alt={alt || ''} className="w-full h-full object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                      <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded">Trocar imagem</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground p-4">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    <p className="text-xs">Clique para enviar imagem {slot}</p>
                  </div>
                )}
              </div>
              <input
                ref={(el) => { fileInputRefs.current[slot] = el; }}
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  onFileSelected(slot, file);
                }}
              />
            </div>
          );
        })}
      </div>
    </NodeViewWrapper>
  );
}

const ImageGrid = Node.create({
  name: 'imageGrid',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      images: {
        default: JSON.stringify(EMPTY_GRID),
        // renderHTML here converts internal attr → HTML attribute in getHTML() output
        renderHTML: (attrs) => ({
          'data-images': attrs.images || JSON.stringify(EMPTY_GRID),
        }),
        // parseHTML here converts HTML attribute → internal attr value
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute('data-images') || JSON.stringify(EMPTY_GRID),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-image-grid]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // HTMLAttributes now contains { 'data-images': '...' } from the attr renderHTML above
    const raw = (HTMLAttributes as Record<string, string>)['data-images'] || JSON.stringify(EMPTY_GRID);
    const { src1, src2, alt1, alt2 } = parseGridData(raw);
    const children: any[] = [];
    if (src1) children.push(['img', { src: src1, alt: alt1 || '', class: 'image-grid-img' }]);
    if (src2) children.push(['img', { src: src2, alt: alt2 || '', class: 'image-grid-img' }]);
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-image-grid': '', class: 'image-grid-2col' }),
      ...children,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGridView);
  },
});

// ─── Image Carousel Node ──────────────────────────────────────────────────────
// Stores an array of image URLs as JSON in data-carousel attribute.

function parseCarouselImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}

function ImageCarouselView({ node, updateAttributes, selected }: NodeViewProps) {
  const [index, setIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const images = parseCarouselImages(node.attrs.images as string);

  const addImage = () => addInputRef.current?.click();

  const onAddFilesSelected = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    let next = images;
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ done: i, total: files.length });
        const compressed = await compressImageFile(files[i]);
        const url = await uploadMediaFile(compressed);
        next = [...next, url];
        updateAttributes({ images: JSON.stringify(next) });
      }
      setIndex(next.length - 1);
    } catch (err) {
      alert('Erro ao enviar a foto: ' + (err as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const removeCurrentImage = () => {
    if (images.length === 0) return;
    const next = images.filter((_, i) => i !== index);
    updateAttributes({ images: JSON.stringify(next) });
    setIndex(Math.max(0, index - 1));
  };

  const replaceCurrentImage = () => replaceInputRef.current?.click();

  const onReplaceFileSelected = async (file: File | undefined) => {
    if (!file || images.length === 0) return;
    setUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const url = await uploadMediaFile(compressed);
      const next = images.map((img, i) => (i === index ? url : img));
      updateAttributes({ images: JSON.stringify(next) });
    } catch (err) {
      alert('Erro ao enviar a foto: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const prev = () => setIndex((i) => (i - 1 + Math.max(1, images.length)) % Math.max(1, images.length));
  const next = () => setIndex((i) => (i + 1) % Math.max(1, images.length));

  return (
    <NodeViewWrapper data-drag-handle className="my-4">
      <div className={cn('rounded-xl overflow-hidden bg-muted border border-border', selected && 'outline outline-2 outline-blue-500')}>
        {/* Carousel display — height adapts to each photo's own aspect ratio instead of cropping */}
        <div className="relative bg-muted/50 overflow-hidden flex items-center justify-center" style={{ minHeight: 220 }}>
          {uploading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              {uploadProgress && uploadProgress.total > 1 && (
                <p className="text-xs">Enviando foto {uploadProgress.done + 1} de {uploadProgress.total}…</p>
              )}
            </div>
          ) : images.length > 0 ? (
            <img
              src={images[index]}
              alt={`Slide ${index + 1}`}
              className="max-w-full h-auto object-contain"
              style={{ maxHeight: 480 }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <GalleryHorizontal className="w-10 h-10 opacity-30" />
              <p className="text-sm">Carrossel vazio — clique em + para enviar fotos</p>
            </div>
          )}

          {/* Nav arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Counter */}
          {images.length > 0 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all',
                    i === index ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/80'
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background/80">
          <span className="text-xs text-muted-foreground flex-1">
            Carrossel · {images.length} foto{images.length !== 1 ? 's' : ''}
          </span>
          {images.length > 0 && (
            <button
              type="button"
              disabled={uploading}
              onClick={replaceCurrentImage}
              className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-40"
            >
              Trocar foto atual
            </button>
          )}
          {images.length > 0 && (
            <button
              type="button"
              disabled={uploading}
              onClick={removeCurrentImage}
              className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors disabled:opacity-40"
              title="Remover foto atual"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            disabled={uploading}
            onClick={addImage}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Adicionar fotos
          </button>
        </div>
      </div>
      <input
        ref={addInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          // Precisa converter pra array ANTES de limpar e.target.value — files
          // é uma FileList "viva" ligada ao input, então limpar o value zera
          // a lista também (e o upload silenciosamente não faz nada).
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          onAddFilesSelected(files);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onReplaceFileSelected(file);
        }}
      />
    </NodeViewWrapper>
  );
}

// Nível do módulo porque tanto o botão avulso de vídeo (dentro de
// RichTextEditor) quanto o carrossel de vídeos (view separada, fora do
// componente) precisam das mesmas transformações Cloudinary.
function cappedCloudinaryUrl(url: string): string {
  return url.replace('/upload/', '/upload/c_limit,w_640,h_640,q_auto,f_auto/');
}

function cloudinaryVideoPoster(url: string): string {
  return url
    .replace('/upload/', '/upload/so_1,c_limit,w_640,h_640,q_auto,f_auto/')
    .replace(/\.\w+(\?.*)?$/, '.jpg');
}

const ImageCarousel = Node.create({
  name: 'imageCarousel',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      images: {
        default: JSON.stringify([]),
        renderHTML: (attrs) => ({
          'data-carousel': attrs.images || JSON.stringify([]),
        }),
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute('data-carousel') || JSON.stringify([]),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-image-carousel]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw = (HTMLAttributes as Record<string, string>)['data-carousel'] || JSON.stringify([]);
    const imgs = parseCarouselImages(raw);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-image-carousel': '',
        class: 'image-carousel-block',
        style: 'display:flex;justify-content:center;align-items:center;border-radius:0.75rem;overflow:hidden',
      }),
      // Sem style inline aqui de propósito: .post-content .carousel-slide-img
      // (index.css) já define object-fit:contain pra nunca cortar a foto —
      // um style inline no <img> teria especificidade maior que a classe e
      // sobrescreveria isso silenciosamente (era exatamente esse o bug:
      // o inline antigo tinha object-fit:cover, cortando a foto mesmo com
      // a regra certa já existindo na folha de estilo).
      ...imgs.map((src, i) => ['img', { src, class: 'carousel-slide carousel-slide-img' + (i === 0 ? ' is-active' : ''), alt: '' }]),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageCarouselView);
  },
});

// ─── Video Carousel Node ──────────────────────────────────────────────────────
// Como o carrossel de fotos, mas cada slide é um vídeo importado colando o
// link de um post/Reel do Instagram — o servidor baixa e arquiva no
// Cloudinary (mesmo endpoint /api/media/import-instagram do botão de vídeo
// avulso), e o resultado entra como mais um slide aqui.

interface CarouselVideo { src: string; poster: string | null; sourceUrl: string | null }

function parseCarouselVideos(raw: string | null | undefined): CarouselVideo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => v && v.src) : [];
  } catch { return []; }
}

function VideoCarouselView({ node, updateAttributes, selected }: NodeViewProps) {
  const [index, setIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const videos = parseCarouselVideos(node.attrs.videos as string);
  const current = videos[index];

  const addFromLink = async () => {
    const url = (window.prompt('Cole o link do post ou Reel do Instagram:') || '').trim();
    if (!url) return;
    setImporting(true);
    try {
      const res = await fetch('/api/media/import-instagram', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Falha ao importar (HTTP ${res.status})`);
      if (data.type !== 'video') throw new Error('Esse link não é de um vídeo/Reel.');
      const next: CarouselVideo[] = [
        ...videos,
        { src: cappedCloudinaryUrl(data.url), poster: cloudinaryVideoPoster(data.url), sourceUrl: data.sourceUrl || null },
      ];
      updateAttributes({ videos: JSON.stringify(next) });
      setIndex(next.length - 1);
    } catch (err) {
      alert('Não consegui importar esse vídeo: ' + (err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const removeCurrentVideo = () => {
    if (videos.length === 0) return;
    const next = videos.filter((_, i) => i !== index);
    updateAttributes({ videos: JSON.stringify(next) });
    setIndex(Math.max(0, index - 1));
  };

  const prev = () => setIndex((i) => (i - 1 + Math.max(1, videos.length)) % Math.max(1, videos.length));
  const next = () => setIndex((i) => (i + 1) % Math.max(1, videos.length));

  return (
    <NodeViewWrapper data-drag-handle className="my-4">
      <div className={cn('rounded-xl overflow-hidden bg-muted border border-border', selected && 'outline outline-2 outline-blue-500')}>
        <div className="relative bg-black flex items-center justify-center" style={{ minHeight: 220 }}>
          {importing ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-white/70">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-xs">Importando vídeo do Instagram…</p>
            </div>
          ) : current ? (
            <video
              key={current.src}
              src={current.src}
              poster={current.poster || undefined}
              controls
              playsInline
              preload="metadata"
              className="max-w-full h-auto"
              style={{ maxHeight: 480 }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-white/50 gap-2">
              <Film className="w-10 h-10 opacity-30" />
              <p className="text-sm">Carrossel de vídeos vazio — cole um link do Instagram</p>
            </div>
          )}

          {videos.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {videos.length > 0 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
              {videos.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    'w-2 h-2 rounded-full transition-all',
                    i === index ? 'bg-white scale-110' : 'bg-white/50 hover:bg-white/80'
                  )}
                />
              ))}
            </div>
          )}

          {current?.sourceUrl && (
            <a
              href={current.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full hover:bg-black/80 transition-colors"
            >
              Instagram oficial ↗
            </a>
          )}
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background/80">
          <span className="text-xs text-muted-foreground flex-1">
            Carrossel de vídeos · {videos.length} vídeo{videos.length !== 1 ? 's' : ''}
          </span>
          {videos.length > 0 && (
            <button
              type="button"
              disabled={importing}
              onClick={removeCurrentVideo}
              className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors disabled:opacity-40"
              title="Remover vídeo atual"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            disabled={importing}
            onClick={addFromLink}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Instagram className="w-3.5 h-3.5" />}
            Colar link do Instagram
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const VideoCarousel = Node.create({
  name: 'videoCarousel',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      videos: {
        default: JSON.stringify([]),
        renderHTML: (attrs) => ({
          'data-video-carousel-items': attrs.videos || JSON.stringify([]),
        }),
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute('data-video-carousel-items') || JSON.stringify([]),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-video-carousel]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const raw = (HTMLAttributes as Record<string, string>)['data-video-carousel-items'] || JSON.stringify([]);
    const videos = parseCarouselVideos(raw);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-video-carousel': '',
        class: 'video-carousel-block',
        style: 'display:flex;justify-content:center;align-items:center;border-radius:0.75rem;overflow:hidden;background:#000',
      }),
      ...videos.map((v, i) => {
        const attrs: Record<string, string> = {
          src: v.src, controls: '', playsinline: '',
          class: 'carousel-slide carousel-slide-video' + (i === 0 ? ' is-active' : ''),
        };
        if (v.poster) attrs.poster = v.poster;
        return ['video', attrs];
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoCarouselView);
  },
});

// ─── Preset colors ─────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  { label: 'Preto', value: '#000000' },
  { label: 'Cinza', value: '#6b7280' },
  { label: 'Branco', value: '#ffffff' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Âmbar', value: '#d97706' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Roxo', value: '#7c3aed' },
  { label: 'Rosa', value: '#db2777' },
];

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick, active, disabled, icon, title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded-md text-sm transition-all',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 self-center shrink-0" />;
}

// ─── Color Picker Popover ─────────────────────────────────────────────────────

function ColorPicker({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!editor) return null;

  const currentColor = editor.getAttributes('textStyle').color || '#000000';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="Cor do texto"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'p-1.5 rounded-md text-sm transition-all flex flex-col items-center gap-0.5',
          open ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
        )}
      >
        <Palette className="w-4 h-4" />
        <div className="w-4 h-1 rounded-full" style={{ backgroundColor: currentColor }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-xl shadow-xl p-3 w-44">
          <p className="text-xs font-medium text-muted-foreground mb-2">Cor do texto</p>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => {
                  editor.chain().focus().setColor(c.value).run();
                  setOpen(false);
                }}
                className={cn(
                  'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                  currentColor === c.value ? 'border-primary scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c.value, boxShadow: c.value === '#ffffff' ? 'inset 0 0 0 1px #e5e7eb' : undefined }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentColor.startsWith('#') ? currentColor : '#000000'}
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              className="w-7 h-7 rounded cursor-pointer border border-border"
              title="Cor personalizada"
            />
            <span className="text-xs text-muted-foreground">Personalizada</span>
          </div>
          <button
            type="button"
            onClick={() => { editor.chain().focus().unsetColor().run(); setOpen(false); }}
            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 justify-center"
          >
            <X className="w-3 h-3" /> Remover cor
          </button>
        </div>
      )}
    </div>
  );
}

// ─── RichTextEditor ───────────────────────────────────────────────────────────

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
  const editorOutputRef = useRef<string>(value);
  const normalizingInstagramRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Comece a escrever sua história aqui...' }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      ResizableImage,
      VideoEmbed,
      ImageGrid,
      ImageCarousel,
      VideoCarousel,
      Underline,
      Highlight.configure({ multicolor: false }),
      Youtube.configure({
        width: 640, height: 360,
        HTMLAttributes: { class: 'w-full rounded-lg my-4' },
        nocookie: true,
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontFamily,
      FontSize,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none p-5 min-h-[380px] focus:outline-none text-foreground',
      },
      transformPastedHTML(html: string) {
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll<HTMLElement>('[style]').forEach(el => {
          el.removeAttribute('style');
        });
        div.querySelectorAll<HTMLElement>('[class]').forEach(el => {
          el.removeAttribute('class');
        });
        div.querySelectorAll<HTMLElement>('font').forEach(el => {
          const span = document.createElement('span');
          span.innerHTML = el.innerHTML;
          el.parentNode?.replaceChild(span, el);
        });

        return normalizeInstagramEmbeds(div.innerHTML);
      },
      handlePaste(view, event) {
        // Safari can skip `transformPastedHTML` for copied rich links. Handle
        // the original clipboard HTML ourselves and insert the parsed node
        // directly, so a post/reel URL never falls back to a normal hyperlink.
        const clipboardHtml = event.clipboardData?.getData('text/html') || '';
        if (!clipboardHtml || !isInstagramUrl(clipboardHtml)) return false;

        const normalized = normalizeInstagramEmbeds(clipboardHtml);
        if (normalized === clipboardHtml) return false;

        event.preventDefault();
        const holder = document.createElement('div');
        holder.innerHTML = normalized;
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(holder);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const normalized = normalizingInstagramRef.current ? html : normalizeInstagramEmbeds(html);
      if (normalized !== html) {
        normalizingInstagramRef.current = true;
        editor.commands.setContent(normalized, false);
        normalizingInstagramRef.current = false;
        editorOutputRef.current = normalized;
        onChange(normalized);
        return;
      }
      editorOutputRef.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === editorOutputRef.current) return;
    editorOutputRef.current = value;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL do link:', prev);
    if (url === null) return;
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('URL da imagem:');
    if (url) editor.chain().focus().setImage({ src: url } as any).run();
  }, [editor]);

  // Upload direto de arquivo (foto/vídeo próprios, não precisam vir do
  // Instagram) — sempre disponível, além do fluxo por link.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingKind, setUploadingKind] = useState<'photo' | 'video' | null>(null);

  const addEditorialPhoto = useCallback(() => photoInputRef.current?.click(), []);
  const addEditorialVideo = useCallback(() => videoInputRef.current?.click(), []);

  // Insere (ou troca) uma foto/vídeo editorial só colando o link do post/reel
  // do Instagram — o servidor baixa e arquiva no Cloudinary, sem precisar
  // baixar o arquivo na máquina do usuário primeiro.
  const [importingInstagram, setImportingInstagram] = useState(false);
  const addFromInstagramLink = useCallback(async () => {
    if (!editor) return;
    const url = (window.prompt('Cole o link do post ou Reel do Instagram:') || '').trim();
    if (!url) return;
    setImportingInstagram(true);
    try {
      const res = await fetch('/api/media/import-instagram', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Falha ao importar (HTTP ${res.status})`);

      if (data.type === 'video') {
        (editor.chain().focus() as any).insertContent({
          type: 'videoEmbed',
          attrs: {
            src: cappedCloudinaryUrl(data.url),
            poster: cloudinaryVideoPoster(data.url),
            editorial: true,
            editorialBadgeHref: data.sourceUrl,
          },
        }).run();
      } else {
        editor.chain().focus().insertContent({
          type: 'image',
          attrs: {
            src: cappedCloudinaryUrl(data.url),
            alt: '',
            editorial: true,
            editorialHref: data.sourceUrl,
            editorialAriaLabel: 'Ver origem oficial',
          },
        }).run();
      }
    } catch (err) {
      alert('Não consegui importar essa mídia: ' + (err as Error).message);
    } finally {
      setImportingInstagram(false);
    }
  }, [editor]);

  const handlePhotoSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setUploadingKind('photo');
    try {
      const compressed = await compressImageFile(file);
      const url = await uploadMediaFile(compressed);
      const sourceUrl = (window.prompt('Link do post/perfil oficial do Instagram (opcional — deixe em branco se for uma foto própria):') || '').trim();
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: {
          src: cappedCloudinaryUrl(url),
          alt: '',
          editorial: true,
          editorialHref: sourceUrl || null,
          editorialAriaLabel: sourceUrl ? 'Ver origem oficial' : null,
        },
      }).run();
    } catch (err) {
      alert('Erro ao enviar a foto: ' + (err as Error).message);
    } finally {
      setUploadingKind(null);
    }
  }, [editor]);

  const handleVideoSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    if (file.size > 4 * 1024 * 1024) {
      alert(
        `Vídeo muito grande (${Math.round(file.size / 1024 / 1024)}MB). ` +
          'Comprima pra no máximo uns 4MB antes de enviar (limite do servidor de upload).',
      );
      return;
    }
    setUploadingKind('video');
    try {
      const url = await uploadMediaFile(file);
      const sourceUrl = (window.prompt('Link do post/reel oficial do Instagram (opcional — deixe em branco se for um vídeo próprio):') || '').trim();
      (editor.chain().focus() as any).insertContent({
        type: 'videoEmbed',
        attrs: {
          src: cappedCloudinaryUrl(url),
          poster: cloudinaryVideoPoster(url),
          editorial: true,
          editorialBadgeHref: sourceUrl || null,
        },
      }).run();
    } catch (err) {
      alert('Erro ao enviar o vídeo: ' + (err as Error).message);
    } finally {
      setUploadingKind(null);
    }
  }, [editor]);

  const addVideo = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Cole o link do vídeo (YouTube, Instagram Reels, Cloudinary ou MP4 direto):');
    if (!url) return;
    if (isInstagramUrl(url)) {
      const embedSrc = toInstagramEmbedUrl(url);
      if (!embedSrc) {
        alert(
          'Links do Instagram não são inseridos como embed (a faixa branca do Instagram não pode ser removida). ' +
            'Baixe a foto/vídeo e suba o arquivo diretamente.',
        );
        return;
      }
      (editor.chain().focus() as any).insertContent({
        type: 'videoEmbed',
        attrs: { src: embedSrc, embedType: 'instagram' },
      }).run();
    } else if (isDirectVideoUrl(url)) {
      (editor.chain().focus() as any).insertContent({
        type: 'videoEmbed',
        attrs: { src: url, embedType: 'video' },
      }).run();
    } else {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  }, [editor]);

  const addImageGrid = useCallback(() => {
    if (!editor) return;
    (editor.chain().focus() as any).insertContent({
      type: 'imageGrid',
      attrs: { images: JSON.stringify(EMPTY_GRID) },
    }).run();
  }, [editor]);

  const addImageCarousel = useCallback(() => {
    if (!editor) return;
    (editor.chain().focus() as any).insertContent({
      type: 'imageCarousel',
      attrs: { images: JSON.stringify([]) },
    }).run();
  }, [editor]);

  const addVideoCarousel = useCallback(() => {
    if (!editor) return;
    (editor.chain().focus() as any).insertContent({
      type: 'videoCarousel',
      attrs: { videos: JSON.stringify([]) },
    }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn('border border-border rounded-lg bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary transition-all', className)}>
      <BubbleMenu editor={editor} className="flex items-center gap-0.5 bg-background border border-border shadow-lg rounded-lg p-1">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold className="w-3.5 h-3.5" />} title="Negrito" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic className="w-3.5 h-3.5" />} title="Itálico" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon className="w-3.5 h-3.5" />} title="Sublinhado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter className="w-3.5 h-3.5" />} title="Destacar" />
        <Divider />
        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<LinkIcon className="w-3.5 h-3.5" />} title="Link" />
      </BubbleMenu>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-2 sticky top-0 z-10">
        {/* Undo / Redo */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} icon={<Undo className="w-4 h-4" />} title="Desfazer" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} icon={<Redo className="w-4 h-4" />} title="Refazer" />
        <Divider />

        {/* Font family */}
        <select
          title="Fonte"
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={e => {
            const v = e.target.value;
            if (!v) (editor.chain().focus() as any).unsetFontFamily().run();
            else (editor.chain().focus() as any).setFontFamily(v).run();
          }}
          className="h-7 rounded border border-border bg-background text-xs px-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Fonte padrão</option>
          <option value="'Lora', serif">Lora (Serif)</option>
          <option value="'Plus Jakarta Sans', sans-serif">Jakarta Sans</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Courier New', monospace">Courier (mono)</option>
        </select>

        {/* Font size */}
        <select
          title="Tamanho"
          value={editor.getAttributes('textStyle').fontSize ?? ''}
          onChange={e => {
            const v = e.target.value;
            if (!v) (editor.chain().focus() as any).unsetFontSize().run();
            else (editor.chain().focus() as any).setFontSize(v).run();
          }}
          className="h-7 w-20 rounded border border-border bg-background text-xs px-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Normal</option>
          <option value="0.75rem">Pequeno</option>
          <option value="0.875rem">Menor</option>
          <option value="1rem">Médio</option>
          <option value="1.125rem">Grande</option>
          <option value="1.25rem">Maior</option>
          <option value="1.5rem">Extra</option>
          <option value="2rem">Destaque</option>
        </select>

        {/* Clear all formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          icon={<Eraser className="w-4 h-4" />}
          title="Limpar toda a formatação do texto selecionado"
        />
        <Divider />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={<Heading1 className="w-4 h-4" />} title="Título 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={<Heading2 className="w-4 h-4" />} title="Título 2" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={<Heading3 className="w-4 h-4" />} title="Título 3" />
        <Divider />

        {/* Formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold className="w-4 h-4" />} title="Negrito" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic className="w-4 h-4" />} title="Itálico" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon className="w-4 h-4" />} title="Sublinhado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} icon={<Strikethrough className="w-4 h-4" />} title="Tachado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter className="w-4 h-4" />} title="Destacar" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} icon={<Code className="w-4 h-4" />} title="Código" />
        <Divider />

        {/* Color */}
        <ColorPicker editor={editor} />
        <Divider />

        {/* Alignment */}
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} icon={<AlignLeft className="w-4 h-4" />} title="Alinhar à esquerda" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} icon={<AlignCenter className="w-4 h-4" />} title="Centralizar" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} icon={<AlignRight className="w-4 h-4" />} title="Alinhar à direita" />
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} icon={<AlignJustify className="w-4 h-4" />} title="Justificar" />
        <Divider />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={<List className="w-4 h-4" />} title="Lista" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={<ListOrdered className="w-4 h-4" />} title="Lista Numerada" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={<Quote className="w-4 h-4" />} title="Citação" />
        <Divider />

        {/* Media */}
        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<LinkIcon className="w-4 h-4" />} title="Link" />
        <ToolbarButton onClick={addImage} icon={<ImageIcon className="w-4 h-4" />} title="Imagem" />
        <ToolbarButton onClick={addImageGrid} icon={<LayoutGrid className="w-4 h-4" />} title="Grade 2 imagens lado a lado" />
        <ToolbarButton onClick={addImageCarousel} icon={<GalleryHorizontal className="w-4 h-4" />} title="Carrossel de fotos" />
        <ToolbarButton onClick={addVideoCarousel} icon={<Film className="w-4 h-4" />} title="Carrossel de vídeos (colando links do Instagram)" />
        <ToolbarButton onClick={addVideo} icon={<YoutubeIcon className="w-4 h-4" />} title="Inserir vídeo (YouTube ou link direto)" />
        <Divider />

        {/* Upload direto de arquivo — foto/vídeo próprios ou baixados do
            Instagram, com link de origem opcional. Máx. 640px aplicado
            automaticamente via Cloudinary, sem crédito visível (só hover). */}
        <ToolbarButton
          onClick={addEditorialPhoto}
          disabled={uploadingKind !== null}
          icon={uploadingKind === 'photo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          title="Enviar foto editorial (arquivo, máx. 640px, com origem opcional do Instagram)"
        />
        <ToolbarButton
          onClick={addEditorialVideo}
          disabled={uploadingKind !== null}
          icon={uploadingKind === 'video' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          title="Enviar vídeo editorial (arquivo, máx. ~4MB, com origem opcional do Instagram)"
        />
        <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={handlePhotoSelected} />
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelected} />

        {/* Cola o link do post/reel do Instagram e o próprio servidor baixa
            e arquiva no Cloudinary — sem precisar baixar o arquivo antes. */}
        <ToolbarButton
          onClick={addFromInstagramLink}
          disabled={importingInstagram}
          icon={importingInstagram ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
          title="Inserir foto/vídeo colando o link do Instagram (sem precisar baixar o arquivo)"
        />

        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={<Minus className="w-4 h-4" />} title="Linha Horizontal" />
      </div>

      <EditorContent editor={editor} />

      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        <span>{editor.getText().length} caracteres</span>
        <span className="flex items-center gap-1">
          <AlignLeft className="w-3 h-3" />
          {editor.getText().split(/\s+/).filter(Boolean).length} palavras
        </span>
      </div>
    </div>
  );
}
