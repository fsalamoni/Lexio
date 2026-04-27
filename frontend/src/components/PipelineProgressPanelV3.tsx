import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import {
  DOCUMENT_V3_PHASES,
  type DocumentV3PipelineStep,
  type DocumentV3Phase,
  getDocumentV3StepMeta,
} from '../lib/document-v3-pipeline'
import { formatCostBadge } from '../lib/currency-utils'

interface Props {
  agents: DocumentV3PipelineStep[]
  percent: number
  currentMessage: string
  isComplete: boolean
  hasError: boolean
}

function StatusIcon({ status }: { status: DocumentV3PipelineStep['status'] }) {
  if (status === 'completed') return <CheckCircle className="h-4 w-4 text-emerald-600" />
  if (status === 'active') return <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
  if (status === 'error') return <AlertCircle className="h-4 w-4 text-red-600" />
  return <Clock className="h-4 w-4 text-gray-300" />
}

function formatDuration(ms?: number): string | null {
  if (!ms || ms <= 0) return null
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

export default function PipelineProgressPanelV3({ agents, percent, currentMessage, isComplete, hasError }: Props) {
  const grouped: Record<DocumentV3Phase, DocumentV3PipelineStep[]> = {
    config: [], compreensao: [], analise: [], pesquisa: [], redacao: [], qualidade: [], salvando: [],
  }
  for (const a of agents) grouped[a.phase].push(a)

  const barColor = hasError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : 'bg-teal-500'
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)))

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span className="font-medium">Progresso</span>
          <span className="tabular-nums font-medium text-gray-700">{safePercent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${safePercent}%` }} />
        </div>
        {currentMessage && (
          <p className="text-xs text-gray-600 mt-2">{currentMessage}</p>
        )}
      </div>

      <div className="space-y-4">
        {DOCUMENT_V3_PHASES.map(phase => {
          const items = grouped[phase.key]
          if (!items || items.length === 0) return null
          const allDone = items.every(i => i.status === 'completed')
          const anyActive = items.some(i => i.status === 'active')
          const phaseStatus = allDone ? 'completed' : anyActive ? 'active' : 'pending'
          const phaseTotalCost = items.reduce((sum, i) => sum + (i.runtimeCostUsd ?? 0), 0)
          const phaseTotalDurationMs = items.reduce((sum, i) => sum + (i.runtimeDurationMs ?? 0), 0)
          return (
            <section key={phase.key} className="rounded-xl border border-gray-200 bg-white">
              <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <StatusIcon status={phaseStatus} />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{phase.label}</p>
                    <p className="text-[11px] text-gray-500">{phase.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(phaseTotalCost > 0 || phaseTotalDurationMs > 0) && (
                    <span className="text-[10px] text-gray-500 tabular-nums" data-testid={`phase-summary-${phase.key}`}>
                      {[
                        phaseTotalCost > 0 ? formatCostBadge(phaseTotalCost) : null,
                        formatDuration(phaseTotalDurationMs),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 tabular-nums">
                    {items.filter(i => i.status === 'completed').length}/{items.length}
                  </span>
                </div>
              </header>
              <ul className="divide-y divide-gray-50">
                {items.map(agent => {
                  const meta = getDocumentV3StepMeta(agent)
                  const dur = formatDuration(agent.runtimeDurationMs)
                  const cost = agent.runtimeCostUsd && agent.runtimeCostUsd > 0
                    ? formatCostBadge(agent.runtimeCostUsd)
                    : null
                  const retryCount = agent.runtimeRetryCount ?? 0
                  const escalated = agent.runtimeUsedFallback === true || Boolean(agent.runtimeFallbackFrom)
                  return (
                    <li key={agent.key} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="mt-0.5"><StatusIcon status={agent.status} /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {agent.label}
                            {agent.parallel && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700">paralelo</span>
                            )}
                            {retryCount > 0 && (
                              <span
                                data-testid={`retry-badge-${agent.key}`}
                                className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700"
                                title={`${retryCount} ${retryCount === 1 ? 'tentativa adicional' : 'tentativas adicionais'}`}
                              >
                                ↻ retry {retryCount}
                              </span>
                            )}
                            {escalated && (
                              <span
                                data-testid={`escalated-badge-${agent.key}`}
                                className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-700"
                                title={agent.runtimeFallbackFrom ? `Escalado a partir de ${agent.runtimeFallbackFrom}` : 'Escalado para modelo de supervisor'}
                              >
                                ⇧ escalado
                              </span>
                            )}
                          </p>
                          <span className="text-[11px] text-gray-400 truncate max-w-[40%]">{agent.runtimeModel}</span>
                        </div>
                        {agent.runtimeMessage || agent.description ? (
                          <p className="text-[11px] text-gray-500 mt-0.5">{agent.runtimeMessage || agent.description}</p>
                        ) : null}
                        {(meta || dur || cost) && (
                          <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                            {[meta, dur, cost].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
