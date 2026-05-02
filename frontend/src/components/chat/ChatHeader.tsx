import { MessagesSquare, Square, WifiOff } from 'lucide-react'
import type { ChatConversationData, ChatEffortLevel } from '../../lib/firestore-types'
import EffortPicker from './EffortPicker'

interface ChatHeaderProps {
  conversation: ChatConversationData | null
  effort: ChatEffortLevel
  onChangeEffort: (effort: ChatEffortLevel) => void
  busy: boolean
  onCancel: () => void
}

export default function ChatHeader({
  conversation,
  effort,
  onChangeEffort,
  busy,
  onCancel,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--v2-border)] bg-white/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
          <MessagesSquare className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-semibold text-[var(--v2-ink-strong)]">
            {conversation?.title ?? 'Chat'}
          </h1>
          <p className="text-xs text-[var(--v2-ink-faint)]">
            Orquestrador multiagente · 9 agentes ativos · super-skills no PR3 · sidecar no PR4
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SidecarStatusPlaceholder />
        <EffortPicker value={effort} onChange={onChangeEffort} disabled={busy} />
        {busy && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            <Square className="h-3 w-3" />
            Cancelar
          </button>
        )}
      </div>
    </header>
  )
}

/**
 * Visual placeholder for the sidecar pairing status. Real wiring lands in
 * PR4 alongside the @lexio/desktop helper.
 */
function SidecarStatusPlaceholder() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-border)] bg-white px-3 py-1 text-[11px] text-[var(--v2-ink-faint)]"
      title="O sidecar @lexio/desktop chega no PR4 — sem ele, o chat funciona, mas não pode ler/gravar arquivos no seu PC."
    >
      <WifiOff className="h-3 w-3" />
      Sidecar offline
    </span>
  )
}
