import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ChatHeader from '../components/chat/ChatHeader'
import Composer from '../components/chat/Composer'
import ConversationList from '../components/chat/ConversationList'
import EmptyState from '../components/chat/EmptyState'
import MessageStream from '../components/chat/MessageStream'
import SearchPanel from '../components/chat/SearchPanel'
import { useChatController } from '../components/chat/use-chat-controller'
import { isMockRuntimeActive } from '../lib/chat-orchestrator'
import type { HybridResultItem } from '../lib/search-client'

/**
 * Chat — orchestrated multi-agent conversation page.
 *
 * Architecture (see `lib/chat-orchestrator/`):
 *  - The page is a thin shell around `useChatController`.
 *  - The controller owns the orchestrator runtime, persistence and
 *    AbortController for cancellation.
 *  - PR2 ships the runtime + UI; specialists/super-skills are unlocked in
 *    PR3 and the @lexio/desktop sidecar in PR4.
 */
export default function Chat() {
  const [params, setParams] = useSearchParams()
  const conversationId = params.get('id')
  const [activeId, setActiveId] = useState<string | null>(conversationId)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => {
    setActiveId(conversationId)
  }, [conversationId])

  const handleSelectConversation = (id: string) => {
    setActiveId(id)
    const next = new URLSearchParams(params)
    next.set('id', id)
    setParams(next, { replace: true })
  }

  const controller = useChatController({ conversationId: activeId })
  const { state, sendMessage, cancel, setEffort } = controller
  const mock = isMockRuntimeActive()
  const busy = state.status === 'sending'

  // Callback para anexar resultados de busca ao contexto do chat
  const handleAttachToContext = useCallback(
    (results: HybridResultItem[]) => {
      const context = results
        .map(
          (r, i) =>
            `[Resultado ${i + 1}] Fonte: ${r.source} (score: ${r.score.toFixed(2)})\n${r.content}`,
        )
        .join('\n\n---\n\n')
      sendMessage(`Considere os seguintes resultados de busca jurídica:\n\n${context}`)
    },
    [sendMessage],
  )

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div
        className={`grid flex-1 overflow-hidden ${
          showSearch ? 'lg:grid-cols-[280px_1fr_380px]' : 'lg:grid-cols-[280px_1fr]'
        }`}
      >
        <ConversationList activeId={activeId} onSelect={handleSelectConversation} />
        <div className="flex flex-col overflow-hidden min-h-0">
          <ChatHeader
            conversation={state.conversation}
            effort={state.effort}
            onChangeEffort={setEffort}
            busy={busy}
            onCancel={cancel}
            onToggleSearch={() => setShowSearch(s => !s)}
            showSearch={showSearch}
          />
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            {!activeId && (
              <div className="flex h-full items-center justify-center p-6">
                <EmptyState demo={mock} />
              </div>
            )}
            {activeId && (
              <MessageStream
                turns={state.turns}
                liveTurn={state.liveTurn}
                emptyState={<EmptyState demo={mock} />}
              />
            )}
          </div>
          {activeId && (
            <div className="border-t border-[var(--v2-border)] bg-white/80 p-3">
              {state.error && (
                <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                  {state.error}
                </div>
              )}
              <Composer
                onSend={sendMessage}
                disabled={busy || state.status === 'loading'}
                busy={busy}
                placeholder={
                  state.status === 'awaiting_user'
                    ? 'Responda à pergunta do orquestrador para continuar…'
                    : undefined
                }
              />
            </div>
          )}
        </div>
        {showSearch && (
          <SearchPanel
            onClose={() => setShowSearch(false)}
            onAttachToContext={activeId ? handleAttachToContext : undefined}
          />
        )}
      </div>
    </div>
  )
}
