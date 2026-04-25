import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  Scale,
  Shield,
  RefreshCw,
  ClipboardCheck,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Settings,
  Save,
  Library,
  Layers,
  ScanSearch,
} from 'lucide-react'
import { DOCUMENT_PIPELINE_COMPLETED_PHASE, createDocumentPipelineSteps, type DocumentPipelineStep } from '../lib/document-pipeline'
import { formatCostBadge } from '../lib/currency-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  config:           Settings,
  triagem:          Search,
  acervo_buscador:  Library,
  acervo_compilador: Layers,
  acervo_revisor:   ScanSearch,
  pesquisador:      BookOpen,
  jurista:          Scale,
  advogado_diabo:   Shield,
  jurista_v2:       RefreshCw,
  fact_checker:     ClipboardCheck,
  moderador:        Scale,
  redacao:          FileText,
  salvando:         Save,
  nb_acervo_triagem:  Search,
  nb_acervo_buscador: Library,
  nb_acervo_analista: Scale,
  nb_acervo_curador:  ClipboardCheck,
}

/** Phase key emitted by generation-service when the pipeline finishes. */
export const PHASE_COMPLETED = DOCUMENT_PIPELINE_COMPLETED_PHASE
export const PIPELINE_AGENTS = createDocumentPipelineSteps().map(({ status: _status, startedAt: _startedAt, completedAt: _completedAt, runtimeMessage: _runtimeMessage, runtimeModel, runtimeMeta: _runtimeMeta, runtimeCostUsd: _runtimeCostUsd, runtimeDurationMs: _runtimeDurationMs, runtimeRetryCount: _runtimeRetryCount, runtimeFallbackFrom: _runtimeFallbackFrom, ...stage }) => ({
  ...stage,
  model: runtimeModel ?? '—',
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem}s`
}

function elapsedSince(startedAt: number): string {
  return formatDuration(Date.now() - startedAt)
}



function estimateRemainingMs(agents: DocumentPipelineStep[]): number | null {
  const completedDurations = agents
    .filter(agent => agent.startedAt && agent.completedAt)
    .map(agent => (agent.completedAt as number) - (agent.startedAt as number))

  if (completedDurations.length === 0) return null

  const averageDuration = completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
  const activeAgent = agents.find(agent => agent.status === 'active' && agent.startedAt)
  const pendingCount = agents.filter(agent => agent.status === 'pending').length
  const activeRemaining = activeAgent
    ? Math.max(0, averageDuration - (Date.now() - (activeAgent.startedAt as number)))
    : 0

  return Math.round(activeRemaining + pendingCount * averageDuration)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agents: DocumentPipelineStep[]
  percent: number
  currentMessage: string
  isComplete: boolean
  hasError: boolean
  warning?: string
  resumeAction?: { label: string; onClick: () => void }
}

export default function PipelineProgressPanel({
  agents,
  percent,
  currentMessage,
  isComplete,
  hasError,
  warning,
  resumeAction,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const safePercent = Math.max(0, Math.min(100, percent))
  const displayPercent = isComplete ? 100 : Math.min(99, safePercent)

  const completedCount = agents.filter(a => a.status === 'completed').length
  const totalSteps = agents.length
  const totalCost = agents.reduce((sum, agent) => sum + (agent.runtimeCostUsd ?? 0), 0)
  const retryCount = agents.reduce((sum, agent) => sum + (agent.runtimeRetryCount ?? 0), 0)
  const fallbackCount = agents.filter(agent => Boolean(agent.runtimeFallbackFrom)).length
  const remainingMs = estimateRemainingMs(agents)
  const operationalSummary = [
    remainingMs ? `ETA ${formatDuration(remainingMs)}` : null,
    totalCost > 0 ? `Custo ${formatCostBadge(totalCost)}` : null,
    retryCount > 0 ? `${retryCount} ${retryCount === 1 ? 'retry' : 'retries'}` : null,
    fallbackCount > 0 ? `${fallbackCount} ${fallbackCount === 1 ? 'fallback' : 'fallbacks'}` : null,
  ].filter(Boolean).join(' • ')

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {isComplete ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : hasError ? (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-teal-500 animate-spin flex-shrink-0" />
          )}
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-900 block">
              {isComplete
                ? 'Documento gerado com sucesso!'
                : hasError
                  ? 'Erro na geração do documento'
                  : 'Gerando documento...'}
            </span>
            <span className="text-xs text-gray-500 block truncate">
              {currentMessage} — {completedCount}/{totalSteps} etapas
            </span>
            {operationalSummary && (
              <span className="text-[11px] text-gray-400 block truncate mt-0.5">
                {operationalSummary}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 self-end sm:self-auto">
          <span className="text-sm font-semibold text-teal-600 tabular-nums">{displayPercent}%</span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {/* Progress bar — always visible */}
      <div className="px-4 pb-3">
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all duration-700 ease-out ${
              hasError
                ? 'bg-red-400'
                : isComplete
                  ? 'bg-green-500'
                  : 'bg-gradient-to-r from-teal-500 to-teal-400'
            }`}
            style={{ width: `${displayPercent}%` }}
          />
        </div>
      </div>

      {/* Expanded panel — pipeline flow */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="relative">
            {agents.map((agent, idx) => {
              const Icon = AGENT_ICONS[agent.key] ?? Loader2
              const isLast = idx === agents.length - 1
              const duration =
                agent.status === 'completed' && agent.startedAt && agent.completedAt
                  ? formatDuration(agent.completedAt - agent.startedAt)
                  : agent.status === 'active' && agent.startedAt
                    ? elapsedSince(agent.startedAt)
                    : null

              return (
                <div key={agent.key} className="flex gap-3 relative">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      className={`absolute left-[15px] top-[30px] w-0.5 h-[calc(100%-14px)] ${
                        agent.status === 'completed'
                          ? 'bg-teal-300'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}

                  {/* Status icon */}
                  <div className="flex-shrink-0 z-10">
                    {agent.status === 'completed' ? (
                      <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-teal-600" />
                      </div>
                    ) : agent.status === 'active' ? (
                      <div className="w-8 h-8 rounded-full bg-teal-50 border-2 border-teal-500 flex items-center justify-center animate-pulse">
                        <Icon className="w-4 h-4 text-teal-600" />
                      </div>
                    ) : agent.status === 'error' ? (
                      <div className="w-8 h-8 rounded-full bg-red-50 border-2 border-red-400 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className={`pb-4 min-w-0 flex-1 ${isLast ? 'pb-0' : ''}`}>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span
                        className={`text-sm font-medium ${
                          agent.status === 'completed'
                            ? 'text-gray-900'
                            : agent.status === 'active'
                              ? 'text-teal-700'
                              : agent.status === 'error'
                                ? 'text-red-600'
                                : 'text-gray-400'
                        }`}
                      >
                        {agent.label}
                      </span>
                      {agent.runtimeModel && agent.runtimeModel !== '—' && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            agent.status === 'pending'
                              ? 'bg-gray-100 text-gray-400'
                              : agent.runtimeModel === 'Haiku'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {agent.runtimeModel}
                        </span>
                      )}
                      {agent.runtimeFallbackFrom && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                          Fallback
                        </span>
                      )}
                      {(agent.runtimeRetryCount ?? 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-sky-50 text-sky-700">
                          {agent.runtimeRetryCount} retry{agent.runtimeRetryCount === 1 ? '' : 's'}
                        </span>
                      )}
                      {agent.runtimeCostUsd != null && agent.runtimeCostUsd > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">
                          {formatCostBadge(agent.runtimeCostUsd)}
                        </span>
                      )}
                      {duration && (
                        <span className="text-[10px] text-gray-400 tabular-nums sm:ml-auto">
                          {agent.status === 'active' ? '⏱ ' : '✓ '}{duration}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        agent.status === 'pending' ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {agent.runtimeMessage || agent.description}
                    </p>
                    {agent.runtimeMeta && agent.runtimeMeta !== agent.runtimeMessage && (
                      <p className="text-[11px] mt-1 text-gray-400">
                        {agent.runtimeMeta}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Warning banner */}
          {warning && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{warning}</p>
            </div>
          )}

          {/* Resume action button */}
          {resumeAction && (
            <div className="mt-3">
              <button
                type="button"
                onClick={resumeAction.onClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {resumeAction.label}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
