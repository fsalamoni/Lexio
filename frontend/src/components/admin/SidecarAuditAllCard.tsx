/**
 * SidecarAuditAllCard — aggregated view of the user's PC-action audit across
 * all of their conversations (Configurações). Client-side aggregation: lists
 * recent conversations and merges their `audit` subcollections — no rules or
 * index changes needed. Shown behind FF_CHAT_PC_APPROVALS.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { listChatConversations, listChatSidecarAuditEntries } from '../../lib/firestore-service'
import { IS_FIREBASE } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import type { ChatSidecarAuditEntryData } from '../../lib/firestore-types'

const MAX_CONVERSATIONS = 40
const PER_CONVERSATION = 50
const MAX_ROWS = 200

type Row = ChatSidecarAuditEntryData & { conversation_title?: string }

export default function SidecarAuditAllCard() {
  const { userId } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!IS_FIREBASE || !userId) return
    setLoading(true)
    try {
      const { items: conversations } = await listChatConversations(userId)
      const recent = conversations.slice(0, MAX_CONVERSATIONS)
      const perConvo = await Promise.all(
        recent.map(async conversation => {
          if (!conversation.id) return [] as Row[]
          try {
            const { items } = await listChatSidecarAuditEntries(userId, conversation.id, { limit: PER_CONVERSATION })
            return items.map(entry => ({ ...entry, conversation_title: conversation.title }))
          } catch {
            return [] as Row[]
          }
        }),
      )
      const merged = perConvo.flat().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, MAX_ROWS)
      setRows(merged)
      setLoaded(true)
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <p className="flex-1 text-sm text-[var(--v2-ink-soft)]">
          Todas as ações no PC (escrever, apagar, renomear, shell, git) propostas/executadas nas suas conversas.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--v2-border)] bg-white px-2.5 py-1 text-xs font-semibold hover:bg-[var(--v2-border)]"
        >
          <RefreshCw className={clsx('h-3 w-3', loading && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {!IS_FIREBASE && <p className="text-xs text-[var(--v2-ink-faint)]">Auditoria indisponível no modo demonstração.</p>}
      {loading && rows.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-[var(--v2-ink-faint)]"><Loader2 className="h-3 w-3 animate-spin" /> Carregando…</p>
      )}
      {loaded && rows.length === 0 && (
        <p className="text-xs text-[var(--v2-ink-faint)]">Nenhuma ação no PC registrada ainda.</p>
      )}

      {rows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-lg border border-[var(--v2-border)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--v2-border)]/40 text-[var(--v2-ink-faint)]">
              <tr>
                <th className="px-3 py-1.5 font-semibold">Quando</th>
                <th className="px-3 py-1.5 font-semibold">Operação</th>
                <th className="px-3 py-1.5 font-semibold">Status</th>
                <th className="px-3 py-1.5 font-semibold">Recurso</th>
                <th className="px-3 py-1.5 font-semibold">Conversa</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id ?? `${row.operation}-${row.created_at}`} className="border-t border-[var(--v2-border)]">
                  <td className="whitespace-nowrap px-3 py-1.5 text-[var(--v2-ink-faint)]">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold text-[var(--v2-ink-strong)]">{row.operation}</td>
                  <td className="px-3 py-1.5">
                    <span className={clsx('inline-flex items-center gap-1', STATUS_TEXT[row.status] ?? 'text-slate-500')}>
                      <span className={clsx('inline-block h-1.5 w-1.5 rounded-full', STATUS_DOT[row.status] ?? 'bg-slate-300')} />
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-1.5 text-[var(--v2-ink-faint)]" title={row.resource_path}>{row.resource_path ?? '—'}</td>
                  <td className="max-w-[10rem] truncate px-3 py-1.5 text-[var(--v2-ink-faint)]" title={row.conversation_title}>{row.conversation_title ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const STATUS_DOT: Record<string, string> = {
  proposed: 'bg-amber-400', approved: 'bg-sky-400', executed: 'bg-emerald-500', rejected: 'bg-slate-400', failed: 'bg-rose-500',
}
const STATUS_TEXT: Record<string, string> = {
  proposed: 'text-amber-600', approved: 'text-sky-600', executed: 'text-emerald-600', rejected: 'text-slate-500', failed: 'text-rose-600',
}
const STATUS_LABEL: Record<string, string> = {
  proposed: 'proposta', approved: 'aprovada', executed: 'executada', rejected: 'rejeitada', failed: 'falhou',
}

function formatDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return iso }
}
