/**
 * ThesisAnalysisCard — card displayed at the top of the Banco de Teses page.
 *
 * Responsibilities:
 * 1. Show summary: "X documentos analisados / Y documentos novos (não analisados)"
 * 2. Button "Analisar Teses" to trigger the 5-agent analysis pipeline
 * 3. Live progress panel during analysis (one row per agent)
 * 4. Suggestion panel: list of AnalysisSuggestion items with Accept / Modify / Reject
 * 5. Persist last session metadata to Firestore on completion
 */

import { useEffect, useState, useCallback } from 'react'
import {
  FlaskConical, Play, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, Merge, Trash2, Plus, Sparkles, FileText,
  ArrowRight, Clock, BookOpen,
} from 'lucide-react'
import AgentTrailProgressModal from './AgentTrailProgressModal'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import {
  listTheses,
  getAcervoAnalysisStatus,
  markAcervoDocumentsAnalyzed,
  saveThesisAnalysisSession,
  getLastThesisAnalysisSession,
  createThesis,
  updateThesis,
  deleteThesis,
  getSettings,
  type ThesisData,
  type ThesisAnalysisSessionData,
} from '../lib/firestore-service'
import {
  analyzeThesisBank,
  type AnalysisSuggestion,
  type AgentProgress,
  type ThesisAnalysisResult,
} from '../lib/thesis-analyzer'
import { loadThesisAnalystModels } from '../lib/model-config'

// ── Sub-components ────────────────────────────────────────────────────────────

const SUGGESTION_TYPE_CONFIG: Record<AnalysisSuggestion['type'], {
  icon: React.ElementType; label: string; colors: string; badgeColors: string
}> = {
  merge:   { icon: Merge,    label: 'Compilar',       colors: 'border-blue-200 bg-blue-50/40',   badgeColors: 'bg-blue-100 text-blue-700' },
  delete:  { icon: Trash2,   label: 'Excluir',        colors: 'border-red-200 bg-red-50/30',     badgeColors: 'bg-red-100 text-red-700'   },
  create:  { icon: Plus,     label: 'Nova tese',      colors: 'border-green-200 bg-green-50/30', badgeColors: 'bg-green-100 text-green-700' },
  improve: { icon: Sparkles, label: 'Melhorar',       colors: 'border-amber-200 bg-amber-50/30', badgeColors: 'bg-amber-100 text-amber-700' },
}

const PRIORITY_LABELS: Record<AnalysisSuggestion['priority'], { label: string; color: string }> = {
  high:   { label: 'Alta prioridade',  color: 'text-red-600'    },
  medium: { label: 'Média prioridade', color: 'text-amber-600'  },
  low:    { label: 'Baixa prioridade', color: 'text-gray-400'   },
}

type SuggestionState = 'pending' | 'accepted' | 'rejected' | 'applying'

interface SuggestionCardProps {
  suggestion: AnalysisSuggestion
  state: SuggestionState
  disabled?: boolean
  onAccept: () => void
  onReject: () => void
}

