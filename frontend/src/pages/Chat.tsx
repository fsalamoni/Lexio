import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import ChatHeader from '../components/chat/ChatHeader'
import Composer from '../components/chat/Composer'
import ConversationList from '../components/chat/ConversationList'
import EmptyState from '../components/chat/EmptyState'
import MessageStream from '../components/chat/MessageStream'
import SearchPanel from '../components/chat/SearchPanel'
import SidecarAuditPanel from '../components/chat/SidecarAuditPanel'
import { useChatController } from '../components/chat/use-chat-controller'
import { isMockRuntimeActive } from '../lib/chat-orchestrator'
import { loadGithubConnectorConfig } from '../lib/chat-orchestrator/github-config'
import { isEnabled } from '../lib/feature-flags'
import { exportChatConversation } from '../lib/chat-conversation-export'
import type { HybridResultItem } from '../lib/search-client'

/**
 * Chat — orchestrated multi-agent conversation page.
 *
 * Architecture (see `lib/chat-orchestrator/`):
 *  - The page is a thin shell around `useChatController`.
 *  - The controller owns the orchestrator runtime, persistence and
 *    AbortController for cancellation.
 *  - PR2 ships the runtime + UI; specialists/super-skills are unlocked in
 *    pipeline super-skills and the @lexio/desktop sidecar.
 */
export default function Chat() {
  const [params, setParams] = useSearchParams()
  const conversationId = params.get('id')
  const [activeId, setActiveId] = useState<string | null>(conversationId)
  const [showSearch, setShowSearch] = useState(false)
  // Mobile single-pane navigation: 'list' shows the conversation list,
  // 'chat' shows the active conversation. Ignored at lg+ (both panes visible).
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(conversationId ? 'chat' : 'list')

  useEffect(() => {
    setActiveId(conversationId)
    if (conversationId) setMobileView('chat')
  }, [conversationId])

  const handleSelectConversation = (id: string) => {
    setActiveId(id)
    setMobileView('chat')
    const next = new URLSearchParams(params)
    next.set('id', id)
    setParams(next, { replace: true })
  }

  const controller = useChatController({ conversationId: activeId })
  const { state, sendMessage, retryExport, cancel, setEffort, setAgentMode } = controller
  const mock = isMockRuntimeActive()
  const busy = state.status === 'sending'

  // Load the configured GitHub target repository to display as scope hint on
  // the agent mode picker (only relevant when the agent-modes flag is on).
  const [targetRepo, setTargetRepo] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!isEnabled('FF_CHAT_AGENT_MODES')) return
    let cancelled = false
    loadGithubConnectorConfig()
      .then(cfg => {
        if (cancelled) return
        const owner = (cfg.default_owner || '').trim()
        const repo = (cfg.default_repo || '').trim()
        setTargetRepo(owner && repo ? `${owner}/${repo}` : undefined)
      })
      .catch(() => {
        if (!cancelled) setTargetRepo(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    <div className="flex h-[calc(100dvh-5.5rem)] flex-col lg:h-[calc(100vh-3rem)]">
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list — full width on mobile (list view), fixed column at lg */}
        <div
          className={clsx(
            'min-h-0 w-full overflow-hidden lg:block lg:w-[280px] lg:shrink-0',
            mobileView === 'list' ? 'block' : 'hidden',
          )}
        >
          <ConversationList activeId={activeId} onSelect={handleSelectConversation} />
        </div>
        {/* Chat column — hidden on mobile while the list is showing */}
        <div
          className={clsx(
            'min-h-0 flex-1 flex-col overflow-hidden',
            mobileView === 'chat' ? 'flex' : 'hidden lg:flex',
          )}
        >
          <ChatHeader
            conversation={state.conversation}
            effort={state.effort}
            onChangeEffort={setEffort}
            agentMode={state.agentMode}
            onChangeAgentMode={setAgentMode}
            targetRepo={targetRepo}
            busy={busy}
            onCancel={cancel}
            onBack={() => setMobileView('list')}
            onToggleSearch={() => setShowSearch(s => !s)}
            showSearch={showSearch}
            onExport={
              activeId && isEnabled('FF_CHAT_CONVO_TOOLS') && state.turns.length > 0
                ? () => exportChatConversation(state.conversation, state.turns, 'md')
                : undefined
            }
          />
          {activeId && isEnabled('FF_CHAT_PC_APPROVALS') && (
            <SidecarAuditPanel conversationId={activeId} />
          )}
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
                onSendPendingAnswer={sendMessage}
                onRetryExport={retryExport}
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
          <div className="fixed inset-0 z-40 bg-white lg:static lg:z-auto lg:block lg:w-[380px] lg:shrink-0">
            <SearchPanel
              onClose={() => setShowSearch(false)}
              onAttachToContext={activeId ? handleAttachToContext : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
