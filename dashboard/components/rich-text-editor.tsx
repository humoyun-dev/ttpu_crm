"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Yozing...",
  className,
  minHeight = "120px",
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class: "outline-none",
      },
    },
    immediatelyRender: false,
  });

  if (!editor) return null;

  const tools = [
    {
      icon: Bold,
      title: "Qalin (Ctrl+B)",
      active: editor.isActive("bold"),
      action: () => editor.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      title: "Kursiv (Ctrl+I)",
      active: editor.isActive("italic"),
      action: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      icon: List,
      title: "Bullet ro'yxat",
      active: editor.isActive("bulletList"),
      action: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      title: "Raqamli ro'yxat",
      active: editor.isActive("orderedList"),
      action: () => editor.chain().focus().toggleOrderedList().run(),
    },
  ];

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background text-sm focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
        {tools.map((tool, i) => (
          <button
            key={i}
            type="button"
            title={tool.title}
            onClick={tool.action}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              tool.active && "bg-muted text-foreground",
            )}
          >
            <tool.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          title="Formatlashni tozalash"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="px-3 py-2 [&_.tiptap]:focus:outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
