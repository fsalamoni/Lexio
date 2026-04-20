import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { useEffect, useCallback, useState } from 'react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Highlighter, Undo, Redo, Minus, Link as LinkIcon, Table as TableIcon,
  Unlink, Type,
} from 'lucide-react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  onWordCount?: (words: number, chars: number) => void
}

// ── Toolbar primitives ────────────────────────────────────────────────────────

function Btn({
  onClick,
  isActive = false,
  title,
  children,
  disabled = false,
}: {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      disabled={disabled}
      className="flex items-center justify-center w-7 h-7 rounded-lg transition-all"
      style={{
        background: isActive ? 'rgba(15,118,110,0.12)' : 'transparent',
        color: isActive ? 'var(--v2-accent-strong)' : 'var(--v2-ink-soft)',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
      }}
      onMouseEnter={e => {
        if (!isActive && !disabled)
          e.currentTarget.style.background = 'rgba(15,23,42,0.07)'
      }}
      onMouseLeave={e => {
        if (!isActive)
          e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function Sep() {
  return (
    <div
      className="self-stretch"
      style={{ width: '1px', background: 'var(--v2-line-soft)', margin: '0 2px' }}
    />
  )
}

// ── Link dialog ───────────────────────────────────────────────────────────────

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = editor.getAttributes('link').href as string | undefined
  const [url, setUrl] = useState(existing ?? 'https://')

  const apply = () => {
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim(), target: '_blank' }).run()
    }
    onClose()
  }

  const remove = () => {
    editor.chain().focus().unsetLink().run()
    onClose()
  }

  return (
    <div
      className="absolute top-full left-0 mt-1 p-3 z-20 flex flex-col gap-2 rounded-xl"
      style={{
        background: 'var(--v2-panel-strong)',
        border: '1px solid var(--v2-line-soft)',
        boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
        width: '20rem',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <p className="text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>Inserir link</p>
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') onClose() }}
        autoFocus
        className="w-full rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
        style={{
          border: '1px solid var(--v2-line-soft)',
          background: 'rgba(255,255,255,0.9)',
          color: 'var(--v2-ink-strong)',
          fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--v2-accent-strong)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--v2-line-soft)')}
        placeholder="https://..."
      />
      <div className="flex gap-2 justify-end">
        {existing && (
          <button
            type="button"
            onClick={remove}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'rgb(220,38,38)', border: '1px solid rgba(220,38,38,0.25)', background: 'transparent' }}
          >
            Remover
          </button>
        )}
        <button type="button" onClick={onClose} className="v2-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>
          Cancelar
        </button>
        <button type="button" onClick={apply} className="v2-btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>
          Aplicar
        </button>
      </div>
    </div>
  )
}

// ── Color picker ──────────────────────────────────────────────────────────────

const PALETTE = [
  '#0f172a', '#374151', '#6b7280', '#9ca3af', '#d1d5db',
  '#dc2626', '#ea580c', '#d97706', '#65a30d', '#16a34a',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#be123c',
]

