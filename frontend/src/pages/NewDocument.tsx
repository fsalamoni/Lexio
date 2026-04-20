import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, FileText, ArrowRight, Sparkles, Loader2, MessageCircleQuestion } from 'lucide-react'
import api, { invalidateApiCache } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { IS_FIREBASE } from '../lib/firebase'
import {
  loadAdminDocumentTypes, loadAdminLegalAreas,
  createDocument,
  getDocumentTypesForProfile, getLegalAreasForProfile,
  getProfile, type ProfileData,
  getUserSettings,
  type ContextDetailData, type ContextDetailQuestion,
} from '../lib/firestore-service'
import { generateDocument, generateContextQuestions, estimateDocumentGenerationCost, type GenerationProgress } from '../lib/generation-service'
import { ModelUnavailableError, TransientLLMError } from '../lib/llm-client'
import { ModelsNotConfiguredError } from '../lib/model-config'
import type { UserProfileForGeneration } from '../lib/generation-service'
import PipelineProgressPanel, {
} from '../components/PipelineProgressPanel'
import AgentTrailProgressModal from '../components/AgentTrailProgressModal'
import {
  applyDocumentPipelineProgress,
  createDocumentPipelineSteps,
  DOCUMENT_PIPELINE_COMPLETED_PHASE,
  getDocumentStepMeta,
  type DocumentPipelineStep,
} from '../lib/document-pipeline'
import { buildWorkspaceDocumentDetailPath, buildWorkspaceSettingsPath } from '../lib/workspace-routes'

interface DocType {
  id: string
  name: string
  description: string
  templates: string[]
}

interface LegalAreaOption {
  id: string
  name: string
  description: string
}

