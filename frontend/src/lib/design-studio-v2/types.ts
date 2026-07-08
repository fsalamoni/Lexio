/**
 * Design Studio v2 — engine types.
 *
 * The studio is a conversational, project-oriented builder: the user chats with
 * an orchestrator that reasons about the request, then either builds directly,
 * proposes a plan, or asks clarifying questions (per-command mode). Work is
 * materialised into a virtual project (a map of files) that is rendered in a
 * live preview and applied to a connected repository (local workspace or
 * GitHub).
 *
 * Persisted shapes live in `firestore-types.ts`; this module adds the runtime
 * types (project, turn results, orchestrator I/O) used only by the engine and
 * the page.
 */

import type {
  ChatAgentMode,
  DesignStudioFile,
  DesignStudioFileChange,
  DesignStudioMessageData,
  DesignStudioPlan,
  DesignStudioRepoRef,
} from '../firestore-types'
import type { UsageExecutionRecord } from '../cost-analytics'

export type {
  ChatAgentMode as DesignStudioMode,
  DesignStudioFile,
  DesignStudioFileChange,
  DesignStudioMessageData,
  DesignStudioPlan,
  DesignStudioRepoRef,
}

/** The in-memory project: a virtual filesystem plus the preview entry point. */
export interface DesignStudioProject {
  /** Files keyed by normalised relative path. */
  files: Record<string, DesignStudioFile>
  /** Relative path of the file used as the live-preview entry point (web). */
  previewEntry?: string
}

/** A single file operation the engine can apply to a project. */
export interface DesignStudioFileOp {
  path: string
  op: 'write' | 'delete'
  content?: string
  binary?: boolean
  summary?: string
}

/** An image asset the orchestrator requested for the project. */
export interface DesignStudioAssetRequest {
  path: string
  prompt: string
  aspectRatio?: string
}

/** A request to delegate deeper work on specific files to a specialist agent. */
export interface DesignStudioDelegation {
  agent: 'ds2_frontend_engineer' | 'ds2_backend_engineer' | 'ds2_designer'
  task: string
  files?: string[]
}

/**
 * The structured response the orchestrator LLM must return (as JSON). Parsed
 * defensively by {@link parseOrchestratorResponse}.
 */
export interface DesignStudioOrchestratorResponse {
  intent: 'build' | 'plan' | 'ask' | 'chat'
  thinking?: string
  message: string
  questions?: string[]
  plan?: Pick<DesignStudioPlan, 'summary' | 'steps'>
  files?: DesignStudioFileOp[]
  previewEntry?: string
  commands?: string[]
  assets?: DesignStudioAssetRequest[]
  delegate?: DesignStudioDelegation[]
  /** When true (build mode), run the reviewer quality pass. */
  review?: boolean
  /** A short, friendly title for the session (first turn only). */
  sessionTitle?: string
}

/** The runtime configuration a turn needs to talk to the LLM. */
export interface DesignStudioRuntime {
  apiKey: string
  /** Per-agent model map (design_studio_v2_models). */
  models: Record<string, string>
  /** Resolve fallback candidates for an agent key + primary model. */
  resolveFallback: (agentKey: string, primaryModel: string) => string[]
  uid?: string
  /** Session id used to attribute usage executions in the cost breakdown. */
  sessionId?: string
}

/** Progress events emitted by the engine so the UI can show live status. */
export type DesignStudioProgressEvent =
  | { type: 'phase'; agent: string; label: string; status: 'start' | 'done' | 'error'; detail?: string }
  | { type: 'thinking'; text: string }
  | { type: 'message_delta'; delta: string; total: string }

/** Inputs to a single studio turn. */
export interface DesignStudioTurnInput {
  userMessage: string
  mode: ChatAgentMode
  project: DesignStudioProject
  repo?: DesignStudioRepoRef
  /** Prior conversation (already trimmed to a window by the caller). */
  history: DesignStudioMessageData[]
  runtime: DesignStudioRuntime
  signal?: AbortSignal
  onEvent?: (event: DesignStudioProgressEvent) => void
  /** Best-effort generator for image assets; omitted disables asset generation. */
  generateAsset?: (request: DesignStudioAssetRequest, signal?: AbortSignal) => Promise<{ dataUrl: string; execution: UsageExecutionRecord } | null>
}

/** The result of a single studio turn. */
export interface DesignStudioTurnResult {
  assistantMessage: DesignStudioMessageData
  project: DesignStudioProject
  executions: UsageExecutionRecord[]
  /** True when the preview should be rebuilt. */
  previewChanged: boolean
  sessionTitle?: string
}
