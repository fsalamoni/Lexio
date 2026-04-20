import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, Circle, Activity, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import DraggablePanel from './DraggablePanel'
import { buildWorkspaceSettingsPath } from '../lib/workspace-routes'

export type TrailStepStatus = 'pending' | 'active' | 'completed' | 'error'

export interface TrailStep {
  key: string
  label: string
  status: TrailStepStatus
  detail?: string
  meta?: string
}

interface AgentTrailProgressModalProps {
  isOpen: boolean
  title: string
  subtitle?: string
  currentMessage: string
  percent: number
  steps: TrailStep[]
  isComplete: boolean
  hasError: boolean
  canClose?: boolean
  onClose: () => void
  warning?: string
  settingsHint?: string
  activeStageLabel?: string
  activeStageMeta?: string
  children?: ReactNode
}

function StepStatusIcon({ status }: { status: TrailStepStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
  }
  if (status === 'active') {
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--v2-accent-strong)' }} />
  }
  if (status === 'error') {
    return <AlertCircle className="w-4 h-4" style={{ color: 'rgb(239,68,68)' }} />
  }
  return <Circle className="w-4 h-4" style={{ color: 'var(--v2-line-soft)' }} />
}

export default function AgentTrailProgressModal({
  isOpen,
  title,
  subtitle,
  currentMessage,
  percent,
  steps,
  isComplete,
  hasError,
  canClose = true,
  onClose,
  warning,
  settingsHint,
  activeStageLabel,
  activeStageMeta,
  children,
}: AgentTrailProgressModalProps) {
  const location = useLocation()

  if (!isOpen) return null

  const effectivePercent = Math.max(0, Math.min(100, isComplete ? 100 : percent))
  const activeStep = steps.find(step => step.status === 'active')
  const nextStep = activeStep
    ? steps[steps.findIndex(step => step.key === activeStep.key) + 1]
    : steps.find(step => step.status === 'pending')
  const completedCount = steps.filter(step => step.status === 'completed').length
  const totalCount = steps.length || 1
  const normalizedProgress = effectivePercent / 100
  const stackCount = isComplete ? 0 : Math.max(1, Math.round((1 - normalizedProgress) * 6))
  const traversedPath = steps
    .filter(step => step.status === 'completed' || step.status === 'active')
    .map(step => step.label)

  return (
    <DraggablePanel
      open={isOpen}
      onClose={canClose ? onClose : () => {}}
      title={title}
      icon={<Activity size={16} />}
      initialWidth={860}
      initialHeight={620}
      minWidth={420}
      minHeight={300}
      closeOnEscape={canClose}
    >
      <div className="h-full flex flex-col" style={{ background: 'var(--v2-panel-strong)', fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)" }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.6)' }}>
          {subtitle && <p className="text-xs truncate" style={{ color: 'var(--v2-ink-faint)' }}>{subtitle}</p>}

          <div className="mt-3 flex items-center gap-2 text-sm mb-2">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
            ) : hasError ? (
              <AlertCircle className="w-4 h-4" style={{ color: 'rgb(239,68,68)' }} />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--v2-accent-strong)' }} />
            )}
            <span className="flex-1 truncate" style={{ color: 'var(--v2-ink-soft)' }}>{currentMessage}</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--v2-accent-strong)' }}>{effectivePercent}%</span>
          </div>
          <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--v2-line-soft)' }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${effectivePercent}%`,
                background: hasError
                  ? 'rgb(239,68,68)'
                  : isComplete
                    ? 'var(--v2-accent-strong)'
                    : 'var(--v2-accent-strong)',
              }}
            />
          </div>

          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--v2-ink-faint)' }}>Caminho percorrido</p>
            {traversedPath.length > 0 ? (
              <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--v2-ink-soft)' }}>
                {traversedPath.join(' → ')}
              </p>
            ) : (
              <p className="text-xs mt-1" style={{ color: 'var(--v2-ink-faint)' }}>Aguardando início da trilha...</p>
            )}
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div
            className="rounded-2xl p-4"
            style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.7)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: 'var(--v2-ink-faint)' }}>Agente em foco</p>
                <p className="mt-1 text-base font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
                  {activeStageLabel || (isComplete ? 'Entrega concluída' : hasError ? 'Execução interrompida' : activeStep?.label || 'Preparando trilha')}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--v2-ink-soft)' }}>
                  {isComplete
                    ? 'O pipeline terminou e o resultado já pode ser aberto.'
                    : hasError
                      ? 'A trilha encontrou um erro e requer sua atenção.'
                      : activeStep?.detail || currentMessage}
                </p>
                {(activeStageMeta || activeStep?.meta) && (
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>
                    {activeStageMeta || activeStep?.meta}
                  </p>
                )}
                {nextStep && !isComplete && !hasError && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
                    Em seguida: <span className="font-medium" style={{ color: 'var(--v2-ink-soft)' }}>{nextStep.label}</span>
                  </p>
                )}
              </div>

              <div
                className="flex-shrink-0 rounded-2xl px-4 py-3 min-w-[210px]"
                style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.9)' }}
              >
                <div className="flex items-end justify-center gap-1 h-20">
                  {Array.from({ length: stackCount }).map((_, index) => (
                    <div
                      key={index}
                      className="w-6 rounded-sm transition-all duration-500"
                      style={{
                        height: `${28 + (stackCount - index) * 7}px`,
                        transform: `translateY(${index * 2}px) rotate(${index % 2 === 0 ? -2 : 2}deg)`,
                        border: '1px solid rgba(15,118,110,0.15)',
                        background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(15,118,110,0.08))',
                      }}
                    />
                  ))}
                  {!isComplete && !hasError && (
                    <div className="ml-2 flex h-20 w-14 items-end justify-center">
                      <div
                        className="relative flex h-16 w-12 items-end justify-center rounded-t-[16px] rounded-b-md"
                        style={{ background: 'rgba(15,23,42,0.85)' }}
                      >
                        <div
                          className="absolute -top-3 h-6 w-6 rounded-full"
                          style={{ background: 'rgba(15,118,110,0.15)', border: '1px solid rgba(15,118,110,0.25)' }}
                        />
                        <div className="mb-2 h-7 w-8 rounded-md" style={{ background: 'var(--v2-accent-strong)' }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: 'var(--v2-ink-faint)' }}>
                  <span>{completedCount}/{totalCount} etapas</span>
                  <span>{effectivePercent}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {steps.map(step => (
              <div
                key={step.key}
                className="flex items-start gap-2.5 p-2 rounded-xl"
                style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.6)' }}
              >
                <div className="mt-0.5"><StepStatusIcon status={step.status} /></div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: step.status === 'error'
                        ? 'rgb(239,68,68)'
                        : step.status === 'active'
                          ? 'var(--v2-accent-strong)'
                          : step.status === 'completed'
                            ? 'var(--v2-ink-strong)'
                            : 'var(--v2-ink-faint)',
                    }}
                  >
                    {step.label}
                  </p>
                  {step.detail && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: step.status === 'error' ? 'rgb(239,68,68)' : 'var(--v2-ink-faint)' }}
                    >
                      {step.detail}
                    </p>
                  )}
                  {step.meta && (
                    <p className="text-[11px] mt-1" style={{ color: 'var(--v2-ink-faint)' }}>
                      {step.meta}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Warning banner */}
          {warning && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{warning}</p>
            </div>
          )}

          {/* Settings hint for capability errors */}
          {settingsHint && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <Settings className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs text-red-700">{settingsHint}</p>
                <Link
                  to={buildWorkspaceSettingsPath({ preserveSearch: location.search })}
                  className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-red-600 hover:text-red-800 underline"
                >
                  <Settings className="w-3 h-3" />
                  Abrir Configurações
                </Link>
              </div>
            </div>
          )}

          {children}
        </div>
      </div>
    </DraggablePanel>
  )
}