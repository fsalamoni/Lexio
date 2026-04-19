import type { ElementType, ReactNode } from 'react'

type MetricTone = 'default' | 'accent' | 'warm' | 'success' | 'danger'

type MetricItem = {
  label: string
  value: ReactNode
  helper?: ReactNode
  icon?: ElementType
  tone?: MetricTone
}

const TONE_CLASS_MAP: Record<MetricTone, string> = {
  default: 'bg-[rgba(255,255,255,0.72)] text-[var(--v2-ink-strong)]',
  accent: 'bg-[rgba(15,118,110,0.12)] text-[var(--v2-ink-strong)]',
  warm: 'bg-[rgba(217,119,6,0.14)] text-[var(--v2-ink-strong)]',
  success: 'bg-[rgba(5,150,105,0.14)] text-[var(--v2-ink-strong)]',
  danger: 'bg-[rgba(220,38,38,0.12)] text-[var(--v2-ink-strong)]',
}

export function V2MetricCard({ label, value, helper, icon: Icon, tone = 'default' }: MetricItem) {
  return (
    <div className={`v2-summary-card ${TONE_CLASS_MAP[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          {helper ? <p className="mt-2 text-sm text-[var(--v2-ink-soft)]">{helper}</p> : null}
        </div>
        {Icon ? <Icon className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--v2-accent-strong)]" /> : null}
      </div>
    </div>
  )
}

export function V2MetricGrid({ items, className = '' }: { items: MetricItem[]; className?: string }) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${className}`.trim()}>
      {items.map((item) => (
        <V2MetricCard key={item.label} {...item} />
      ))}
    </div>
  )
}

export function V2PageHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description: ReactNode
  actions?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className="v2-panel overflow-hidden p-6 lg:p-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
        <div className="space-y-4">
          {eyebrow ? <div className="v2-kicker">{eyebrow}</div> : null}
          <div className="space-y-3">
            <h1 className="v2-display text-4xl leading-tight text-[var(--v2-ink-strong)]">{title}</h1>
            <p className="max-w-3xl text-sm leading-7 text-[var(--v2-ink-soft)] sm:text-[15px]">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
        {aside ? <div className="v2-hero-aside">{aside}</div> : null}
      </div>
    </section>
  )
}

export function V2EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ElementType
  title: ReactNode
  description: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="v2-panel px-6 py-12 text-center lg:px-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[rgba(15,23,42,0.06)] text-[var(--v2-accent-strong)]">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-[var(--v2-ink-strong)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[var(--v2-ink-soft)]">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}