export default function NewDocument() {
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [legalAreas, setLegalAreas] = useState<LegalAreaOption[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null)
  const [pipelineAgents, setPipelineAgents] = useState<DocumentPipelineStep[]>([])
  const [pipelinePercent, setPipelinePercent] = useState(0)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [pipelineError, setPipelineError] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfileForGeneration | null>(null)
  const agentTimers = useRef<Record<string, number>>({})

  // Context detail state
  const [contextDetail, setContextDetail] = useState<ContextDetailData | null>(null)
  const [loadingContextDetail, setLoadingContextDetail] = useState(false)
  const [showContextDetail, setShowContextDetail] = useState(false)

  const { userId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { startTask } = useTaskManager()
  const prefillHandledRef = useRef(false)

  const MAX_REQUEST = 2000

  // Whether the main form fields are ready for generation
  const formReady = !!selectedType && request.trim().length > 0

  // Cost estimate based on current form state
  const costEstimate = useMemo(() => {
    if (!formReady) return null
    return estimateDocumentGenerationCost(request.length, true, 0)
  }, [formReady, request.length])

  // Initialise pipeline agents state from template
  const initPipeline = useCallback(() => {
    setPipelineAgents(createDocumentPipelineSteps())
    setPipelinePercent(0)
    setPipelineMessage('')
    setPipelineComplete(false)
    setPipelineError(false)
    agentTimers.current = {}
  }, [])

  // Handle progress updates from the generation service
  const handleProgress = useCallback((p: GenerationProgress) => {
    const now = Date.now()

    setPipelineAgents(prev => applyDocumentPipelineProgress(prev, p, agentTimers.current, now))

    setPipelinePercent(p.percent)
    setPipelineMessage(p.message)

    if (p.phase === DOCUMENT_PIPELINE_COMPLETED_PHASE) {
      setPipelineAgents(prev =>
        prev.map(a =>
          a.status === 'active'
            ? { ...a, status: 'completed' as const, completedAt: now }
            : a,
        ),
      )
      setPipelinePercent(100)
      setPipelineComplete(true)
    }
  }, [])

  useEffect(() => {
    if (IS_FIREBASE && userId) {
      // Load user profile first, then filter doc types/areas accordingly
      Promise.all([
        getProfile(userId),
        loadAdminDocumentTypes(),
        loadAdminLegalAreas(),
      ]).then(([profile, availableDocTypes, availableLegalAreas]: [ProfileData | null, DocType[], LegalAreaOption[]]) => {
        setUserProfile(profile ?? null)
        setDocTypes(getDocumentTypesForProfile(profile ?? null, availableDocTypes))
        const sortedAreas = getLegalAreasForProfile(profile ?? null, availableLegalAreas)
        setLegalAreas(sortedAreas)
        if (profile?.primary_areas && profile.primary_areas.length > 0) {
          setSelectedAreas(profile.primary_areas)
        }
        if (profile?.default_document_type) {
          setSelectedType(profile.default_document_type)
        }
      }).catch(() => {
        toast.error('Erro ao carregar tipos de documento e áreas disponíveis')
      }).finally(() => setLoadingTypes(false))
    } else if (IS_FIREBASE) {
      Promise.all([
        loadAdminDocumentTypes(),
        loadAdminLegalAreas(),
      ]).then(([availableDocTypes, availableLegalAreas]: [DocType[], LegalAreaOption[]]) => {
        setDocTypes(availableDocTypes)
        setLegalAreas(availableLegalAreas)
      }).catch(() => {
        toast.error('Erro ao carregar tipos de documento e áreas disponíveis')
      }).finally(() => setLoadingTypes(false))
    } else {
      Promise.all([
        api.get('/document-types').then(res => setDocTypes(Array.isArray(res.data) ? res.data : [])),
        api.get('/legal-areas').then(res => setLegalAreas(Array.isArray(res.data) ? res.data : [])),
      ]).catch(() => toast.error('Erro ao carregar tipos de documento e áreas disponíveis')).finally(() => setLoadingTypes(false))
    }
  }, [userId])

  // Pre-fill form from query params (e.g. "Abrir no Gerador" from DocumentDetail)
  useEffect(() => {
    if (prefillHandledRef.current || loadingTypes) return
    const qRequest = searchParams.get('request')
    const qType = searchParams.get('type')
    if (!qRequest && !qType) return
    prefillHandledRef.current = true
    if (qRequest) setRequest(qRequest)
    if (qType && docTypes.some(t => t.id === qType)) setSelectedType(qType)
    // Clean query params without triggering a navigation
    setSearchParams({}, { replace: true })
  }, [searchParams, docTypes, loadingTypes, setSearchParams])

  // Ctrl+Enter keyboard shortcut to submit form
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

  const currentType = docTypes.find((t) => t.id === selectedType)

  // Handle "Detalhar contexto" — AI generates clarifying questions
  const handleDetailContext = async () => {
    if (!formReady) return
    setLoadingContextDetail(true)
    try {
      const result = await generateContextQuestions(selectedType, request, selectedAreas)
      setContextDetail({
        analysis_summary: result.analysis_summary,
        questions: result.questions,
        llm_execution: result.llm_execution,
      })
      setShowContextDetail(true)
    } catch (err: any) {
      if (err instanceof ModelsNotConfiguredError) {
        toast.warning('Modelos não configurados', 'Configure os modelos em Configurações antes de usar esta funcionalidade.')
        navigate(buildWorkspaceSettingsPath({ preserveSearch: location.search }))
      } else if (err instanceof ModelUnavailableError) {
        toast.warning(`Modelo indisponível: ${err.modelId}`, 'Vá em Configurações e substitua-o por outro.')
      } else {
        toast.error('Erro ao detalhar contexto', err?.message || 'Tente novamente')
      }
    } finally {
      setLoadingContextDetail(false)
    }
  }

  // Update a single question answer
  const updateAnswer = (questionId: string, answer: string) => {
    setContextDetail(prev => {
      if (!prev) return prev
      return {
        ...prev,
        questions: prev.questions.map(q =>
          q.id === questionId ? { ...q, answer } : q,
        ),
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedType || !request.trim()) return

    // Budget warning check (non-blocking unless hard_block is set)
    if (IS_FIREBASE && userId && costEstimate) {
      try {
        const settings = await getUserSettings(userId)
        const budget = settings?.token_budget
        if (budget) {
          const monthlyLimit = budget.monthly_limit_usd ?? 0
          const warningPct = budget.warning_threshold_pct ?? 80
          if (monthlyLimit > 0) {
            // Approximate: use total_cost_usd from settings if available
            const totalSpend = (settings as Record<string, unknown>).total_cost_usd as number | undefined
            if (totalSpend && totalSpend >= monthlyLimit) {
              if (budget.hard_block) {
                toast.error('Orçamento excedido', 'O limite mensal de tokens foi atingido. Ajuste em Custos & Tokens.')
                return
              }
              toast.warning('Orçamento excedido', `Gasto atual: $${totalSpend.toFixed(2)} / $${monthlyLimit.toFixed(2)}. A geração prosseguirá.`)
            } else if (totalSpend && (totalSpend / monthlyLimit) * 100 >= warningPct) {
              toast.warning('Orçamento em alerta', `Gasto atual: $${totalSpend.toFixed(2)} / $${monthlyLimit.toFixed(2)} (${Math.round((totalSpend / monthlyLimit) * 100)}%)`)
            }
          }
        }
      } catch {
        // Non-critical — proceed with generation
      }
    }

    // Confirm for estimated costly operations (above $0.10)
    if (costEstimate && costEstimate.estimatedCostUsd > 0.10) {
      const proceed = window.confirm(
        `Esta geração está estimada em ~$${costEstimate.estimatedCostUsd.toFixed(3)} USD (${costEstimate.agentCount} agentes, ~${(costEstimate.estimatedTokens / 1000).toFixed(0)}k tokens). Deseja continuar?`
      )
      if (!proceed) return
    }

    setLoading(true)
    try {
      if (IS_FIREBASE && userId) {
        const newDoc = await createDocument(userId, {
          document_type_id: selectedType,
          original_request: request,
          template_variant: selectedTemplate || null,
          legal_area_ids: selectedAreas.length > 0 ? selectedAreas : null,
          context_detail: contextDetail,
        })
        invalidateApiCache('/stats')

        // Stay on page and show pipeline progress
        initPipeline()
        setGenerating(true)
        setGeneratedDocId(newDoc.id!)
        setLoading(false)

        // Register with global task manager so it persists across navigation
        const docTypeName = docTypes.find(d => d.id === selectedType)?.name || selectedType
        startTask(`Gerando: ${docTypeName}`, async (onTaskProgress) => {
          try {
            await generateDocument(
              userId,
              newDoc.id!,
              selectedType,
              request,
              selectedAreas,
              null,
              (p) => {
                handleProgress(p)
                const pct = p.phase === DOCUMENT_PIPELINE_COMPLETED_PHASE
                  ? 100
                  : Math.min(95, (p.step / p.totalSteps) * 100)
                onTaskProgress({ progress: pct, phase: p.message || p.phase })
              },
              userProfile,
              contextDetail,
            )
            return newDoc.id
          } catch (err: any) {
            console.error('Generation failed:', err)
            setPipelineError(true)
            setPipelineAgents(prev =>
              prev.map(a =>
                a.status === 'active'
                  ? { ...a, status: 'error' as const, completedAt: Date.now() }
                  : a,
              ),
            )
            if (err instanceof ModelsNotConfiguredError) {
              setPipelineMessage('Modelos não configurados. Vá em Configurações.')
              toast.warning('Modelos não configurados', err.message)
              navigate(buildWorkspaceSettingsPath({ preserveSearch: location.search }))
            } else if (err instanceof ModelUnavailableError) {
              setPipelineMessage(`Modelo "${err.modelId}" indisponível. Altere-o em Configurações.`)
              toast.warning(
                `Modelo indisponível: ${err.modelId}`,
                'Este modelo foi removido do OpenRouter. Vá em Configurações e substitua-o por outro.',
              )
            } else if (err instanceof TransientLLMError) {
              const msg = 'O modelo LLM não respondeu. Tente novamente ou altere o modelo em Configurações.'
              setPipelineMessage(msg)
              toast.error('Modelo sem resposta', msg)
            } else {
              setPipelineMessage(err?.message || 'Erro na geração')
              const { humanizeError } = await import('../lib/error-humanizer')
              const humanized = humanizeError(err)
              toast.error(humanized.title, humanized.detail || err?.message)
            }
            throw err
          }
        })
      } else {
        const res = await api.post('/documents', {
          document_type_id: selectedType,
          original_request: request,
          template_variant: selectedTemplate || null,
          legal_area_ids: selectedAreas.length > 0 ? selectedAreas : null,
        })
        invalidateApiCache('/stats')
        navigate(buildWorkspaceDocumentDetailPath(res.data.id, { preserveSearch: location.search }))
      }
    } catch (err: any) {
      toast.error('Erro ao criar documento', err?.response?.data?.detail || err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6 v2-bridge-surface">
      <V2PageHero
        eyebrow={<><FileText className="h-3.5 w-3.5" /> Gerador</>}
        title="Configure o caso e dispare a trilha multiagente sem sair do novo workspace"
        description="Defina tipo documental, areas, contexto e escopo da solicitacao para iniciar uma geracao guiada por pipeline, com visibilidade de custo e aprofundamento opcional de contexto." 
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Preparacao atual</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Tipo</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{currentType?.name || 'Nao definido'}</p>
            </div>
            <div className="rounded-[1.4rem] bg-[rgba(255,255,255,0.82)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Solicitacao</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">{request.length}/{MAX_REQUEST}</p>
            </div>
          </div>
        )}
      />

      <V2MetricGrid
        items={[
          {
            label: 'Tipo documental',
            value: currentType?.name || 'Pendente',
            helper: 'Selecione a estrutura de saida desejada',
            icon: FileText,
            tone: selectedType ? 'accent' : 'default',
          },
          {
            label: 'Areas selecionadas',
            value: selectedAreas.length.toLocaleString('pt-BR'),
            helper: selectedAreas.length > 0 ? 'Filtro juridico ativo' : 'Sem restricao de area',
            icon: ChevronDown,
          },
          {
            label: 'Context detail',
            value: contextDetail ? 'Pronto' : 'Opcional',
            helper: contextDetail ? `${contextDetail.questions.filter(q => q.answer.trim()).length}/${contextDetail.questions.length} respostas` : 'Perguntas geradas sob demanda',
            icon: MessageCircleQuestion,
          },
          {
            label: 'Estimativa',
            value: costEstimate ? `~$${costEstimate.estimatedCostUsd.toFixed(3)}` : 'Aguardando',
            helper: costEstimate ? `~${(costEstimate.estimatedTokens / 1000).toFixed(0)}k tokens` : 'Preencha tipo e solicitacao',
            icon: Sparkles,
            tone: costEstimate ? 'warm' : 'default',
          },
        ]}
      />
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        {/* Main form */}
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
                onChange={(e) => { setSelectedType(e.target.value); setSelectedTemplate(''); setContextDetail(null); setShowContextDetail(false) }}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 bg-white text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                required
              >
                <option value="">Selecione o tipo...</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

          {currentType?.templates && currentType.templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full border rounded-lg px-4 py-2"
              >
                <option value="">Genérico</option>
                {currentType.templates.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Áreas do Direito</label>
            <div className="flex flex-wrap gap-2">
              {legalAreas.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => setSelectedAreas((prev) =>
                    prev.includes(area.id)
                      ? prev.filter((a) => a !== area.id)
                      : [...prev, area.id]
                  )}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedAreas.includes(area.id)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
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
              className="w-full border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm resize-y"
              placeholder="Descreva a questão jurídica que deseja analisar..."
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Seja específico — inclua fatos, legislação aplicável e o resultado esperado.
            </p>
          </div>
        </div>

        {/* Context Detail — AI-assisted Q&A section */}
        {contextDetail && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowContextDetail(prev => !prev)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <MessageCircleQuestion className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Detalhamento de Contexto</span>
                <span className="text-xs text-purple-600 font-medium">
                  {contextDetail.questions.filter(q => q.answer.trim()).length}/{contextDetail.questions.length} respondidas
                </span>
              </div>
              {showContextDetail
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />
              }
            </button>
            {showContextDetail && (
            <div className="px-6 pb-6 space-y-5">
              {/* Analysis summary */}
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-xs font-medium text-purple-700 mb-1">Análise preliminar</p>
                <p className="text-sm text-purple-900">{contextDetail.analysis_summary}</p>
              </div>

              {/* Questions */}
              {contextDetail.questions.map((q, idx) => (
                <div key={q.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="text-purple-600 font-semibold mr-1">{idx + 1}.</span>
                    {q.question}
                  </label>
                  <textarea
                    value={q.answer}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm resize-y"
                    placeholder="Sua resposta (opcional)..."
                  />
                </div>
              ))}
              <p className="text-xs text-gray-400">
                Responda as perguntas que considerar relevantes. Perguntas sem resposta serão ignoradas.
              </p>
            </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {/* Detalhar contexto button — optional AI-assisted step */}
          {formReady && !generating && IS_FIREBASE && (
            <button
              type="button"
              onClick={handleDetailContext}
              disabled={loadingContextDetail || generating}
              className="flex items-center justify-center gap-2 border border-purple-300 text-purple-700 px-4 py-3.5 rounded-xl hover:bg-purple-50 disabled:opacity-50 font-semibold text-sm transition-colors disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loadingContextDetail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {contextDetail ? 'Refazer perguntas' : 'Detalhar contexto'}
                </>
              )}
            </button>
          )}

          {/* Cost estimate preview */}
          {costEstimate && !generating && (
            <div className="w-full text-xs text-gray-500 flex items-center justify-between px-1">
              <span>Estimativa: ~{costEstimate.agentCount} agentes, ~{(costEstimate.estimatedTokens / 1000).toFixed(0)}k tokens</span>
              <span className="font-medium text-amber-600">~${costEstimate.estimatedCostUsd.toFixed(3)} USD</span>
            </div>
          )}

          {/* Generate button */}
          <button
            type="submit"
            disabled={loading || loadingTypes || !selectedType || !request.trim() || generating}
            className="flex-1 bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 disabled:opacity-50 font-semibold text-sm transition-colors shadow-sm disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Criando documento...
              </span>
            ) : generating ? 'Geração em andamento...' : (
              <span className="inline-flex items-center gap-2">
                Gerar Documento com IA
                <kbd className="hidden sm:inline-block text-xs bg-brand-500/30 px-1.5 py-0.5 rounded">Ctrl+Enter</kbd>
              </span>
            )}
          </button>
        </div>
      </form>

      <AgentTrailProgressModal
        isOpen={generating}
        title="Trilha de Geração de Documento"
        subtitle={currentType?.name || selectedType || undefined}
        currentMessage={pipelineMessage || 'Inicializando agentes...'}
        percent={pipelinePercent}
        steps={pipelineAgents.map(agent => ({
          key: agent.key,
          label: agent.label,
          status: agent.status,
          detail: agent.runtimeMessage || agent.description,
          meta: getDocumentStepMeta(agent),
        }))}
        isComplete={pipelineComplete}
        hasError={pipelineError}
        canClose={pipelineComplete || pipelineError}
        onClose={() => {
          if (pipelineComplete || pipelineError) setGenerating(false)
        }}
      >
        <PipelineProgressPanel
          agents={pipelineAgents}
          percent={pipelinePercent}
          currentMessage={pipelineMessage}
          isComplete={pipelineComplete}
          hasError={pipelineError}
        />

        {(pipelineComplete || pipelineError) && generatedDocId && (
          <button
            type="button"
            onClick={() => navigate(buildWorkspaceDocumentDetailPath(generatedDocId, { preserveSearch: location.search }))}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 font-semibold text-sm transition-colors shadow-sm"
          >
            {pipelineComplete ? 'Ver Documento Gerado' : 'Ver Documento'}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </AgentTrailProgressModal>
    </div>
  )
}
