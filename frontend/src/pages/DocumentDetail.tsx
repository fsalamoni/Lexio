import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, FileText, Edit3, Clock, DollarSign, Cpu, Eye, EyeOff } from 'lucide-react'
import api from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ProgressTracker from '../components/ProgressTracker'

interface DocumentData {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  original_request: string
  created_at: string
  docx_path: string | null
  legal_area_ids: string[]
  texto_completo: string | null
}

interface Execution {
  id: string
  agent_name: string
  phase: string
  model: string | null
  tokens_in: number | null
  tokens_out: number | null
  cost_usd: number | null
  duration_ms: number | null
  created_at: string
}

const DOCTYPE_LABELS: Record<string, string> = {
  parecer: 'Parecer',
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  recurso: 'Recurso',
  sentenca: 'Sentença',
  acao_civil_publica: 'Ação Civil Pública',
}

const AREA_LABELS: Record<string, string> = {
  administrative: 'Administrativo',
  constitutional: 'Constitucional',
  civil: 'Civil',
  tax: 'Tributário',
  labor: 'Trabalhista',
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtCost(usd: number | null): string {
  if (usd == null) return '—'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(4)}`
}

function fmtModel(model: string | null): string {
  if (!model) return '—'
  if (model.includes('haiku')) return 'Haiku'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('opus')) return 'Opus'
  return model.split('/').pop() || model
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [loadingDocx, setLoadingDocx] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchDoc = useCallback(() => {
    if (!id) return
    api.get(`/documents/${id}`)
      .then(res => setDoc(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    fetchDoc()
    // Stop polling once the document is no longer processing
    const interval = setInterval(() => {
      setDoc(d => {
        if (d && d.status !== 'processando') {
          clearInterval(interval)
          return d
        }
        fetchDoc()
        return d
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchDoc])

  // Load executions when document is complete
  useEffect(() => {
    if (!id || !doc || doc.status !== 'concluido') return
    api.get(`/documents/${id}/executions`)
      .then(res => setExecutions(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
  }, [id, doc?.status])

  // Load DOCX preview with mammoth
  const loadDocxPreview = async () => {
    if (!id || docxHtml) { setShowPreview(v => !v); return }
    setLoadingDocx(true)
    try {
      const res = await api.get(`/documents/${id}/download`, {
        responseType: 'arraybuffer',
      })
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ arrayBuffer: res.data })
      setDocxHtml(result.value)
      setShowPreview(true)
    } catch {
      // Fallback to plain text
      setDocxHtml(null)
      setShowPreview(false)
    } finally {
      setLoadingDocx(false)
    }
  }

  if (loading) return (
    <div className="max-w-4xl space-y-6">
      <div className="h-8 skeleton w-48" />
      <div className="h-40 skeleton rounded-xl" />
      <div className="h-32 skeleton rounded-xl" />
    </div>
  )
  if (!doc) return (
    <div className="text-center py-20 text-gray-500">
      <p>Documento não encontrado.</p>
    </div>
  )

  const docLabel = DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id
  const totalCost = executions.reduce((sum, e) => sum + (e.cost_usd || 0), 0)
  const totalDuration = executions.reduce((sum, e) => sum + (e.duration_ms || 0), 0)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <FileText className="w-8 h-8 text-brand-600 mt-1 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{docLabel}</h1>
          <p className="text-gray-500 mt-0.5">{doc.tema || 'Processando...'}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={doc.status} />
          {doc.quality_score != null && (
            <span className={`text-lg font-bold ${
              doc.quality_score >= 80 ? 'text-green-600'
                : doc.quality_score >= 60 ? 'text-yellow-600'
                : 'text-red-600'
            }`}>
              {doc.quality_score}/100
            </span>
          )}
        </div>
      </div>

      {/* Progress tracker */}
      {doc.status === 'processando' && id && (
        <ProgressTracker documentId={id} />
      )}

      {/* Main info + actions */}
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Solicitação Original</h2>
          <p className="text-gray-800 leading-relaxed">{doc.original_request}</p>
        </div>

        {(doc.legal_area_ids?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Áreas do Direito</h2>
            <div className="flex flex-wrap gap-2">
              {doc.legal_area_ids.map(area => (
                <span key={area} className="px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full">
                  {AREA_LABELS[area] || area}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 text-sm">
          <div>
            <p className="text-gray-400 text-xs">Criado em</p>
            <p className="font-medium text-gray-800">
              {new Date(doc.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          {executions.length > 0 && (
            <>
              <div>
                <p className="text-gray-400 text-xs">Agentes executados</p>
                <p className="font-medium text-gray-800">{executions.length}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Tempo total</p>
                <p className="font-medium text-gray-800">{fmtDuration(totalDuration)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Custo LLM</p>
                <p className="font-medium text-amber-700">{fmtCost(totalCost)}</p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {doc.status === 'concluido' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
            <button
              onClick={() => navigate(`/documents/${doc.id}/edit`)}
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors text-sm"
            >
              <Edit3 className="w-4 h-4" />
              Editar Documento
            </button>
            {doc.docx_path && (
              <>
                <a
                  href={`/api/v1/documents/${doc.id}/download`}
                  className="inline-flex items-center gap-2 border border-brand-600 text-brand-600 px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Baixar DOCX
                </a>
                <button
                  onClick={loadDocxPreview}
                  disabled={loadingDocx}
                  className="inline-flex items-center gap-2 border text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                >
                  {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {loadingDocx ? 'Carregando...' : showPreview ? 'Ocultar DOCX' : 'Ver DOCX'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* DOCX preview */}
      {showPreview && docxHtml && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b">
            <h2 className="text-sm font-medium text-gray-700">Pré-visualização DOCX</h2>
          </div>
          <div
            className="p-8 docx-preview text-sm"
            dangerouslySetInnerHTML={{ __html: docxHtml }}
          />
        </div>
      )}

      {/* Text preview (fallback for completed docs without DOCX) */}
      {doc.texto_completo && !showPreview && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">Conteúdo do Documento</h2>
            {doc.texto_completo.length > 2000 && (
              <button
                onClick={() => navigate(`/documents/${doc.id}/edit`)}
                className="text-xs text-brand-600 hover:underline"
              >
                Ver completo no editor
              </button>
            )}
          </div>
          <div className="p-6">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-serif leading-relaxed">
              {doc.texto_completo.length > 3000
                ? doc.texto_completo.substring(0, 3000) + '\n\n[...] — Abra o editor para ver o texto completo.'
                : doc.texto_completo
              }
            </pre>
          </div>
        </div>
      )}

      {/* Execution timeline */}
      {executions.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-brand-600" />
              Timeline de Execução — {executions.length} agentes
            </h2>
          </div>
          <div className="divide-y">
            {executions.map((ex, i) => (
              <div key={ex.id} className="flex items-center gap-4 px-6 py-3">
                <span className="text-xs text-gray-400 w-4 flex-shrink-0 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{ex.agent_name}</p>
                    {ex.model && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {fmtModel(ex.model)}
                      </span>
                    )}
                  </div>
                  {(ex.tokens_in || ex.tokens_out) && (
                    <p className="text-xs text-gray-400">
                      {ex.tokens_in?.toLocaleString()} in · {ex.tokens_out?.toLocaleString()} out tokens
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-xs">
                  <span className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-3 h-3" />
                    {fmtDuration(ex.duration_ms)}
                  </span>
                  <span className="flex items-center gap-1 text-amber-700">
                    <DollarSign className="w-3 h-3" />
                    {fmtCost(ex.cost_usd)}
                  </span>
                </div>
              </div>
            ))}
            {/* Total row */}
            <div className="flex items-center gap-4 px-6 py-3 bg-gray-50">
              <span className="text-xs font-semibold text-gray-600 flex-1">Total</span>
              <div className="flex items-center gap-4 flex-shrink-0 text-xs font-semibold">
                <span className="flex items-center gap-1 text-gray-600">
                  <Clock className="w-3 h-3" />
                  {fmtDuration(totalDuration)}
                </span>
                <span className="flex items-center gap-1 text-amber-700">
                  <DollarSign className="w-3 h-3" />
                  {fmtCost(totalCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
