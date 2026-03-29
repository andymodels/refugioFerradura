import React, { useRef, useState, useEffect } from 'react';
import { Bold, Italic, Heading2, List, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { cn } from './ui-elements';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function RichTextEditor({ value, onChange, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML && !isFocused) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value, isFocused]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    handleInput();
  };

  const handleLink = () => {
    const url = prompt('Enter link URL:');
    if (url) execCommand('createLink', url);
  };

  const handleImage = () => {
    const url = prompt('Enter image URL:');
    if (url) execCommand('insertImage', url);
  };

  return (
    <div className={cn("border border-border rounded-sm bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:border-primary transition-all", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/50 p-2">
        <ToolbarButton onClick={() => execCommand('bold')} icon={<Bold className="w-4 h-4" />} title="Bold" />
        <ToolbarButton onClick={() => execCommand('italic')} icon={<Italic className="w-4 h-4" />} title="Italic" />
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton onClick={() => execCommand('formatBlock', 'H2')} icon={<Heading2 className="w-4 h-4" />} title="Heading 2" />
        <ToolbarButton onClick={() => execCommand('insertUnorderedList')} icon={<List className="w-4 h-4" />} title="Bullet List" />
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton onClick={handleLink} icon={<LinkIcon className="w-4 h-4" />} title="Link" />
        <ToolbarButton onClick={handleImage} icon={<ImageIcon className="w-4 h-4" />} title="Image" />
      </div>
      <div
        ref={editorRef}
        contentEditable
        className="prose-editor p-4 min-h-[300px] text-sm text-foreground bg-background"
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          handleInput();
        }}
        data-placeholder="Comece a escrever sua história aqui..."
      />
    </div>
  );
}

function ToolbarButton({ onClick, icon, title }: { onClick: () => void, icon: React.ReactNode, title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-border/50 rounded-sm transition-colors"
    >
      {icon}
    </button>
  );
}
