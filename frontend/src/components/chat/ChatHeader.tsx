import { ArrowLeft, Download, MessagesSquare, Search, Square, WifiOff } from 'lucide-react'
import clsx from 'clsx'
import type { ChatConversationData, ChatEffortLevel } from '../../lib/firestore-types'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../../lib/model-config'
import { isEnabled } from '../../lib/feature-flags'
import EffortPicker from './EffortPicker'
import SidecarStatusBadge from './SidecarStatusBadge'

interface ChatHeaderProps {
  conversation: ChatConversationData | null
  effort: ChatEffortLevel
  onChangeEffort: (effort: ChatEffortLevel) => void
  busy: boolean
  onCancel: () => void
  onToggleSearch?: () => void
  showSearch?: boolean
  /** Back to the conversation list (mobile single-pane only). */
  onBack?: () => void
  /** Export the current conversation transcript (Markdown). */
  onExport?: () => void
}

export default function ChatHeader({
  conversation,
  effort,
  onChangeEffort,
  busy,
  onCancel,
  onToggleSearch,
  showSearch,
  onBack,
  onExport,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-2 border-b border-[var(--v2-border)] bg-white/80 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para a lista de conversas"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--v2-ink-faint)] hover:bg-[var(--v2-border)] lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 sm:flex">
          <MessagesSquare className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">
            {conversation?.title ?? 'Chat'}
          </h1>
          <p className="hidden truncate text-xs text-[var(--v2-ink-faint)] sm:block">
            Orquestrador multiagente · {CHAT_ORCHESTRATOR_AGENT_DEFS.length} agentes · lotes paralelos
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onToggleSearch && (
          <button
            type="button"
            onClick={onToggleSearch}
            className={clsx(
              'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition',
              showSearch
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-[var(--v2-border)] bg-white text-[var(--v2-ink-strong)] hover:bg-[var(--v2-border)]',
            )}
            title="Busca híbrida (Qdrant + DataJud)"
            aria-label="Buscar"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Buscar</span>
          </button>
        )}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--v2-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--v2-ink-strong)] transition hover:bg-[var(--v2-border)]"
            title="Exportar a conversa em Markdown"
            aria-label="Exportar conversa"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exportar</span>
          </button>
        )}
        <div className="hidden sm:block">
          {isEnabled('FF_CHAT_PC_APPROVALS') ? <SidecarStatusBadge /> : <SidecarStatusPlaceholder />}
        </div>
        <EffortPicker value={effort} onChange={onChangeEffort} disabled={busy} />
        {busy && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            aria-label="Cancelar"
          >
            <Square className="h-3 w-3" />
            <span className="hidden sm:inline">Cancelar</span>
          </button>
        )}
      </div>
    </header>
  )
}

function SidecarStatusPlaceholder() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-border)] bg-white px-3 py-1 text-[11px] text-[var(--v2-ink-faint)]"
      title="Sidecar @lexio/desktop não pareado nesta sessão. O chat funciona no browser; ações locais de arquivos/shell dependem do sidecar ativo."
    >
      <WifiOff className="h-3 w-3" />
      Sidecar offline
    </span>
  )
}
