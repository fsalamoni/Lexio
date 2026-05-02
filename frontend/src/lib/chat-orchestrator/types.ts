/**
 * Internal types for the Chat Orchestrator runtime.
 *
 * The runtime is plain TypeScript — no React imports allowed. The UI layer
 * lives in `components/chat/` and consumes events through the `onTrail`
 * callback exposed by `runChatTurn`.
 */

import type {
  ChatEffortLevel,
  ChatTrailEvent,
  ChatTurnStatus,
} from '../firestore-types'
import type { UsageExecutionRecord } from '../cost-analytics'

/** Re-export for consumers so they only need a single import path. */
export type { ChatEffortLevel, ChatTrailEvent, ChatTurnStatus }

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
  effort: ChatEffortLevel
  budget: BudgetTracker
  signal: AbortSignal
  emit: (event: ChatTrailEvent) => void
  models: Record<string, string>
  apiKey: string
  /** Mock runtime active (demo mode / no Firebase). */
  mock: boolean
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
  awaiting_user?: { question: string; options?: string[] }
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
  apiKey: string
  signal: AbortSignal
  onTrail: (event: ChatTrailEvent) => void
  /** Override the runtime — used for tests and demo mode. */
  llmCall?: OrchestratorLLMCall
  /** Force mock runtime regardless of environment. */
  mock?: boolean
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
  apiKey: string
  signal: AbortSignal
  budget: BudgetTracker
  perCallTokenCap: number
  agentLabel?: string
}) => Promise<{ raw: string; usage: UsageExecutionRecord | null }>

export interface RunChatTurnOutput {
  status: ChatTurnStatus
  assistant_markdown: string | null
  pending_question?: { text: string; options?: string[] } | null
  llm_executions: UsageExecutionRecord[]
}
