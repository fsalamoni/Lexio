import { X, Loader2, CheckCircle2, AlertCircle, Circle } from 'lucide-react'
import type { ReactNode } from 'react'

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
  children,
}: AgentTrailProgressModalProps) {
  if (!isOpen) return null

  const effectivePercent = Math.max(0, Math.min(100, isComplete ? 100 : percent))
  const traversedPath = steps
    .filter(step => step.status === 'completed' || step.status === 'active')
    .map(step => step.label)

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={canClose ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-white flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 pt-4 pb-3 border-b bg-white">
          <div className="flex items-center gap-2 text-sm mb-2">
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

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
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

          {children}
        </div>
      </div>
    </div>
  )
}