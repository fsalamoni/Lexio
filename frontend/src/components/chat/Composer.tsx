import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface ComposerProps {
  onSend: (text: string) => void
  disabled?: boolean
  busy?: boolean
  placeholder?: string
}

export default function Composer({ onSend, disabled, busy, placeholder }: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-resize textarea up to ~10 lines.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 240)
    ta.style.height = `${next}px`
  }, [text])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--v2-border)] bg-white p-3 shadow-sm">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder={placeholder ?? 'Pergunte ao orquestrador… (Enter envia, Shift+Enter quebra a linha)'}
        disabled={disabled}
        className="w-full resize-none border-0 bg-transparent text-sm leading-6 text-[var(--v2-ink-strong)] placeholder:text-[var(--v2-ink-faint)] focus:outline-none disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--v2-ink-faint)]">
        <span>Enter envia · Shift+Enter quebra linha</span>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
            disabled || !text.trim()
              ? 'bg-[var(--v2-border)] text-[var(--v2-ink-faint)] cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700',
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar
        </button>
      </div>
    </div>
  )
}
