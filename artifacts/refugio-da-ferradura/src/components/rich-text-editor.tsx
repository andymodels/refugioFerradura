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
import { mergeAttributes } from '@tiptap/core';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Minus, Code, Highlighter, AlignLeft, Youtube as YoutubeIcon
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
    <NodeViewWrapper
      className="relative my-4 inline-block"
      style={{ display: 'block' }}
      data-drag-handle
    >
      <div className={cn('relative inline-block', selected && 'outline outline-2 outline-blue-500 rounded-lg')}>
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ''}
          title={node.attrs.title ?? undefined}
          style={style}
          className="rounded-lg"
          draggable={false}
        />

        {/* Right-edge resize handle */}
        {selected && (
          <div
            onMouseDown={onMouseDownHandle}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 flex items-center justify-center cursor-ew-resize"
            style={{ width: 16, height: 40 }}
          >
            <div className="w-2 h-8 bg-white border border-blue-500 rounded shadow-md" />
          </div>
        )}

        {/* Width badge */}
        {selected && widthVal && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
            {widthVal}px
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Custom Image extension with resizable node view
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

// ─── Toolbar helpers ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick, active, disabled, icon, title
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
        "p-1.5 rounded-md text-sm transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
        disabled && "opacity-30 cursor-not-allowed"
      )}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 self-center shrink-0" />;
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
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: 'Comece a escrever sua história aqui...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      ResizableImage,
      Underline,
      Highlight.configure({ multicolor: false }),
      Youtube.configure({
        width: 640,
        height: 360,
        HTMLAttributes: { class: 'w-full rounded-lg my-4' },
        nocookie: true,
      }),
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
    editor.commands.setContent(value || "", false);
  }, [value, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href || '';
    const url = window.prompt('URL do link:', prev);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
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

  if (!editor) return null;

  return (
    <div className={cn("border border-border rounded-lg bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary transition-all", className)}>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 bg-background border border-border shadow-lg rounded-lg p-1"
      >
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold className="w-3.5 h-3.5" />} title="Negrito" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic className="w-3.5 h-3.5" />} title="Itálico" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon className="w-3.5 h-3.5" />} title="Sublinhado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter className="w-3.5 h-3.5" />} title="Destacar" />
        <Divider />
        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<LinkIcon className="w-3.5 h-3.5" />} title="Link" />
      </BubbleMenu>

      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-2 sticky top-0 z-10">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} icon={<Undo className="w-4 h-4" />} title="Desfazer" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} icon={<Redo className="w-4 h-4" />} title="Refazer" />
        <Divider />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={<Heading1 className="w-4 h-4" />} title="Título 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={<Heading2 className="w-4 h-4" />} title="Título 2" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={<Heading3 className="w-4 h-4" />} title="Título 3" />
        <Divider />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold className="w-4 h-4" />} title="Negrito" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic className="w-4 h-4" />} title="Itálico" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon className="w-4 h-4" />} title="Sublinhado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} icon={<Strikethrough className="w-4 h-4" />} title="Tachado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter className="w-4 h-4" />} title="Destacar" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} icon={<Code className="w-4 h-4" />} title="Código" />
        <Divider />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={<List className="w-4 h-4" />} title="Lista" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={<ListOrdered className="w-4 h-4" />} title="Lista Numerada" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={<Quote className="w-4 h-4" />} title="Citação" />
        <Divider />
        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<LinkIcon className="w-4 h-4" />} title="Link" />
        <ToolbarButton onClick={addImage} icon={<ImageIcon className="w-4 h-4" />} title="Imagem" />
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
