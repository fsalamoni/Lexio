import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { listChatSidecarAuditEntries } from '../../lib/firestore-service'
import { IS_FIREBASE } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import type { ChatSidecarAuditEntryData } from '../../lib/firestore-types'

interface SidecarAuditPanelProps {
  conversationId: string
}

/**
 * Collapsible per-conversation audit log of PC actions (write/delete/rename/
 * shell). Collapsed by default; loads on first expand. Shown behind
 * `FF_CHAT_PC_APPROVALS`.
 */
export default function SidecarAuditPanel({ conversationId }: SidecarAuditPanelProps) {
  const { userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<ChatSidecarAuditEntryData[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!IS_FIREBASE || !userId) return
    setLoading(true)
    try {
      const { items } = await listChatSidecarAuditEntries(userId, conversationId, { limit: 100 })
      setEntries(items)
      setLoaded(true)
    } catch {
      // best-effort; the panel just stays empty on read failure.
    } finally {
      setLoading(false)
    }
  }, [userId, conversationId])

  // Reset when the conversation changes.
  useEffect(() => {
    setEntries([])
    setLoaded(false)
    setOpen(false)
  }, [conversationId])

  useEffect(() => {
    if (open && !loaded) void load()
  }, [open, loaded, load])

  return (
    <div className="border-b border-[var(--v2-border)] bg-white/60">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <ShieldCheck className="h-3 w-3" />
          Auditoria de ações no PC{entries.length ? ` (${entries.length})` : ''}
        </button>
        {open && (
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
          >
            <RefreshCw className={clsx('h-3 w-3', loading && 'animate-spin')} />
            atualizar
          </button>
        )}
      </div>
      {open && (
        <div className="max-h-44 overflow-auto px-4 pb-2">
          {!IS_FIREBASE && (
            <p className="py-2 text-[11px] text-[var(--v2-ink-faint)]">Auditoria indisponível no modo demonstração.</p>
          )}
          {IS_FIREBASE && loaded && entries.length === 0 && (
            <p className="py-2 text-[11px] text-[var(--v2-ink-faint)]">Nenhuma ação no PC registrada nesta conversa.</p>
          )}
          <ul className="space-y-1">
            {entries.map(entry => (
              <li key={entry.id ?? `${entry.operation}-${entry.created_at}`} className="flex items-center gap-2 text-[11px]">
                <span className={clsx('inline-block h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[entry.status] ?? 'bg-slate-300')} />
                <span className="font-mono font-semibold text-[var(--v2-ink-strong)]">{entry.operation}</span>
                <span className="text-[var(--v2-ink-faint)]">{STATUS_LABEL[entry.status] ?? entry.status}</span>
                {entry.resource_path && (
                  <span className="truncate text-[var(--v2-ink-faint)]" title={entry.resource_path}>· {entry.resource_path}</span>
                )}
                <span className="ml-auto shrink-0 text-[var(--v2-ink-faint)]">{formatTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  proposed: 'bg-amber-400',
  approved: 'bg-sky-400',
  executed: 'bg-emerald-500',
  rejected: 'bg-slate-400',
  failed: 'bg-rose-500',
}

const STATUS_LABEL: Record<string, string> = {
  proposed: 'proposta',
  approved: 'aprovada',
  executed: 'executada',
  rejected: 'rejeitada',
  failed: 'falhou',
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
