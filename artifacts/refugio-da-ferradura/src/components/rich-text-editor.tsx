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
import { mergeAttributes, Node } from '@tiptap/core';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Minus, Code, Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Youtube as YoutubeIcon, LayoutGrid, Palette, X,
} from 'lucide-react';
import { cn } from './ui-elements';

// ─── Resizable Image NodeView ─────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{ x: number; w: number } | null>(null);

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
      updateAttributes({ width: newW });
    };
    const onUp = () => {
      startRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [node.attrs.width, updateAttributes]);

  const widthVal = node.attrs.width;
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
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
}).configure({
  HTMLAttributes: { class: 'rounded-lg' },
  inline: false,
});

// ─── Two-Column Image Grid Node ───────────────────────────────────────────────

function ImageGridView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src1, src2, alt1, alt2 } = node.attrs;

  const promptUrl = (slot: 1 | 2) => {
    const current = slot === 1 ? src1 : src2;
    const url = window.prompt(`URL da imagem ${slot}:`, current || '');
    if (url === null) return;
    if (slot === 1) updateAttributes({ src1: url });
    else updateAttributes({ src2: url });
  };

  return (
    <NodeViewWrapper data-drag-handle className="my-4">
      <div
        className={cn(
          'grid grid-cols-2 gap-3 rounded-lg',
          selected && 'outline outline-2 outline-blue-500 rounded-lg'
        )}
      >
        {([1, 2] as const).map((slot) => {
          const src = slot === 1 ? src1 : src2;
          const alt = slot === 1 ? alt1 : alt2;
          return (
            <div
              key={slot}
              onClick={() => promptUrl(slot)}
              className={cn(
                'relative overflow-hidden rounded-lg aspect-[4/3] cursor-pointer group',
                !src && 'border-2 border-dashed border-border bg-muted flex items-center justify-center'
              )}
            >
              {src ? (
                <>
                  <img src={src} alt={alt || ''} className="w-full h-full object-cover rounded-lg" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                    <span className="text-white text-xs font-medium bg-black/60 px-2 py-1 rounded">Trocar imagem</span>
                  </div>
                </>
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">Clique para adicionar imagem {slot}</p>
                </div>
              )}
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
      src1: { default: '' },
      src2: { default: '' },
      alt1: { default: '' },
      alt2: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-image-grid]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { src1, src2, alt1, alt2 } = HTMLAttributes;
    return [
      'div',
      mergeAttributes({ 'data-image-grid': '', class: 'image-grid-2col' }),
      ['img', { src: src1 || '', alt: alt1 || '', class: 'image-grid-img' }],
      ['img', { src: src2 || '', alt: alt2 || '', class: 'image-grid-img' }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageGridView);
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'Comece a escrever sua história aqui...' }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      ResizableImage,
      ImageGrid,
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
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none p-5 min-h-[380px] focus:outline-none text-foreground',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
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

  const addYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Cole o link do vídeo do YouTube:');
    if (!url) return;
    editor.chain().focus().setYoutubeVideo({ src: url }).run();
  }, [editor]);

  const addImageGrid = useCallback(() => {
    if (!editor) return;
    (editor.chain().focus() as any).insertContent({
      type: 'imageGrid',
      attrs: { src1: '', src2: '', alt1: '', alt2: '' },
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
        <ToolbarButton onClick={addYoutube} icon={<YoutubeIcon className="w-4 h-4" />} title="Vídeo YouTube" />
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
