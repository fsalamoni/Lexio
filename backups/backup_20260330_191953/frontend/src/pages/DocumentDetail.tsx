import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, FileText, Edit3, Clock, DollarSign, Cpu, Eye, EyeOff, Send, ThumbsUp, ThumbsDown, RotateCcw, AlertCircle, Trash2 } from 'lucide-react'
import api, { invalidateApiCache } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import ProgressTracker from '../components/ProgressTracker'
import PipelineProgressPanel, {
  PIPELINE_AGENTS,
  PHASE_COMPLETED,
  type AgentStep,
} from '../components/PipelineProgressPanel'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { IS_FIREBASE } from '../lib/firebase'
import { getDocument, updateDocument, deleteDocument as firestoreDeleteDoc, type ContextDetailData } from '../lib/firestore-service'
import { generateDocument, type GenerationProgress } from '../lib/generation-service'
import { TransientLLMError } from '../lib/llm-client'
import { generateAndDownloadDocx } from '../lib/docx-generator'
import { DOCTYPE_LABELS, AREA_LABELS } from '../lib/constants'

interface QualityIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  suggestion?: string
}

interface DocumentData {
  id: string
  document_type_id: string
  tema: string | null
  status: string
  quality_score: number | null
  quality_issues: QualityIssue[] | null
  original_request: string
  created_at: string
  docx_path: string | null
  legal_area_ids: string[]
  texto_completo: string | null
  context_detail?: ContextDetailData | null
  metadata_?: {
    rejection_reason?: string
    rejected_by_name?: string
    rejected_at?: string
    approved_by_name?: string
    approved_at?: string
  }
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
  const toast = useToast()
  const { role, userId } = useAuth()
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [loadingDocx, setLoadingDocx] = useState(false)
  const [loading, setLoading] = useState(true)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pipeline progress state for retry flow (Firebase mode)
  const [retryPipeline, setRetryPipeline] = useState(false)
  const [pipelineAgents, setPipelineAgents] = useState<AgentStep[]>([])
  const [pipelinePercent, setPipelinePercent] = useState(0)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [pipelineError, setPipelineError] = useState(false)
  const agentTimers = useRef<Record<string, number>>({})

  const initPipeline = useCallback(() => {
    setPipelineAgents(PIPELINE_AGENTS.map(a => ({ ...a, status: 'pending' as const })))
    setPipelinePercent(0)
    setPipelineMessage('')
    setPipelineComplete(false)
    setPipelineError(false)
    agentTimers.current = {}
  }, [])

  const handleRetryProgress = useCallback((p: GenerationProgress) => {
    const now = Date.now()
    setPipelineAgents(prev => {
      const phaseIdx = prev.findIndex(a => a.key === p.phase)
      return prev.map((agent, idx) => {
        if (agent.key === p.phase && agent.status !== 'completed') {
          if (!agentTimers.current[p.phase]) agentTimers.current[p.phase] = now
          return { ...agent, status: 'active' as const, startedAt: agentTimers.current[p.phase] }
        }
        if (idx < phaseIdx && agent.status === 'active') {
          return { ...agent, status: 'completed' as const, completedAt: now }
        }
        return agent
      })
    })
    setPipelinePercent(p.percent)
    setPipelineMessage(p.message)
    if (p.phase === PHASE_COMPLETED) {
      setPipelineAgents(prev =>
        prev.map(a => a.status === 'active' ? { ...a, status: 'completed' as const, completedAt: now } : a),
      )
      setPipelinePercent(100)
      setPipelineComplete(true)
    }
  }, [])

