import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type {
  ChatConversationData,
  ChatTrailEvent,
  ChatTurnData,
  ChatTurnStatus,
  ChatEffortLevel,
} from '../../lib/firestore-types'
import {
  appendChatTurn,
  ensureChatConversation,
  getChatConversation,
  listChatTurns,
  updateChatTurn,
  updateChatConversationEffort,
  updateChatConversationPreview,
} from '../../lib/firestore-service'
import {
  DEFAULT_EFFORT,
  EFFORT_PRESETS,
  isEffortLevel,
  isMockRuntimeActive,
  mockOrchestratorLLM,
  runChatTurn,
} from '../../lib/chat-orchestrator'
import {
  buildPipelineFallbackResolver,
  CHAT_ORCHESTRATOR_AGENT_DEFS,
  loadChatOrchestratorModels,
  loadFallbackPriorityConfig,
} from '../../lib/model-config'
import { getOpenRouterKey } from '../../lib/generation-service'
import { useAuth } from '../../contexts/AuthContext'
import { IS_FIREBASE } from '../../lib/firebase'

export interface ChatControllerState {
  conversationId: string | null
  conversation: ChatConversationData | null
  turns: ChatTurnData[]
  /** The turn currently being orchestrated. Lives in memory; merged with `turns` when persisted. */
  liveTurn: ChatTurnData | null
  status: 'idle' | 'loading' | 'sending' | 'awaiting_user' | 'error'
  error: string | null
  effort: ChatEffortLevel
}

type Action =
  | { type: 'LOAD_START'; conversationId: string }
  | { type: 'LOAD_SUCCESS'; conversation: ChatConversationData; turns: ChatTurnData[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'BEGIN_SEND'; turn: ChatTurnData }
  | { type: 'TRAIL_APPEND'; event: ChatTrailEvent }
  | { type: 'COMMIT_TURN'; turn: ChatTurnData; status: ChatTurnStatus }
  | { type: 'SEND_ERROR'; error: string }
  | { type: 'SET_EFFORT'; effort: ChatEffortLevel }
  | { type: 'SET_LAST_PREVIEW'; preview: string }

const initialState: ChatControllerState = {
  conversationId: null,
  conversation: null,
  turns: [],
  liveTurn: null,
  status: 'idle',
  error: null,
  effort: DEFAULT_EFFORT,
}

const CHAT_CONVERSATION_UPSERTED_EVENT = 'lexio:chat-conversation-upserted'

function notifyChatConversationUpserted(conversationId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHAT_CONVERSATION_UPSERTED_EVENT, { detail: { conversationId } }))
}

function reducer(state: ChatControllerState, action: Action): ChatControllerState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...initialState, conversationId: action.conversationId, status: 'loading' }
    case 'LOAD_SUCCESS':
      return {
        ...state,
        conversation: action.conversation,
        turns: action.turns,
        status: action.turns.some(t => t.status === 'awaiting_user') ? 'awaiting_user' : 'idle',
        effort: action.conversation.effort ?? DEFAULT_EFFORT,
        error: null,
      }
    case 'LOAD_ERROR':
      return { ...state, status: 'error', error: action.error }
    case 'BEGIN_SEND':
      return { ...state, liveTurn: action.turn, status: 'sending', error: null }
    case 'TRAIL_APPEND':
      if (!state.liveTurn) return state
      return {
        ...state,
        liveTurn: { ...state.liveTurn, trail: [...state.liveTurn.trail, action.event] },
      }
    case 'COMMIT_TURN':
      return {
        ...state,
        liveTurn: null,
        turns: [...state.turns, { ...action.turn, status: action.status }],
        status: action.status === 'awaiting_user' ? 'awaiting_user' : 'idle',
      }
    case 'SEND_ERROR':
      return {
        ...state,
        liveTurn: state.liveTurn ? { ...state.liveTurn, status: 'error' } : null,
        status: 'error',
        error: action.error,
      }
    case 'SET_EFFORT':
      return { ...state, effort: action.effort, conversation: state.conversation ? { ...state.conversation, effort: action.effort } : null }
    case 'SET_LAST_PREVIEW':
      return state.conversation ? { ...state, conversation: { ...state.conversation, last_preview: action.preview } } : state
    default:
      return state
  }
}

interface UseChatControllerArgs {
  conversationId: string | null
}

/**
 * Hook tying the React surface to the orchestrator runtime. Owns:
 *   - loading the conversation + its turns
 *   - building a SkillContext (models + API key) and calling runChatTurn
 *   - persisting the live turn after each trail event (debounced)
 *   - exposing send/cancel/setEffort to the UI
 */
