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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
    >
      {/* Backdrop click area */}
      <div
        className="absolute inset-0"
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
        className="relative w-full max-w-2xl mx-4 flex flex-col overflow-hidden"
        style={{
          background: 'var(--v2-panel-strong, rgba(255,255,255,0.97))',
          border: '1px solid var(--v2-line-soft, rgba(15,23,42,0.08))',
          borderRadius: '1.75rem',
          boxShadow: '0 32px 80px rgba(15,23,42,0.22), 0 8px 24px rgba(15,23,42,0.10)',
          fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.7)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }}
            >
              <VariantIcon className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 id={titleId} className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>{title}</h2>
              {subtitle && (
                <p id={subtitleId} className="text-xs mt-0.5 truncate max-w-[300px]" style={{ color: 'var(--v2-ink-faint)' }}>{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isDone && (
              <Sparkles className="w-4 h-4 animate-pulse" style={{ color: 'var(--v2-accent-strong)' }} />
            )}
            {canClose && (
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ color: 'var(--v2-ink-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(15,23,42,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title={isDone ? 'Fechar' : 'Cancelar pesquisa'}
                aria-label={isDone ? 'Fechar' : 'Cancelar pesquisa'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1" style={{ background: 'var(--v2-line-soft)' }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${isDone ? 100 : progressPercent}%`,
              background: hasErrors ? 'rgb(239,68,68)' : 'var(--v2-accent-strong)',
            }}
          />
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto" style={{ fontFamily: "var(--v2-font-sans, 'Inter', sans-serif)" }}>
          {/* Steps timeline */}
          <div className="space-y-0">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex gap-3">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <StepIndicator status={step.status} />
                  {idx < steps.length - 1 && (
                    <div
                      className="w-0.5 flex-1 min-h-[16px] transition-colors duration-300"
                      style={{ background: step.status === 'done' ? 'rgba(15,118,110,0.25)' : 'var(--v2-line-soft)' }}
                    />
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium transition-colors" style={{
                      color: step.status === 'active' ? 'var(--v2-ink-strong)' :
                             step.status === 'done' ? 'var(--v2-ink-soft)' :
                             step.status === 'error' ? 'rgb(185,28,28)' :
                             'var(--v2-ink-faint)',
                    }}>
                      {step.label}
                    </span>
                    {step.status === 'active' && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold animate-pulse"
                        style={{ background: 'rgba(15,118,110,0.10)', color: 'var(--v2-accent-strong)' }}
                      >
                        em andamento
                      </span>
                    )}
                  </div>
                  {step.detail && (
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: step.status === 'error' ? 'rgb(239,68,68)' : 'var(--v2-ink-faint)' }}
                    >
                      {step.detail}
                    </p>
                  )}
                  {step.substeps.length > 0 && (step.status === 'active' || step.status === 'done') && (
                    <div className="mt-1.5 space-y-0.5">
                      {step.substeps.slice(-4).map((sub, subIdx) => (
                        <p key={subIdx} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--v2-ink-faint)' }}>
                          <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--v2-ink-faint)' }} />
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
          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl p-4"
            style={{ background: 'rgba(15,23,42,0.03)', border: '1px solid var(--v2-line-soft)' }}
          >
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
            <div
              className="rounded-xl p-3 max-h-32 overflow-y-auto font-mono"
              style={{ background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(255,255,255,0.08)' }}
              ref={logRef}
              aria-live="polite"
              aria-atomic="false"
            >
              {allLogEntries.slice(-15).map((entry, i) => (
                <p key={i} className="text-[10px] leading-relaxed" style={{ color: 'rgba(156,163,175,1)' }}>
                  <span className="select-none" style={{ color: 'rgba(75,85,99,1)' }}>{String(i + 1).padStart(2, '0')} </span>
                  {entry}
                </p>
              ))}
              {!isDone && (
                <p className="text-[10px] animate-pulse" style={{ color: 'rgba(52,211,153,1)' }}>▎</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--v2-line-soft)', background: 'rgba(255,255,255,0.6)' }}
        >
          <p className="text-xs" style={{ color: 'var(--v2-ink-faint)' }}>
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
              className="v2-btn-secondary"
              style={{ minHeight: '2.25rem', padding: '0.5rem 1rem', fontSize: '0.8125rem' }}
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

function StepIndicator({ status }: { status: ResearchStep['status'] }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0'
  switch (status) {
    case 'done':
      return (
        <div className={base} style={{ background: 'rgba(15,118,110,0.12)' }}>
          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--v2-accent-strong)' }} />
        </div>
      )
    case 'active':
      return (
        <div className={base} style={{ background: 'rgba(15,118,110,0.12)' }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--v2-accent-strong)' }} />
        </div>
      )
    case 'error':
      return (
        <div className={base} style={{ background: 'rgba(239,68,68,0.10)' }}>
          <AlertCircle className="w-4 h-4" style={{ color: 'rgb(220,38,38)' }} />
        </div>
      )
    default:
      return (
        <div className={base} style={{ background: 'var(--v2-line-soft)' }}>
          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--v2-ink-faint)' }} />
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
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--v2-ink-faint)' }} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--v2-ink-faint)' }}>{label}</p>
        <p className="text-sm font-semibold" style={{ color: 'var(--v2-ink-strong)' }}>
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