  const fetchDoc = useCallback(() => {
    if (!id) return
    if (IS_FIREBASE && userId) {
      getDocument(userId, id)
        .then(data => {
          if (data) {
            const docData: DocumentData = {
              id: data.id ?? id,
              document_type_id: data.document_type_id,
              tema: data.tema ?? null,
              status: data.status,
              quality_score: data.quality_score ?? null,
              quality_issues: (data as any).quality_issues ?? null,
              original_request: data.original_request,
              created_at: data.created_at,
              docx_path: (data as any).docx_path ?? null,
              legal_area_ids: data.legal_area_ids ?? [],
              texto_completo: data.texto_completo ?? null,
              context_detail: data.context_detail ?? null,
              metadata_: (data as any).metadata_ ?? undefined,
            }
            setDoc(docData)
            if (docData.status !== 'processando' && intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
          }
        })
        .catch(() => toast.error('Erro ao carregar documento'))
        .finally(() => setLoading(false))
    } else {
      api.get(`/documents/${id}`)
        .then(res => {
          const data = res.data
          setDoc(data)
          if (data.status !== 'processando' && intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        })
        .catch(() => toast.error('Erro ao carregar documento'))
        .finally(() => setLoading(false))
    }
  }, [id, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchDoc()
    // Only poll while the document is being processed
    intervalRef.current = setInterval(fetchDoc, 5000)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchDoc])

  // Stop polling once document is no longer processing
  useEffect(() => {
    if (doc && doc.status !== 'processando' && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [doc])

  // Load executions when document is complete (API mode only — Firebase stores in document itself)
  useEffect(() => {
    if (!id || !doc || doc.status !== 'concluido') return
    if (IS_FIREBASE) return // Executions not available in Firebase mode
    api.get(`/documents/${id}/executions`)
      .then(res => setExecutions(Array.isArray(res.data) ? res.data : []))
      .catch(() => {/* non-critical: executions timeline may not be available */})
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
      toast.error('Não foi possível carregar a prévia do DOCX')
      setDocxHtml(null)
      setShowPreview(false)
    } finally {
      setLoadingDocx(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !doc) return
    if (!window.confirm(`Excluir este documento permanentemente? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      if (IS_FIREBASE && userId) {
        await firestoreDeleteDoc(userId, id)
      } else {
        await api.delete(`/documents/${id}`)
      }
      invalidateApiCache('/stats')
      toast.success('Documento excluído')
      navigate('/documents')
    } catch (err: any) {
      toast.error('Erro ao excluir documento', err?.response?.data?.detail || err?.message)
    } finally {
      setDeleting(false)
    }
  }

  const handleRetry = async () => {
    if (!id) return
    setRetrying(true)
    try {
      if (IS_FIREBASE && userId && doc) {
        // Show pipeline progress and re-trigger generation in Firebase mode
        initPipeline()
        setRetryPipeline(true)
        toast.success('Reprocessamento iniciado')
        try {
          await generateDocument(
            userId,
            id,
            doc.document_type_id,
            doc.original_request,
            doc.legal_area_ids ?? [],
            undefined,
            handleRetryProgress,
          )
        } catch (err: any) {
          console.error('Retry generation failed:', err)
          setPipelineError(true)
          const errorMsg = err instanceof TransientLLMError
            ? 'O modelo LLM não respondeu. Tente novamente ou altere o modelo em Administração.'
            : err?.message?.includes('API key')
              ? 'Chave de API não configurada ou inválida'
              : err?.message?.includes('fetch') || err?.message?.includes('network')
                ? 'Erro de conexão durante a geração'
                : err?.message || 'Erro inesperado durante a geração'
          setPipelineMessage(errorMsg)
          setPipelineAgents(prev =>
            prev.map(a => a.status === 'active' ? { ...a, status: 'error' as const, completedAt: Date.now() } : a),
          )
          toast.error('Erro na geração', errorMsg)
        }
      } else {
        await api.post(`/documents/${id}/retry`)
        toast.success('Reprocessamento iniciado')
      }
      fetchDoc()
      // Resume polling
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchDoc, 5000)
      }
    } catch (err: any) {
      toast.error('Erro ao reprocessar', err?.response?.data?.detail || err?.message)
    } finally {
      setRetrying(false)
    }
  }

  const handleWorkflowAction = async (action: 'submit-review' | 'approve' | 'reject') => {
    if (!id) return
    setWorkflowLoading(true)
    try {
      if (IS_FIREBASE && userId) {
        // Firebase mode: update status directly in Firestore
        const statusMap: Record<string, string> = {
          'submit-review': 'em_revisao',
          'approve': 'aprovado',
          'reject': 'rejeitado',
        }
        const updates: Record<string, unknown> = { status: statusMap[action] }
        if (action === 'reject' && rejectReason) {
          updates.metadata_ = { rejection_reason: rejectReason, rejected_at: new Date().toISOString() }
        }
        await updateDocument(userId, id, updates as any)
        if (action === 'reject') { setShowRejectForm(false); setRejectReason('') }
        toast.success(action === 'approve' ? 'Documento aprovado' : action === 'reject' ? 'Documento rejeitado' : 'Documento enviado para revisão')
      } else {
        if (action === 'reject') {
          await api.post(`/documents/${id}/reject`, { reason: rejectReason })
          setShowRejectForm(false)
          setRejectReason('')
          toast.success('Documento rejeitado')
        } else if (action === 'approve') {
          await api.post(`/documents/${id}/approve`)
          toast.success('Documento aprovado')
        } else {
          await api.post(`/documents/${id}/submit-review`)
          toast.success('Documento enviado para revisão')
        }
      }
      fetchDoc()
    } catch (err: any) {
      toast.error('Erro na ação de revisão', err?.response?.data?.detail || err?.message)
    } finally {
      setWorkflowLoading(false)
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

      {/* Pipeline progress panel for Firebase retry flow */}
      {retryPipeline && (
        <PipelineProgressPanel
          agents={pipelineAgents}
          percent={pipelinePercent}
          currentMessage={pipelineMessage}
          isComplete={pipelineComplete}
          hasError={pipelineError}
        />
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

        {/* Context Detail — AI-generated Q&A */}
        {doc.context_detail && doc.context_detail.questions?.length > 0 && (
          <div className="pt-2 border-t">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Detalhamento de Contexto</h2>
            {doc.context_detail.analysis_summary && (
              <div className="bg-purple-50 rounded-lg p-3 mb-3">
                <p className="text-xs font-medium text-purple-700 mb-0.5">Análise preliminar</p>
                <p className="text-sm text-purple-900">{doc.context_detail.analysis_summary}</p>
              </div>
            )}
            <div className="space-y-3">
              {doc.context_detail.questions.map((q: { id: string; question: string; answer: string }, idx: number) => (
                <div key={q.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="text-purple-600 mr-1">{idx + 1}.</span>
                    {q.question}
                  </p>
                  {q.answer ? (
                    <p className="text-sm text-gray-600 mt-1 pl-4 border-l-2 border-purple-200">{q.answer}</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1 italic">Não respondida</p>
                  )}
                </div>
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
        {/* Retry for failed documents */}
        {doc.status === 'erro' && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">Falha no processamento</p>
                <p className="text-xs text-red-600 mt-0.5">O pipeline encontrou um erro. Você pode tentar reprocessar.</p>
              </div>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                <RotateCcw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Reprocessando...' : 'Reprocessar'}
              </button>
            </div>
          </div>
        )}

        {['concluido', 'em_revisao', 'aprovado', 'rejeitado'].includes(doc.status) && (
          <div className="space-y-3 pt-2 border-t">
            {/* Primary document actions */}
            <div className="flex flex-wrap items-center gap-3">
              {doc.status !== 'aprovado' && (
                <button
                  onClick={() => navigate(`/documents/${doc.id}/edit`)}
                  className="inline-flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors text-sm"
                >
                  <Edit3 className="w-4 h-4" />
                  Editar
                </button>
              )}
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
              {/* Client-side DOCX for Firebase mode (no docx_path) */}
              {IS_FIREBASE && !doc.docx_path && doc.texto_completo && (
                <button
                  onClick={() => generateAndDownloadDocx(
                    doc.texto_completo!,
                    `${doc.document_type_id}_${doc.id}`,
                    DOCTYPE_LABELS[doc.document_type_id] || doc.document_type_id,
                    doc.tema || undefined,
                  )}
                  className="inline-flex items-center gap-2 border border-brand-600 text-brand-600 px-4 py-2 rounded-lg hover:bg-brand-50 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Baixar DOCX
                </button>
              )}
            </div>

            {/* Delete button — not while processando */}
            {doc.status !== 'processando' && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 border border-red-200 text-red-500 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            )}

            {/* Workflow actions */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Submit for review — author, when concluido or rejeitado */}
              {(doc.status === 'concluido' || doc.status === 'rejeitado') && (
                <button
                  onClick={() => handleWorkflowAction('submit-review')}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  Enviar para Revisão
                </button>
              )}

              {/* Admin actions — approve/reject when em_revisao */}
              {doc.status === 'em_revisao' && role === 'admin' && !showRejectForm && (
                <>
                  <button
                    onClick={() => handleWorkflowAction('approve')}
                    disabled={workflowLoading}
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm disabled:opacity-50"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Aprovar
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={workflowLoading}
                    className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors text-sm disabled:opacity-50"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Rejeitar
                  </button>
                </>
              )}

              {/* Reopen from approved — admin only */}
              {doc.status === 'aprovado' && role === 'admin' && (
                <button
                  onClick={() => handleWorkflowAction('submit-review')}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-2 border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reabrir para Revisão
                </button>
              )}
            </div>

            {/* Reject form */}
            {showRejectForm && doc.status === 'em_revisao' && role === 'admin' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-orange-800">Motivo da rejeição (opcional)</p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Descreva o motivo da rejeição para orientar o autor..."
                  rows={3}
                  className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400 resize-y bg-white"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleWorkflowAction('reject')}
                    disabled={workflowLoading}
                    className="bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 text-sm disabled:opacity-50"
                  >
                    Confirmar Rejeição
                  </button>
                  <button
                    onClick={() => { setShowRejectForm(false); setRejectReason('') }}
                    className="border text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Rejection info */}
            {doc.status === 'rejeitado' && doc.metadata_?.rejection_reason && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    Rejeitado por {doc.metadata_.rejected_by_name || 'administrador'}
                  </p>
                  <p className="text-sm text-orange-700 mt-1">{doc.metadata_.rejection_reason}</p>
                </div>
              </div>
            )}

            {/* Approval info */}
            {doc.status === 'aprovado' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
                <ThumbsUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <p className="text-sm text-emerald-700">
                  Aprovado por <strong>{doc.metadata_?.approved_by_name || 'administrador'}</strong>
                </p>
              </div>
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

      {/* Quality issues */}
      {doc.quality_issues && doc.quality_issues.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              Problemas de Qualidade Detectados ({doc.quality_issues.length})
            </h2>
          </div>
          <div className="divide-y">
            {doc.quality_issues.map((issue, i) => {
              const severityColors = {
                high: 'bg-red-50 border-l-4 border-red-400',
                medium: 'bg-amber-50 border-l-4 border-amber-400',
                low: 'bg-blue-50 border-l-4 border-blue-300',
              }
              const severityLabels = { high: 'Alto', medium: 'Médio', low: 'Baixo' }
              const severityTextColors = { high: 'text-red-700', medium: 'text-amber-700', low: 'text-blue-700' }
              return (
                <div key={i} className={`px-6 py-4 ${severityColors[issue.severity] || ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      issue.severity === 'high' ? 'bg-red-100 text-red-700'
                        : issue.severity === 'medium' ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {severityLabels[issue.severity] || issue.severity}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${severityTextColors[issue.severity] || 'text-gray-700'}`}>
                        {issue.type}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">{issue.description}</p>
                      {issue.suggestion && (
                        <p className="text-xs text-gray-500 mt-1 italic">Sugestão: {issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
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
