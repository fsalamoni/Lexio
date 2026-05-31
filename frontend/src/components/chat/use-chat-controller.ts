import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch } from 'react'
import type {
  ChatConversationData,
  ChatPendingQuestionData,
  ChatTrailEvent,
  ChatTurnAttachment,
  ChatTurnData,
  ChatTurnStatus,
  ChatEffortLevel,
} from '../../lib/firestore-types'
import {
  appendChatSidecarAuditEntry,
  appendChatTurn,
  createChatApprovalRequest,
  ensureChatConversation,
  getChatConversation,
  listChatTurns,
  persistChatAgentWorkPackage,
  renameChatConversation,
  updateChatApprovalRequest,
  updateChatTurn,
  updateChatConversationEffort,
  updateChatConversationPreview,
} from '../../lib/firestore-service'
import {
  buildGithubSkills,
  buildSidecarSkills,
  buildSuperSkills,
  DEFAULT_EFFORT,
  EFFORT_PRESETS,
  isEffortLevel,
  isMockRuntimeActive,
  mockOrchestratorLLM,
  runChatTurn,
  type SkillContext,
} from '../../lib/chat-orchestrator'
import { runChatTurnV2 } from '../../lib/chat-orchestrator-v2'
import { loadSidecarConnectionConfig, getDefaultSidecarConnectionConfig } from '../../lib/chat-orchestrator/sidecar-config'
import type { PreparedChatInputAttachment } from '../../lib/chat-attachment-ingestion'
import { uploadChatInputAttachmentFile } from '../../lib/chat-input-storage'
import { buildAttachmentContextSources, renderTurnUserContentForHistory } from '../../lib/chat-context-builder'
import {
  analyzeChatMultimodalAttachments,
  resolveChatMultimodalModel,
} from '../../lib/chat-multimodal-analysis'
import {
  appendOrReplaceBundleEvent,
  buildChatDeliverableBundleForTurn,
  buildRetryState,
  findArtifactInWorkPackage,
  findWorkPackageForExportRetry,
  prepareWorkPackageForExportRetry,
  replaceWorkPackageInTrail,
  type ChatExportRetryRequest,
} from '../../lib/chat-deliverable-bundles'
import {
  buildPipelineFallbackResolver,
  CHAT_ORCHESTRATOR_AGENT_DEFS,
  CHAT_ORCHESTRATOR_V2_AGENT_DEFS,
  loadChatOrchestratorModels,
  loadChatOrchestratorV2Models,
  loadFallbackPriorityConfig,
} from '../../lib/model-config'
import { loadMultimodalPolicyRuntimeConfig, type MultimodalPolicyRuntimeConfig } from '../../lib/multimodal-policy'
import { getOpenRouterKey } from '../../lib/generation-service'
import { isEnabled } from '../../lib/feature-flags'
import type { UsageExecutionRecord } from '../../lib/cost-analytics'
import { useAuth } from '../../contexts/AuthContext'
import { IS_FIREBASE } from '../../lib/firebase'
import {
  deriveChatConversationPreviewFromTurns,
  deriveChatConversationTitleFromTurns,
  isArchivedChatConversation,
  isLegacyRecoveredConversation,
  shouldRepairChatConversationFromTurns,
} from '../../lib/chat-conversation-integrity'

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
  | { type: 'RESOLVE_PENDING_TURN'; turnId: string; event: ChatTrailEvent; completedAt: string }
  | { type: 'COMMIT_TURN'; turn: ChatTurnData; status: ChatTurnStatus }
  | { type: 'UPDATE_TURN'; turn: ChatTurnData }
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
const MAX_STREAM_TOTAL_CHARS_FOR_PERSISTENCE = 6000
const MAX_STREAM_DELTA_CHARS_FOR_PERSISTENCE = 600
const MAX_TRAIL_EVENTS_FOR_PERSISTENCE = 180
const STREAM_TRUNCATION_MARKER = '\n…[conteúdo de streaming resumido]…\n'

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
        liveTurn: { ...state.liveTurn, trail: mergeStreamingTrailEvent(state.liveTurn.trail, action.event) },
      }
    case 'RESOLVE_PENDING_TURN': {
      const turns = state.turns.map(turn => {
        if (turn.id !== action.turnId) return turn
        return {
          ...turn,
          trail: mergeStreamingTrailEvent(turn.trail, action.event),
          status: 'done' as ChatTurnStatus,
          pending_question: null,
          completed_at: action.completedAt,
        }
      })
      return {
        ...state,
        turns,
        status: turns.some(turn => turn.status === 'awaiting_user') ? 'awaiting_user' : 'idle',
      }
    }
    case 'COMMIT_TURN':
      return {
        ...state,
        liveTurn: null,
        turns: [...state.turns, { ...action.turn, status: action.status }],
        status: action.status === 'awaiting_user' ? 'awaiting_user' : 'idle',
      }
    case 'UPDATE_TURN':
      return {
        ...state,
        turns: state.turns.map(turn => turn.id === action.turn.id ? action.turn : turn),
        liveTurn: state.liveTurn?.id === action.turn.id ? action.turn : state.liveTurn,
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

type ApprovalDecision = 'approved' | 'rejected' | 'adjust'

async function executeApprovalDecision(args: {
  pendingTurn: ChatTurnData
  pendingQuestion: ChatPendingQuestionData
  decision: ApprovalDecision
  userInput: string
  conversationId: string
  userId: string | null
  effort: ChatEffortLevel
  dispatch: Dispatch<Action>
}): Promise<void> {
  const { pendingTurn, pendingQuestion, decision, userInput, conversationId, userId, effort, dispatch } = args
  const approvalId = pendingQuestion.approval_id ?? `local-${pendingTurn.id ?? Date.now()}`
  const approved = decision === 'approved'
  const completedAt = new Date().toISOString()
  const resolutionEvent: ChatTrailEvent = {
    type: 'approval_resolved',
    approval_id: approvalId,
    approved,
    reason: decision === 'adjust'
      ? 'Usuário solicitou ajustes antes da execução.'
      : approved
        ? 'Usuário aprovou a execução no chat.'
        : 'Usuário rejeitou a execução no chat.',
    ts: completedAt,
  }

  if (IS_FIREBASE && userId && pendingTurn.id) {
    try {
      await updateChatTurn(userId, conversationId, pendingTurn.id, {
        trail: compactChatTrailForPersistence(mergeStreamingTrailEvent(pendingTurn.trail, resolutionEvent)),
        status: 'done',
        pending_question: null,
        completed_at: completedAt,
      })
      if (pendingQuestion.approval_id) {
        await updateChatApprovalRequest(userId, conversationId, pendingQuestion.approval_id, {
          status: decision === 'approved' ? 'approved' : decision === 'adjust' ? 'cancelled' : 'rejected',
          decided_at: completedAt,
          decided_by: userId,
        })
      }
    } catch {
      // best-effort; the in-memory state still resolves the pending question.
    }
  }
  if (pendingTurn.id) {
    dispatch({ type: 'RESOLVE_PENDING_TURN', turnId: pendingTurn.id, event: resolutionEvent, completedAt })
  }

  if (!approved || !pendingQuestion.resume_tool || !pendingQuestion.resume_args) {
    const assistantMarkdown = decision === 'adjust'
      ? 'Tudo bem. A ação pendente foi pausada para ajustes; descreva no próximo envio o que deve mudar antes de executar.'
      : 'Ação cancelada. Nenhum documento, arquivo ou custo adicional foi gerado a partir desta aprovação.'
    await persistResolvedApprovalReply({
      conversationId,
      userId,
      userInput,
      resolutionEvent,
      assistantMarkdown,
      dispatch,
    })
    return
  }

  await runApprovedResumeTool({
    conversationId,
    userId,
    effort,
    userInput,
    pendingQuestion,
    resolutionEvent,
    dispatch,
  })
}

async function persistResolvedApprovalReply(args: {
  conversationId: string
  userId: string | null
  userInput: string
  resolutionEvent: ChatTrailEvent
  assistantMarkdown: string
  dispatch: Dispatch<Action>
}): Promise<void> {
  const { conversationId, userId, userInput, resolutionEvent, assistantMarkdown, dispatch } = args
  const now = new Date().toISOString()
  let turnId = `local-${Date.now()}`
  const turn: ChatTurnData = {
    id: turnId,
    conversation_id: conversationId,
    user_input: userInput,
    trail: [resolutionEvent],
    assistant_markdown: assistantMarkdown,
    status: 'done',
    created_at: now,
    completed_at: now,
  }
  if (IS_FIREBASE && userId) {
    try {
      await ensureChatConversation(userId, conversationId, { title: userInput.slice(0, 80) })
      notifyChatConversationUpserted(conversationId)
      turnId = await appendChatTurn(userId, conversationId, {
        conversation_id: conversationId,
        user_input: userInput,
        trail: [resolutionEvent],
        assistant_markdown: assistantMarkdown,
        status: 'done',
        created_at: now,
        completed_at: now,
      })
      turn.id = turnId
      await updateChatConversationPreview(userId, conversationId, assistantMarkdown)
    } catch {
      // best-effort; local state still records the user's decision.
    }
  }
  dispatch({ type: 'COMMIT_TURN', turn, status: 'done' })
}

/**
 * Build the best-effort audit hook for sidecar/PC actions. Returns undefined in
 * demo mode / when unauthenticated so skills simply skip auditing.
 */
function buildSidecarAuditHook(userId: string | null, conversationId: string): SkillContext['appendAuditEntry'] {
  if (!IS_FIREBASE || !userId) return undefined
  return entry => appendChatSidecarAuditEntry(userId, conversationId, entry).then(() => undefined)
}

export async function resolveApprovalResumeRuntime(args: {
  userId: string | null
  mock: boolean
}): Promise<Pick<SkillContext, 'models' | 'apiKey'>> {
  const { userId, mock } = args
  if (mock) {
    return {
      models: mockModelMap(),
      apiKey: 'demo',
    }
  }

  const useChatV2 = isEnabled('FF_CHAT_ORCHESTRATOR_V2')
  const [models, apiKey] = await Promise.all([
    useChatV2 ? loadChatOrchestratorV2Models(userId ?? undefined) : loadChatOrchestratorModels(userId ?? undefined),
    getOpenRouterKey(userId ?? undefined).catch(() => ''),
  ])

  return { models, apiKey }
}

async function runApprovedResumeTool(args: {
  conversationId: string
  userId: string | null
  effort: ChatEffortLevel
  userInput: string
  pendingQuestion: ChatPendingQuestionData
  resolutionEvent: ChatTrailEvent
  dispatch: Dispatch<Action>
}): Promise<void> {
  const { conversationId, userId, effort, userInput, pendingQuestion, resolutionEvent, dispatch } = args
  const mock = isMockRuntimeActive()
  let turnId = `local-${Date.now()}`
  const startedAt = new Date().toISOString()
  const trailBuffer: ChatTrailEvent[] = [resolutionEvent]
  const liveTurn: ChatTurnData = {
    id: turnId,
    conversation_id: conversationId,
    user_input: userInput,
    trail: trailBuffer.slice(),
    assistant_markdown: null,
    status: 'running',
    created_at: startedAt,
  }

  if (IS_FIREBASE && userId) {
    try {
      await ensureChatConversation(userId, conversationId, { title: userInput.slice(0, 80), effort })
      notifyChatConversationUpserted(conversationId)
      turnId = await appendChatTurn(userId, conversationId, {
        conversation_id: conversationId,
        user_input: userInput,
        trail: compactChatTrailForPersistence(trailBuffer),
        assistant_markdown: null,
        status: 'running',
        created_at: startedAt,
      })
      liveTurn.id = turnId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      trailBuffer.push({
        type: 'error',
        message: `Persistência inicial indisponível; seguindo a aprovação em modo local. Detalhe: ${message}`,
        ts: new Date().toISOString(),
      })
    }
  }

  dispatch({ type: 'BEGIN_SEND', turn: liveTurn })

  const onTrail = (event: ChatTrailEvent) => {
    mergeStreamingTrailEventInPlace(trailBuffer, event)
    dispatch({ type: 'TRAIL_APPEND', event })
  }

  try {
    // Resume covers both pipeline super-skills (e.g. generate_image) and the
    // sidecar PC skills (write_file/run_shell/delete_file/rename_file), whose
    // approval gate pauses the turn the same way.
    const skill = [...buildSuperSkills(), ...buildSidecarSkills(), ...buildGithubSkills()].find(candidate => candidate.name === pendingQuestion.resume_tool)
    if (!skill) {
      throw new Error(`Continuação aprovada não encontrada: ${pendingQuestion.resume_tool}`)
    }
    const { models: resumeModels, apiKey: resumeApiKey } = await resolveApprovalResumeRuntime({ userId, mock })
    const sidecarConfig = mock ? getDefaultSidecarConnectionConfig() : await loadSidecarConnectionConfig(userId ?? undefined)
    const controller = new AbortController()
    const ctx: SkillContext = {
      uid: userId ?? 'demo',
      conversationId,
      turnId,
      userInput,
      effort,
      budget: createApprovalResumeBudget(),
      signal: controller.signal,
      emit: onTrail,
      models: resumeModels,
      apiKey: resumeApiKey,
      mock,
      sidecar: sidecarConfig,
      persistWorkPackage: IS_FIREBASE && userId
        ? workPackage => persistChatAgentWorkPackage(userId, conversationId, workPackage)
        : undefined,
      createApprovalRequest: IS_FIREBASE && userId
        ? data => createChatApprovalRequest(userId, conversationId, data)
        : undefined,
      appendAuditEntry: buildSidecarAuditHook(userId, conversationId),
    }
    const result = await skill.run(pendingQuestion.resume_args ?? {}, ctx)
    const completedAt = new Date().toISOString()
    const completedTurn: ChatTurnData = {
      ...liveTurn,
      id: turnId,
      trail: trailBuffer.slice(),
      assistant_markdown: result.final_answer ?? result.tool_message,
      status: result.awaiting_user ? 'awaiting_user' : 'done',
      pending_question: result.awaiting_user ? {
        text: result.awaiting_user.question,
        options: result.awaiting_user.options,
        approval_id: result.awaiting_user.approval_id,
        resume_tool: result.awaiting_user.resume_tool,
        resume_args: result.awaiting_user.resume_args,
      } : null,
      llm_executions: [],
      completed_at: completedAt,
    }
    if (IS_FIREBASE && userId) {
      try {
        await updateChatTurn(userId, conversationId, turnId, {
          trail: compactChatTrailForPersistence(completedTurn.trail),
          assistant_markdown: completedTurn.assistant_markdown,
          status: completedTurn.status,
          pending_question: completedTurn.pending_question,
          llm_executions: [],
          completed_at: completedAt,
        })
        if (completedTurn.assistant_markdown) {
          await updateChatConversationPreview(userId, conversationId, completedTurn.assistant_markdown)
        }
      } catch {
        // best-effort; the local turn remains visible.
      }
    }
    dispatch({ type: 'COMMIT_TURN', turn: completedTurn, status: completedTurn.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const completedAt = new Date().toISOString()
    const errorEvent: ChatTrailEvent = { type: 'error', message, ts: completedAt }
    trailBuffer.push(errorEvent)
    const failedTurn: ChatTurnData = {
      ...liveTurn,
      id: turnId,
      trail: trailBuffer.slice(),
      assistant_markdown: buildRuntimeFallbackAnswer(userInput, message),
      status: 'done',
      completed_at: completedAt,
    }
    if (IS_FIREBASE && userId) {
      try {
        await updateChatTurn(userId, conversationId, turnId, {
          trail: compactChatTrailForPersistence(failedTurn.trail),
          assistant_markdown: failedTurn.assistant_markdown,
          status: 'done',
          completed_at: completedAt,
        })
      } catch {
        // best-effort
      }
    }
    dispatch({ type: 'COMMIT_TURN', turn: failedTurn, status: 'done' })
  }
}

function findLatestPendingApprovalTurn(turns: ChatTurnData[]): { turn: ChatTurnData; question: ChatPendingQuestionData } | null {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex]
    if (turn.status === 'awaiting_user' && turn.pending_question?.approval_id) {
      return { turn, question: turn.pending_question }
    }
  }
  return null
}

function normalizeApprovalDecision(text: string): ApprovalDecision | null {
  const normalized = text.trim().toLowerCase()
  if (/^(aprovar|aprovado|aprovada|autorizar|autorizo|sim|ok|pode|confirmo)\b/.test(normalized)) return 'approved'
  if (/^(rejeitar|rejeito|negar|nego|cancelar|cancela|não|nao)\b/.test(normalized)) return 'rejected'
  if (/^(ajustar|ajuste|alterar|corrigir|modificar|revisar)\b/.test(normalized)) return 'adjust'
  return null
}

function createApprovalResumeBudget(): SkillContext['budget'] {
  return {
    recordUsage() {},
    used: () => ({ tokens: 0, cost_usd: 0 }),
    usedRatio: () => 0,
    exceeded: () => false,
    hardStop() {},
    isHardStopped: () => ({ stopped: false }),
    records: () => [],
  }
}

interface UseChatControllerArgs {
  conversationId: string | null
}

type ChatSendInput = string | {
  text: string
  attachments?: ChatTurnAttachment[]
  attachmentFiles?: PreparedChatInputAttachment[]
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
        const { items: turns } = await listChatTurns(userId!, conversationId)
        let conv = await getChatConversation(userId!, conversationId)
        if (!conv) {
          if (turns.length === 0) {
            if (cancelled) return
            dispatch({ type: 'LOAD_ERROR', error: 'Conversa não encontrada. Nenhum histórico foi alterado.' })
            return
          }
          conv = await ensureChatConversation(userId!, conversationId, {
            title: deriveChatConversationTitleFromTurns(turns),
            last_preview: deriveChatConversationPreviewFromTurns(turns),
          })
          notifyChatConversationUpserted(conversationId)
        }
        if (isArchivedChatConversation(conv)) {
          if (cancelled) return
          dispatch({ type: 'LOAD_ERROR', error: 'Conversa arquivada. O histórico permanece preservado.' })
          return
        }
        if (shouldRepairChatConversationFromTurns(conv, turns)) {
          const repairedTitle = deriveChatConversationTitleFromTurns(turns)
          const repairedPreview = deriveChatConversationPreviewFromTurns(turns)
          await renameChatConversation(userId!, conversationId, repairedTitle)
          if (repairedPreview) {
            await updateChatConversationPreview(userId!, conversationId, repairedPreview)
          }
          conv = { ...conv, title: repairedTitle, last_preview: repairedPreview || conv.last_preview }
          notifyChatConversationUpserted(conversationId)
        } else if (isLegacyRecoveredConversation(conv)) {
          if (turns.length === 0) {
            if (cancelled) return
            dispatch({ type: 'LOAD_ERROR', error: 'Conversa recuperada vazia ignorada. Nenhum histórico foi alterado.' })
            return
          }
        }
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

  const sendMessage = useCallback(async (input: ChatSendInput) => {
    if (!conversationId) return
    if (!userId && IS_FIREBASE) return
    if (state.status === 'sending') return

    const rawText = typeof input === 'string' ? input : input.text
    let attachments = typeof input === 'string' ? [] : input.attachments ?? []
    const attachmentFiles = typeof input === 'string' ? [] : input.attachmentFiles ?? []
    const trimmed = rawText.trim() || (attachments.length ? 'Analise os anexos enviados.' : '')
    if (!trimmed) return
    let contextSources = buildAttachmentContextSources(attachments)

    const pendingApproval = findLatestPendingApprovalTurn(state.turns)
    const approvalDecision = pendingApproval ? normalizeApprovalDecision(trimmed) : null
    if (pendingApproval && approvalDecision) {
      await executeApprovalDecision({
        pendingTurn: pendingApproval.turn,
        pendingQuestion: pendingApproval.question,
        decision: approvalDecision,
        userInput: trimmed,
        conversationId,
        userId,
        effort: state.effort,
        dispatch,
      })
      return
    }

    const mock = isMockRuntimeActive()

    let turnId = `local-${Date.now()}`
    const startedAt = new Date().toISOString()
    const initialTrail: ChatTrailEvent[] = []
    const liveTurn: ChatTurnData = {
      id: turnId,
      conversation_id: conversationId,
      user_input: trimmed,
      trail: initialTrail,
      assistant_markdown: null,
      status: 'running',
      created_at: startedAt,
      input_attachments: attachments.length ? attachments : undefined,
      context_sources: contextSources.length ? contextSources : undefined,
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
          input_attachments: attachments.length ? attachments : undefined,
          context_sources: contextSources.length ? contextSources : undefined,
          trail: [],
          assistant_markdown: null,
          status: 'running',
          created_at: startedAt,
        })
        liveTurn.id = turnId
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        initialTrail.push({
          type: 'error',
          message: `Persistência inicial indisponível; seguindo em modo local. Detalhe: ${message}`,
          ts: new Date().toISOString(),
        })
      }
    }

    if (attachments.length > 0 && attachmentFiles.length > 0) {
      attachments = await materializeChatInputAttachmentUploads({
        uid: userId ?? 'demo',
        conversationId,
        turnId,
        attachments,
        attachmentFiles,
        events: initialTrail,
      })
      contextSources = buildAttachmentContextSources(attachments)
      liveTurn.input_attachments = attachments.length ? attachments : undefined
      liveTurn.context_sources = contextSources.length ? contextSources : undefined
      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            input_attachments: liveTurn.input_attachments,
            context_sources: liveTurn.context_sources,
            trail: compactChatTrailForPersistence(initialTrail),
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          initialTrail.push({
            type: 'error',
            message: `Anexos processados localmente, mas a atualização remota do turno falhou. Detalhe: ${message}`,
            ts: new Date().toISOString(),
          })
        }
      }
    }

    dispatch({ type: 'BEGIN_SEND', turn: liveTurn })

    abortRef.current = new AbortController()
    const controller = abortRef.current

    // Build models map + API key (mock stays empty for demo).
    let models: Record<string, string> = {}
    let fallbackModels: Record<string, string[]> = {}
    let multimodalRuntimeConfig: MultimodalPolicyRuntimeConfig | undefined
    let apiKey = ''
    let sidecarConfig = getDefaultSidecarConnectionConfig()
    const useChatV2 = isEnabled('FF_CHAT_ORCHESTRATOR_V2')
    try {
      if (mock) {
        models = useChatV2
          ? { cv2_orchestrator: 'demo/orchestrator', cv2_worker: 'demo/worker', cv2_critic: 'demo/critic' }
          : mockModelMap()
        fallbackModels = {}
        apiKey = 'demo'
      } else {
        const [loadedModels, fallbackConfig, loadedMultimodalRuntime, loadedSidecar] = await Promise.all([
          useChatV2 ? loadChatOrchestratorV2Models(userId ?? undefined) : loadChatOrchestratorModels(userId ?? undefined),
          loadFallbackPriorityConfig(userId ?? undefined),
          loadMultimodalPolicyRuntimeConfig(userId ?? undefined),
          loadSidecarConnectionConfig(userId ?? undefined),
        ])
        models = loadedModels
        multimodalRuntimeConfig = loadedMultimodalRuntime
        sidecarConfig = loadedSidecar
        const resolveFallbacks = buildPipelineFallbackResolver(useChatV2 ? CHAT_ORCHESTRATOR_V2_AGENT_DEFS : CHAT_ORCHESTRATOR_AGENT_DEFS, fallbackConfig)
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
        assistant_markdown: buildRuntimeFallbackAnswer(trimmed, `Falha de configuração: ${message}`),
        status: 'done',
        completed_at: completedAt,
      }
      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            trail: failedTurn.trail,
            assistant_markdown: failedTurn.assistant_markdown,
            status: 'done',
            completed_at: completedAt,
          })
        } catch {
          // best-effort; the in-memory turn still shows the failure.
        }
      }
      dispatch({ type: 'COMMIT_TURN', turn: failedTurn, status: 'done' })
      return
    }

    // Throttled persistence — write to Firestore at most every 500ms while
    // events stream in, plus a final flush at completion.
    let pendingPersist = false
    let scheduled: ReturnType<typeof setTimeout> | null = null
    const trailBuffer: ChatTrailEvent[] = initialTrail.slice()
    const flushTrail = async () => {
      if (!IS_FIREBASE || !userId) return
      pendingPersist = false
      try {
        await updateChatTurn(userId, conversationId, turnId, {
          trail: compactChatTrailForPersistence(trailBuffer),
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
      mergeStreamingTrailEventInPlace(trailBuffer, event)
      dispatch({ type: 'TRAIL_APPEND', event })
      schedulePersist()
    }

    const multimodalExecutions: UsageExecutionRecord[] = []
    if (!mock && isEnabled('FF_CHAT_MULTIMODAL_ANALYSIS') && attachments.length > 0 && attachmentFiles.length > 0) {
      try {
        const analysis = await analyzeChatMultimodalAttachments({
          attachments,
          attachmentFiles,
          apiKey,
          userInput: trimmed,
          model: resolveChatMultimodalModel(models),
          audioTranscriptionModel: models.chat_audio_transcription,
          fallbackModels: fallbackModels.chat_multimodal_analysis ?? fallbackModels.chat_legal_researcher ?? fallbackModels.chat_orchestrator ?? [],
          multimodalPolicy: multimodalRuntimeConfig?.policy,
          modelCatalog: multimodalRuntimeConfig?.modelCatalog,
          providerSettings: multimodalRuntimeConfig?.providerSettings,
          signal: controller.signal,
          onTrail,
        })
        if (analysis.changed) {
          attachments = analysis.attachments
          contextSources = buildAttachmentContextSources(attachments)
          liveTurn.input_attachments = attachments.length ? attachments : undefined
          liveTurn.context_sources = contextSources.length ? contextSources : undefined
          dispatch({ type: 'UPDATE_TURN', turn: { ...liveTurn, trail: trailBuffer.slice() } })
          if (IS_FIREBASE && userId) {
            try {
              await updateChatTurn(userId, conversationId, turnId, {
                input_attachments: liveTurn.input_attachments,
                context_sources: liveTurn.context_sources,
                trail: compactChatTrailForPersistence(trailBuffer),
              })
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              onTrail({
                type: 'error',
                message: `Análise multimodal concluída localmente, mas a atualização remota falhou. Detalhe: ${message}`,
                ts: new Date().toISOString(),
              })
            }
          }
        }
        multimodalExecutions.push(...analysis.usageRecords)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (err instanceof DOMException && err.name === 'AbortError') {
          onTrail({ type: 'error', message: 'Análise multimodal cancelada pelo usuário.', ts: new Date().toISOString() })
        } else {
          onTrail({
            type: 'error',
            message: `Análise multimodal dos anexos indisponível; seguindo com o arquivo bruto e o contexto já extraído. Detalhe: ${message}`,
            ts: new Date().toISOString(),
          })
        }
      }
    }

    // Build prior history (concatenate previous turns).
    const history = state.turns.flatMap(turn => [
      { role: 'user' as const, content: renderTurnUserContentForHistory(turn) },
      ...(turn.assistant_markdown ? [{ role: 'assistant' as const, content: turn.assistant_markdown }] : []),
    ])

    try {
      const result = await (useChatV2 ? runChatTurnV2 : runChatTurn)({
        uid: userId ?? 'demo',
        conversationId,
        turnId,
        effort: state.effort,
        history,
        user_input: trimmed,
        attachments,
        contextSources,
        models,
        fallbackModels,
        apiKey,
        sidecar: sidecarConfig,
        signal: controller.signal,
        onTrail,
        onAgentToken: (agentKey: string, delta: string, total: string) => {
          const event: ChatTrailEvent = {
            type: 'agent_token',
            agent_key: agentKey,
            delta,
            total,
            ts: new Date().toISOString(),
          }
          mergeStreamingTrailEventInPlace(trailBuffer, event)
          dispatch({ type: 'TRAIL_APPEND', event })
          schedulePersist()
        },
        llmCall: mock ? mockOrchestratorLLM : undefined,
        mock,
        persistWorkPackage: IS_FIREBASE && userId
          ? workPackage => persistChatAgentWorkPackage(userId, conversationId, workPackage)
          : undefined,
        createApprovalRequest: IS_FIREBASE && userId
          ? data => createChatApprovalRequest(userId, conversationId, data)
          : undefined,
        appendAuditEntry: buildSidecarAuditHook(userId, conversationId),
      })

      if (scheduled) {
        clearTimeout(scheduled)
        scheduled = null
      }

      let completedTurn: ChatTurnData = {
        ...liveTurn,
        id: turnId,
        trail: trailBuffer.slice(),
        assistant_markdown: result.assistant_markdown,
        status: result.status,
        pending_question: result.pending_question ?? null,
        llm_executions: [...multimodalExecutions, ...result.llm_executions],
        completed_at: new Date().toISOString(),
      }
      completedTurn = attachDeliverableBundleToTurn(completedTurn)

      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            trail: compactChatTrailForPersistence(completedTurn.trail),
            deliverable_bundles: completedTurn.deliverable_bundles,
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
          onTrail({
            type: 'error',
            message: `Falha ao salvar o turno no histórico remoto; a entrega foi mantida nesta tela. Detalhe: ${message}`,
            ts: new Date().toISOString(),
          })
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
        assistant_markdown: buildRuntimeFallbackAnswer(trimmed, message),
        status: 'done',
        llm_executions: multimodalExecutions.length ? multimodalExecutions : undefined,
        completed_at: completedAt,
      }
      if (IS_FIREBASE && userId) {
        try {
          await updateChatTurn(userId, conversationId, turnId, {
            status: 'done',
            trail: compactChatTrailForPersistence(failedTurn.trail),
            assistant_markdown: failedTurn.assistant_markdown,
            llm_executions: failedTurn.llm_executions,
            completed_at: failedTurn.completed_at,
          })
        } catch {
          // best-effort
        }
      }
      dispatch({ type: 'COMMIT_TURN', turn: failedTurn, status: 'done' })
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

  const retryExport = useCallback(async (request: ChatExportRetryRequest) => {
    const turn = state.turns.find(candidate => candidate.id === request.turnId)
    if (!turn) return
    const workPackage = findWorkPackageForExportRetry(turn, request)
    if (!workPackage) return
    const artifact = findArtifactInWorkPackage(workPackage, request.artifactId)
    if (!artifact) return

    const retry = buildRetryState({
      artifact,
      format: request.format,
      exportId: request.exportId,
      status: 'running',
    })
    let nextTrail: ChatTrailEvent[] = [
      ...turn.trail,
      { type: 'export_retry_requested', retry, ts: retry.requested_at },
    ]

    const finish = async (updatedTurn: ChatTurnData) => {
      if (IS_FIREBASE && userId && updatedTurn.id) {
        await updateChatTurn(userId, updatedTurn.conversation_id, updatedTurn.id, {
          trail: compactChatTrailForPersistence(updatedTurn.trail),
          deliverable_bundles: updatedTurn.deliverable_bundles,
        })
      }
      dispatch({ type: 'UPDATE_TURN', turn: updatedTurn })
    }

    try {
      const preparedPackage = prepareWorkPackageForExportRetry(workPackage, request)
      const { materializeChatAgentWorkPackageExports } = await import('../../lib/chat-artifact-exporters')
      const materializedPackage = await materializeChatAgentWorkPackageExports(preparedPackage, {
        userId: userId ?? 'demo',
        conversationId: turn.conversation_id,
        turnId: turn.id ?? request.turnId,
      })
      const persistedPackage = IS_FIREBASE && userId
        ? await persistChatAgentWorkPackage(userId, turn.conversation_id, materializedPackage)
        : materializedPackage
      nextTrail = replaceWorkPackageInTrail(nextTrail, persistedPackage)

      const updatedArtifact = findArtifactInWorkPackage(persistedPackage, request.artifactId)
      const exportRef = updatedArtifact?.exports?.find(candidate =>
        (request.exportId && candidate.export_id === request.exportId)
        || (!request.exportId && candidate.format === request.format),
      )
      const retryCompleted = buildRetryState({
        artifact: updatedArtifact ?? artifact,
        format: request.format,
        exportId: request.exportId ?? exportRef?.export_id,
        status: exportRef?.status === 'ready' && exportRef.download_url ? 'ready' : 'failed',
        error: exportRef?.status === 'ready' ? undefined : exportRef?.reason ?? 'O export nao retornou um download pronto.',
      })
      nextTrail = [
        ...nextTrail,
        {
          type: 'export_retry_completed',
          retry: { ...retryCompleted, retry_id: retry.retry_id, requested_at: retry.requested_at },
          export_ref: exportRef,
          ts: retryCompleted.completed_at ?? new Date().toISOString(),
        },
      ]
      await finish(attachDeliverableBundleToTurn({ ...turn, trail: nextTrail }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedRetry = buildRetryState({
        artifact,
        format: request.format,
        exportId: request.exportId,
        status: 'failed',
        error: message,
      })
      nextTrail = [
        ...nextTrail,
        {
          type: 'export_retry_completed',
          retry: { ...failedRetry, retry_id: retry.retry_id, requested_at: retry.requested_at },
          ts: failedRetry.completed_at ?? new Date().toISOString(),
        },
      ]
      await finish(attachDeliverableBundleToTurn({ ...turn, trail: nextTrail }))
    }
  }, [state.turns, userId])

  const value = useMemo(() => ({
    state,
    sendMessage,
    retryExport,
    cancel,
    setEffort,
  }), [state, sendMessage, retryExport, cancel, setEffort])

  return value
}

async function materializeChatInputAttachmentUploads(args: {
  uid: string
  conversationId: string
  turnId: string
  attachments: ChatTurnAttachment[]
  attachmentFiles: PreparedChatInputAttachment[]
  events: ChatTrailEvent[]
}): Promise<ChatTurnAttachment[]> {
  const candidatesById = new Map(args.attachmentFiles.map(candidate => [candidate.attachment.attachment_id, candidate]))
  const uploaded: ChatTurnAttachment[] = []

  for (const attachment of args.attachments) {
    const candidate = candidatesById.get(attachment.attachment_id)
    if (!candidate) {
      uploaded.push({ ...attachment, upload_status: attachment.upload_status ?? 'skipped' })
      continue
    }

    args.events.push({
      type: 'attachment_upload_started',
      attachment_id: attachment.attachment_id,
      filename: attachment.filename,
      size_bytes: attachment.size_bytes,
      ts: new Date().toISOString(),
    })

    try {
      const stored = await uploadChatInputAttachmentFile({
        userId: args.uid,
        conversationId: args.conversationId,
        turnId: args.turnId,
        attachmentId: attachment.attachment_id,
        filename: attachment.filename,
        file: candidate.file,
      })
      const next: ChatTurnAttachment = {
        ...attachment,
        upload_status: stored.status,
        storage_path: stored.path,
        download_url: stored.url || attachment.download_url,
      }
      uploaded.push(next)
      args.events.push({
        type: 'attachment_processed',
        attachment: next,
        ts: new Date().toISOString(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const next: ChatTurnAttachment = {
        ...attachment,
        upload_status: 'failed',
        upload_error: message,
        extraction: {
          ...attachment.extraction,
          error: [attachment.extraction.error, `Upload bruto: ${message}`].filter(Boolean).join(' | ') || undefined,
        },
      }
      uploaded.push(next)
      args.events.push({
        type: 'attachment_failed',
        attachment_id: attachment.attachment_id,
        filename: attachment.filename,
        message,
        ts: new Date().toISOString(),
      })
    }
  }

  return uploaded
}

function attachDeliverableBundleToTurn(turn: ChatTurnData): ChatTurnData {
  const bundle = buildChatDeliverableBundleForTurn(turn)
  if (!bundle) return { ...turn, deliverable_bundles: undefined }
  const trail = appendOrReplaceBundleEvent(turn.trail, bundle)
  return {
    ...turn,
    trail,
    deliverable_bundles: [bundle],
  }
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
    chat_argument_builder: 'demo/argument-builder',
    chat_ethics_auditor: 'demo/ethics-auditor',
    chat_artifact_architect: 'demo/artifact-architect',
    chat_document_composer: 'demo/document-composer',
    chat_data_builder: 'demo/data-builder',
    chat_media_director: 'demo/media-director',
    chat_image_generator: 'demo/image-generator',
    chat_multimodal_analysis: 'demo/multimodal-analysis',
    chat_image_evidence_specialist: 'demo/image-evidence-specialist',
    chat_audio_evidence_specialist: 'demo/audio-evidence-specialist',
    chat_video_evidence_specialist: 'demo/video-evidence-specialist',
    chat_multimodal_evidence_synthesizer: 'demo/multimodal-evidence-synthesizer',
    chat_audio_transcription: 'demo/audio-transcription',
    chat_export_packager: 'demo/export-packager',
    chat_audio_generator: 'demo/audio-generator',
    chat_presentation_designer: 'demo/presentation-designer',
    chat_video_generator: 'demo/video-generator',
  }
}

export function mergeStreamingTrailEvent(trail: ChatTrailEvent[], event: ChatTrailEvent): ChatTrailEvent[] {
  const next = trail.slice()
  mergeStreamingTrailEventInPlace(next, event)
  return next
}

function mergeStreamingTrailEventInPlace(trail: ChatTrailEvent[], event: ChatTrailEvent): void {
  const last = trail[trail.length - 1]
  if (last?.type === 'orchestrator_thought' && event.type === 'orchestrator_thought') {
    trail[trail.length - 1] = event
    return
  }
  if (
    last?.type === 'agent_token'
    && event.type === 'agent_token'
    && last.agent_key === event.agent_key
  ) {
    trail[trail.length - 1] = event
    return
  }
  trail.push(event)
}

export function compactChatTrailForPersistence(trail: ChatTrailEvent[]): ChatTrailEvent[] {
  const compacted = trail.map(compactStreamingEvent)
  if (compacted.length <= MAX_TRAIL_EVENTS_FOR_PERSISTENCE) return compacted

  const head = compacted.slice(0, 40)
  const tail = compacted.slice(-(MAX_TRAIL_EVENTS_FOR_PERSISTENCE - head.length - 1))
  return [
    ...head,
    {
      type: 'error',
      message: `${compacted.length - head.length - tail.length} eventos intermediários foram resumidos para manter o histórico leve.`,
      ts: new Date().toISOString(),
    },
    ...tail,
  ]
}

function compactStreamingEvent(event: ChatTrailEvent): ChatTrailEvent {
  if (event.type === 'orchestrator_thought' || event.type === 'agent_token') {
    return {
      ...event,
      delta: truncateMiddle(event.delta, MAX_STREAM_DELTA_CHARS_FOR_PERSISTENCE),
      total: truncateMiddle(event.total, MAX_STREAM_TOTAL_CHARS_FOR_PERSISTENCE),
    }
  }
  return event
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const keep = Math.max(0, Math.floor((maxChars - STREAM_TRUNCATION_MARKER.length) / 2))
  return `${value.slice(0, keep)}${STREAM_TRUNCATION_MARKER}${value.slice(-keep)}`
}

function buildRuntimeFallbackAnswer(userInput: string, detail: string): string {
  return [
    'Consegui preservar este turno e manter o orquestrador disponível, mas uma falha técnica interrompeu a execução multiagente completa.',
    '',
    '## Pedido recebido',
    userInput,
    '',
    '## Entrega segura',
    'O pedido ficou registrado nesta conversa. Reenvie a solicitação ou peça para continuar a partir daqui; o orquestrador retomará com outra estratégia em vez de travar.',
    '',
    `**Detalhe técnico:** ${detail}`,
  ].join('\n')
}

export { isEffortLevel, EFFORT_PRESETS }
