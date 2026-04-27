import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FileText, ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTaskManager } from '../contexts/TaskManagerContext'
import { useToast } from '../components/Toast'
import { Skeleton } from '../components/Skeleton'
import { V2MetricGrid, V2PageHero } from '../components/v2/V2PagePrimitives'
import { IS_FIREBASE } from '../lib/firebase'
import {
  loadAdminDocumentTypes, loadAdminLegalAreas,
  getDocumentTypesForProfile, getLegalAreasForProfile,
  getProfile,
} from '../lib/firestore-service'
import { createDocumentV3, generateDocumentV3, type GenerationProgressV3 } from '../lib/document-v3-orchestrator'
import { ModelUnavailableError, TransientLLMError } from '../lib/llm-client'
import { ModelsNotConfiguredError } from '../lib/model-config'
import type { UserProfileForGeneration } from '../lib/generation-service'
import PipelineProgressPanelV3 from '../components/PipelineProgressPanelV3'
import AgentTrailProgressModalV3 from '../components/AgentTrailProgressModalV3'
import {
  applyDocumentV3PipelineProgress,
  createDocumentV3PipelineSteps,
  DOCUMENT_V3_PIPELINE_COMPLETED_PHASE,
  type DocumentV3PipelineStep,
} from '../lib/document-v3-pipeline'
import { deriveExecutionState, normalizeProgressForExecution } from '../lib/pipeline-execution-contract'
import { buildWorkspaceDocumentDetailPath, buildWorkspaceSettingsPath } from '../lib/workspace-routes'

interface DocType { id: string; name: string; description: string; templates: string[] }
interface LegalAreaOption { id: string; name: string; description: string }

const MAX_REQUEST = 2000

