import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText, ArrowRight, Sparkles, X, Hammer } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { IS_FIREBASE } from '../lib/firebase'
import { isEnabled as isFeatureEnabled } from '../lib/feature-flags'
import {
  loadAdminDocumentTypes, loadAdminLegalAreas,
  getDocumentTypesForProfile, getLegalAreasForProfile,
  getProfile,
} from '../lib/firestore-service'
import {
  createDocumentV4,
  generateDocumentV4,
  type GenerationProgressV4,
} from '../lib/document-v4-orchestrator'
import { ModelUnavailableError, TransientLLMError } from '../lib/llm-client'
import { ModelsNotConfiguredError } from '../lib/model-config'
import type { UserProfileForGeneration } from '../lib/generation-service'
import {
  applyDocumentV4PipelineProgress,
  createDocumentV4PipelineSteps,
  DOCUMENT_V4_PIPELINE_COMPLETED_PHASE,
  type DocumentV4PipelineStep,
} from '../lib/document-v4-pipeline'
import { deriveExecutionState, normalizeProgressForExecution } from '../lib/pipeline-execution-contract'
import { buildWorkspaceDocumentDetailPath, buildWorkspaceSettingsPath } from '../lib/workspace-routes'

interface DocType { id: string; name: string; description: string; templates: string[] }
interface LegalAreaOption { id: string; name: string; description: string }

const MAX_REQUEST = 2000

