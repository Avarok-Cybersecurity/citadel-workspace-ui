import React from 'react';
import { useEditor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Quote,
  Code,
  Undo,
  Redo,
} from 'lucide-react';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
}

function ToolbarButton({ icon, onClick, active, disabled, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        p-1.5 rounded transition-colors
        ${active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-white/10 text-muted-foreground hover:text-foreground'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      title={title}
    >
      {icon}
    </button>
  );
}

export function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-surface/50 bg-background">
      <ToolbarButton
        icon={<Bold className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title="Bold"
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title="Italic"
      />
      <ToolbarButton
        icon={<Strikethrough className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title="Strikethrough"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<Heading1 className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      />
      <ToolbarButton
        icon={<Heading2 className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        title="Bullet List"
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        title="Numbered List"
      />

      <div className="w-px h-5 bg-gray-600/50 mx-1" />

      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive('blockquote')}
        title="Blockquote"
      />
      <ToolbarButton
        icon={<Code className="h-4 w-4" />}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive('codeBlock')}
        title="Code Block"
      />

      <div className="flex-1" />

      <ToolbarButton
        icon={<Undo className="h-4 w-4" />}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      />
      <ToolbarButton
        icon={<Redo className="h-4 w-4" />}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      />
    </div>
  );
}
