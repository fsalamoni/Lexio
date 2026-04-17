import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, Circle, Activity, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import DraggablePanel from './DraggablePanel'

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
    return <CheckCircle2 className="w-4 h-4 text-emerald-600" />
  }
  if (status === 'active') {
    return <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
  }
  if (status === 'error') {
    return <AlertCircle className="w-4 h-4 text-red-500" />
  }
  return <Circle className="w-4 h-4 text-gray-300" />
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
      <div className="h-full bg-white flex flex-col">
        <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-white">
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}

          <div className="mt-3 flex items-center gap-2 text-sm mb-2">
            {isComplete ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : hasError ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
            )}
            <span className="text-gray-700 flex-1 truncate">{currentMessage}</span>
            <span className="text-brand-700 font-semibold tabular-nums">{effectivePercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                hasError
                  ? 'bg-red-500'
                  : isComplete
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-brand-500 to-brand-400'
              }`}
              style={{ width: `${effectivePercent}%` }}
            />
          </div>

          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Caminho percorrido</p>
            {traversedPath.length > 0 ? (
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                {traversedPath.join(' -> ')}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Aguardando início da trilha...</p>
            )}
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-brand-50/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Agente em foco</p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {activeStageLabel || (isComplete ? 'Entrega concluida' : hasError ? 'Execucao interrompida' : activeStep?.label || 'Preparando trilha')}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {isComplete
                    ? 'O pipeline terminou e o resultado ja pode ser aberto.'
                    : hasError
                      ? 'A trilha encontrou um erro e requer sua atencao.'
                      : activeStep?.detail || currentMessage}
                </p>
                {(activeStageMeta || activeStep?.meta) && (
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {activeStageMeta || activeStep?.meta}
                  </p>
                )}
                {nextStep && !isComplete && !hasError && (
                  <p className="mt-2 text-xs text-slate-500">
                    Em seguida: <span className="font-medium text-slate-700">{nextStep.label}</span>
                  </p>
                )}
              </div>

              <div className="flex-shrink-0 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm min-w-[210px]">
                <div className="flex items-end justify-center gap-1 h-20">
                  {Array.from({ length: stackCount }).map((_, index) => (
                    <div
                      key={index}
                      className="w-6 rounded-sm border border-brand-100 bg-gradient-to-b from-white to-brand-100/70 shadow-[0_1px_0_rgba(15,23,42,0.06)] transition-all duration-500"
                      style={{
                        height: `${28 + (stackCount - index) * 7}px`,
                        transform: `translateY(${index * 2}px) rotate(${index % 2 === 0 ? -2 : 2}deg)`,
                      }}
                    />
                  ))}
                  {!isComplete && !hasError && (
                    <div className="ml-2 flex h-20 w-14 items-end justify-center">
                      <div className="relative flex h-16 w-12 items-end justify-center rounded-t-[16px] rounded-b-md bg-slate-900/90">
                        <div className="absolute -top-3 h-6 w-6 rounded-full bg-brand-100 border border-brand-200" />
                        <div className="mb-2 h-7 w-8 rounded-md bg-brand-500/90" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{completedCount}/{totalCount} etapas</span>
                  <span>{effectivePercent}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {steps.map(step => (
              <div key={step.key} className="flex items-start gap-2.5 p-2 rounded-lg border border-gray-100 bg-gray-50/70">
                <div className="mt-0.5"><StepStatusIcon status={step.status} /></div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${
                    step.status === 'error'
                      ? 'text-red-600'
                      : step.status === 'active'
                        ? 'text-brand-700'
                        : step.status === 'completed'
                          ? 'text-gray-900'
                          : 'text-gray-400'
                  }`}>
                    {step.label}
                  </p>
                  {step.detail && (
                    <p className={`text-xs mt-0.5 ${step.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                      {step.detail}
                    </p>
                  )}
                  {step.meta && (
                    <p className="text-[11px] mt-1 text-gray-400">
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
                <a
                  href="/settings"
                  className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-red-600 hover:text-red-800 underline"
                >
                  <Settings className="w-3 h-3" />
                  Abrir Configurações
                </a>
              </div>
            </div>
          )}

          {children}
        </div>
      </div>
    </DraggablePanel>
  )
}