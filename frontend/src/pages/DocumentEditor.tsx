import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, FileText, Check } from 'lucide-react'
import api from '../api/client'
import RichTextEditor from '../components/RichTextEditor'
import { useToast } from '../components/Toast'

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [docInfo, setDocInfo] = useState<{
    document_type_id: string
    tema: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const toast = useToast()

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  useEffect(() => {
    if (!id) return
    api.get(`/documents/${id}/content`)
      .then(res => {
        // Convert plain text to basic HTML paragraphs if needed
        const raw = res.data.content || ''
        const html = raw.includes('<') ? raw : textToHtml(raw)
        setContent(html)
        setDocInfo({
          document_type_id: res.data.document_type_id,
          tema: res.data.tema,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const handleChange = useCallback((html: string) => {
    setContent(html)
    setHasChanges(true)
    setSaved(false)
  }, [])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      await api.put(`/documents/${id}/content`, { content })
      setSaved(true)
      setHasChanges(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      toast.error('Erro ao salvar documento', err?.response?.data?.detail || err?.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-gray-500">Carregando editor...</p>

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/documents/${id}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-brand-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Editor de Documento
              </h1>
              <p className="text-sm text-gray-500">
                {docInfo?.tema || docInfo?.document_type_id || 'Documento'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="w-4 h-4" />
              Salvo
            </span>
          )}
          {hasChanges && !saved && (
            <span className="text-sm text-amber-600">Alterações não salvas</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <RichTextEditor
        content={content}
        onChange={handleChange}
        placeholder="O conteúdo do documento aparecerá aqui..."
      />

      {/* Keyboard shortcut hint */}
      <p className="text-xs text-gray-400 mt-3 text-right">
        Ctrl+B negrito · Ctrl+I itálico · Ctrl+U sublinhado
      </p>
    </div>
  )
}

/**
 * Convert plain text (with double newlines as paragraph separators) to HTML.
 */
function textToHtml(text: string): string {
  if (!text.trim()) return '<p></p>'
  return text
    .split(/\n\n+/)
    .map(para => {
      const trimmed = para.trim()
      if (!trimmed) return ''
      // Check if it looks like a section header (ALL CAPS, short)
      if (trimmed === trimmed.toUpperCase() && trimmed.length < 80 && !trimmed.includes('.')) {
        return `<h2>${trimmed}</h2>`
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
    })
    .filter(Boolean)
    .join('\n')
}