function ColorPicker({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  return (
    <div
      className="absolute top-full left-0 mt-1 p-3 z-20 rounded-xl"
      style={{
        background: 'var(--v2-panel-strong)',
        border: '1px solid var(--v2-line-soft)',
        boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--v2-ink-strong)' }}>Cor do texto</p>
      <div className="grid grid-cols-5 gap-1.5">
        {PALETTE.map(color => (
          <button
            key={color}
            type="button"
            onClick={() => { editor.chain().focus().setColor(color).run(); onClose() }}
            className="w-6 h-6 rounded-full border transition-transform hover:scale-110"
            style={{ background: color, borderColor: 'var(--v2-line-soft)' }}
            title={color}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => { editor.chain().focus().unsetColor().run(); onClose() }}
        className="mt-2 w-full text-center text-xs py-1 rounded-lg transition-colors"
        style={{ color: 'var(--v2-ink-faint)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        Remover cor
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Comece a editar o documento...',
  editable = true,
  onWordCount,
}: RichTextEditorProps) {
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [showLink, setShowLink] = useState(false)
  const [showColor, setShowColor] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
      const text = editor.getText()
      const words = text.trim() ? text.trim().split(/\s+/).length : 0
      const chars = text.length
      setWordCount(words)
      setCharCount(chars)
      onWordCount?.(words, chars)
    },
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
  })

  // Sync external content changes (e.g., initial load)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (current !== content) {
      editor.commands.setContent(content)
    }
  // We intentionally skip `editor` in deps — it changes each render otherwise
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl"
      style={{
        border: '1px solid var(--v2-line-soft)',
        background: 'var(--v2-panel-strong)',
        fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
      }}
    >
      {/* Toolbar */}
      {editable && (
        <div
          className="flex items-center flex-wrap gap-0.5 px-3 py-2"
          style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.75)' }}
        >
          {/* Undo / Redo */}
          <Btn onClick={() => editor.chain().focus().undo().run()} title="Desfazer (Ctrl+Z)" disabled={!editor.can().undo()}>
            <Undo className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().redo().run()} title="Refazer (Ctrl+Y)" disabled={!editor.can().redo()}>
            <Redo className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Headings */}
          <Btn
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Título 1"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Título 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Título 3"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Inline formatting */}
          <Btn onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito (Ctrl+B)">
            <Bold className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico (Ctrl+I)">
            <Italic className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Sublinhado (Ctrl+U)">
            <UnderlineIcon className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado">
            <Strikethrough className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive('highlight')} title="Destaque">
            <Highlighter className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Text color */}
          <div className="relative">
            <Btn onClick={() => { setShowColor(v => !v); setShowLink(false) }} title="Cor do texto" isActive={showColor}>
              <Type className="w-3.5 h-3.5" />
            </Btn>
            {showColor && <ColorPicker editor={editor} onClose={() => setShowColor(false)} />}
          </div>

          {/* Link */}
          <div className="relative">
            <Btn
              onClick={() => { setShowLink(v => !v); setShowColor(false) }}
              isActive={editor.isActive('link') || showLink}
              title="Inserir/editar link"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </Btn>
            {showLink && <LinkDialog editor={editor} onClose={() => setShowLink(false)} />}
          </div>
          {editor.isActive('link') && (
            <Btn onClick={() => editor.chain().focus().unsetLink().run()} title="Remover link">
              <Unlink className="w-3.5 h-3.5" />
            </Btn>
          )}

          <Sep />

          {/* Alignment */}
          <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Alinhar à esquerda">
            <AlignLeft className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Centralizar">
            <AlignCenter className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Alinhar à direita">
            <AlignRight className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Justificar">
            <AlignJustify className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Lists */}
          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista com marcadores">
            <List className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista numerada">
            <ListOrdered className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Table */}
          <Btn onClick={insertTable} title="Inserir tabela (3×3)">
            <TableIcon className="w-3.5 h-3.5" />
          </Btn>

          {/* Horizontal rule */}
          <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
            <Minus className="w-3.5 h-3.5" />
          </Btn>
        </div>
      )}

      {/* Editor content area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: editable ? 'rgba(255,255,255,0.97)' : 'transparent' }}
        onClick={() => { setShowLink(false); setShowColor(false) }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Status bar */}
      {editable && (
        <div
          className="flex items-center justify-between px-4 py-1.5 select-none"
          style={{
            borderTop: '1px solid var(--v2-line-soft)',
            background: 'rgba(255,255,255,0.6)',
          }}
        >
          <span className="text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>
            Ctrl+B negrito · Ctrl+I itálico · Ctrl+U sublinhado
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--v2-ink-faint)' }}>
            {wordCount} palavras · {charCount} caracteres
          </span>
        </div>
      )}
    </div>
  )
}
