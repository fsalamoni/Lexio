import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, FileText, ArrowRight, Sparkles, Loader2, MessageCircleQuestion } from 'lucide-react'
import api, { invalidateApiCache } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { IS_FIREBASE } from '../lib/firebase'
import {
  getDocumentTypes, getLegalAreas,
  createDocument,
  getDocumentTypesForProfile, getLegalAreasForProfile,
  getProfile, type ProfileData,
  type ContextDetailData, type ContextDetailQuestion,
} from '../lib/firestore-service'
import { generateDocument, generateContextQuestions, type GenerationProgress } from '../lib/generation-service'
import { ModelUnavailableError, TransientLLMError } from '../lib/llm-client'
import type { UserProfileForGeneration } from '../lib/generation-service'
import PipelineProgressPanel, {
  PIPELINE_AGENTS,
  PHASE_COMPLETED,
  type AgentStep,
} from '../components/PipelineProgressPanel'

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
  const [pipelineAgents, setPipelineAgents] = useState<AgentStep[]>([])
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
  const toast = useToast()
  const { startTask } = useTaskManager()

  const MAX_REQUEST = 2000

  // Whether the main form fields are ready for generation
  const formReady = !!selectedType && request.trim().length > 0

  // Initialise pipeline agents state from template
  const initPipeline = useCallback(() => {
    setPipelineAgents(
      PIPELINE_AGENTS.map(a => ({ ...a, status: 'pending' as const })),
    )
    setPipelinePercent(0)
    setPipelineMessage('')
    setPipelineComplete(false)
    setPipelineError(false)
    agentTimers.current = {}
  }, [])

  // Handle progress updates from the generation service
  const handleProgress = useCallback((p: GenerationProgress) => {
    const now = Date.now()

    setPipelineAgents(prev => {
      const phaseKey = p.phase
      // Find the index of the current phase in the pipeline
      const phaseIdx = prev.findIndex(a => a.key === phaseKey)
      return prev.map((agent, idx) => {
        if (agent.key === phaseKey && agent.status !== 'completed') {
          // Mark this agent as active and record start time
          if (!agentTimers.current[phaseKey]) {
            agentTimers.current[phaseKey] = now
          }
          return { ...agent, status: 'active' as const, startedAt: agentTimers.current[phaseKey] }
        }
        // Mark all agents before the current phase as completed
        if (idx < phaseIdx && agent.status === 'active') {
          return {
            ...agent,
            status: 'completed' as const,
            completedAt: now,
          }
        }
        return agent
      })
    })

    setPipelinePercent(p.percent)
    setPipelineMessage(p.message)

    if (p.phase === PHASE_COMPLETED) {
      // Mark all agents as completed
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
      getProfile(userId).then((profile: ProfileData | null) => {
        setUserProfile(profile ?? null)
        setDocTypes(getDocumentTypesForProfile(profile ?? null))
        const sortedAreas = getLegalAreasForProfile(profile ?? null)
        setLegalAreas(sortedAreas)
        // Pre-select user's primary legal areas
        if (profile?.primary_areas && profile.primary_areas.length > 0) {
          setSelectedAreas(profile.primary_areas)
        }
        // Pre-select default document type if set in profile
        if (profile?.default_document_type) {
          setSelectedType(profile.default_document_type)
        }
      }).catch(() => {
        setDocTypes(getDocumentTypes())
        setLegalAreas(getLegalAreas())
      }).finally(() => setLoadingTypes(false))
    } else if (IS_FIREBASE) {
      setDocTypes(getDocumentTypes())
      setLegalAreas(getLegalAreas())
      setLoadingTypes(false)
    } else {
      Promise.all([
        api.get('/document-types').then(res => setDocTypes(Array.isArray(res.data) ? res.data : [])),
        api.get('/legal-areas').then(res => setLegalAreas(Array.isArray(res.data) ? res.data : [])),
      ]).catch(() => toast.error('Erro ao carregar tipos de documento e áreas disponíveis')).finally(() => setLoadingTypes(false))
    }
  }, [userId])

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
      if (err instanceof ModelUnavailableError) {
        toast.warning(`Modelo indisponível: ${err.modelId}`, 'Vá em Administração e substitua-o por outro.')
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
                const pct = p.phase === PHASE_COMPLETED ? 100 : Math.min(95, (PIPELINE_AGENTS.findIndex(a => a.key === p.phase) + 1) / PIPELINE_AGENTS.length * 100)
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
            if (err instanceof ModelUnavailableError) {
              setPipelineMessage(`Modelo "${err.modelId}" indisponível. Altere-o em Administração.`)
              toast.warning(
                `Modelo indisponível: ${err.modelId}`,
                'Este modelo foi removido do OpenRouter. Vá em Administração e substitua-o por outro.',
              )
            } else if (err instanceof TransientLLMError) {
              const msg = 'O modelo LLM não respondeu. Tente novamente ou altere o modelo em Administração.'
              setPipelineMessage(msg)
              toast.error('Modelo sem resposta', msg)
            } else {
              setPipelineMessage(err?.message || 'Erro na geração')
              toast.error('Erro na geração', err?.message)
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
        navigate(`/documents/${res.data.id}`)
      }
    } catch (err: any) {
      toast.error('Erro ao criar documento', err?.response?.data?.detail || err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Documento</h1>
          <p className="text-sm text-gray-500">Preencha os campos abaixo para iniciar a geração</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
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
            ) : generating ? 'Geração em andamento...' : 'Gerar Documento com IA'}
          </button>
        </div>
      </form>

      {/* Pipeline progress panel — shown during/after generation */}
      {generating && (
        <div className="mt-6 space-y-4">
          <PipelineProgressPanel
            agents={pipelineAgents}
            percent={pipelinePercent}
            currentMessage={pipelineMessage}
            isComplete={pipelineComplete}
            hasError={pipelineError}
          />

          {/* Navigation button when complete or on error */}
          {(pipelineComplete || pipelineError) && generatedDocId && (
            <button
              type="button"
              onClick={() => navigate(`/documents/${generatedDocId}`)}
              className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-3.5 rounded-xl hover:bg-brand-700 font-semibold text-sm transition-colors shadow-sm"
            >
              {pipelineComplete ? 'Ver Documento Gerado' : 'Ver Documento'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
