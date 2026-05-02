import { useEffect, useState } from 'react'
import { Loader2, MessagesSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { ChatConversationData } from '../../lib/firestore-types'
import {
  createChatConversation,
  deleteChatConversation,
  listChatConversations,
  renameChatConversation,
} from '../../lib/firestore-service'
import { useAuth } from '../../contexts/AuthContext'
import { IS_FIREBASE } from '../../lib/firebase'

interface ConversationListProps {
  activeId: string | null
  onSelect: (id: string) => void
}

export default function ConversationList({ activeId, onSelect }: ConversationListProps) {
  const { userId, isReady } = useAuth()
  const [items, setItems] = useState<ChatConversationData[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryFlag, setRetryFlag] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Wait for auth to be fully ready before attempting Firestore reads.
    // This prevents permission-denied errors when the token is still propagating.
    if (!isReady || (!userId && IS_FIREBASE)) {
      if (!cancelled) setLoading(false)
      return
    }
    const loadConversations = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        if (!IS_FIREBASE) {
          if (cancelled) return
          setItems([])
          setLoading(false)
          return
        }
        const { items } = await listChatConversations(userId!)
        if (cancelled) return
        setItems(items)
      } catch {
        if (cancelled) return
        setItems([])
        setLoadError('Não foi possível carregar as conversas. Verifique sua conexão.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadConversations()
    const onConversationUpserted = () => { void loadConversations() }
    window.addEventListener('lexio:chat-conversation-upserted', onConversationUpserted)
    return () => {
      cancelled = true
      window.removeEventListener('lexio:chat-conversation-upserted', onConversationUpserted)
    }
  }, [userId, isReady, retryFlag])

  const handleCreate = async () => {
    if (!IS_FIREBASE) {
      const localId = `demo-${Date.now()}`
      const synthetic: ChatConversationData = {
        id: localId,
        title: 'Conversa demo',
        effort: 'medio',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setItems(prev => [synthetic, ...prev])
      onSelect(localId)
      return
    }
    if (!userId) return
    setCreating(true)
    try {
      const id = await createChatConversation(userId, { title: 'Nova conversa' })
      setItems(prev => [
        { id, title: 'Nova conversa', effort: 'medio', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ...prev,
      ])
      onSelect(id)
    } finally {
      setCreating(false)
    }
  }

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id)
    setRenameDraft(currentTitle)
  }

  const commitRename = async (id: string) => {
    const title = renameDraft.trim() || 'Conversa sem título'
    setRenamingId(null)
    setItems(prev => prev.map(it => (it.id === id ? { ...it, title } : it)))
    if (IS_FIREBASE && userId) {
      try {
        await renameChatConversation(userId, id, title)
      } catch {
        // best-effort
      }
    }
  }

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id))
    if (IS_FIREBASE && userId) {
      try {
        await deleteChatConversation(userId, id)
      } catch {
        // best-effort
      }
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 border-r border-[var(--v2-border)] bg-white/60 p-3">
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
      >
        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Nova conversa
      </button>
      <div className="mt-2 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--v2-border)] scrollbar-track-transparent">
        {loading && (
          <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--v2-ink-faint)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Carregando…
          </div>
        )}
        {loadError && (
          <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {loadError}
            <button
              type="button"
              onClick={() => setRetryFlag(n => n + 1)}
              className="ml-2 underline hover:text-rose-900"
            >
              Tentar novamente
            </button>
          </div>
        )}
        {!loading && !loadError && items.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-[var(--v2-ink-faint)]">
            Nenhuma conversa ainda. Comece criando uma nova.
          </div>
        )}
        <ul className="flex flex-col gap-1">
          {items.map(item => {
            const active = item.id === activeId
            const isRenaming = renamingId === item.id
            return (
              <li key={item.id ?? `r-${item.created_at}`}>
                <div
                  className={clsx(
                    'group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                    active ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-[var(--v2-border)]',
                  )}
                >
                  <MessagesSquare className={clsx('h-3.5 w-3.5 shrink-0', active ? 'text-indigo-600' : 'text-[var(--v2-ink-faint)]')} />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={e => setRenameDraft(e.target.value)}
                      onBlur={() => item.id && commitRename(item.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (item.id) commitRename(item.id)
                        }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="flex-1 rounded border border-[var(--v2-border)] bg-white px-1.5 py-0.5 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => item.id && onSelect(item.id)}
                      className="flex-1 truncate text-left"
                      title={item.last_preview || item.title}
                    >
                      {item.title}
                    </button>
                  )}
                  {!isRenaming && item.id && (
                    <div className="hidden items-center gap-1 group-hover:flex">
                      <button
                        type="button"
                        onClick={() => startRename(item.id!, item.title)}
                        className="rounded p-1 text-[var(--v2-ink-faint)] hover:bg-white hover:text-[var(--v2-ink-strong)]"
                        title="Renomear"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id!)}
                        className="rounded p-1 text-[var(--v2-ink-faint)] hover:bg-rose-50 hover:text-rose-600"
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
