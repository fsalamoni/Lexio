import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, Circle, Activity, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import DraggablePanel from './DraggablePanel'

export type TrailStepStatus = 'pending' | 'active' | 'completed' | 'error'

export interface TrailStep {
  key: string
  label: string
  status: TrailStepStatus
  detail?: string
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
  children,
}: AgentTrailProgressModalProps) {
  if (!isOpen) return null

  const effectivePercent = Math.max(0, Math.min(100, isComplete ? 100 : percent))
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