export function useChatController({ conversationId }: UseChatControllerArgs) {
  const { userId } = useAuth()
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)

  // Load on conversation change.
  useEffect(() => {
    let cancelled = false
    if (!conversationId) return
    if (!userId && IS_FIREBASE) return
    dispatch({ type: 'LOAD_START', conversationId })
    ;(async () => {
      try {
        if (!IS_FIREBASE) {
          // Demo mode: synthesise an empty conversation + no turns.
          const synthetic: ChatConversationData = {
            id: conversationId,
            title: 'Conversa demo',
            effort: DEFAULT_EFFORT,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_preview: '',
          }
          if (cancelled) return
          dispatch({ type: 'LOAD_SUCCESS', conversation: synthetic, turns: [] })
          return
        }
        let conv = await getChatConversation(userId!, conversationId)
        if (!conv) {
          conv = await ensureChatConversation(userId!, conversationId, { title: 'Conversa recuperada' })
          notifyChatConversationUpserted(conversationId)
        }
        const { items: turns } = await listChatTurns(userId!, conversationId)
        if (cancelled) return
        dispatch({ type: 'LOAD_SUCCESS', conversation: conv, turns })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        dispatch({ type: 'LOAD_ERROR', error: message })
      }
    })()
    return () => { cancelled = true }
  }, [conversationId, userId])

  const sendMessage = useCallback(async (text: string) => {
    if (!conversationId) return
    if (!userId && IS_FIREBASE) return
    if (state.status === 'sending') return

    const trimmed = text.trim()
    if (!trimmed) return

    const mock = isMockRuntimeActive()

    let turnId = `local-${Date.now()}`
    const startedAt = new Date().toISOString()
    const liveTurn: ChatTurnData = {
      id: turnId,
      conversation_id: conversationId,
      user_input: trimmed,
      trail: [],
      assistant_markdown: null,
      status: 'running',
      created_at: startedAt,
    }

    if (IS_FIREBASE && userId) {
      try {
        await ensureChatConversation(userId, conversationId, {
          title: trimmed.slice(0, 80),
          effort: state.effort,
        })
        notifyChatConversationUpserted(conversationId)
        turnId = await appendChatTurn(userId, conversationId, {
          conversation_id: conversationId,
          user_input: trimmed,
          trail: [],
          assistant_markdown: null,
          status: 'running',
          created_at: startedAt,
        })
        liveTurn.id = turnId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        dispatch({ type: 'SEND_ERROR', error: `Falha ao registrar turno: ${message}` })
        return
      }
    }

    dispatch({ type: 'BEGIN_SEND', turn: liveTurn })

    abortRef.current = new AbortController()
    const controller = abortRef.current

    // Build models map + API key (mock stays empty for demo).
    let models: Record<string, string> = {}
    let fallbackModels: Record<string, string[]> = {}
    let apiKey = ''
    try {
      if (mock) {
        models = mockModelMap()
        fallbackModels = {}
        apiKey = 'demo'
      } else {
        models = await loadChatOrchestratorModels(userId ?? undefined)
        const fallbackConfig = await loadFallbackPriorityConfig(userId ?? undefined)
        const resolveFallbacks = buildPipelineFallbackResolver(CHAT_ORCHESTRATOR_AGENT_DEFS, fallbackConfig)
        fallbackModels = Object.fromEntries(
          Object.entries(models).map(([agentKey, model]) => [agentKey, resolveFallbacks(agentKey, model)]),
        )
        apiKey = await getOpenRouterKey(userId ?? undefined)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const completedAt = new Date().toISOString()
      const errorEvent: ChatTrailEvent = { type: 'error', message, ts: completedAt }
      const failedTurn: ChatTurnData = {
        ...liveTurn,
        id: turnId,
        trail: [errorEvent],
        assistant_markdown: `Não consegui iniciar o orquestrador porque a configuração falhou: ${message}`,
        status: 'error',
        completed_at: completedAt,
      }
      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            trail: failedTurn.trail,
            assistant_markdown: failedTurn.assistant_markdown,
            status: 'error',
            completed_at: completedAt,
          })
        } catch {
          // best-effort; the in-memory turn still shows the failure.
        }
      }
      dispatch({ type: 'COMMIT_TURN', turn: failedTurn, status: 'error' })
      return
    }

    // Throttled persistence — write to Firestore at most every 500ms while
    // events stream in, plus a final flush at completion.
    let pendingPersist = false
    let scheduled: ReturnType<typeof setTimeout> | null = null
    const trailBuffer: ChatTrailEvent[] = []
    const flushTrail = async () => {
      if (!IS_FIREBASE || !userId) return
      pendingPersist = false
      try {
        await updateChatTurn(userId, conversationId, turnId, {
          trail: trailBuffer.slice(),
        })
      } catch {
        // best-effort
      }
    }
    const schedulePersist = () => {
      if (!IS_FIREBASE) return
      if (scheduled) return
      pendingPersist = true
      scheduled = setTimeout(() => {
        scheduled = null
        if (pendingPersist) flushTrail()
      }, 500)
    }

    const onTrail = (event: ChatTrailEvent) => {
      trailBuffer.push(event)
      dispatch({ type: 'TRAIL_APPEND', event })
      schedulePersist()
    }

    // Build prior history (concatenate previous turns).
    const history = state.turns.flatMap(turn => [
      { role: 'user' as const, content: turn.user_input },
      ...(turn.assistant_markdown ? [{ role: 'assistant' as const, content: turn.assistant_markdown }] : []),
    ])

    try {
      const result = await runChatTurn({
        uid: userId ?? 'demo',
        conversationId,
        turnId,
        effort: state.effort,
        history,
        user_input: trimmed,
        models,
        fallbackModels,
        apiKey,
        signal: controller.signal,
        onTrail,
        llmCall: mock ? mockOrchestratorLLM : undefined,
        mock,
      })

      if (scheduled) {
        clearTimeout(scheduled)
        scheduled = null
      }

      const completedTurn: ChatTurnData = {
        ...liveTurn,
        id: turnId,
        trail: trailBuffer.slice(),
        assistant_markdown: result.assistant_markdown,
        status: result.status,
        pending_question: result.pending_question ?? null,
        llm_executions: result.llm_executions,
        completed_at: new Date().toISOString(),
      }

      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            trail: completedTurn.trail,
            assistant_markdown: completedTurn.assistant_markdown,
            status: completedTurn.status,
            pending_question: completedTurn.pending_question ?? null,
            llm_executions: completedTurn.llm_executions,
            completed_at: completedTurn.completed_at,
          })
          if (result.assistant_markdown) {
            try {
              await updateChatConversationPreview(userId, conversationId, result.assistant_markdown)
              dispatch({ type: 'SET_LAST_PREVIEW', preview: result.assistant_markdown.slice(0, 240) })
            } catch {
              // best-effort
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          dispatch({ type: 'SEND_ERROR', error: `Falha ao salvar turno: ${message}` })
          return
        }
      }

      dispatch({ type: 'COMMIT_TURN', turn: completedTurn, status: result.status })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        const cancelledTurn: ChatTurnData = {
          ...liveTurn,
          id: turnId,
          trail: trailBuffer.slice(),
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        }
        if (IS_FIREBASE && userId) {
          try {
            await updateChatTurn(userId, conversationId, turnId, {
              trail: cancelledTurn.trail,
              status: 'cancelled',
              completed_at: cancelledTurn.completed_at,
            })
          } catch {
            // best-effort
          }
        }
        dispatch({ type: 'COMMIT_TURN', turn: cancelledTurn, status: 'cancelled' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      const completedAt = new Date().toISOString()
      const errorEvent: ChatTrailEvent = { type: 'error', message, ts: completedAt }
      const failedTurn: ChatTurnData = {
        ...liveTurn,
        id: turnId,
        trail: [...trailBuffer, errorEvent],
        assistant_markdown: `O orquestrador não conseguiu concluir este turno. O pedido ficou salvo e pode ser reenviado.\n\n**Detalhe técnico:** ${message}`,
        status: 'error',
        completed_at: completedAt,
      }
      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            status: 'error',
            trail: failedTurn.trail,
            assistant_markdown: failedTurn.assistant_markdown,
            completed_at: failedTurn.completed_at,
          })
        } catch {
          // best-effort
        }
      }
      dispatch({ type: 'COMMIT_TURN', turn: failedTurn, status: 'error' })
    } finally {
      abortRef.current = null
    }
  }, [conversationId, state.effort, state.status, state.turns, userId])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const setEffort = useCallback(async (effort: ChatEffortLevel) => {
    dispatch({ type: 'SET_EFFORT', effort })
    if (IS_FIREBASE && userId && conversationId) {
      try {
        await updateChatConversationEffort(userId, conversationId, effort)
      } catch {
        // best-effort: UI already reflects the new value
      }
    }
  }, [conversationId, userId])

  const value = useMemo(() => ({
    state,
    sendMessage,
    cancel,
    setEffort,
  }), [state, sendMessage, cancel, setEffort])

  return value
}

function mockModelMap(): Record<string, string> {
  return {
    chat_orchestrator: 'demo/orchestrator',
    chat_planner: 'demo/planner',
    chat_clarifier: 'demo/clarifier',
    chat_legal_researcher: 'demo/legal',
    chat_code_writer: 'demo/code',
    chat_fs_actor: 'demo/fs',
    chat_summarizer: 'demo/summarizer',
    chat_critic: 'demo/critic',
    chat_writer: 'demo/writer',
  }
}

export { isEffortLevel, EFFORT_PRESETS }
