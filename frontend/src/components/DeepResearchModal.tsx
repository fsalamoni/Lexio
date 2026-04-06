import React, { useEffect, useId, useRef, useState } from 'react'
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Globe,
  FileText,
  Brain,
  Library,
  BarChart3,
  Sparkles,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ResearchStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
  detail?: string
  substeps: string[]
}

export interface ResearchStats {
  sourcesFound: number
  urlsExamined: number
  tribunalsQueried: number
  tokensUsed: number
  elapsedMs: number
}

interface DeepResearchModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  variant: 'external' | 'deep' | 'jurisprudencia'
  steps: ResearchStep[]
  stats: ResearchStats
  canClose: boolean
}

// ── Tailwind-safe color maps (avoids dynamic class purging) ────────────────────

const VARIANT_STYLES = {
  external: {
    icon: Globe,
    gradient: 'bg-gradient-to-r from-blue-600 to-blue-700',
    progressBar: 'bg-blue-500',
    connectorDone: 'bg-blue-300',
    badge: 'bg-blue-100 text-blue-700',
    stepIndicatorBg: 'bg-blue-100',
    stepIndicatorIcon: 'text-blue-600',
    doneBtn: 'bg-blue-600 text-white hover:bg-blue-700',
  },
  deep: {
    icon: Brain,
    gradient: 'bg-gradient-to-r from-indigo-600 to-indigo-700',
    progressBar: 'bg-indigo-500',
    connectorDone: 'bg-indigo-300',
    badge: 'bg-indigo-100 text-indigo-700',
    stepIndicatorBg: 'bg-indigo-100',
    stepIndicatorIcon: 'text-indigo-600',
    doneBtn: 'bg-indigo-600 text-white hover:bg-indigo-700',
  },
  jurisprudencia: {
    icon: Library,
    gradient: 'bg-gradient-to-r from-emerald-600 to-emerald-700',
    progressBar: 'bg-emerald-500',
    connectorDone: 'bg-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700',
    stepIndicatorBg: 'bg-emerald-100',
    stepIndicatorIcon: 'text-emerald-600',
    doneBtn: 'bg-emerald-600 text-white hover:bg-emerald-700',
  },
} as const

// ── Component ──────────────────────────────────────────────────────────────────

