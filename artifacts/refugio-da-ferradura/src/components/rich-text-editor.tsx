import React, { useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Minus, Code, Highlighter, AlignLeft
} from 'lucide-react';
import { cn } from './ui-elements';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

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

export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
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
      Image.configure({
        HTMLAttributes: { class: 'max-w-full rounded-lg my-4' },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-stone max-w-none p-5 min-h-[380px] focus:outline-none text-foreground',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes into the editor (e.g. from AI generation)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", false);
    }
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
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn("border border-border rounded-lg bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/30 focus-within:border-primary transition-all", className)}>
      {/* Bubble Menu (appears on text selection) */}
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

      {/* Main Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 p-2 sticky top-0 z-10">
        {/* History */}
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} icon={<Undo className="w-4 h-4" />} title="Desfazer" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} icon={<Redo className="w-4 h-4" />} title="Refazer" />
        <Divider />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={<Heading1 className="w-4 h-4" />} title="Título 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={<Heading2 className="w-4 h-4" />} title="Título 2" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} icon={<Heading3 className="w-4 h-4" />} title="Título 3" />
        <Divider />

        {/* Text formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={<Bold className="w-4 h-4" />} title="Negrito" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={<Italic className="w-4 h-4" />} title="Itálico" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} icon={<UnderlineIcon className="w-4 h-4" />} title="Sublinhado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} icon={<Strikethrough className="w-4 h-4" />} title="Tachado" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} icon={<Highlighter className="w-4 h-4" />} title="Destacar" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} icon={<Code className="w-4 h-4" />} title="Código" />
        <Divider />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={<List className="w-4 h-4" />} title="Lista" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={<ListOrdered className="w-4 h-4" />} title="Lista Numerada" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} icon={<Quote className="w-4 h-4" />} title="Citação" />
        <Divider />

        {/* Media */}
        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<LinkIcon className="w-4 h-4" />} title="Link" />
        <ToolbarButton onClick={addImage} icon={<ImageIcon className="w-4 h-4" />} title="Imagem" />
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} icon={<Minus className="w-4 h-4" />} title="Linha Horizontal" />
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Status Bar */}
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
