import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import type { ChatAgentMode } from '../../lib/firestore-types'
import AgentModePicker from '../chat/AgentModePicker'

interface StudioComposerProps {
  mode: ChatAgentMode
  onModeChange: (mode: ChatAgentMode) => void
  onSend: (text: string) => void
  onStop?: () => void
  running: boolean
  disabled?: boolean
  placeholder?: string
  targetRepo?: string
}

/**
 * The Design Studio v2 message composer: a growing textarea, the per-command
 * mode picker (auto / plan / ask) and a send/stop control. Enter sends;
 * Shift+Enter inserts a newline.
 */
export default function StudioComposer({
  mode,
  onModeChange,
  onSend,
  onStop,
  running,
  disabled,
  placeholder,
  targetRepo,
}: StudioComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || running || disabled) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--v2-border)] bg-white/85 p-2.5 shadow-sm">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={2}
        placeholder={placeholder ?? 'Descreva o que você quer construir ou alterar…'}
        aria-label="Mensagem para o Design Studio"
        className="max-h-[220px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-[var(--v2-ink-strong)] placeholder:text-[var(--v2-ink-faint)] focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <AgentModePicker value={mode} onChange={onModeChange} disabled={running || disabled} targetRepo={targetRepo} />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v2-ink-strong)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <Square className="h-3.5 w-3.5" /> Parar
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v2-accent-strong)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Enviar <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