export default function NewDocumentV3() {
  const [docTypes, setDocTypes] = useState<DocType[]>([])
  const [legalAreas, setLegalAreas] = useState<LegalAreaOption[]>([])
  const [selectedType, setSelectedType] = useState('')
  const [selectedAreas, setSelectedAreas] = useState<string[]>([])
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null)
  const [pipelineAgents, setPipelineAgents] = useState<DocumentV3PipelineStep[]>([])
  const [pipelinePercent, setPipelinePercent] = useState(0)
  const [pipelineMessage, setPipelineMessage] = useState('')
  const [pipelineComplete, setPipelineComplete] = useState(false)
  const [pipelineError, setPipelineError] = useState(false)
  const [userProfile, setUserProfile] = useState<UserProfileForGeneration | null>(null)
  const agentTimers = useRef<Record<string, number>>({})

  const { userId } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { startTask } = useTaskManager()

  const formReady = !!selectedType && request.trim().length > 0

  const initPipeline = useCallback(() => {
    setPipelineAgents(createDocumentV3PipelineSteps())
    setPipelinePercent(0)
    setPipelineMessage('')
    setPipelineComplete(false)
    setPipelineError(false)
    agentTimers.current = {}
  }, [])

  const handleProgress = useCallback((p: GenerationProgressV3) => {
    const now = Date.now()
    const completed = p.phase === DOCUMENT_V3_PIPELINE_COMPLETED_PHASE || p.executionState === 'completed'
    const executionState = completed
      ? 'completed'
      : deriveExecutionState({ progress: p.percent, phase: p.phase, executionState: p.executionState })
    const normalizedPercent = normalizeProgressForExecution({ progress: p.percent, executionState })

    setPipelineAgents(prev => applyDocumentV3PipelineProgress(prev, p, agentTimers.current, now))
    setPipelinePercent(normalizedPercent)
    setPipelineMessage(p.message)

    if (p.phase === DOCUMENT_V3_PIPELINE_COMPLETED_PHASE) {
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

  const currentType = docTypes.find((t) => t.id === selectedType)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedType || !request.trim() || !userId || !IS_FIREBASE) return

    setLoading(true)
    try {
      const newDoc = await createDocumentV3(userId, {
        document_type_id: selectedType,
        original_request: request,
        legal_area_ids: selectedAreas.length > 0 ? selectedAreas : null,
      })

      initPipeline()
      setGenerating(true)
      setGeneratedDocId(newDoc.id)
      setLoading(false)

      const docTypeName = docTypes.find(d => d.id === selectedType)?.name || selectedType
      startTask(`Gerando v3: ${docTypeName}`, async (onTaskProgress) => {
        try {
          await generateDocumentV3(
            userId,
            newDoc.id,
            selectedType,
            request,
            selectedAreas,
            null,
            (p) => {
              handleProgress(p)
              const executionState = deriveExecutionState({
                progress: p.percent,
                phase: p.phase,
                executionState: p.executionState,
              })
              const pct = normalizeProgressForExecution({ progress: p.percent, executionState })
              onTaskProgress({
                progress: pct,
                phase: p.message || p.phase,
                executionState,
                stageMeta: p.stageMeta,
                currentStep: p.step,
                totalSteps: p.totalSteps,
              })
            },
            userProfile,
            null,
          )
          return newDoc.id
        } catch (err: any) {
          console.error('V3 generation failed:', err)
          setPipelineError(true)
          setPipelineAgents(prev => prev.map(a =>
            a.status === 'active' ? { ...a, status: 'error' as const, completedAt: Date.now() } : a,
          ))
          if (err instanceof ModelsNotConfiguredError) {
            setPipelineMessage('Modelos v3 não configurados. Vá em Configurações.')
            toast.warning('Modelos não configurados', err.message)
            navigate(buildWorkspaceSettingsPath({ preserveSearch: location.search }))
          } else if (err instanceof ModelUnavailableError) {
            setPipelineMessage(`Modelo "${err.modelId}" indisponível. Altere-o em Configurações.`)
            toast.warning(`Modelo indisponível: ${err.modelId}`, 'Vá em Configurações e substitua-o.')
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
    } catch (err: any) {
      toast.error('Erro ao criar documento', err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 v2-bridge-surface">
      <V2PageHero
        eyebrow={<><FileText className="h-3.5 w-3.5" /> Gerador v3</>}
        title="Pipeline supervisionada multi-agente em 4 fases"
        description="Compreensão · Análise · Pesquisa · Redação. Agentes paralelos por fase, supervisor com retry automático e contexto compartilhado para reduzir alucinações."
        aside={(
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Pipeline</p>
            <div className="rounded-[1.4rem] bg-[rgba(245,241,232,0.92)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--v2-ink-faint)]">Versão</p>
              <p className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">v3 (preview)</p>
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
          { label: 'Fases', value: '4', helper: 'Compreensão, Análise, Pesquisa, Redação', icon: Sparkles, tone: 'warm' },
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
                  Gerar com pipeline v3
                  <kbd className="hidden sm:inline-block text-xs bg-teal-500/30 px-1.5 py-0.5 rounded">Ctrl+Enter</kbd>
                </span>
              )}
        </button>
      </form>

      <AgentTrailProgressModalV3
        isOpen={generating}
        title="Trilha de Geração v3"
        subtitle={currentType?.name || selectedType || undefined}
        currentMessage={pipelineMessage || 'Inicializando agentes...'}
        percent={pipelinePercent}
        agents={pipelineAgents}
        isComplete={pipelineComplete}
        hasError={pipelineError}
        canClose={pipelineComplete || pipelineError}
        onClose={() => {
          if (pipelineComplete || pipelineError) setGenerating(false)
        }}
      >
        <PipelineProgressPanelV3
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
            className="w-full flex items-center justify-center gap-2 bg-teal-600 text-white py-3.5 rounded-xl hover:bg-teal-700 font-semibold text-sm transition-colors shadow-sm"
          >
            {pipelineComplete ? 'Ver Documento Gerado' : 'Ver Documento'}
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </AgentTrailProgressModalV3>
    </div>
  )
}
