import { Gauge } from 'lucide-react'
import clsx from 'clsx'
import type { ChatEffortLevel } from '../../lib/firestore-types'
import { EFFORT_DESCRIPTIONS, EFFORT_LABELS } from '../../lib/chat-orchestrator'

interface EffortPickerProps {
  value: ChatEffortLevel
  onChange: (effort: ChatEffortLevel) => void
  disabled?: boolean
}

const ORDER: ChatEffortLevel[] = ['rapido', 'medio', 'profundo', 'deep_research']

export default function EffortPicker({ value, onChange, disabled }: EffortPickerProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-border)] bg-white/80 p-1 text-xs">
      <Gauge className="ml-1 h-3.5 w-3.5 text-[var(--v2-ink-faint)]" />
      {ORDER.map(level => {
        const active = level === value
        return (
          <button
            key={level}
            type="button"
            disabled={disabled}
            onClick={() => onChange(level)}
            title={EFFORT_DESCRIPTIONS[level]}
            className={clsx(
              'rounded-full px-3 py-1 transition-colors',
              active
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-[var(--v2-ink-muted)] hover:text-[var(--v2-ink-strong)]',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {EFFORT_LABELS[level]}
          </button>
        )
      })}
    </div>
  )
}
