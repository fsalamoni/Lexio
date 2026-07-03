import { Bot, HelpCircle, ListChecks, Zap } from 'lucide-react'
import clsx from 'clsx'
import type { ChatAgentMode } from '../../lib/firestore-types'
import { CHAT_AGENT_MODES } from '../../lib/firestore-types'

interface AgentModePickerProps {
  value: ChatAgentMode
  onChange: (mode: ChatAgentMode) => void
  disabled?: boolean
  /** Configured target repository (owner/repo) shown as scope hint. */
  targetRepo?: string
}

const MODE_LABELS: Record<ChatAgentMode, string> = {
  auto: 'Automático',
  ask: 'Sempre perguntar',
  plan: 'Planejar',
}

const MODE_DESCRIPTIONS: Record<ChatAgentMode, string> = {
  auto: 'Executa as ações de escrita sem pausar (mantendo o bloqueio de main/master).',
  ask: 'Pede aprovação a cada operação de escrita (aprovar / rejeitar / ajustar).',
  plan: 'Estuda o pedido e entrega um plano estruturado para aprovar, rejeitar ou revisar antes de executar.',
}

const MODE_ICONS: Record<ChatAgentMode, typeof Bot> = {
  auto: Zap,
  ask: HelpCircle,
  plan: ListChecks,
}

export default function AgentModePicker({ value, onChange, disabled, targetRepo }: AgentModePickerProps) {
  const scopeHint = targetRepo ? ` · escopo: ${targetRepo}` : ''
  return (
    <>
      {/* Mobile/tablet: compact native select */}
      <label className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-border)] bg-white/80 px-2 py-1 text-xs md:hidden">
        <Bot className="h-3.5 w-3.5 text-[var(--v2-ink-faint)]" />
        <select
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value as ChatAgentMode)}
          aria-label="Modo de execução do agente"
          className="bg-transparent pr-1 text-xs font-semibold text-[var(--v2-ink-strong)] focus:outline-none disabled:opacity-60"
        >
          {CHAT_AGENT_MODES.map(mode => (
            <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>

      {/* Desktop: segmented control */}
      <div
        className="hidden items-center gap-1 rounded-full border border-[var(--v2-border)] bg-white/80 p-1 text-xs md:inline-flex"
        title={`Modo de execução do agente${scopeHint}`}
      >
        <Bot className="ml-1 h-3.5 w-3.5 text-[var(--v2-ink-faint)]" />
        {CHAT_AGENT_MODES.map(mode => {
          const active = mode === value
          const Icon = MODE_ICONS[mode]
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode)}
              title={`${MODE_DESCRIPTIONS[mode]}${scopeHint}`}
              aria-pressed={active}
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors',
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-[var(--v2-ink-muted)] hover:text-[var(--v2-ink-strong)]',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
            >
              <Icon className="h-3 w-3" />
              {MODE_LABELS[mode]}
            </button>
          )
        })}
      </div>
    </>
  )
}
