import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, Circle, Activity, Settings, UserRound, MoveRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { deriveHandoff, executionStateToAgentState, getHandoffMessage, type AgentSlot, type AgentState } from './AgentTrailStateMachine'
import DraggablePanel from './DraggablePanel'
import { isEnabled } from '../lib/feature-flags'
import type { PipelineExecutionState } from '../lib/pipeline-execution-contract'
import { buildWorkspaceSettingsPath } from '../lib/workspace-routes'

export type TrailStepStatus = 'pending' | 'active' | 'completed' | 'error'

export interface TrailStep {
  key: string
  label: string
  status: TrailStepStatus
  executionState?: PipelineExecutionState
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

function resolveTrailStepAgentState(step: TrailStep): AgentState {
  if (step.executionState) {
    return executionStateToAgentState(step.executionState)
  }
  return trailStatusToAgentState(step.status)
}

function isWaitingIoStep(step: TrailStep | undefined): boolean {
  return Boolean(step && resolveTrailStepAgentState(step) === 'waiting_io')
}

function StepStatusIcon({ step }: { step: TrailStep }) {
  if (step.status === 'completed') {
    return <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
  }
  if (step.status === 'active' && step.executionState === 'waiting_io') {
    return <Activity className="w-4 h-4 animate-pulse" style={{ color: 'rgb(14,116,144)' }} />
  }
  if (step.status === 'active') {
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--v2-accent-strong)' }} />
  }
  if (step.status === 'error') {
    return <AlertCircle className="w-4 h-4" style={{ color: 'rgb(239,68,68)' }} />
  }
  return <Circle className="w-4 h-4" style={{ color: 'var(--v2-line-soft)' }} />
}

function getEffectivePercent(percent: number, isComplete: boolean): number {
  const safePercent = Math.max(0, Math.min(100, percent))
  return isComplete ? 100 : Math.min(99, safePercent)
}

