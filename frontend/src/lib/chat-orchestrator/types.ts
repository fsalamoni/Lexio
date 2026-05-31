/**
 * Internal types for the Chat Orchestrator runtime.
 *
 * The runtime is plain TypeScript — no React imports allowed. The UI layer
 * lives in `components/chat/` and consumes events through the `onTrail`
 * callback exposed by `runChatTurn`.
 */

import type {
  ChatEffortLevel,
  ChatAgentWorkPackage,
  ChatApprovalRequestData,
  ChatContextSourceRef,
  ChatPendingQuestionData,
  ChatSidecarApprovalPolicy,
  ChatSidecarAuditEntryData,
  ChatTrailEvent,
  ChatTurnAttachment,
  ChatTurnStatus,
} from '../firestore-types'

/** Resolved sidecar (PC) connection used by filesystem/shell skills. */
export interface SidecarRuntimeConfig {
  token: string
  host: string
  port: number
  enabled: boolean
  approval_policy?: ChatSidecarApprovalPolicy
}

/** Audit entry hook payload — everything except the keys the repository fills. */
export type ChatSidecarAuditEntryInput = Omit<
  ChatSidecarAuditEntryData,
  'id' | 'conversation_id' | 'created_at'
> & { created_at?: string }
import type { UsageExecutionRecord, UsageFunctionKey } from '../cost-analytics'

/** Re-export for consumers so they only need a single import path. */
export type { ChatEffortLevel, ChatTrailEvent, ChatTurnStatus }

/**
 * Orchestration profile — lets a single engine power multiple chat pipelines
 * (v1 full-roster vs v2 lean group) without forking the runtime. The default
 * profile preserves the original v1 behavior; the v2 runtime supplies its own
 * via `RunChatTurnInput.profile`.
 */
export interface ChatOrchestratorProfile {
  /** Identifier used in trail/debug. */
  id: 'v1' | 'v2'
  /** Model key (in `models`) used for the lead orchestrator LLM. */
  orchestratorAgentKey: string
  /** Human label for the lead, used in cost/trail. */
  orchestratorLabel: string
  /** Model key used by the forced-finalization writer. */
  finalForceAgentKey: string
  /** Model key used by the critic / quality gate. */
  criticAgentKey: string
  /** Cost source_type / function_key all usage records are tagged with. */
  functionKey: UsageFunctionKey
  /** Cost function label. */
  functionLabel: string
  /** Agent keys the orchestrator may invoke through `call_agent`. */
  callableAgentKeys: ReadonlySet<string>
  /** Descriptions of callable agents rendered into the system prompt. */
  listCallableAgents: () => Array<{ key: string; label: string; description: string }>
  /** Builds the skill set available this turn (already filtered by user config). */
  buildSkills: () => Skill[]
}

/**
 * One message inside the orchestrator's working history. Mirrors the OpenAI
 * chat-completion message shape but stays local to this module so we can
 * extend it without touching `llm-client.ts`.
 *
 * `tool_summary` is set on synthetic "user" messages we inject after a tool
 * runs — they describe the tool's outcome to the orchestrator on the next
 * iteration.
 */
export interface OrchestratorMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** Marks a synthetic message produced by a skill execution (not a real user input). */
  tool_summary?: boolean
  /** Tag carried forward into trail events; helps debugging. */
  tag?: string
}

/**
 * A skill the orchestrator can invoke. Skills are registered in
 * `skill-registry.ts`. Each skill gets a name (matching the JSON tool the
 * orchestrator emits), a short description used in the system prompt, an
 * optional argument schema rendered into the prompt, and a `run` callback
 * that performs the actual work.
 */
export interface Skill<Args = Record<string, unknown>, Output = unknown> {
  name: string
  description: string
  /**
   * JSON-schema-like description of the args. Rendered as bullet points in
   * the orchestrator's system prompt; the orchestrator does not enforce the
   * schema at runtime — the skill's `run` function is responsible for
   * validating its own arguments.
   */
  argsHint?: Record<string, string>
  run: (args: Args, ctx: SkillContext) => Promise<SkillResult<Output>>
}

/** Argument bag passed to every skill. */
export interface SkillContext {
  uid: string
  conversationId: string
  turnId: string
  userInput: string
  effort: ChatEffortLevel
  budget: BudgetTracker
  signal: AbortSignal
  emit: (event: ChatTrailEvent) => void
  models: Record<string, string>
  /** Per-agent fallback chain resolved from the user's fallback-priority settings. */
  fallbackModels?: Record<string, string[]>
  apiKey: string
  /** Mock runtime active (demo mode / no Firebase). */
  mock: boolean
  /**
   * Active orchestration profile. Optional on the type so existing test
   * fixtures that build a bare `SkillContext` keep compiling; recording sites
   * fall back to the v1 defaults when absent.
   */
  profile?: ChatOrchestratorProfile
  /**
   * Resolved sidecar (PC) connection used by filesystem/shell skills. When
   * absent, those skills fall back to demo mode. Loaded once per turn.
   */
  sidecar?: SidecarRuntimeConfig
  /** Streaming callback: fires for each token delta produced by any specialist agent. */
  onAgentToken?: (agentKey: string, delta: string, total: string) => void
  /** Optional durable persistence hook; awaited before the runtime advances to the next iteration. */
  persistWorkPackage?: (workPackage: ChatAgentWorkPackage) => Promise<ChatAgentWorkPackage>
  /** Optional approval persistence hook for costly or side-effectful actions. */
  createApprovalRequest?: (
    data: Omit<ChatApprovalRequestData, 'id' | 'conversation_id' | 'created_at' | 'updated_at' | 'status'> & { status?: ChatApprovalRequestData['status'] }
  ) => Promise<string>
  /**
   * Optional audit hook — sidecar/PC skills append one entry per proposed,
   * executed or failed filesystem/shell/git action. Best-effort: failures must
   * never block the action itself.
   */
  appendAuditEntry?: (entry: ChatSidecarAuditEntryInput) => Promise<void>
}