export default function NewDocumentV4() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { userId } = useAuth()
  const { startTask } = useTaskManager()

  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [legalAreas, setLegalAreas] = useState<LegalAreaOption[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null)
  const [pipelineSteps, setPipelineSteps] = useState<DocumentV4PipelineStep[]>([])
  const [pipelinePercent, setPipelinePercent] = useState(0)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipelineIteration, setPipelineIteration] = useState<number | null>(null)
  const [pipelineTool, setPipelineTool] = useState<string | null>(null)
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [pipelineError, setPipelineError] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfileForGeneration | null>(null)
  const stepTimers = useRef<Record<string, number>>({})
  const abortControllerRef = useRef<AbortController | null>(null)

  const flagOn = isFeatureEnabled('FF_DOCUMENT_GENERATION_V4')

  // Redirect to v2 picker when flag is off — surfaces a clear "not available" path
  // instead of letting the user submit a v4 request that can't run.
  useEffect(() => {
    if (!flagOn) {
      navigate('/documents/new', { replace: true })
    }
  }, [flagOn, navigate])

  const formReady = !!selectedType && request.trim().length > 0

  const initPipeline = useCallback(() => {
    setPipelineSteps(createDocumentV4PipelineSteps())
    setPipelinePercent(0)
    setPipelineMessage('')
    setPipelineIteration(null)
    setPipelineTool(null)
    setPipelineComplete(false)
    setPipelineError(false)
    stepTimers.current = {}
  }, [])

  const handleProgress = useCallback((p: GenerationProgressV4) => {
    const now = Date.now()
    const completed = p.phase === DOCUMENT_V4_PIPELINE_COMPLETED_PHASE || p.executionState === 'completed'
    const executionState = completed
      ? 'completed'
      : deriveExecutionState({ progress: p.percent, phase: p.phase, executionState: p.executionState })
    const normalizedPercent = normalizeProgressForExecution({ progress: p.percent, executionState })
    const progressWithState = { ...p, executionState }
    setPipelineSteps(prev => applyDocumentV4PipelineProgress(prev, progressWithState, stepTimers.current, now))
    setPipelinePercent(normalizedPercent)
    setPipelineMessage(p.message)
    if (typeof p.iteration === 'number') setPipelineIteration(p.iteration)
    if (typeof p.tool === 'string') setPipelineTool(p.tool)
    if (p.phase === DOCUMENT_V4_PIPELINE_COMPLETED_PHASE) {
      setPipelinePercent(100)
      setPipelineComplete(true)
    }
  }, [])

  useEffect(() => {
    if (IS_FIREBASE && userId) {
      Promise.allSettled([
        getProfile(userId),
        loadAdminDocumentTypes(),
        loadAdminLegalAreas(),
      ]).then(([profileResult, docTypesResult, legalAreasResult]) => {
        const availableDocTypes = docTypesResult.status === 'fulfilled' ? docTypesResult.value : []
        const availableLegalAreas = legalAreasResult.status === 'fulfilled' ? legalAreasResult.value : []
        const profile = profileResult.status === 'fulfilled' ? profileResult.value ?? null : null
        setUserProfile(profile)
        setDocTypes(getDocumentTypesForProfile(profile, availableDocTypes))
        setLegalAreas(getLegalAreasForProfile(profile, availableLegalAreas))
        if (profile?.primary_areas?.length) {
          const ids = new Set(availableLegalAreas.map(a => a.id))
          setSelectedAreas(profile.primary_areas.filter(id => ids.has(id)))
        }
        if (profile?.default_document_type && availableDocTypes.some(d => d.id === profile.default_document_type)) {
          setSelectedType(profile.default_document_type)
        }
        if (docTypesResult.status === 'rejected' || legalAreasResult.status === 'rejected') {
          toast.error('Erro ao carregar tipos de documento e áreas')
        }
      }).finally(() => setLoadingTypes(false))
    } else {
      setLoadingTypes(false)
    }
  }, [userId])

  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter' && formReady && !loading && !generating) {
        e.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [formReady, loading, generating])

  const currentType = docTypes.find(t => t.id === selectedType)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedType || !request.trim() || !userId || !IS_FIREBASE) return
    setLoading(true)
    try {
      const newDoc = await createDocumentV4(userId, {
        document_type_id: selectedType,
        original_request: request,
        legal_area_ids: selectedAreas.length > 0 ? selectedAreas : null,
      })
      initPipeline()
      setGenerating(true)
      setGeneratedDocId(newDoc.id)
      setLoading(false)
      const controller = new AbortController()
      abortControllerRef.current = controller
      const docTypeName = docTypes.find(d => d.id === selectedType)?.name || selectedType
      startTask(`Gerando documento v4: ${docTypeName}`, async (onTaskProgress) => {
        try {
          await generateDocumentV4(
            userId,
            newDoc.id,
            selectedType,
            request,
            selectedAreas,
            null,
            (p) => {
              handleProgress(p)
              const executionState = deriveExecutionState({ progress: p.percent, phase: p.phase, executionState: p.executionState })
              const pct = normalizeProgressForExecution({ progress: p.percent, executionState })
              onTaskProgress({
                progress: pct,
                phase: p.message || p.phase,
                executionState,
                stageMeta: p.stageMeta,
                currentStep: 1,
                totalSteps: 4,
              })
            },
            userProfile,
            null,
            { signal: controller.signal },
          )
          return newDoc.id
        } catch (err: any) {
          abortControllerRef.current = null
          if (err?.name === 'AbortError') return newDoc.id
          setPipelineError(true)
          setPipelineSteps(prev => prev.map(s =>
            s.status === 'active' ? { ...s, status: 'error' as const, completedAt: Date.now() } : s,
          ))
          if (err instanceof ModelsNotConfiguredError) {
            setPipelineMessage('Modelo do agente v4 não configurado. Vá em Configurações.')
            toast.warning('Modelo não configurado', err.message)
            navigate(buildWorkspaceSettingsPath({ preserveSearch: location.search }))
          } else if (err instanceof ModelUnavailableError) {
            setPipelineMessage(`Modelo "${err.modelId}" indisponível.`)
            toast.warning(`Modelo indisponível: ${err.modelId}`, 'Substitua-o em Configurações.')
          } else if (err instanceof TransientLLMError) {
            setPipelineMessage('O modelo LLM não respondeu. Tente novamente ou altere o modelo.')
            toast.error('Modelo sem resposta', 'Tente novamente em alguns instantes.')
          } else {
            setPipelineMessage(err?.message || 'Erro na geração')
            const { humanizeError } = await import('../lib/error-humanizer')
            const humanized = humanizeError(err)
            toast.error(humanized.title, humanized.detail || err?.message)
          }
          throw err
        }
      })
    } catch (err: any) {
      toast.error('Erro ao criar documento', err?.message)
    } finally {
      setLoading(false)
    }
  }

  if (!flagOn) {
    // While the redirect effect runs, render an empty shell to avoid flash.
    return null
  }

  return (
    <div className="space-y-6 v2-bridge-surface">
      <V2PageHero
        eyebrow={<><FileText className="h-3.5 w-3.5" /> Novo Documento (v4 — experimental)</>}
        title="Agente único + ferramentas, com crítico opcional"
        description="Um modelo reasoning-tier decide quando buscar acervo, jurisprudência e web. Reduz custo e latência mantendo a qualidade jurídica via crítico evaluator-optimizer."
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Pipeline</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Versão</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">v4</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Tipo</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{currentType?.name || 'Não definido'}</p>
            </div>
          </div>
        )}
      />

      <V2MetricGrid
        items={[
          { label: 'Tipo documental', value: currentType?.name || 'Pendente', helper: 'Selecione a estrutura', icon: FileText, tone: selectedType ? 'accent' : 'default' },
          { label: 'Áreas selecionadas', value: selectedAreas.length.toLocaleString('pt-BR'), helper: selectedAreas.length > 0 ? 'Filtro jurídico ativo' : 'Sem restrição', icon: Sparkles },
          { label: 'Arquitetura', value: 'Single-agent', helper: '1 agente + ferramentas em loop', icon: Hammer, tone: 'warm' },
          { label: 'Solicitação', value: `${request.length}/${MAX_REQUEST}`, helper: 'Caracteres', icon: FileText },
        ]}
      />

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Documento <span className="text-red-500">*</span>
            </label>
            {loadingTypes ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : (
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              >
                <option value="">Selecione o tipo...</option>
                {docTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Áreas do Direito</label>
            <div className="flex flex-wrap gap-2">
              {legalAreas.map(area => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreas(prev =>
                    prev.includes(area.id) ? prev.filter(a => a !== area.id) : [...prev, area.id],
                  )}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedAreas.includes(area.id) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Solicitação <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs tabular-nums ${request.length > MAX_REQUEST * 0.9 ? 'text-amber-600' : 'text-gray-400'}`}>
                {request.length}/{MAX_REQUEST}
              </span>
            </div>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value.slice(0, MAX_REQUEST))}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-y"
              placeholder="Descreva a questão jurídica..."
              required
            />
            <p className="text-xs text-gray-400 mt-1">Seja específico — fatos, legislação aplicável e resultado esperado.</p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || loadingTypes || !formReady || generating}
          className="w-full bg-teal-600 text-white py-3.5 rounded-xl hover:bg-teal-700 disabled:opacity-50 font-semibold text-sm transition-colors shadow-sm disabled:cursor-not-allowed"
        >
          {loading
            ? 'Criando documento...'
            : generating
              ? 'Geração em andamento...'
              : (
                <span className="inline-flex items-center gap-2">
                  Gerar documento v4
                  <kbd className="hidden sm:inline-block text-xs bg-teal-500/30 px-1.5 py-0.5 rounded">Ctrl+Enter</kbd>
                </span>
              )}
        </button>
      </form>

      {/* Inline v4 progress overlay — simpler than v3 because the pipeline is linear. */}
      {generating && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Geração v4 em andamento</h2>
                <p className="text-sm text-slate-600 mt-1">{currentType?.name || selectedType}</p>
              </div>
              {(pipelineComplete || pipelineError) && (
                <button
                  type="button"
                  onClick={() => setGenerating(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                  <span>{pipelineMessage || 'Inicializando…'}</span>
                  <span className="tabular-nums">{Math.round(pipelinePercent)}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all ${pipelineError ? 'bg-rose-500' : pipelineComplete ? 'bg-emerald-500' : 'bg-teal-500'}`}
                    style={{ width: `${pipelinePercent}%` }}
                  />
                </div>
              </div>
              {pipelineIteration != null && (
                <div className="text-sm text-slate-600">
                  Iteração: <strong>{pipelineIteration}</strong>
                  {pipelineTool && <> · Ferramenta atual: <code className="font-mono text-xs">{pipelineTool}</code></>}
                </div>
              )}
              <ul className="space-y-1.5">
                {pipelineSteps.map(step => (
                  <li key={step.key} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      step.status === 'completed' ? 'bg-emerald-500'
                      : step.status === 'active' ? 'bg-teal-500 animate-pulse'
                      : step.status === 'error' ? 'bg-rose-500'
                      : 'bg-slate-300'
                    }`} />
                    <span className={step.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}>
                      {step.label}
                    </span>
                    {step.runtimeMessage && step.status === 'active' && (
                      <span className="text-xs text-slate-500 truncate">— {step.runtimeMessage}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              {!pipelineComplete && !pipelineError && (
                <button
                  type="button"
                  onClick={() => {
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort()
                      abortControllerRef.current = null
                      setPipelineError(true)
                      setPipelineMessage('Geração cancelada pelo usuário.')
                      setPipelineSteps(prev => prev.map(s =>
                        s.status === 'active' ? { ...s, status: 'error' as const, completedAt: Date.now() } : s,
                      ))
                      toast.info('Geração cancelada', 'A pipeline v4 foi interrompida.')
                    }
                  }}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
              )}
              {(pipelineComplete || pipelineError) && generatedDocId && (
                <button
                  type="button"
                  onClick={() => navigate(buildWorkspaceDocumentDetailPath(generatedDocId, { preserveSearch: location.search }))}
                  className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-teal-700"
                >
                  {pipelineComplete ? 'Ver documento gerado' : 'Ver documento'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
