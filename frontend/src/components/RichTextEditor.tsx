import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { useEffect, useCallback, useState, useRef } from 'react'
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
import ImageExt from '@tiptap/extension-image'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3,
  Highlighter, Undo, Redo, Minus, Link as LinkIcon, Table as TableIcon,
  Unlink, ImageIcon, Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  ListChecks, Indent, Outdent, Search, Printer, Quote,
  Palette, RemoveFormatting,
} from 'lucide-react'

// ── Font size / family command type augmentation ────────────────────────────────
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: { setFontSize: (fontSize: string) => ReturnType; unsetFontSize: () => ReturnType }
    fontFamily: { setFontFamily: (fontFamily: string) => ReturnType; unsetFontFamily: () => ReturnType }
  }
}

// ── Inline TipTap extensions ──────────────────────────────────────────────────
const FontSizeExt = Extension.create<{ types: string[] }>({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: {
      default: null,
      parseHTML: el => el.style.fontSize || null,
      renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
    }}}]
  },
  addCommands() {
    return {
      setFontSize: (fs: string) => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize: fs }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { removeEmptyTextStyle: () => { run: () => boolean } } } }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})

const FontFamilyExt = Extension.create<{ types: string[] }>({
  name: 'fontFamily',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontFamily: {
      default: null,
      parseHTML: el => el.style.fontFamily || null,
      renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
    }}}]
  },
  addCommands() {
    return {
      setFontFamily: (ff: string) => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontFamily: ff }).run(),
      unsetFontFamily: () => ({ chain }: { chain: () => { setMark: (n: string, a: object) => { removeEmptyTextStyle: () => { run: () => boolean } } } }) =>
        chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    }
  },
})

const FONT_FAMILIES = [
  { label: 'Documento',      value: '"Times New Roman", Times, serif' },
  { label: 'Sans-serif',     value: 'Inter, -apple-system, sans-serif' },
  { label: 'Monoespaçado',  value: 'ui-monospace, "Courier New", monospace' },
]

const FONT_SIZES = ['8','9','10','11','12','14','16','18','20','24','28','32','36','48','72']

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

// ── Highlight color picker ─────────────────────────────────────────────────────

const HIGHLIGHT_COLORS = [
  { label: 'Amarelo', value: '#fef08a' },
  { label: 'Verde', value: '#bbf7d0' },
  { label: 'Azul', value: '#bfdbfe' },
  { label: 'Rosa', value: '#fecdd3' },
  { label: 'Laranja', value: '#fed7aa' },
  { label: 'Roxo', value: '#e9d5ff' },
]

function HighlightColorPicker({ editor, onClose }: { editor: Editor; onClose: () => void }) {
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
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--v2-ink-strong)' }}>Cor de destaque</p>
      <div className="flex gap-1.5">
        {HIGHLIGHT_COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            onClick={() => { editor.chain().focus().toggleHighlight({ color: c.value }).run(); onClose() }}
            className="w-6 h-6 rounded-full border transition-transform hover:scale-110"
            style={{ background: c.value, borderColor: 'var(--v2-line-soft)' }}
            title={c.label}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => { editor.chain().focus().unsetHighlight().run(); onClose() }}
        className="mt-2 w-full text-center text-xs py-1 rounded-lg transition-colors"
        style={{ color: 'var(--v2-ink-faint)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        Remover destaque
      </button>
    </div>
  )
}

// ── Image dialog ──────────────────────────────────────────────────────────────

function ImageDialog({ onInsertUrl, onClose }: { onInsertUrl: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('')

  return (
    <div className="flex flex-col gap-2" onMouseDown={e => e.stopPropagation()}>
      <p className="text-xs font-semibold" style={{ color: 'var(--v2-ink-soft)' }}>Ou cole uma URL</p>
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { onInsertUrl(url); } if (e.key === 'Escape') onClose() }}
        className="w-full rounded-lg px-3 py-1.5 text-sm outline-none transition-colors"
        style={{
          border: '1px solid var(--v2-line-soft)',
          background: 'rgba(255,255,255,0.9)',
          color: 'var(--v2-ink-strong)',
          fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
        }}
        placeholder="https://exemplo.com/imagem.png"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="v2-btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', minHeight: 'auto' }}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => { if (url.trim()) { onInsertUrl(url); } }}
          disabled={!url.trim()}
          className="v2-btn-primary"
          style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', minHeight: 'auto', opacity: url.trim() ? 1 : 0.5 }}
        >
          Inserir
        </button>
      </div>
    </div>
  )
}

