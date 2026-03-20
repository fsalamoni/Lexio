import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, Clock, RefreshCw, X, Trash2, Info, Eye, BookOpen, Sparkles, Loader2, Save, Edit3, Tags, Search, Filter, ChevronDown } from 'lucide-react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  listAcervoDocuments,
  createAcervoDocument,
  deleteAcervoDocument,
  updateAcervoEmenta,
  updateAcervoTags,
  updateAcervoTextContent,
  getSettings,
  loadAdminLegalAreas,
  type AcervoDocumentData,
  type AdminLegalArea,
} from '../lib/firestore-service'
import { generateAcervoEmenta, generateAcervoTags, NATUREZA_OPTIONS, type NaturezaValue } from '../lib/generation-service'
import { getAssuntosForAreas, getTiposForClassification } from '../lib/classification-data'

interface UploadedFile {
  id: string
  filename: string
  size_bytes: number
  chunks_indexed: number
  collection_name: string | null
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  indexing:    { label: 'Indexando...', icon: Clock,         color: 'text-yellow-500' },
  indexed:     { label: 'Indexado',    icon: CheckCircle,    color: 'text-green-500'  },
  index_empty: { label: 'Sem texto',   icon: AlertCircle,    color: 'text-amber-500'  },
  index_error: { label: 'Erro',        icon: AlertCircle,    color: 'text-red-500'    },
  uploaded:    { label: 'Enviado',     icon: CheckCircle,    color: 'text-blue-500'   },
}

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt', '.doc', '.md']
const ACCEPTED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword', 'text/plain', 'text/markdown']
const MAX_SIZE_MB = 50

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Document view modal ──────────────────────────────────────────────────────