/**
 * Result returned by a skill's `run`. Drives the orchestrator's next step.
 *
 * - `tool_message`: required text appended to the orchestrator's history as
 *   a synthetic "user" message describing what the skill did.
 * - `trail`: optional extra trail events emitted in addition to the
 *   automatically generated `agent_call`/`agent_response` events.
 * - `final_answer`: when set, the orchestrator stops the loop and uses the
 *   string as the assistant's final markdown.
 * - `awaiting_user`: when set, the turn is paused, persisted with
 *   `status='awaiting_user'`, and surfaced through the UI for the user to
 *   answer.
 */
export interface SkillResult<Output = unknown> {
  tool_message: string
  trail?: ChatTrailEvent[]
  final_answer?: string
  awaiting_user?: {
    question: string
    options?: string[]
    approval_id?: string
    resume_tool?: string
    resume_args?: Record<string, unknown>
  }
  output?: Output
}

/** Effort knob → numerical caps. */
export interface EffortPreset {
  maxIterations: number
  maxFanOut: number
  maxTokens: number
  perCallTokenCap: number
  /** Run the critic every N iterations (≥ maxIterations to disable). */
  criticInterval: number
  /** Compress history when used / max ≥ this threshold. */
  summarizeAt: number
  /** Optional hard USD ceiling per turn (enforced when FF_CHAT_ENGINE_PLUS is on). */
  maxCostUsd?: number
  /** Critic acceptance score (0-100). Used when FF_CHAT_ENGINE_PLUS is on; defaults to 75. */
  criticThreshold?: number
}

/** Budget tracker — stops the loop when limits are exceeded. */
export interface BudgetTracker {
  recordUsage(record: Partial<UsageExecutionRecord> & { total_tokens?: number; cost_usd?: number }): void
  used(): { tokens: number; cost_usd: number }
  usedRatio(): number
  exceeded(): boolean
  hardStop(reason: string): void
  isHardStopped(): { stopped: boolean; reason?: string }
  records(): UsageExecutionRecord[]
}

/**
 * Parsed orchestrator decision — the JSON the orchestrator LLM is asked to
 * emit. Validation lives in `tools-adapter.ts`.
 */
export interface OrchestratorDecision {
  tool: string
  args: Record<string, unknown>
  rationale?: string
}

/** Public entry point arguments. */
export interface RunChatTurnInput {
  uid: string
  conversationId: string
  turnId: string
  effort: ChatEffortLevel
  history: Array<Pick<OrchestratorMessage, 'role' | 'content'>>
  user_input: string
  models: Record<string, string>
  fallbackModels?: Record<string, string[]>
  apiKey: string
  signal: AbortSignal
  onTrail: (event: ChatTrailEvent) => void
  /** Override the runtime — used for tests and demo mode. */
  llmCall?: OrchestratorLLMCall
  /** Force mock runtime regardless of environment. */
  mock?: boolean
  /** Files and rich context blocks attached to this user turn. */
  attachments?: ChatTurnAttachment[]
  /** Resolved context sources that should be visible to the orchestrator. */
  contextSources?: ChatContextSourceRef[]
  /** Explicit release gate: the turn must create downloadable artifacts before finalizing. */
  requireDeliverableBundle?: boolean
  /** Streaming callback: fires for each token delta produced by any specialist agent. */
  onAgentToken?: (agentKey: string, delta: string, total: string) => void
  /** Optional durable persistence hook; awaited before the runtime advances to the next iteration. */
  persistWorkPackage?: (workPackage: ChatAgentWorkPackage) => Promise<ChatAgentWorkPackage>
  /** Optional approval persistence hook for costly or side-effectful actions. */
  createApprovalRequest?: SkillContext['createApprovalRequest']
  /** Optional audit hook for sidecar/PC actions. */
  appendAuditEntry?: SkillContext['appendAuditEntry']
  /** Orchestration profile (defaults to v1 when omitted). Set by `runChatTurnV2`. */
  profile?: ChatOrchestratorProfile
  /** Resolved sidecar (PC) connection for filesystem/shell skills. */
  sidecar?: SidecarRuntimeConfig
}

/**
 * Function signature exposed by `orchestrator-llm.ts`. Tests inject a fake
 * implementation through `RunChatTurnInput.llmCall` to drive deterministic
 * sequences without hitting the network.
 */
export type OrchestratorLLMCall = (params: {
  systemPrompt: string
  history: OrchestratorMessage[]
  modelKey: string
  models: Record<string, string>
  fallbackModels?: Record<string, string[]>
  apiKey: string
  signal: AbortSignal
  budget: BudgetTracker
  perCallTokenCap: number
  agentLabel?: string
  /** Cost source_type / function_key for the usage record (defaults to chat_orchestrator). */
  functionKey?: UsageFunctionKey
  /** Cost function label for the usage record. */
  functionLabel?: string
  /** Streaming callback: invoked token-by-token as the LLM generates the decision. */
  onToken?: (delta: string, total: string) => void
}) => Promise<{ raw: string; usage: UsageExecutionRecord | null }>

export interface RunChatTurnOutput {
  status: ChatTurnStatus
  assistant_markdown: string | null
  pending_question?: ChatPendingQuestionData | null
  llm_executions: UsageExecutionRecord[]
  elapsed_ms?: number
}