// ── Find & Replace bar ────────────────────────────────────────────────────────

function FindReplaceBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [matchCount, setMatchCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const doFind = useCallback((query: string) => {
    if (!query.trim()) { setMatchCount(0); return }
    const text = editor.getText()
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const matches = text.match(regex)
    setMatchCount(matches?.length ?? 0)
  }, [editor])

  const handleFindChange = useCallback((value: string) => {
    setFindText(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doFind(value), 200)
  }, [doFind])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const doReplace = useCallback(() => {
    if (!findText.trim()) return
    // Use text-level search to find position, then replace via transaction
    const docText = editor.getText()
    const escapedFind = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = docText.match(new RegExp(escapedFind, 'i'))
    if (!match || match.index === undefined) return

    // Walk through document nodes to find the text position
    let pos = 0
    let found = false
    editor.state.doc.descendants((node, nodePos) => {
      if (found || !node.isText) return
      const nodeText = node.text ?? ''
      const localMatch = nodeText.match(new RegExp(escapedFind, 'i'))
      if (localMatch && localMatch.index !== undefined) {
        const from = nodePos + localMatch.index
        const to = from + localMatch[0].length
        editor.chain().focus().insertContentAt({ from, to }, replaceText).run()
        found = true
        setMatchCount(prev => Math.max(0, prev - 1))
      }
    })
  }, [findText, replaceText, editor])

  const doReplaceAll = useCallback(() => {
    if (!findText.trim()) return
    const escapedFind = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedFind, 'gi')
    let replacements = 0

    // Process replacements from end to start to preserve positions
    const positions: Array<{ from: number; to: number }> = []
    editor.state.doc.descendants((node, nodePos) => {
      if (!node.isText) return
      const nodeText = node.text ?? ''
      let m: RegExpExecArray | null
      const localRegex = new RegExp(escapedFind, 'gi')
      while ((m = localRegex.exec(nodeText)) !== null) {
        positions.push({ from: nodePos + m.index, to: nodePos + m.index + m[0].length })
      }
    })

    // Apply from end to start
    for (let i = positions.length - 1; i >= 0; i--) {
      editor.chain().focus().insertContentAt(positions[i], replaceText).run()
      replacements++
    }

    if (replacements > 0) setMatchCount(0)
  }, [findText, replaceText, editor])

  return (
    <div
      className="flex items-center flex-wrap gap-2 px-3 py-2"
      style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,252,247,0.92)' }}
    >
      <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--v2-ink-faint)' }} />
      <input
        type="text"
        value={findText}
        onChange={e => handleFindChange(e.target.value)}
        placeholder="Localizar..."
        autoFocus
        className="rounded-lg px-2 py-1 text-xs outline-none flex-1 min-w-[100px]"
        style={{
          border: '1px solid var(--v2-line-soft)',
          background: 'rgba(255,255,255,0.9)',
          color: 'var(--v2-ink-strong)',
          fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
          maxWidth: '180px',
        }}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      />
      <input
        type="text"
        value={replaceText}
        onChange={e => setReplaceText(e.target.value)}
        placeholder="Substituir por..."
        className="rounded-lg px-2 py-1 text-xs outline-none flex-1 min-w-[100px]"
        style={{
          border: '1px solid var(--v2-line-soft)',
          background: 'rgba(255,255,255,0.9)',
          color: 'var(--v2-ink-strong)',
          fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
          maxWidth: '180px',
        }}
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      />
      <span className="text-[10px] tabular-nums" style={{ color: 'var(--v2-ink-faint)' }}>
        {matchCount} resultado{matchCount !== 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={doReplace}
        disabled={matchCount === 0}
        className="px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors"
        style={{
          border: '1px solid var(--v2-line-soft)',
          color: matchCount > 0 ? 'var(--v2-ink-strong)' : 'var(--v2-ink-faint)',
          background: 'rgba(255,255,255,0.8)',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
        }}
      >
        Substituir
      </button>
      <button
        type="button"
        onClick={doReplaceAll}
        disabled={matchCount === 0}
        className="px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors"
        style={{
          border: '1px solid var(--v2-line-soft)',
          color: matchCount > 0 ? 'var(--v2-ink-strong)' : 'var(--v2-ink-faint)',
          background: 'rgba(255,255,255,0.8)',
          cursor: matchCount > 0 ? 'pointer' : 'not-allowed',
        }}
      >
        Substituir tudo
      </button>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-[10px] px-1.5 py-0.5 rounded-lg"
        style={{ color: 'var(--v2-ink-faint)' }}
      >
        ✕
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
  const [showHighlightColor, setShowHighlightColor] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const closeAllPopovers = useCallback((except?: string) => {
    if (except !== 'link') setShowLink(false)
    if (except !== 'color') setShowColor(false)
    if (except !== 'highlight') setShowHighlightColor(false)
    if (except !== 'image') setShowImageDialog(false)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      FontSizeExt,
      FontFamilyExt,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ImageExt.configure({ inline: false, allowBase64: true }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
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

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      editor.chain().focus().setImage({ src: result, alt: file.name }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [editor])

  const insertImageFromUrl = useCallback((url: string) => {
    if (!url.trim() || !editor) return
    editor.chain().focus().setImage({ src: url.trim() }).run()
  }, [editor])

  const handlePrint = useCallback(() => {
    const printWin = window.open('', '_blank')
    if (!printWin || !editor) return
    const html = editor.getHTML()
    printWin.document.write(`<!DOCTYPE html><html><head><title>Imprimir documento</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  body { font-family: 'Times New Roman', Times, Georgia, serif; font-size: 12pt; line-height: 1.85; color: #1a1a1a; max-width: 794px; margin: 40px auto; padding: 0 40px; }
  h1 { font-size: 1.5rem; font-weight: 700; } h2 { font-size: 1.25rem; font-weight: 600; } h3 { font-size: 1.0625rem; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; height: auto; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
  ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.25rem; }
  @media print { body { margin: 0; padding: 0; } }
</style></head><body>${html}</body></html>`)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => { printWin.print(); printWin.close() }, 400)
  }, [editor])

  const clearFormatting = useCallback(() => {
    editor?.chain().focus().clearNodes().unsetAllMarks().run()
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

          {/* Font family */}
          <select
            value={editor.getAttributes('textStyle').fontFamily || '"Times New Roman", Times, serif'}
            onChange={e => editor.chain().focus().setFontFamily(e.target.value).run()}
            title="Fonte"
            className="rounded px-1.5 py-1 text-xs outline-none cursor-pointer"
            style={{
              border: '1px solid var(--v2-line-soft)',
              background: 'var(--v2-panel-strong)',
              color: 'var(--v2-ink-strong)',
              fontFamily: 'var(--v2-font-sans)',
              maxWidth: '112px',
            }}
          >
            {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>

          {/* Font size */}
          <select
            value={editor.getAttributes('textStyle').fontSize?.replace('pt', '') || '12'}
            onChange={e => editor.chain().focus().setFontSize(e.target.value + 'pt').run()}
            title="Tamanho da fonte"
            className="rounded px-1.5 py-1 text-xs outline-none cursor-pointer"
            style={{
              border: '1px solid var(--v2-line-soft)',
              background: 'var(--v2-panel-strong)',
              color: 'var(--v2-ink-strong)',
              fontFamily: 'var(--v2-font-sans)',
              width: '52px',
            }}
          >
            {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

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
          <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="Subscrito">
            <SubscriptIcon className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="Sobrescrito">
            <SuperscriptIcon className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Highlight with color picker */}
          <div className="relative">
            <Btn
              onClick={() => { setShowHighlightColor(v => !v); setShowColor(false); setShowLink(false); setShowImageDialog(false) }}
              isActive={editor.isActive('highlight') || showHighlightColor}
              title="Destaque / Marca-texto"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </Btn>
            {showHighlightColor && <HighlightColorPicker editor={editor} onClose={() => setShowHighlightColor(false)} />}
          </div>

          {/* Text color */}
          <div className="relative">
            <Btn onClick={() => { setShowColor(v => !v); setShowLink(false); setShowHighlightColor(false); setShowImageDialog(false) }} title="Cor do texto" isActive={showColor}>
              <Palette className="w-3.5 h-3.5" />
            </Btn>
            {showColor && <ColorPicker editor={editor} onClose={() => setShowColor(false)} />}
          </div>

          {/* Clear formatting */}
          <Btn onClick={clearFormatting} title="Limpar formatação">
            <RemoveFormatting className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Link */}
          <div className="relative">
            <Btn
              onClick={() => { setShowLink(v => !v); setShowColor(false); setShowHighlightColor(false); setShowImageDialog(false) }}
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

          {/* Image */}
          <div className="relative">
            <Btn
              onClick={() => { setShowImageDialog(v => !v); setShowColor(false); setShowLink(false); setShowHighlightColor(false) }}
              isActive={showImageDialog}
              title="Inserir imagem"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </Btn>
            {showImageDialog && (
              <div
                className="absolute top-full left-0 mt-1 p-3 z-20 flex flex-col gap-2 rounded-xl"
                style={{
                  background: 'var(--v2-panel-strong)',
                  border: '1px solid var(--v2-line-soft)',
                  boxShadow: '0 8px 32px rgba(15,23,42,0.12)',
                  width: '18rem',
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>Inserir imagem</p>
                <button
                  type="button"
                  onClick={() => { imageInputRef.current?.click(); setShowImageDialog(false) }}
                  className="v2-btn-secondary w-full justify-center"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', minHeight: 'auto' }}
                >
                  Enviar arquivo do computador
                </button>
                <div className="v2-divider" />
                <ImageDialog onInsertUrl={(url) => { insertImageFromUrl(url); setShowImageDialog(false) }} onClose={() => setShowImageDialog(false)} />
              </div>
            )}
          </div>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

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

          {/* Indent / Outdent */}
          <Btn
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
            disabled={!editor.can().sinkListItem('listItem')}
            title="Aumentar recuo"
          >
            <Indent className="w-3.5 h-3.5" />
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
            disabled={!editor.can().liftListItem('listItem')}
            title="Diminuir recuo"
          >
            <Outdent className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Lists */}
          <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista com marcadores">
            <List className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Lista numerada">
            <ListOrdered className="w-3.5 h-3.5" />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="Lista de tarefas">
            <ListChecks className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Block quote */}
          <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citação em bloco">
            <Quote className="w-3.5 h-3.5" />
          </Btn>

          {/* Table */}
          <Btn onClick={insertTable} title="Inserir tabela (3×3)">
            <TableIcon className="w-3.5 h-3.5" />
          </Btn>

          {/* Horizontal rule */}
          <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Linha horizontal">
            <Minus className="w-3.5 h-3.5" />
          </Btn>

          <Sep />

          {/* Find & Replace */}
          <Btn onClick={() => setShowFindReplace(v => !v)} isActive={showFindReplace} title="Localizar e substituir (Ctrl+H)">
            <Search className="w-3.5 h-3.5" />
          </Btn>

          {/* Print */}
          <Btn onClick={handlePrint} title="Imprimir (Ctrl+P)">
            <Printer className="w-3.5 h-3.5" />
          </Btn>
        </div>
      )}

      {/* Find & Replace bar */}
      {editable && showFindReplace && (
        <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
      )}

      {/* Editor content area */}
      <div
        className={editable ? 'doc-canvas' : 'flex-1 overflow-y-auto'}
        style={editable ? undefined : { background: 'transparent' }}
        onClick={() => closeAllPopovers()}
      >
        {editable ? (
          <div className="doc-page">
            <EditorContent editor={editor} />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
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
            Ctrl+B negrito · Ctrl+I itálico · Ctrl+U sublinhado · Ctrl+H localizar
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--v2-ink-faint)' }}>
            {wordCount} palavras · {charCount} caracteres
          </span>
        </div>
      )}
    </div>
  )
}