function AcervoDocModal({ doc, onClose, onTextSaved }: { doc: AcervoDocumentData; onClose: () => void; onTextSaved?: (text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(doc.text_content || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!onTextSaved) return
    setSaving(true)
    try {
      onTextSaved(text)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900 truncate text-sm">{doc.filename}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Meta */}
        <div className="flex gap-4 px-5 py-2 border-b bg-gray-50 text-xs text-gray-500">
          <span>{formatSize(doc.size_bytes)}</span>
          {doc.chunks_count > 0 && <span>{doc.chunks_count} fragmentos</span>}
          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="w-full h-full min-h-[300px] border rounded-lg p-3 text-sm text-gray-800 font-sans leading-relaxed focus:ring-2 focus:ring-teal-300 focus:border-teal-400 outline-none resize-y"
            />
          ) : doc.text_content ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{doc.text_content}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <AlertCircle className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium">Sem conteúdo de texto</p>
              <p className="text-xs mt-1">Este documento não possui texto extraível (ex.: PDF escaneado ou formato binário sem suporte).</p>
            </div>
          )}
        </div>
        {/* Actions */}
        {onTextSaved && (
          <div className="flex items-center justify-end px-5 py-3 border-t bg-gray-50 gap-2">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setEditing(false); setText(doc.text_content || '') }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Ementa view/edit modal ───────────────────────────────────────────────────

function EmentaModal({
  doc,
  apiKey,
  onClose,
  onSaved,
}: {
  doc: AcervoDocumentData
  apiKey: string
  onClose: () => void
  onSaved: (ementa: string, keywords: string[]) => void
}) {
  const [ementa, setEmenta] = useState(doc.ementa || '')
  const [keywords, setKeywords] = useState((doc.ementa_keywords || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(false)

  const handleGenerate = async () => {
    if (!doc.text_content) return
    setGenerating(true)
    try {
      const result = await generateAcervoEmenta(apiKey, doc.filename, doc.text_content)
      setEmenta(result.ementa)
      setKeywords(result.keywords.join(', '))
      setEditing(true)
    } catch (err) {
      console.error('Erro ao gerar ementa:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!doc.id) return
    setSaving(true)
    try {
      const kws = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      // onSaved calls updateAcervoEmenta externally with uid
      onSaved(ementa, kws)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-indigo-500 flex-shrink-0" />
            <span className="font-semibold text-gray-900 text-sm">Ementa</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* File info */}
        <div className="flex gap-4 px-5 py-2 border-b bg-gray-50 text-xs text-gray-500">
          <span className="truncate font-medium">{doc.filename}</span>
          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {ementa || editing ? (
            <>
              {editing ? (
                <textarea
                  value={ementa}
                  onChange={e => setEmenta(e.target.value)}
                  rows={8}
                  className="w-full border rounded-lg p-3 text-sm text-gray-800 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none resize-y"
                  placeholder="Digite a ementa do documento..."
                />
              ) : (
                <div className="bg-indigo-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {ementa}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Palavras-chave</label>
                {editing ? (
                  <input
                    type="text"
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none"
                    placeholder="nepotismo, cargo político, súmula vinculante 13"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.split(',').map((kw, i) => kw.trim() && (
                      <span key={i} className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{kw.trim()}</span>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <BookOpen className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium">Nenhuma ementa</p>
              <p className="text-xs mt-1">Gere automaticamente ou redija manualmente.</p>
              <button
                onClick={() => setEditing(true)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Redigir Manualmente
              </button>
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !doc.text_content}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {ementa ? 'Regerar' : 'Gerar Ementa'}
          </button>
          <div className="flex gap-2">
            {ementa && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
            )}
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tags view/edit modal ────────────────────────────────────────────────────

const NATUREZA_LABELS: Record<string, string> = Object.fromEntries(
  NATUREZA_OPTIONS.map(o => [o.value, o.label]),
)

/** Multi-select dropdown component for standardized tag selection. */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
  colorClass = 'bg-blue-100 text-blue-700',
  disabled = false,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  colorClass?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o)
  )

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value))
    } else {
      onChange([...selected, value])
    }
    setSearch('')
  }

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      <div
        className={`min-h-[38px] border rounded-lg px-2 py-1.5 flex flex-wrap gap-1 items-center cursor-pointer ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-teal-400'}`}
        onClick={() => !disabled && setOpen(!open)}
      >
        {selected.length === 0 && (
          <span className="text-sm text-gray-400 px-1">{placeholder}</span>
        )}
        {selected.map(s => (
          <span
            key={s}
            className={`${colorClass} text-xs px-2 py-0.5 rounded-full flex items-center gap-1`}
          >
            {s}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggle(s) }}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0" />}
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-teal-300"
              placeholder="Buscar..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">Nenhuma opção encontrada</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={e => { e.stopPropagation(); toggle(o) }}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-teal-50 transition-colors"
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Single-select dropdown for tipo_documento. */
function SingleSelectDropdown({
  label,
  options,
  value,
  onChange,
  placeholder,
  colorClass = 'bg-green-100 text-green-700',
  disabled = false,
}: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  colorClass?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div ref={ref} className="relative">
      <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
      <div
        className={`min-h-[38px] border rounded-lg px-3 py-2 flex items-center cursor-pointer ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-teal-400'}`}
        onClick={() => !disabled && setOpen(!open)}
      >
        {value ? (
          <span className={`${colorClass} text-xs px-2 py-0.5 rounded-full flex items-center gap-1`}>
            {value}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onChange('') }}
                className="hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ) : (
          <span className="text-sm text-gray-400">{placeholder}</span>
        )}
        {!disabled && <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto flex-shrink-0" />}
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-hidden flex flex-col">
          <div className="p-1.5 border-b">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-teal-300"
              placeholder="Buscar..."
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 p-3 text-center">Nenhuma opção encontrada</p>
            ) : (
              filtered.map(o => (
                <button
                  key={o}
                  type="button"
                  onClick={e => { e.stopPropagation(); onChange(o); setOpen(false); setSearch('') }}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-teal-50 transition-colors ${o === value ? 'bg-teal-50 font-medium' : ''}`}
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TagsModal({
  doc,
  apiKey,
  onClose,
  onSaved,
}: {
  doc: AcervoDocumentData
  apiKey: string
  onClose: () => void
  onSaved: (tags: { natureza?: NaturezaValue; area_direito?: string[]; assuntos?: string[]; tipo_documento?: string; contexto?: string[] }) => void
}) {
  const [natureza, setNatureza] = useState<NaturezaValue | ''>(doc.natureza || '')
  const [selectedAreas, setSelectedAreas] = useState<string[]>(doc.area_direito || [])
  const [selectedAssuntos, setSelectedAssuntos] = useState<string[]>(doc.assuntos || [])
  const [tipDocumento, setTipDocumento] = useState(doc.tipo_documento || '')
  const [contexto, setContexto] = useState((doc.contexto || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState(!doc.tags_generated)
  const [legalAreas, setLegalAreas] = useState<AdminLegalArea[]>([])

  // Load legal areas from admin settings
  useEffect(() => {
    loadAdminLegalAreas().then(setLegalAreas).catch(() => {})
  }, [])

  // Compute available options based on current selections
  const enabledAreas = legalAreas.filter(a => a.is_enabled)
  const areaOptions = enabledAreas.map(a => a.name)

  // Map area names to IDs for classification lookup
  const nameToIdMap = Object.fromEntries(enabledAreas.map(a => [a.name, a.id]))
  const selectedAreaIds = selectedAreas.map(name => nameToIdMap[name]).filter(Boolean)

  // Get available assuntos based on natureza + selected areas,
  // merging static tree assuntos with admin-added assuntos
  const availableAssuntos = (() => {
    if (!natureza || selectedAreaIds.length === 0) return []
    const treeAssuntos = getAssuntosForAreas(natureza, selectedAreaIds)
    // Merge admin-added assuntos for selected areas
    const seen = new Set(treeAssuntos)
    const merged = [...treeAssuntos]
    for (const areaName of selectedAreas) {
      const area = enabledAreas.find(a => a.name === areaName)
      if (area?.assuntos) {
        for (const a of area.assuntos) {
          if (!seen.has(a)) {
            seen.add(a)
            merged.push(a)
          }
        }
      }
    }
    return merged
  })()

  // Get available tipos based on natureza + areas + assuntos
  const availableTipos = natureza && selectedAreaIds.length > 0
    ? getTiposForClassification(natureza, selectedAreaIds, selectedAssuntos)
    : []

  // Helper: compute valid assuntos for given natureza + area names (tree + admin)
  const getValidAssuntos = (nat: string, areaNames: string[]): Set<string> => {
    const areaIds = areaNames.map(n => nameToIdMap[n]).filter(Boolean)
    const tree = nat && areaIds.length > 0 ? getAssuntosForAreas(nat, areaIds) : []
    const valid = new Set(tree)
    for (const areaName of areaNames) {
      const area = enabledAreas.find(a => a.name === areaName)
      if (area?.assuntos) {
        for (const a of area.assuntos) valid.add(a)
      }
    }
    return valid
  }

  // When natureza changes, clear assuntos/tipo that are no longer valid
  const handleNaturezaChange = (val: NaturezaValue | '') => {
    setNatureza(val)
    // Reset dependent fields since available options change
    setSelectedAssuntos(prev => {
      if (!val || selectedAreas.length === 0) return []
      const valid = getValidAssuntos(val, selectedAreas)
      return prev.filter(a => valid.has(a))
    })
    setTipDocumento('')
  }

  // When areas change, filter assuntos/tipo that are no longer valid
  const handleAreasChange = (names: string[]) => {
    setSelectedAreas(names)
    if (natureza && names.length > 0) {
      const valid = getValidAssuntos(natureza, names)
      setSelectedAssuntos(prev => prev.filter(a => valid.has(a)))
    } else {
      setSelectedAssuntos([])
    }
    setTipDocumento('')
  }

  const handleGenerate = async () => {
    if (!doc.text_content) return
    setGenerating(true)
    try {
      const result = await generateAcervoTags(apiKey, doc.filename, doc.text_content)
      setNatureza(result.natureza)
      // Match generated area names to available admin areas
      const generatedAreas = result.area_direito.filter(a => areaOptions.includes(a))
      setSelectedAreas(generatedAreas.length > 0 ? generatedAreas : result.area_direito)
      setSelectedAssuntos(result.assuntos)
      if (result.tipo_documento) setTipDocumento(result.tipo_documento)
      setContexto(result.contexto.join(', '))
      setEditing(true)
    } catch (err) {
      console.error('Erro ao gerar tags:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      onSaved({
        natureza: natureza || undefined,
        area_direito: selectedAreas,
        assuntos: selectedAssuntos,
        tipo_documento: tipDocumento || undefined,
        contexto: contexto.split(',').map(s => s.trim()).filter(Boolean),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const hasTags = doc.tags_generated || natureza || selectedAreas.length > 0 || selectedAssuntos.length > 0 || tipDocumento || contexto

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Tags className="w-5 h-5 text-teal-500 flex-shrink-0" />
            <span className="font-semibold text-gray-900 text-sm">Tags de Classificação</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* File info */}
        <div className="flex gap-4 px-5 py-2 border-b bg-gray-50 text-xs text-gray-500">
          <span className="truncate font-medium">{doc.filename}</span>
          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {hasTags || editing ? (
            <>
              {/* Natureza */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Natureza</label>
                {editing ? (
                  <select
                    value={natureza}
                    onChange={e => handleNaturezaChange(e.target.value as NaturezaValue)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:ring-2 focus:ring-teal-300 focus:border-teal-400 outline-none"
                  >
                    <option value="">Selecione...</option>
                    {NATUREZA_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label} — {o.description}</option>
                    ))}
                  </select>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                    {NATUREZA_LABELS[natureza] || natureza || 'Não classificado'}
                  </span>
                )}
              </div>
              {/* Área do Direito (multi-select) */}
              {editing ? (
                <MultiSelectDropdown
                  label="Área do Direito"
                  options={areaOptions}
                  selected={selectedAreas}
                  onChange={handleAreasChange}
                  placeholder={!natureza ? 'Selecione a natureza primeiro' : 'Selecione as áreas do direito'}
                  colorClass="bg-blue-100 text-blue-700"
                  disabled={!natureza}
                />
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Área do Direito</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAreas.map((a, i) => (
                      <span key={`area-${a}-${i}`} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                    {selectedAreas.length === 0 && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
              )}
              {/* Assuntos (multi-select, filtered by natureza + áreas) */}
              {editing ? (
                <MultiSelectDropdown
                  label="Assuntos"
                  options={availableAssuntos}
                  selected={selectedAssuntos}
                  onChange={setSelectedAssuntos}
                  placeholder={selectedAreas.length === 0 ? 'Selecione as áreas primeiro' : 'Selecione os assuntos'}
                  colorClass="bg-amber-100 text-amber-700"
                  disabled={!natureza || selectedAreas.length === 0}
                />
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Assuntos</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAssuntos.map((a, i) => (
                      <span key={`assunto-${a}-${i}`} className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                    {selectedAssuntos.length === 0 && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </div>
              )}
              {/* Tipo do Documento (single-select, filtered) */}
              {editing ? (
                <SingleSelectDropdown
                  label="Tipo do Documento"
                  options={availableTipos}
                  value={tipDocumento}
                  onChange={setTipDocumento}
                  placeholder={selectedAssuntos.length === 0 ? 'Selecione os assuntos primeiro' : 'Selecione o tipo do documento'}
                  colorClass="bg-green-100 text-green-700"
                  disabled={!natureza || selectedAreas.length === 0}
                />
              ) : (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo do Documento</label>
                  {tipDocumento ? (
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">{tipDocumento}</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
              )}
              {/* Contexto (free text with guidance) */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Contexto</label>
                {editing && (
                  <p className="text-xs text-gray-400 mb-1.5">
                    <Info className="w-3 h-3 inline mr-0.5" />
                    Utilize expressões amplas ou específicas, conforme o caso, para facilitar que este documento seja encontrado pelo buscador de acervo em casos com contexto semelhante.
                  </p>
                )}
                {editing ? (
                  <textarea
                    value={contexto}
                    onChange={e => setContexto(e.target.value)}
                    rows={3}
                    className="w-full border rounded-lg p-3 text-sm text-gray-800 focus:ring-2 focus:ring-teal-300 focus:border-teal-400 outline-none resize-y"
                    placeholder="Ex: Município celebrou contrato sem licitação, Empresa questionou dispensa de licitação"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contexto.split(',').map((c, i) => c.trim() && (
                      <span key={`ctx-${c.trim()}-${i}`} className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{c.trim()}</span>
                    ))}
                    {!contexto.trim() && <span className="text-xs text-gray-400">—</span>}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Tags className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium">Nenhuma classificação gerada</p>
              <p className="text-xs mt-1">Clique em "Gerar Tags" para classificar automaticamente.</p>
            </div>
          )}
        </div>
        {/* Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50 gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !doc.text_content}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hasTags ? 'Reclassificar' : 'Gerar Tags'}
          </button>
          <div className="flex gap-2">
            {hasTags && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
            )}
            {editing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Text extraction ──────────────────────────────────────────────────────────

/** Extract text from a File client-side. Handles DOCX, DOC (mammoth), PDF (pdfjs CDN), and plain text. */
async function extractFileText(file: File): Promise<string> {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')

  // DOCX / DOC — use mammoth (bundled dependency)
  if (ext === '.docx' || ext === '.doc') {
    const arrayBuffer = await file.arrayBuffer()
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value.trim()
  }

  // PDF — load pdfjs from CDN at runtime (no build dependency)
  if (ext === '.pdf') {
    return extractPdfText(file)
  }

  // TXT / MD / others — plain UTF-8 text
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.trim() : '')
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsText(file, 'UTF-8')
  })
}

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import(/* @vite-ignore */ PDFJS_CDN) as any
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }
  return pages.join('\n').trim()
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Upload() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [history, setHistory] = useState<UploadedFile[]>([])
  const [firebaseHistory, setFirebaseHistory] = useState<AcervoDocumentData[]>([])
  const [localFiles, setLocalFiles] = useState<{ name: string; size: number; status: 'uploading' | 'error'; progress?: number }[]>([])
  const [viewDoc, setViewDoc] = useState<AcervoDocumentData | null>(null)
  const [ementaDoc, setEmentaDoc] = useState<AcervoDocumentData | null>(null)
  const [tagsDoc, setTagsDoc] = useState<AcervoDocumentData | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkTagsGenerating, setBulkTagsGenerating] = useState(false)
  const [bulkTagsProgress, setBulkTagsProgress] = useState<{ done: number; total: number } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterNatureza, setFilterNatureza] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const toast = useToast()
  const { userId } = useAuth()

  // Load API key once
  useEffect(() => {
    (async () => {
      try {
        const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
        if (envKey && envKey.startsWith('sk-')) { setApiKey(envKey); return }
        const settings = await getSettings()
        const apiKeys = (settings?.api_keys ?? {}) as Record<string, string>
        const key = apiKeys.openrouter_api_key ?? (settings?.openrouter_api_key as string) ?? ''
        setApiKey(key)
      } catch { /* ignore */ }
    })()
  }, [])

  const fetchHistory = useCallback(() => {
    if (IS_FIREBASE && userId) {
      listAcervoDocuments(userId)
        .then(res => setFirebaseHistory(res.items))
        .catch(() => toast.error('Erro ao carregar histórico do acervo'))
      return
    }
    if (IS_FIREBASE) return
    api.get('/uploads').then(res => setHistory(res.data.items || [])).catch(() => toast.error('Erro ao carregar histórico de uploads'))
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchHistory()
    if (!IS_FIREBASE) {
      const interval = setInterval(fetchHistory, 5000)
      return () => clearInterval(interval)
    }
  }, [fetchHistory])


  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      return `Tipo não suportado: ${ext}`
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Arquivo muito grande (máx. ${MAX_SIZE_MB} MB)`
    }
    return null
  }

  const processFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)

    for (const file of files) {
      const error = validateFile(file)
      if (error) {
        toast.error(`${file.name}: ${error}`)
        continue
      }

      setLocalFiles(prev => [...prev, { name: file.name, size: file.size, status: 'uploading', progress: 0 }])

      if (IS_FIREBASE) {
        // Firebase mode: extract text client-side and store in Firestore
        if (!userId) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error('Usuário não autenticado. Faça login novamente.')
          continue
        }
        try {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, progress: 20 } : f)
          )
          const textContent = await extractFileText(file)
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, progress: 80 } : f)
          )
          const result = await createAcervoDocument(userId, {
            filename: file.name,
            content_type: file.type || 'text/plain',
            size_bytes: file.size,
            text_content: textContent,
          })
          setLocalFiles(prev => prev.filter(f => f.name !== file.name))
          if (result.truncated) {
            toast.success(`${file.name} adicionado ao acervo (texto truncado por exceder o limite)`)
          } else {
            toast.success(`${file.name} adicionado ao acervo`)
          }
          fetchHistory()
        } catch (err: any) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error(`Erro ao processar ${file.name}`, err?.message)
        }
      } else {
        // Server mode: upload to backend API
        try {
          const formData = new FormData()
          formData.append('file', file)
          await api.post('/uploads', formData, {
            onUploadProgress: (evt) => {
              if (evt.total) {
                const pct = Math.round((evt.loaded / evt.total) * 100)
                setLocalFiles(prev =>
                  prev.map(f => f.name === file.name ? { ...f, progress: pct } : f)
                )
              }
            },
          })
          setLocalFiles(prev => prev.filter(f => f.name !== file.name))
          fetchHistory()
        } catch (err: any) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error(`Erro ao enviar ${file.name}`, err?.response?.data?.detail || err?.message)
        }
      }
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }


  const handleDeleteUpload = async (id: string, filename: string) => {
    if (!window.confirm(`Remover "${filename}" do acervo permanentemente?`)) return
    setDeletingId(id)
    try {
      if (IS_FIREBASE) {
        if (!userId) { toast.error('Usuário não autenticado. Faça login novamente.'); setDeletingId(null); return }
        await deleteAcervoDocument(userId, id)
        setFirebaseHistory(prev => prev.filter(f => f.id !== id))
      } else {
        await api.delete(`/uploads/${id}`)
        setHistory(prev => prev.filter(f => f.id !== id))
      }
      toast.success('Arquivo removido do acervo')
    } catch (err: any) {
      toast.error('Erro ao remover arquivo', err?.response?.data?.detail ?? err?.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files))
  }

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length) processFiles(files)
  }

  const removeLocalFile = (name: string) => {
    setLocalFiles(prev => prev.filter(f => f.name !== name))
  }

  // Bulk ementa generation for all docs without ementa
  const handleBulkGenerateEmentas = async () => {
    if (!userId || !apiKey || bulkGenerating) return
    const docsWithoutEmenta = firebaseHistory.filter(d => !d.ementa && d.text_content && d.status === 'indexed')
    if (docsWithoutEmenta.length === 0) {
      toast.info('Todos os documentos já possuem ementa.')
      return
    }
    setBulkGenerating(true)
    setBulkProgress({ done: 0, total: docsWithoutEmenta.length })

    let done = 0
    // Process in batches of 5
    for (let i = 0; i < docsWithoutEmenta.length; i += 5) {
      const batch = docsWithoutEmenta.slice(i, i + 5)
      await Promise.all(batch.map(async d => {
        try {
          const result = await generateAcervoEmenta(apiKey, d.filename, d.text_content)
          await updateAcervoEmenta(userId, d.id!, result.ementa, result.keywords)
          // Update local state
          setFirebaseHistory(prev => prev.map(fd =>
            fd.id === d.id ? { ...fd, ementa: result.ementa, ementa_keywords: result.keywords } : fd,
          ))
        } catch (err) {
          console.error(`Erro ao gerar ementa para ${d.filename}:`, err)
        } finally {
          done++
          setBulkProgress({ done, total: docsWithoutEmenta.length })
        }
      }))
    }

    setBulkGenerating(false)
    setBulkProgress(null)
    toast.success(`Ementas geradas para ${done} documento(s).`)
    fetchHistory()
  }

  // Save ementa from modal
  const handleSaveEmenta = async (docId: string, ementa: string, keywords: string[]) => {
    if (!userId) return
    await updateAcervoEmenta(userId, docId, ementa, keywords)
    setFirebaseHistory(prev => prev.map(d =>
      d.id === docId ? { ...d, ementa, ementa_keywords: keywords } : d,
    ))
    setEmentaDoc(null)
    toast.success('Ementa salva com sucesso.')
  }

  // Save text content from document view modal
  const handleSaveText = async (docId: string, textContent: string) => {
    if (!userId) return
    await updateAcervoTextContent(userId, docId, textContent)
    setFirebaseHistory(prev => prev.map(d =>
      d.id === docId ? { ...d, text_content: textContent } : d,
    ))
    // Update the viewDoc state so the modal reflects saved content
    setViewDoc(prev => prev ? { ...prev, text_content: textContent } : null)
    toast.success('Texto salvo com sucesso.')
  }

  // Save tags from modal
  const handleSaveTags = async (docId: string, tags: { natureza?: NaturezaValue; area_direito?: string[]; assuntos?: string[]; tipo_documento?: string; contexto?: string[] }) => {
    if (!userId) return
    await updateAcervoTags(userId, docId, tags)
    setFirebaseHistory(prev => prev.map(d =>
      d.id === docId ? { ...d, ...tags, tags_generated: true } : d,
    ))
    setTagsDoc(null)
    toast.success('Tags salvas com sucesso.')
  }

  // Bulk tags generation for all docs without tags
  const handleBulkGenerateTags = async () => {
    if (!userId || !apiKey || bulkTagsGenerating) return
    const docsWithoutTags = firebaseHistory.filter(d => !d.tags_generated && d.text_content && d.status === 'indexed')
    if (docsWithoutTags.length === 0) {
      toast.info('Todos os documentos já possuem tags de classificação.')
      return
    }
    setBulkTagsGenerating(true)
    setBulkTagsProgress({ done: 0, total: docsWithoutTags.length })

    let done = 0
    for (let i = 0; i < docsWithoutTags.length; i += 5) {
      const batch = docsWithoutTags.slice(i, i + 5)
      await Promise.all(batch.map(async d => {
        try {
          const result = await generateAcervoTags(apiKey, d.filename, d.text_content)
          await updateAcervoTags(userId, d.id!, result)
          setFirebaseHistory(prev => prev.map(fd =>
            fd.id === d.id ? { ...fd, ...result, tags_generated: true } : fd,
          ))
        } catch (err) {
          console.error(`Erro ao gerar tags para ${d.filename}:`, err)
        } finally {
          done++
          setBulkTagsProgress({ done, total: docsWithoutTags.length })
        }
      }))
    }

    setBulkTagsGenerating(false)
    setBulkTagsProgress(null)
    toast.success(`Tags geradas para ${done} documento(s).`)
    fetchHistory()
  }

  const docsWithoutEmenta = firebaseHistory.filter(d => !d.ementa && d.text_content && d.status === 'indexed')
  const docsWithEmenta = firebaseHistory.filter(d => !!d.ementa)
  const docsWithoutTags = firebaseHistory.filter(d => !d.tags_generated && d.text_content && d.status === 'indexed')
  const docsWithTags = firebaseHistory.filter(d => !!d.tags_generated)

  // Apply search and filter
  const filteredHistory = firebaseHistory.filter(d => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchFilename = d.filename.toLowerCase().includes(q)
      const matchEmenta = (d.ementa || '').toLowerCase().includes(q)
      const matchAreas = (d.area_direito || []).some(a => a.toLowerCase().includes(q))
      const matchAssuntos = (d.assuntos || []).some(a => a.toLowerCase().includes(q))
      const matchTipo = (d.tipo_documento || '').toLowerCase().includes(q)
      const matchContexto = (d.contexto || []).some(c => c.toLowerCase().includes(q))
      if (!matchFilename && !matchEmenta && !matchAreas && !matchAssuntos && !matchTipo && !matchContexto) return false
    }
    if (filterNatureza && d.natureza !== filterNatureza) return false
    return true
  })

  return (
    <div className="max-w-3xl">
      {/* View modal */}
      {viewDoc && (
        <AcervoDocModal
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onTextSaved={viewDoc.id ? (text) => handleSaveText(viewDoc.id!, text) : undefined}
        />
      )}
      {/* Ementa modal */}
      {ementaDoc && apiKey && (
        <EmentaModal
          doc={ementaDoc}
          apiKey={apiKey}
          onClose={() => setEmentaDoc(null)}
          onSaved={(ementa, kws) => handleSaveEmenta(ementaDoc.id!, ementa, kws)}
        />
      )}
      {/* Tags modal */}
      {tagsDoc && apiKey && (
        <TagsModal
          doc={tagsDoc}
          apiKey={apiKey}
          onClose={() => setTagsDoc(null)}
          onSaved={(tags) => handleSaveTags(tagsDoc.id!, tags)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload de Documentos</h1>
        <button
          onClick={fetchHistory}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Firebase mode: guidance on how acervo works */}
      {IS_FIREBASE && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 flex gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Acervo de documentos de referência</p>
            <p className="text-xs text-blue-600 mt-1">
              Envie documentos de texto (.txt, .md, .doc, .docx, .pdf) que servirão como base de conhecimento
              na elaboração de novos documentos. O conteúdo textual será armazenado e utilizado pelo
              pipeline de geração junto com as teses do banco de teses.
            </p>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={[
          'bg-white rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 mb-6 select-none',
          isDragging
            ? 'border-brand-500 bg-brand-50 scale-[1.01] shadow-lg'
            : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50',
        ].join(' ')}
      >
        <div className={[
          'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors',
          isDragging ? 'bg-brand-100' : 'bg-gray-100',
        ].join(' ')}>
          <UploadIcon className={['w-8 h-8 transition-colors', isDragging ? 'text-brand-600' : 'text-gray-400'].join(' ')} />
        </div>

        {isDragging ? (
          <>
            <p className="text-brand-700 font-semibold text-lg">Solte os arquivos aqui</p>
            <p className="text-brand-500 text-sm mt-1">Pronto para indexar</p>
          </>
        ) : (
          <>
            <p className="text-gray-700 font-semibold">Arraste arquivos ou clique para selecionar</p>
            <p className="text-sm text-gray-400 mt-1">
              {ACCEPTED_TYPES.join(', ').toUpperCase()} — máx. {MAX_SIZE_MB} MB por arquivo
            </p>
            <p className="text-xs text-gray-400 mt-1">Serão indexados automaticamente no acervo vetorial</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {/* Files uploading now */}
      {localFiles.length > 0 && (
        <div className="space-y-2 mb-4">
          {localFiles.map((f, i) => (
            <div key={i} className="bg-white rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(f.size)}</p>
                </div>
                {f.status === 'uploading' && (
                  <span className="text-xs text-brand-600 font-medium flex-shrink-0">{f.progress ?? 0}%</span>
                )}
                {f.status === 'error' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-red-500">Erro</span>
                    <button
                      onClick={() => removeLocalFile(f.name)}
                      className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {f.status === 'uploading' && (
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${f.progress ?? 0}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Indexed history — Firebase mode */}
      {IS_FIREBASE && firebaseHistory.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Header with counts */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-700">Acervo de referência</h2>
                <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{firebaseHistory.length}</span>
                {docsWithEmenta.length > 0 && (
                  <span className="text-xs text-indigo-500 bg-indigo-50 rounded-full px-2 py-0.5" title="Documentos com ementa">
                    {docsWithEmenta.length} com ementa
                  </span>
                )}
                {docsWithTags.length > 0 && (
                  <span className="text-xs text-teal-500 bg-teal-50 rounded-full px-2 py-0.5" title="Documentos com tags">
                    {docsWithTags.length} classificados
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {apiKey && docsWithoutTags.length > 0 && (
                  <button
                    onClick={handleBulkGenerateTags}
                    disabled={bulkTagsGenerating}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={`Gerar tags para ${docsWithoutTags.length} documento(s)`}
                  >
                    {bulkTagsGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tags className="w-3.5 h-3.5" />}
                    {bulkTagsGenerating && bulkTagsProgress
                      ? `${bulkTagsProgress.done}/${bulkTagsProgress.total}`
                      : `Classificar ${docsWithoutTags.length}`}
                  </button>
                )}
                {apiKey && docsWithoutEmenta.length > 0 && (
                  <button
                    onClick={handleBulkGenerateEmentas}
                    disabled={bulkGenerating}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={`Gerar ementas para ${docsWithoutEmenta.length} documento(s)`}
                  >
                    {bulkGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {bulkGenerating && bulkProgress
                      ? `${bulkProgress.done}/${bulkProgress.total}`
                      : `Gerar ${docsWithoutEmenta.length} ementas`}
                  </button>
                )}
              </div>
            </div>
            {/* Search and filter bar */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome, ementa, área, assunto..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
                />
              </div>
              <select
                value={filterNatureza}
                onChange={e => setFilterNatureza(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-teal-300 focus:border-teal-400 outline-none"
              >
                <option value="">Todas as naturezas</option>
                {NATUREZA_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Bulk progress bars */}
          {bulkGenerating && bulkProgress && (
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
              />
            </div>
          )}
          {bulkTagsGenerating && bulkTagsProgress && (
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-teal-500 transition-all duration-300"
                style={{ width: `${(bulkTagsProgress.done / bulkTagsProgress.total) * 100}%` }}
              />
            </div>
          )}
          <div className="divide-y max-h-[32rem] overflow-y-auto">
            {filteredHistory.map(acervoDoc => {
              const s = STATUS_LABELS[acervoDoc.status] || STATUS_LABELS.uploaded
              const StatusIcon = s.icon
              const hasEmenta = !!acervoDoc.ementa
              const hasTags = !!acervoDoc.tags_generated
              return (
                <div key={acervoDoc.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{acervoDoc.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{formatSize(acervoDoc.size_bytes)}</span>
                        {acervoDoc.chunks_count > 0 && <span className="text-xs text-gray-400">· {acervoDoc.chunks_count} fragmentos</span>}
                        {/* Status indicators */}
                        <span className={`inline-flex items-center gap-0.5 text-[10px] ${s.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {s.label}
                        </span>
                        {hasEmenta ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-500">
                            <BookOpen className="w-3 h-3" />
                            Ementa
                          </span>
                        ) : acervoDoc.status === 'indexed' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                            <BookOpen className="w-3 h-3" />
                            Sem ementa
                          </span>
                        )}
                        {hasTags ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-500">
                            <Tags className="w-3 h-3" />
                            {NATUREZA_LABELS[acervoDoc.natureza || ''] || 'Classificado'}
                          </span>
                        ) : acervoDoc.status === 'indexed' && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                            <Tags className="w-3 h-3" />
                            Sem tags
                          </span>
                        )}
                      </div>
                      {/* Tag pills */}
                      {hasTags && (acervoDoc.area_direito?.length || acervoDoc.assuntos?.length) ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(acervoDoc.area_direito || []).map((a) => (
                            <span key={`area-${a}`} className="bg-blue-50 text-blue-600 text-[10px] px-1.5 py-0.5 rounded-full">{a}</span>
                          ))}
                          {(acervoDoc.assuntos || []).map((a) => (
                            <span key={`assunto-${a}`} className="bg-amber-50 text-amber-600 text-[10px] px-1.5 py-0.5 rounded-full">{a}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setTagsDoc(acervoDoc)}
                        className={`transition-colors ${hasTags ? 'text-teal-400 hover:text-teal-600' : 'text-gray-300 hover:text-teal-400'}`}
                        title={hasTags ? 'Ver/editar tags' : 'Classificar documento'}
                      >
                        <Tags className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEmentaDoc(acervoDoc)}
                        className={`transition-colors ${hasEmenta ? 'text-indigo-400 hover:text-indigo-600' : 'text-gray-300 hover:text-indigo-400'}`}
                        title={hasEmenta ? 'Ver/editar ementa' : 'Gerar ementa'}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                      </button>
                      {acervoDoc.text_content && (
                        <button
                          onClick={() => setViewDoc(acervoDoc)}
                          className="text-gray-300 hover:text-brand-500 transition-colors"
                          title="Ver conteúdo"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteUpload(acervoDoc.id!, acervoDoc.filename)}
                        disabled={deletingId === acervoDoc.id}
                        className="ml-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                        title="Remover do acervo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredHistory.length === 0 && (searchQuery || filterNatureza) && (
              <div className="px-4 py-8 text-center text-gray-400">
                <Filter className="w-6 h-6 mx-auto mb-2" />
                <p className="text-sm">Nenhum documento encontrado com os filtros atuais.</p>
                <button
                  onClick={() => { setSearchQuery(''); setFilterNatureza('') }}
                  className="text-xs text-brand-500 hover:text-brand-600 mt-1"
                >
                  Limpar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Indexed history — Server mode */}
      {!IS_FIREBASE && history.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Acervo indexado</h2>
            <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{history.length}</span>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {history.map(doc => {
              const s = STATUS_LABELS[doc.status] || STATUS_LABELS.uploaded
              const Icon = s.icon
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(doc.size_bytes)}
                      {doc.chunks_indexed > 0 && ` · ${doc.chunks_indexed} fragmentos`}
                      {doc.collection_name && ` · ${doc.collection_name}`}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${s.color} flex-shrink-0`}>
                    <Icon className={['w-4 h-4', doc.status === 'indexing' ? 'animate-spin' : ''].join(' ')} />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteUpload(doc.id, doc.filename)}
                    disabled={deletingId === doc.id}
                    className="ml-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0"
                    title="Remover do acervo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {((IS_FIREBASE ? firebaseHistory.length : history.length) === 0) && localFiles.length === 0 && !uploading && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">
            Nenhum documento no acervo ainda.
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Os documentos enviados servirão como base de conhecimento na elaboração de novos documentos.
          </p>
        </div>
      )}
    </div>
  )
}