function trailStatusToAgentState(status: TrailStepStatus): AgentState {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'active':
      return 'running'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

interface DeskFlow {
  activeStep?: TrailStep
  previousDesk?: TrailStep
  activeDesk?: TrailStep
  incomingDesk?: TrailStep
  nextStep?: TrailStep
  traversedPath: string[]
}

function resolveLegacyDeskFlow(steps: TrailStep[]): DeskFlow {
  const activeStep = steps.find(step => step.status === 'active')
  const activeStepIndex = steps.findIndex(step => step.status === 'active')
  const fallbackActiveIndex = steps.findIndex(step => step.status === 'pending')
  const resolvedActiveIndex = activeStepIndex >= 0 ? activeStepIndex : fallbackActiveIndex
  const previousDesk = resolvedActiveIndex > 0 ? steps[resolvedActiveIndex - 1] : undefined
  const activeDesk = resolvedActiveIndex >= 0 ? steps[resolvedActiveIndex] : undefined
  const incomingDesk = resolvedActiveIndex >= 0 && resolvedActiveIndex < steps.length - 1
    ? steps[resolvedActiveIndex + 1]
    : undefined
  const nextStep = activeStep
    ? steps[steps.findIndex(step => step.key === activeStep.key) + 1]
    : steps.find(step => step.status === 'pending')
  const traversedPath = steps
    .filter(step => step.status === 'completed' || step.status === 'active')
    .map(step => step.label)

  return {
    activeStep,
    previousDesk,
    activeDesk,
    incomingDesk,
    nextStep,
    traversedPath,
  }
}

function resolveStateMachineDeskFlow(steps: TrailStep[]): DeskFlow {
  const stepByKey = new Map(steps.map(step => [step.key, step]))
  const slots: AgentSlot[] = steps.map(step => ({
    key: step.key,
    label: step.label,
    detail: step.detail,
    meta: step.meta,
    state: resolveTrailStepAgentState(step),
  }))
  const handoff = deriveHandoff(slots)
  const previousDesk = handoff.previous ? stepByKey.get(handoff.previous.key) : undefined
  const activeDesk = handoff.active
    ? stepByKey.get(handoff.active.key)
    : handoff.incoming
      ? stepByKey.get(handoff.incoming.key)
      : undefined
  const activeIndex = activeDesk ? steps.findIndex(step => step.key === activeDesk.key) : -1
  const incomingDesk = activeIndex >= 0
    ? steps.slice(activeIndex + 1).find(step => step.status === 'pending')
    : undefined
  const traversedPath = steps
    .filter(step => step.status === 'completed' || step.key === activeDesk?.key)
    .map(step => step.label)

  return {
    activeStep: activeDesk,
    previousDesk,
    activeDesk,
    incomingDesk,
    nextStep: incomingDesk,
    traversedPath,
  }
}

function resolveHandoffMessage(
  steps: TrailStep[],
  flow: DeskFlow,
  isComplete: boolean,
  hasError: boolean,
  usingStateMachine: boolean,
): string {
  if (isComplete) return 'Todos os agentes concluíram suas mesas.'
  if (hasError) return 'Fluxo interrompido antes da próxima mesa.'

  if (usingStateMachine) {
    if (flow.activeDesk && isWaitingIoStep(flow.activeDesk)) {
      return `${flow.activeDesk.label} está aguardando resposta do modelo antes da próxima mesa.`
    }
    if (flow.previousDesk && flow.activeDesk) {
      return `${flow.previousDesk.label} concluiu e passou o dossiê para ${flow.activeDesk.label}.`
    }
    if (flow.activeDesk) {
      const activeState = resolveTrailStepAgentState(flow.activeDesk)
      return getHandoffMessage(null, activeState)
    }
    if (flow.incomingDesk) {
      return `Preparando a entrada de ${flow.incomingDesk.label}.`
    }
    return 'Aguardando início da trilha.'
  }

  if (flow.previousDesk && flow.activeDesk) {
    return `${flow.previousDesk.label} concluiu e passou o dossiê para ${flow.activeDesk.label}.`
  }
  if (flow.incomingDesk) {
    return `${flow.activeDesk?.label || 'Agente atual'} está preparando a transição para ${flow.incomingDesk.label}.`
  }
  return 'Agente atual finalizando a última mesa.'
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

  const effectivePercent = getEffectivePercent(percent, isComplete)
  const handoffStateMachineEnabled = isEnabled('FF_HANDOFF_STATE_MACHINE')
  const deskFlow = handoffStateMachineEnabled
    ? resolveStateMachineDeskFlow(steps)
    : resolveLegacyDeskFlow(steps)
  const {
    activeStep,
    previousDesk,
    activeDesk,
    incomingDesk,
    nextStep,
    traversedPath,
  } = deskFlow
  const activeDeskWaitingIo = isWaitingIoStep(activeDesk)
  const completedCount = steps.filter(step => step.status === 'completed').length
  const totalCount = steps.length || 1
  const handoffMessage = resolveHandoffMessage(
    steps,
    deskFlow,
    isComplete,
    hasError,
    handoffStateMachineEnabled,
  )

  return (
    <DraggablePanel
      open={isOpen}
      onClose={canClose ? onClose : () => {}}
      title={title}
      icon={<Activity size={16} />}
      initialWidth={860}
      initialHeight={620}
      minWidth={300}
      minHeight={260}
      closeOnEscape={canClose}
    >
      <div className="h-full flex flex-col" style={{ background: 'var(--v2-panel-strong)', fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)" }}>
        <style>
          {`@keyframes lexioDeskPulse {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-4px); }
            }
            @keyframes lexioCourierMove {
              0% { transform: translateX(0); opacity: 0.25; }
              15% { opacity: 1; }
              100% { transform: translateX(100%); opacity: 0.15; }
            }
            @keyframes lexioDeskGlow {
              0%, 100% { box-shadow: 0 0 0 0 rgba(15,118,110,0.18); }
              50% { box-shadow: 0 0 0 8px rgba(15,118,110,0); }
            }
            @keyframes lexioCourierBob {
              0%, 100% { margin-top: 0; }
              50% { margin-top: -2px; }
            }
            @keyframes lexioDeskArrive {
              0% { transform: translateX(10px); opacity: 0.45; }
              100% { transform: translateX(0); opacity: 1; }
            }
            @media (prefers-reduced-motion: reduce) {
              .lexio-animated {
                animation: none !important;
                transition: none !important;
              }
            }`}
        </style>

        <div className="px-4 sm:px-6 py-4" style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.6)' }}>
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
                background: hasError ? 'rgb(239,68,68)' : 'var(--v2-accent-strong)',
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

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
          <div
            className="rounded-2xl p-4"
            style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.7)' }}
          >
            <div className="flex flex-col gap-4">
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
                className="w-full flex-shrink-0 rounded-2xl px-4 py-3 min-w-0"
                style={{ border: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.9)' }}
              >
                <div className="relative rounded-xl border px-2.5 py-3" style={{ borderColor: 'rgba(15,118,110,0.2)', background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(240,253,250,0.9) 100%)' }}>
                  {!isComplete && !hasError && activeDesk && incomingDesk && !activeDeskWaitingIo && (
                    <div className="pointer-events-none absolute left-[50%] top-[49%] h-px w-[28%]" style={{ background: 'linear-gradient(90deg, rgba(15,118,110,0.4), rgba(15,118,110,0.1))' }}>
                      <span
                        className="lexio-animated absolute -top-[3px] h-2 w-2 rounded-full"
                        style={{
                          background: 'var(--v2-accent-strong)',
                          animation: 'lexioCourierMove 1.2s linear infinite, lexioCourierBob 1.2s ease-in-out infinite',
                        }}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'previous', title: 'Mesa anterior', step: previousDesk, role: 'previous' as const },
                      { key: 'active', title: 'Mesa atual', step: activeDesk, role: 'active' as const },
                      { key: 'incoming', title: 'Próxima mesa', step: incomingDesk, role: 'incoming' as const },
                    ].map(slot => {
                      const isActiveDesk = slot.role === 'active' && !isComplete && !hasError
                      const isIncomingDesk = slot.role === 'incoming' && !isComplete && !hasError && Boolean(slot.step)
                      const isPreviousDesk = slot.role === 'previous' && Boolean(slot.step)
                      const isWaitingDesk = isActiveDesk && isWaitingIoStep(slot.step)

                      return (
                        <div key={slot.key} className="relative rounded-lg border px-2 py-2 min-h-[92px]" style={{
                          borderColor: isActiveDesk
                            ? (isWaitingDesk ? 'rgba(14,116,144,0.45)' : 'rgba(15,118,110,0.55)')
                            : 'rgba(148,163,184,0.28)',
                          background: isActiveDesk
                            ? (isWaitingDesk
                              ? 'linear-gradient(180deg, rgba(224,242,254,0.95), rgba(224,242,254,0.55))'
                              : 'linear-gradient(180deg, rgba(15,118,110,0.12), rgba(15,118,110,0.04))')
                            : 'rgba(255,255,255,0.82)',
                          animation: isActiveDesk
                            ? (isWaitingDesk ? undefined : 'lexioDeskGlow 1.8s ease-in-out infinite')
                            : isIncomingDesk
                              ? 'lexioDeskArrive 0.5s ease-out'
                              : undefined,
                        }}>
                          <p className="text-[10px] uppercase tracking-wide font-semibold truncate" style={{ color: 'var(--v2-ink-faint)' }}>
                            {slot.title}
                          </p>
                          <p className="mt-1 text-[11px] leading-tight min-h-[28px]" style={{ color: slot.step ? 'var(--v2-ink-soft)' : 'var(--v2-ink-faint)' }}>
                            {slot.step?.label || 'Aguardando'}
                          </p>

                          <div className="mt-2 flex items-end justify-center h-9">
                            <div
                              className="relative h-9 w-10 rounded-t-lg rounded-b-sm border"
                              style={{
                                borderColor: 'rgba(15,23,42,0.2)',
                                background: 'linear-gradient(180deg, rgba(15,23,42,0.78), rgba(30,41,59,0.88))',
                              }}
                            >
                              <div className="absolute inset-x-1 bottom-1 h-1.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.22)' }} />
                            </div>
                          </div>

                          {isActiveDesk && (
                            <div className="lexio-animated absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border p-1" style={{
                              borderColor: isWaitingDesk ? 'rgba(14,116,144,0.3)' : 'rgba(15,118,110,0.35)',
                              background: isWaitingDesk ? 'rgba(224,242,254,0.92)' : 'rgba(15,118,110,0.14)',
                              animation: isWaitingDesk ? 'lexioDeskArrive 0.5s ease-out' : 'lexioDeskPulse 1.3s ease-in-out infinite',
                            }}>
                              {isWaitingDesk ? (
                                <Activity className="w-3.5 h-3.5" style={{ color: 'rgb(14,116,144)' }} />
                              ) : (
                                <UserRound className="w-3.5 h-3.5" style={{ color: 'var(--v2-accent-strong)' }} />
                              )}
                            </div>
                          )}

                          {isIncomingDesk && (
                            <div className="lexio-animated absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border p-1" style={{
                              borderColor: 'rgba(14,116,144,0.3)',
                              background: 'rgba(224,242,254,0.85)',
                              animation: 'lexioDeskArrive 0.5s ease-out',
                            }}>
                              <MoveRight className="w-3.5 h-3.5" style={{ color: 'rgb(14,116,144)' }} />
                            </div>
                          )}

                          {isPreviousDesk && !isActiveDesk && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border p-1" style={{
                              borderColor: 'rgba(16,185,129,0.35)',
                              background: 'rgba(209,250,229,0.8)',
                            }}>
                              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'rgb(16,185,129)' }} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <p className="mt-2 text-[11px] text-center" style={{ color: 'var(--v2-ink-faint)' }}>
                    {handoffMessage}
                  </p>
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
                <div className="mt-0.5"><StepStatusIcon step={step} /></div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: step.status === 'error'
                        ? 'rgb(239,68,68)'
                        : step.status === 'active' && step.executionState === 'waiting_io'
                          ? 'rgb(14,116,144)'
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

          {warning && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">{warning}</p>
            </div>
          )}

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