function SuggestionCard({ suggestion, state, disabled = false, onAccept, onReject }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SUGGESTION_TYPE_CONFIG[suggestion.type]
  const Icon = cfg.icon
  const priorityCfg = PRIORITY_LABELS[suggestion.priority]

  const isDone = state === 'accepted' || state === 'rejected'

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${
      isDone ? 'opacity-60' : cfg.colors
    } ${state === 'accepted' ? 'border-green-300' : ''} ${state === 'rejected' ? 'border-gray-200' : ''}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.badgeColors}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeColors}`}>
                {cfg.label}
              </span>
              <span className={`text-xs font-medium ${priorityCfg.color}`}>
                {priorityCfg.label}
              </span>
              <span className="text-xs text-gray-400 ml-auto">
                Impacto: {suggestion.impact_score}/10
              </span>
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-0.5">{suggestion.title}</h4>
            <p className="text-xs text-gray-600 leading-relaxed">{suggestion.description}</p>

            {/* Affected theses chips */}
            {suggestion.affected_thesis_titles && suggestion.affected_thesis_titles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {suggestion.affected_thesis_titles.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 text-gray-600 text-[10px] rounded-full">
                    <BookOpen className="w-2.5 h-2.5" />
                    {t.length > 40 ? t.slice(0, 40) + '…' : t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Toggle details */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Menos detalhes</> : <><ChevronDown className="w-3 h-3" /> Ver justificativa e proposta</>}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-inherit px-4 pb-4 pt-3 space-y-3 bg-white/70">
          {/* Rationale */}
          {suggestion.rationale && (
            <div>
              <h5 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Justificativa</h5>
              <p className="text-xs text-gray-700 leading-relaxed">{suggestion.rationale}</p>
            </div>
          )}

          {/* Proposed thesis preview */}
          {suggestion.proposed_thesis && (
            <div>
              <h5 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {suggestion.type === 'merge' ? 'Tese compilada proposta' : 'Nova tese proposta'}
              </h5>
              <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-800">{suggestion.proposed_thesis.title}</p>
                {suggestion.proposed_thesis.summary && (
                  <p className="text-xs text-gray-500 italic">{suggestion.proposed_thesis.summary}</p>
                )}
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
                  {suggestion.proposed_thesis.content}
                </p>
                {suggestion.proposed_thesis.tags && suggestion.proposed_thesis.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {suggestion.proposed_thesis.tags.map((tag, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!isDone && (
        <div className="border-t border-inherit px-4 py-3 flex items-center justify-end gap-2 bg-white/50">
          <button
            onClick={onReject}
            disabled={state === 'applying' || disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            Rejeitar
          </button>
          <button
            onClick={onAccept}
            disabled={state === 'applying' || disabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium transition-colors"
          >
            {state === 'applying'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Aplicando...</>
              : <><CheckCircle2 className="w-3.5 h-3.5" /> Aceitar</>
            }
          </button>
        </div>
      )}

      {/* Outcome badge */}
      {state === 'accepted' && (
        <div className="border-t border-green-200 px-4 py-2 bg-green-50 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          <span className="text-xs text-green-700 font-medium">Aplicado com sucesso</span>
        </div>
      )}
      {state === 'rejected' && (
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50 flex items-center gap-2">
          <XCircle className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-400">Rejeitado</span>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ThesisAnalysisCardProps {
  /** Called after suggestions are applied so the parent can refresh the thesis list. */
  onThesesChanged?: () => void
}

export default function ThesisAnalysisCard({ onThesesChanged }: ThesisAnalysisCardProps) {
  const { userId } = useAuth()
  const toast = useToast()

  // Stats
  const [analyzedCount, setAnalyzedCount]     = useState<number | null>(null)
  const [unanalyzedCount, setUnanalyzedCount] = useState<number | null>(null)
  const [lastSession, setLastSession]         = useState<ThesisAnalysisSessionData | null>(null)

  // Analysis run state
  const [running, setRunning]   = useState(false)
  const [agentProgress, setAgentProgress] = useState<AgentProgress[]>([])
  const [result, setResult]     = useState<ThesisAnalysisResult | null>(null)
  const [applyingAll, setApplyingAll] = useState(false)

  // Per-suggestion state
  const [suggestionStates, setSuggestionStates] = useState<Record<string, SuggestionState>>({})

  // Filter
  const [typeFilter, setTypeFilter] = useState<AnalysisSuggestion['type'] | 'all'>('all')

  const [cardExpanded, setCardExpanded] = useState(true)

  // ── Load stats on mount ────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    if (!userId) return
    try {
      const [status, session] = await Promise.all([
        getAcervoAnalysisStatus(userId),
        getLastThesisAnalysisSession(userId).catch(() => null),
      ])
      setAnalyzedCount(status.analyzed_count)
      setUnanalyzedCount(status.unanalyzed_count)
      setLastSession(session)
    } catch {
      // Stats are non-critical
    }
  }, [userId])

  useEffect(() => { loadStats() }, [loadStats])

  // ── Resolve API key ────────────────────────────────────────────────────────

  const resolveApiKey = async (): Promise<string> => {
    const envKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (envKey && envKey.startsWith('sk-')) return envKey
    const settings = await getSettings()
    const apiKeys = (settings?.api_keys ?? {}) as Record<string, string>
    return apiKeys.openrouter_api_key ?? (settings?.openrouter_api_key as string) ?? ''
  }

  // ── Run analysis ───────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!userId) return
    if (running || applyingAll) return

    const apiKey = await resolveApiKey()
    if (!apiKey || !apiKey.startsWith('sk-')) {
      toast.error('Chave da API OpenRouter não configurada', 'Configure em Administração → Chaves de API')
      return
    }

    setRunning(true)
    setResult(null)
    setSuggestionStates({})
    setApplyingAll(false)
    setTypeFilter('all')

    try {
      // Load theses and unanalyzed docs in parallel
      const [thesesResult, acervoStatus, modelMap] = await Promise.all([
        listTheses(userId, { limit: 200 }),
        getAcervoAnalysisStatus(userId),
        loadThesisAnalystModels(),
      ])

      const theses = thesesResult.items as ThesisData[]
      const unanalyzedDocs = acervoStatus.unanalyzed_docs

      if (theses.length === 0 && unanalyzedDocs.length === 0) {
        toast.error('Nada a analisar', 'Adicione teses ou documentos ao acervo primeiro.')
        setRunning(false)
        return
      }

      const analysis = await analyzeThesisBank(
        apiKey,
        theses,
        unanalyzedDocs,
        modelMap,
        agents => setAgentProgress(agents),
      )

      setResult(analysis)

      // Initialise all suggestions as pending
      const states: Record<string, SuggestionState> = {}
      for (const s of analysis.suggestions) {
        states[s.id] = 'pending'
      }
      setSuggestionStates(states)

      // Mark analyzed docs in Firestore (non-critical — don't abort analysis if this fails)
      if (unanalyzedDocs.length > 0) {
        try {
          await markAcervoDocumentsAnalyzed(
            userId,
            unanalyzedDocs.map(d => d.id).filter((id): id is string => !!id),
          )
        } catch {
          console.warn('Failed to mark acervo docs as analyzed (non-fatal)')
        }
      }

      // Persist session metadata (non-critical)
      try {
        await saveThesisAnalysisSession(userId, {
          created_at: analysis.created_at,
          total_theses_analyzed: analysis.total_theses_analyzed,
          total_docs_analyzed: analysis.total_docs_analyzed,
          total_new_docs: analysis.new_doc_count,
          suggestions_count: analysis.suggestions.length,
          accepted_count: 0,
          rejected_count: 0,
          executive_summary: analysis.executive_summary,
          status: 'completed',
          usage_summary: analysis.usage_summary,
          llm_executions: analysis.llm_executions,
        })
      } catch {
        console.warn('Failed to persist analysis session (non-fatal)')
      }

      await loadStats()

      if (analysis.suggestions.length === 0) {
        toast.success('Análise concluída', 'Nenhuma ação necessária no momento.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Erro na análise', msg)
      setAgentProgress(prev => prev.map(a => a.status === 'running' ? { ...a, status: 'error' } : a))
    } finally {
      setRunning(false)
    }
  }

  // ── Apply a suggestion ─────────────────────────────────────────────────────

  const handleAccept = async (suggestion: AnalysisSuggestion) => {
    if (!userId) return
    if (applyingAll) return
    const currentState = suggestionStates[suggestion.id]
    if (currentState === 'applying' || currentState === 'accepted' || currentState === 'rejected') return
    setSuggestionStates(prev => ({ ...prev, [suggestion.id]: 'applying' }))
    try {
      if (suggestion.type === 'merge' && suggestion.proposed_thesis) {
        // 1. Create the new compiled thesis
        await createThesis(userId, {
          ...suggestion.proposed_thesis,
          source_type: 'compiled',
          usage_count: 0,
        })
        // 2. Delete/archive the source theses
        for (const id of suggestion.affected_thesis_ids ?? []) {
          await deleteThesis(userId, id)
        }
      } else if (suggestion.type === 'delete') {
        for (const id of suggestion.affected_thesis_ids ?? []) {
          await deleteThesis(userId, id)
        }
      } else if (suggestion.type === 'create' && suggestion.proposed_thesis) {
        await createThesis(userId, {
          ...suggestion.proposed_thesis,
          source_type: 'curated',
          usage_count: 0,
        })
      } else if (suggestion.type === 'improve' && suggestion.proposed_thesis && suggestion.affected_thesis_ids?.[0]) {
        await updateThesis(userId, suggestion.affected_thesis_ids[0], suggestion.proposed_thesis)
      }

      setSuggestionStates(prev => ({ ...prev, [suggestion.id]: 'accepted' }))
      onThesesChanged?.()
      toast.success('Sugestão aplicada com sucesso')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao aplicar sugestão'
      toast.error('Erro', msg)
      setSuggestionStates(prev => ({ ...prev, [suggestion.id]: 'pending' }))
    }
  }

  const handleReject = (suggestion: AnalysisSuggestion) => {
    setSuggestionStates(prev => ({ ...prev, [suggestion.id]: 'rejected' }))
  }

  const handleAcceptAll = async () => {
    if (!result) return
    if (running || applyingAll) return
    const pending = result.suggestions.filter(s => suggestionStates[s.id] === 'pending')
    if (pending.length === 0) return

    setApplyingAll(true)
    try {
      for (const s of pending) {
        const stateNow = suggestionStates[s.id]
        if (stateNow !== 'pending') continue
        await handleAccept(s)
      }
    } finally {
      setApplyingAll(false)
    }
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const pendingCount   = result ? result.suggestions.filter(s => suggestionStates[s.id] === 'pending').length : 0
  const acceptedCount  = result ? result.suggestions.filter(s => suggestionStates[s.id] === 'accepted').length : 0
  const rejectedCount  = result ? result.suggestions.filter(s => suggestionStates[s.id] === 'rejected').length : 0

  const filteredSuggestions = result?.suggestions.filter(s =>
    typeFilter === 'all' ? true : s.type === typeFilter
  ) ?? []

  const typeCounts: Record<string, number> = {}
  for (const s of result?.suggestions ?? []) {
    typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1
  }

  const analysisHasError = agentProgress.some(a => a.status === 'error')
  const analysisComplete = !running && agentProgress.length > 0 && agentProgress.every(
    a => a.status === 'done' || a.status === 'error',
  )
  const completedSteps = agentProgress.filter(a => a.status === 'done').length
  const analysisPercent = agentProgress.length > 0
    ? Math.round((completedSteps / agentProgress.length) * 100)
    : 0
  const currentAgentMessage = running
    ? agentProgress.find(a => a.status === 'running')?.message || 'Executando agentes...'
    : analysisHasError
      ? 'Análise concluída com falhas em alguns agentes.'
      : analysisComplete
        ? 'Análise concluída com sucesso.'
        : 'Preparando análise...'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-teal-50/60 to-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
            <FlaskConical className="w-4.5 h-4.5 text-teal-600" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Análise do Banco de Teses</h3>
            <p className="text-xs text-gray-500">Pipeline de curação com 5 agentes especializados</p>
          </div>
        </div>
        <button
          onClick={() => setCardExpanded(e => !e)}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
        >
          {cardExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {cardExpanded && (
        <div className="p-5">
          {/* Stats row */}
          <div className="flex items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Docs no acervo analisados</p>
                <p className="text-sm font-semibold text-gray-800">
                  {analyzedCount !== null ? analyzedCount : '—'}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-xs text-gray-500">Docs novos (não analisados)</p>
                <p className={`text-sm font-semibold ${unanalyzedCount ? 'text-amber-600' : 'text-gray-800'}`}>
                  {unanalyzedCount !== null ? unanalyzedCount : '—'}
                </p>
              </div>
            </div>
            {lastSession && (
              <>
                <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Última análise</p>
                    <p className="text-xs font-medium text-gray-600">
                      {new Date(lastSession.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                      {' · '}{lastSession.suggestions_count} sugestões ({lastSession.accepted_count} aceitas)
                    </p>
                  </div>
                </div>
              </>
            )}
            <div className="flex-1" />
            <button
              onClick={handleAnalyze}
              disabled={running || applyingAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {running
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
                : <><Play className="w-4 h-4" /> Analisar Teses</>
              }
            </button>
          </div>

          {/* Results panel */}
          {result && (
            <div>
              {/* Executive summary */}
              {result.executive_summary && (
                <div className="mb-4 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-teal-800 leading-relaxed">{result.executive_summary}</p>
                  </div>
                </div>
              )}

              {result.suggestions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                  <p className="text-sm font-medium text-gray-600">Banco de teses bem estruturado</p>
                  <p className="text-xs">Nenhuma ação necessária no momento.</p>
                </div>
              ) : (
                <>
                  {/* Summary bar */}
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <span className="text-sm font-medium text-gray-700">
                      {result.suggestions.length} sugestões
                    </span>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {pendingCount > 0   && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{pendingCount} pendentes</span>}
                      {acceptedCount > 0  && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{acceptedCount} aceitas</span>}
                      {rejectedCount > 0  && <span className="px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">{rejectedCount} rejeitadas</span>}
                    </div>
                    <div className="flex-1" />
                    {pendingCount > 1 && (
                      <button
                        onClick={handleAcceptAll}
                        disabled={applyingAll}
                        className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {applyingAll ? 'Aplicando sugestões pendentes...' : `Aceitar todas pendentes (${pendingCount})`}
                      </button>
                    )}
                  </div>

                  {/* Type filter tabs */}
                  <div className="flex items-center gap-1 mb-4 overflow-x-auto">
                    {(['all', 'merge', 'create', 'delete', 'improve'] as const).map(type => {
                      const count = type === 'all' ? result.suggestions.length : (typeCounts[type] ?? 0)
                      if (count === 0 && type !== 'all') return null
                      const label = type === 'all' ? 'Todas' : SUGGESTION_TYPE_CONFIG[type].label
                      return (
                        <button
                          key={type}
                          onClick={() => setTypeFilter(type)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                            typeFilter === type
                              ? 'bg-teal-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label} {count > 0 && `(${count})`}
                        </button>
                      )
                    })}
                  </div>

                  {/* Suggestion list */}
                  <div className="space-y-3">
                    {filteredSuggestions.map(suggestion => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        state={suggestionStates[suggestion.id] ?? 'pending'}
                        disabled={applyingAll}
                        onAccept={() => handleAccept(suggestion)}
                        onReject={() => handleReject(suggestion)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <AgentTrailProgressModal
        isOpen={running || agentProgress.length > 0}
        title="Trilha de Análise do Banco de Teses"
        subtitle="Pipeline de 5 agentes"
        currentMessage={currentAgentMessage}
        percent={analysisPercent}
        steps={agentProgress.map(agent => ({
          key: agent.key,
          label: agent.label,
          status: agent.status === 'running'
            ? 'active'
            : agent.status === 'done'
              ? 'completed'
              : agent.status,
          detail: agent.message,
        }))}
        isComplete={analysisComplete}
        hasError={analysisHasError}
        canClose={!running}
        onClose={() => {
          if (!running) setAgentProgress([])
        }}
      />
    </div>
  )
}