export function DeepResearchModal({
  isOpen,
  onClose,
  title,
  subtitle,
  variant,
  steps,
  stats,
  canClose,
}: DeepResearchModalProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  const titleId = useId()
  const subtitleId = useId()

  const vStyles = VARIANT_STYLES[variant]

  // Elapsed timer
  useEffect(() => {
    if (!isOpen) return
    startRef.current = Date.now()
    setElapsed(0)
    const interval = setInterval(() => setElapsed(Date.now() - startRef.current), 250)
    return () => clearInterval(interval)
  }, [isOpen])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [steps])

  // Modal UX hardening: lock page scroll, focus dialog, support Esc close.
  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusTarget = canClose ? closeBtnRef.current : dialogRef.current
    focusTarget?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && canClose) {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableSelectors = [
          'button:not([disabled])',
          'a[href]',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ]

        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors.join(',')),
        ).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)

        if (focusable.length === 0) {
          e.preventDefault()
          dialogRef.current.focus()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null

        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault()
            last.focus()
          }
          return
        }

        if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
    }
  }, [canClose, isOpen, onClose])

  if (!isOpen) return null

  const VariantIcon = vStyles.icon
  const activeStep = steps.find(s => s.status === 'active')
  const completedSteps = steps.filter(s => s.status === 'done').length
  const totalSteps = steps.length
  const activeWeight = activeStep ? 0.5 : 0
  const progressPercent = totalSteps > 0
    ? Math.round(((completedSteps + activeWeight) / totalSteps) * 100)
    : 0
  const hasErrors = steps.some(s => s.status === 'error')
  const isDone = steps.length > 0 && steps.every(s => s.status === 'done' || s.status === 'error')
  const displayElapsed = stats.elapsedMs > 0 ? stats.elapsedMs : elapsed

  // Collect all substeps for the live log
  const allLogEntries: string[] = []
  for (const step of steps) {
    for (const sub of step.substeps) {
      allLogEntries.push(sub)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
        onClick={canClose ? onClose : undefined}
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className={`${vStyles.gradient} px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <VariantIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id={titleId} className="text-white font-semibold text-base">{title}</h2>
              {subtitle && (
                <p id={subtitleId} className="text-white/80 text-xs mt-0.5 truncate max-w-[300px]">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isDone && (
              <Sparkles className="w-4 h-4 text-white/60 animate-pulse" />
            )}
            {canClose && (
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title={isDone ? 'Fechar' : 'Cancelar pesquisa'}
                aria-label={isDone ? 'Fechar' : 'Cancelar pesquisa'}
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className={`h-full ${hasErrors ? 'bg-red-500' : vStyles.progressBar} transition-all duration-500 ease-out`}
            style={{ width: `${isDone ? 100 : progressPercent}%` }}
          />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Steps timeline */}
          <div className="space-y-0">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <StepIndicator status={step.status} styles={vStyles} />
                  {idx < steps.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[16px] transition-colors duration-300 ${
                      step.status === 'done' ? vStyles.connectorDone : 'bg-gray-200'
                    }`} />
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium transition-colors ${
                      step.status === 'active' ? 'text-gray-900' :
                      step.status === 'done' ? 'text-gray-700' :
                      step.status === 'error' ? 'text-red-700' :
                      'text-gray-400'
                    }`}>
                      {step.label}
                    </span>
                    {step.status === 'active' && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${vStyles.badge} animate-pulse`}>
                        em andamento
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <p className={`text-xs mt-0.5 ${step.status === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                      {step.detail}
                    </p>
                  )}
                  {step.substeps.length > 0 && (step.status === 'active' || step.status === 'done') && (
                    <div className="mt-1.5 space-y-0.5">
                      {step.substeps.slice(-4).map((sub, subIdx) => (
                        <p key={subIdx} className="text-[11px] text-gray-400 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                          {sub}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Stats panel */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3">
            {stats.sourcesFound > 0 && (
              <StatCard icon={Search} label="Fontes" value={stats.sourcesFound} />
            )}
            {stats.urlsExamined > 0 && (
              <StatCard icon={Globe} label="URLs" value={stats.urlsExamined} />
            )}
            {variant === 'jurisprudencia' && stats.tribunalsQueried > 0 && (
              <StatCard icon={Library} label="Tribunais" value={stats.tribunalsQueried} />
            )}
            {stats.tokensUsed > 0 && (
              <StatCard icon={FileText} label="Tokens" value={stats.tokensUsed} />
            )}
            <StatCard icon={Clock} label="Tempo" value={formatMs(displayElapsed)} isText />
            <StatCard icon={BarChart3} label="Progresso" value={`${progressPercent}%`} isText />
          </div>

          {/* Live log */}
          {allLogEntries.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-32 overflow-y-auto font-mono" ref={logRef} aria-live="polite" aria-atomic="false">
              {allLogEntries.slice(-15).map((entry, i) => (
                <p key={i} className="text-[10px] text-gray-400 leading-relaxed">
                  <span className="text-gray-600 select-none">{String(i + 1).padStart(2, '0')} </span>
                  {entry}
                </p>
              ))}
              {!isDone && (
                <p className="text-[10px] text-green-400 animate-pulse">▎</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between bg-gray-50">
          <p className="text-[11px] text-gray-400">
            {isDone
              ? hasErrors
                ? `Concluído com erros em ${formatMs(displayElapsed)}`
                : `Concluído em ${formatMs(displayElapsed)}`
              : activeStep
                ? `${activeStep.label}...`
                : 'Iniciando pesquisa...'
            }
          </p>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDone
                  ? hasErrors
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : vStyles.doneBtn
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {isDone ? 'Fechar' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

type VariantStyleMap = typeof VARIANT_STYLES[keyof typeof VARIANT_STYLES]

function StepIndicator({ status, styles }: { status: ResearchStep['status']; styles: VariantStyleMap }) {
  switch (status) {
    case 'done':
      return (
        <div className={`w-6 h-6 rounded-full ${styles.stepIndicatorBg} flex items-center justify-center`}>
          <CheckCircle2 className={`w-4 h-4 ${styles.stepIndicatorIcon}`} />
        </div>
      )
    case 'active':
      return (
        <div className={`w-6 h-6 rounded-full ${styles.stepIndicatorBg} flex items-center justify-center`}>
          <Loader2 className={`w-4 h-4 ${styles.stepIndicatorIcon} animate-spin`} />
        </div>
      )
    case 'error':
      return (
        <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-4 h-4 text-red-600" />
        </div>
      )
    default:
      return (
        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-gray-300" />
        </div>
      )
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  isText,
  hidden,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  isText?: boolean
  hidden?: boolean
}) {
  if (hidden) return null
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-700">
          {isText ? value : typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </p>
      </div>
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

// ── Helper: Create initial steps for each variant ──────────────────────────────

export function createExternalSearchSteps(): ResearchStep[] {
  return [
    { id: 'search', label: 'Pesquisando na web', status: 'pending', substeps: [] },
    { id: 'analyze', label: 'Analisando resultados', status: 'pending', substeps: [] },
    { id: 'synthesize', label: 'Sintetizando fonte', status: 'pending', substeps: [] },
  ]
}

export function createDeepSearchSteps(): ResearchStep[] {
  return [
    { id: 'search', label: 'Pesquisando na web', status: 'pending', substeps: [] },
    { id: 'fetch', label: 'Buscando conteúdo completo', status: 'pending', substeps: [] },
    { id: 'analyze', label: 'Analisando fontes', status: 'pending', substeps: [] },
    { id: 'synthesize', label: 'Sintetizando conhecimento', status: 'pending', substeps: [] },
  ]
}

export function createJurisprudenceSteps(): ResearchStep[] {
  return [
    { id: 'query', label: 'Consultando tribunais', status: 'pending', substeps: [] },
    { id: 'filter', label: 'Filtrando resultados', status: 'pending', substeps: [] },
    { id: 'rank', label: 'Ranqueando por relevância', status: 'pending', substeps: [] },
    { id: 'analyze', label: 'Analisando jurisprudência', status: 'pending', substeps: [] },
    { id: 'synthesize', label: 'Gerando síntese', status: 'pending', substeps: [] },
  ]
}
