import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, ArrowLeft, FileText, Check, Download, Bot, Copy } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import RichTextEditor from '../components/RichTextEditor'
import Breadcrumb from '../components/Breadcrumb'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import { getDocument, updateDocument } from '../lib/firestore-service'
import { generateAndDownloadDocx } from '../lib/docx-generator'
import { DOCTYPE_LABELS } from '../lib/constants'
import type { UsageExecutionRecord } from '../lib/cost-analytics'

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [content, setContent] = useState('')
  const [docInfo, setDocInfo] = useState<{
    document_type_id: string
    tema: string | null
    docx_path?: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [executions, setExecutions] = useState<UsageExecutionRecord[]>([])
  const { userId } = useAuth()
  const toast = useToast()

  // Derive unique agents from llm_executions
  const agentBadges = useMemo(() => {
    if (!executions.length) return []
    const seen = new Map<string, { label: string; model: string | null }>()
    for (const ex of executions) {
      if (!seen.has(ex.phase)) {
        seen.set(ex.phase, { label: ex.phase_label || ex.agent_name, model: ex.model_label || ex.model })
      }
    }
    return Array.from(seen.values())
  }, [executions])

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
    if (IS_FIREBASE && userId) {
      getDocument(userId, id)
        .then(doc => {
          if (doc) {
            const raw = doc.texto_completo || ''
            const html = raw.includes('<') ? raw : textToHtml(raw)
            setContent(html)
            setDocInfo({
              document_type_id: doc.document_type_id,
              tema: doc.tema ?? null,
            })
            if (doc.llm_executions?.length) setExecutions(doc.llm_executions)
          }
        })
        .catch(() => toast.error('Erro ao carregar documento'))
        .finally(() => setLoading(false))
    } else {
      Promise.all([
        api.get(`/documents/${id}/content`),
        api.get(`/documents/${id}`),
      ])
        .then(([contentRes, docRes]) => {
          const raw = contentRes.data.content || ''
          const html = raw.includes('<') ? raw : textToHtml(raw)
          setContent(html)
          setDocInfo({
            document_type_id: contentRes.data.document_type_id || docRes.data.document_type_id,
            tema: contentRes.data.tema || docRes.data.tema,
            docx_path: docRes.data.docx_path,
          })
        })
        .catch(() => toast.error('Erro ao carregar documento'))
        .finally(() => setLoading(false))
    }
  }, [id, userId]) // eslint-disable-line

  const handleChange = useCallback((html: string) => {
    setContent(html)
    setHasChanges(true)
    setSaved(false)
  }, [])

  const handleWordCount = useCallback((words: number, chars: number) => {
    setWordCount(words)
    setCharCount(chars)
  }, [])

  // Ctrl+S keyboard shortcut to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (hasChanges && !saving) handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    try {
      if (IS_FIREBASE && userId) {
        await updateDocument(userId, id, { texto_completo: content })
      } else {
        await api.put(`/documents/${id}/content`, { content })
      }
      setSaved(true)
      setHasChanges(false)
      setTimeout(() => setSaved(false), 2500)
      toast.success('Documento salvo com sucesso')
    } catch (err: any) {
      const { humanizeError } = await import('../lib/error-humanizer')
      const h = humanizeError(err)
      toast.error('Erro ao salvar documento', h.detail)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 skeleton rounded-lg" />
          <div className="space-y-2">
            <div className="h-5 skeleton w-40" />
            <div className="h-3 skeleton w-56" />
          </div>
        </div>
        <div className="h-[500px] skeleton rounded-xl" />
      </div>
    )
  }

  const docLabel = DOCTYPE_LABELS[docInfo?.document_type_id || ''] || docInfo?.document_type_id || 'Documento'

  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[
        { label: 'Documentos', to: '/documents' },
        { label: docLabel, to: `/documents/${id}` },
        { label: 'Editar' },
      ]} />
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`/documents/${id}`)}
            title="Voltar ao documento"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 leading-tight">{docLabel}</h1>
              <p className="text-sm text-gray-500 truncate">{docInfo?.tema || 'Sem título'}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Save status indicator */}
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600 font-medium">
              <Check className="w-4 h-4" /> Salvo
            </span>
          )}
          {hasChanges && !saved && (
            <span className="text-sm text-amber-500 font-medium">Não salvo</span>
          )}

          {/* Download button */}
          {docInfo?.docx_path && (
            <a
              href={`/api/v1/documents/${id}/download`}
              title="Baixar DOCX"
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">DOCX</span>
            </a>
          )}
          {/* Client-side DOCX for Firebase mode */}
          {IS_FIREBASE && !docInfo?.docx_path && content && (
            <button
              onClick={() => {
                // Strip HTML to plain text for DOCX
                const tmp = document.createElement('div')
                tmp.innerHTML = content
                const plain = tmp.textContent || tmp.innerText || ''
                generateAndDownloadDocx(
                  plain,
                  `${docInfo?.document_type_id || 'documento'}_${id}`,
                  docLabel,
                  docInfo?.tema || undefined,
                )
              }}
              title="Baixar DOCX"
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">DOCX</span>
            </button>
          )}

          {/* Copy to clipboard */}
          {content && (
            <button
              onClick={() => {
                const tmp = document.createElement('div')
                tmp.innerHTML = content
                const plain = tmp.textContent || tmp.innerText || ''
                navigator.clipboard.writeText(plain).then(() => toast.success('Copiado para a área de transferência'))
              }}
              title="Copiar texto"
              className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Copiar</span>
            </button>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            title="Salvar (Ctrl+S)"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors text-sm font-medium disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : saved ? (
              <><Check className="w-4 h-4" /> Salvo</>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                Salvar
                <kbd className="hidden sm:inline-block text-[10px] bg-brand-500/30 px-1 py-0.5 rounded">⌃S</kbd>
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Word count bar */}
      {wordCount > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3 px-1">
          <span>{wordCount.toLocaleString('pt-BR')} palavras</span>
          <span>·</span>
          <span>{charCount.toLocaleString('pt-BR')} caracteres</span>
          {wordCount > 0 && (
            <>
              <span>·</span>
              <span>~{Math.ceil(wordCount / 200)} min de leitura</span>
            </>
          )}
        </div>
      )}

      {/* Agent provenance badges */}
      {agentBadges.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 px-1">
          <Bot className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-400">Agentes:</span>
          {agentBadges.map((badge, i) => (
            <span
              key={i}
              title={badge.model || undefined}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200"
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* Editor */}
      <RichTextEditor
        content={content}
        onChange={handleChange}
        onWordCount={handleWordCount}
        placeholder="O conteúdo do documento aparecerá aqui..."
      />
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
