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
  Settings,
  Save,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'pending' | 'active' | 'completed' | 'error'

export interface AgentStep {
  key: string
  label: string
  description: string
  model: string
  status: AgentStatus
  startedAt?: number
  completedAt?: number
}

// ── Pipeline stage definitions ────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  config:        Settings,
  triagem:       Search,
  pesquisador:   BookOpen,
  jurista:       Scale,
  advogado_diabo: Shield,
  jurista_v2:    RefreshCw,
  fact_checker:  ClipboardCheck,
  moderador:     Scale,
  redacao:       FileText,
  salvando:      Save,
}

export const PIPELINE_AGENTS: Omit<AgentStep, 'status'>[] = [
  { key: 'config',        label: 'Configuração',          description: 'Carregando chaves de API',              model: '—' },
  { key: 'triagem',       label: 'Triagem',               description: 'Extração de tema e palavras-chave',    model: 'Haiku' },
  { key: 'pesquisador',   label: 'Pesquisador',           description: 'Pesquisa de legislação e jurisprudência', model: 'Sonnet' },
  { key: 'jurista',       label: 'Jurista',               description: 'Desenvolvimento de teses jurídicas',   model: 'Sonnet' },
  { key: 'advogado_diabo', label: 'Advogado do Diabo',    description: 'Crítica e contra-argumentação',         model: 'Sonnet' },
  { key: 'jurista_v2',    label: 'Jurista (revisão)',      description: 'Refinamento de teses após crítica',    model: 'Sonnet' },
  { key: 'fact_checker',  label: 'Fact-Checker',          description: 'Verificação de citações legais',        model: 'Haiku' },
  { key: 'moderador',     label: 'Moderador',             description: 'Planejamento da estrutura do documento', model: 'Sonnet' },
  { key: 'redacao',       label: 'Redator',               description: 'Redação completa do documento',         model: 'Sonnet' },
  { key: 'salvando',      label: 'Salvando',              description: 'Persistindo resultado no banco',        model: '—' },
]

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

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agents: AgentStep[]
  percent: number
  currentMessage: string
  isComplete: boolean
  hasError: boolean
}

export default function PipelineProgressPanel({
  agents,
  percent,
  currentMessage,
  isComplete,
  hasError,
}: Props) {
  const [expanded, setExpanded] = useState(true)

  const completedCount = agents.filter(a => a.status === 'completed').length
  const totalSteps = agents.length

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {isComplete ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : hasError ? (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          ) : (
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin flex-shrink-0" />
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
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold text-brand-600 tabular-nums">{percent}%</span>
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
                  : 'bg-gradient-to-r from-brand-500 to-brand-400'
            }`}
            style={{ width: `${percent}%` }}
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
                          ? 'bg-brand-300'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}

                  {/* Status icon */}
                  <div className="flex-shrink-0 z-10">
                    {agent.status === 'completed' ? (
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                        <CheckCircle className="w-4 h-4 text-brand-600" />
                      </div>
                    ) : agent.status === 'active' ? (
                      <div className="w-8 h-8 rounded-full bg-brand-50 border-2 border-brand-500 flex items-center justify-center animate-pulse">
                        <Icon className="w-4 h-4 text-brand-600" />
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
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          agent.status === 'completed'
                            ? 'text-gray-900'
                            : agent.status === 'active'
                              ? 'text-brand-700'
                              : agent.status === 'error'
                                ? 'text-red-600'
                                : 'text-gray-400'
                        }`}
                      >
                        {agent.label}
                      </span>
                      {agent.model !== '—' && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            agent.status === 'pending'
                              ? 'bg-gray-100 text-gray-400'
                              : agent.model === 'Haiku'
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {agent.model}
                        </span>
                      )}
                      {duration && (
                        <span className="text-[10px] text-gray-400 tabular-nums ml-auto">
                          {agent.status === 'active' ? '⏱ ' : '✓ '}{duration}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        agent.status === 'pending' ? 'text-gray-300' : 'text-gray-500'
                      }`}
                    >
                      {agent.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
