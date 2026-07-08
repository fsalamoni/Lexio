/**
 * Design Studio v2 — the turn engine.
 *
 * `runStudioTurn` drives one exchange: it asks the orchestrator LLM to reason
 * about the request under the current mode (auto / plan / ask), applies any
 * file operations to the virtual project, optionally delegates deeper work to
 * specialist engineers, generates image assets and runs a reviewer quality
 * pass. Every LLM call is recorded as a `design_studio_v2` usage execution for
 * the cost breakdown. All optional phases are wrapped so a specialist failure
 * never dead-ends the main result.
 */

import { callLLMWithMessagesFallback, type ChatMessage, type LLMResult } from '../llm-client'
import { createUsageExecutionRecord, type UsageExecutionRecord } from '../cost-analytics'
import type {
  DesignStudioDelegation,
  DesignStudioFileChange,
  DesignStudioMessageData,
  DesignStudioProject,
  DesignStudioTurnInput,
  DesignStudioTurnResult,
} from './types'
import { applyFileOps } from './project'
import { extractFileOps, parseOrchestratorResponse } from './parser'
import {
  buildOrchestratorSystemPrompt,
  buildReviewerSystemPrompt,
  buildSpecialistSystemPrompt,
} from './prompts'

const ORCHESTRATOR_MAX_TOKENS = 8_000
const SPECIALIST_MAX_TOKENS = 8_000
const REVIEWER_MAX_TOKENS = 6_000
const MAX_DELEGATIONS = 3
const MAX_ASSETS = 4
const HISTORY_WINDOW = 12

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Build a usage execution record from an LLM result for a DS v2 agent phase. */
function executionFromResult(
  agentKey: string,
  agentLabel: string,
  result: LLMResult,
  sessionId: string | undefined,
): UsageExecutionRecord {
  return createUsageExecutionRecord({
    source_type: 'design_studio_v2',
    source_id: sessionId || 'design-studio-v2',
    phase: agentKey,
    agent_name: agentLabel,
    model: result.model,
    provider_id: result.provider_id ?? result.operational?.providerId ?? null,
    provider_label: result.provider_label ?? result.operational?.providerLabel ?? null,
    requested_model: result.operational?.requestedModel ?? null,
    resolved_model: result.operational?.resolvedModel ?? result.model,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    cost_usd: result.cost_usd,
    duration_ms: result.duration_ms,
    used_fallback: result.operational?.fallbackUsed ?? null,
    fallback_from: result.operational?.fallbackFrom ?? null,
    retry_count: result.operational?.totalRetryCount ?? null,
  })
}

/** Convert the (already-windowed) history into chat messages, dropping file bytes. */
function historyToMessages(history: DesignStudioMessageData[]): ChatMessage[] {
  return history.slice(-HISTORY_WINDOW).map((message) => {
    if (message.role === 'user') {
      return { role: 'user' as const, content: message.content }
    }
    // Assistant: send the human-facing message plus a compact note of changes,
    // never the raw file blocks (those live in the project state we pass in).
    const changeNote = message.file_changes?.length
      ? `\n[alterou ${message.file_changes.length} arquivo(s): ${message.file_changes.map((c) => `${c.op} ${c.path}`).slice(0, 12).join(', ')}]`
      : ''
    return { role: 'assistant' as const, content: `${message.content}${changeNote}` }
  })
}

function mapChanges(changes: Array<{ path: string; op: 'create' | 'update' | 'delete'; summary?: string }>): DesignStudioFileChange[] {
  return changes.map((change) => ({ path: change.path, op: change.op, summary: change.summary }))
}

async function runSpecialist(
  delegation: DesignStudioDelegation,
  project: DesignStudioProject,
  input: DesignStudioTurnInput,
): Promise<{ project: DesignStudioProject; changes: DesignStudioFileChange[]; execution?: UsageExecutionRecord; warnings: string[] }> {
  const { runtime, signal, onEvent } = input
  const model = runtime.models[delegation.agent]
  if (!model) return { project, changes: [], warnings: [] }

  const label = delegation.agent === 'ds2_frontend_engineer'
    ? 'Engenheiro Front-end'
    : delegation.agent === 'ds2_backend_engineer'
      ? 'Engenheiro Back-end'
      : 'Diretor de Design'

  onEvent?.({ type: 'phase', agent: delegation.agent, label, status: 'start' })
  try {
    const system = buildSpecialistSystemPrompt({
      agent: delegation.agent,
      task: delegation.task,
      targetFiles: delegation.files,
      project,
    })
    const result = await callLLMWithMessagesFallback(
      runtime.apiKey,
      [{ role: 'system', content: system }, { role: 'user', content: delegation.task }],
      model,
      runtime.resolveFallback(delegation.agent, model),
      SPECIALIST_MAX_TOKENS,
      0.4,
      { signal },
    )
    const ops = extractFileOps(result.content)
    const applied = applyFileOps(project, ops)
    onEvent?.({ type: 'phase', agent: delegation.agent, label, status: 'done', detail: `${applied.changes.length} arquivo(s)` })
    return {
      project: applied.project,
      changes: mapChanges(applied.changes),
      execution: executionFromResult(delegation.agent, `Design Studio v2: ${label}`, result, runtime.sessionId),
      warnings: applied.warnings,
    }
  } catch (error) {
    onEvent?.({ type: 'phase', agent: delegation.agent, label, status: 'error', detail: error instanceof Error ? error.message : String(error) })
    return { project, changes: [], warnings: [] }
  }
}

async function runReviewer(
  project: DesignStudioProject,
  input: DesignStudioTurnInput,
): Promise<{ project: DesignStudioProject; changes: DesignStudioFileChange[]; execution?: UsageExecutionRecord; note?: string; warnings: string[] }> {
  const { runtime, signal, onEvent } = input
  const model = runtime.models.ds2_reviewer
  if (!model) return { project, changes: [], warnings: [] }

  onEvent?.({ type: 'phase', agent: 'ds2_reviewer', label: 'Revisor', status: 'start' })
  try {
    const system = buildReviewerSystemPrompt(project)
    const result = await callLLMWithMessagesFallback(
      runtime.apiKey,
      [
        { role: 'system', content: system },
        { role: 'user', content: 'Revise o projeto atual e corrija problemas objetivos de qualidade, acessibilidade e correção. Reescreva inteiros apenas os arquivos que precisarem de ajuste.' },
      ],
      model,
      runtime.resolveFallback('ds2_reviewer', model),
      REVIEWER_MAX_TOKENS,
      0.3,
      { signal },
    )
    const ops = extractFileOps(result.content)
    const applied = applyFileOps(project, ops)
    onEvent?.({ type: 'phase', agent: 'ds2_reviewer', label: 'Revisor', status: 'done', detail: `${applied.changes.length} ajuste(s)` })
    const parsed = parseOrchestratorResponse(result.content)
    return {
      project: applied.project,
      changes: mapChanges(applied.changes),
      execution: executionFromResult('ds2_reviewer', 'Design Studio v2: Revisor', result, runtime.sessionId),
      note: parsed.message,
      warnings: applied.warnings,
    }
  } catch (error) {
    onEvent?.({ type: 'phase', agent: 'ds2_reviewer', label: 'Revisor', status: 'error', detail: error instanceof Error ? error.message : String(error) })
    return { project, changes: [], warnings: [] }
  }
}

/** Run a single Design Studio v2 turn end to end. */
export async function runStudioTurn(input: DesignStudioTurnInput): Promise<DesignStudioTurnResult> {
  const { runtime, signal, onEvent } = input
  const executions: UsageExecutionRecord[] = []
  const warnings: string[] = []

  const orchestratorModel = runtime.models.ds2_orchestrator
  if (!orchestratorModel) {
    throw new Error('Configure um modelo para o Orquestrador do Design Studio v2 em Configurações → Design Studio v2.')
  }

  // ── Phase 1: Orchestrator ──────────────────────────────────────────────────
  onEvent?.({ type: 'phase', agent: 'ds2_orchestrator', label: 'Orquestrador', status: 'start' })
  const system = buildOrchestratorSystemPrompt({ mode: input.mode, repo: input.repo, project: input.project })
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...historyToMessages(input.history),
    { role: 'user', content: input.userMessage },
  ]

  let orchestratorResult: LLMResult
  try {
    orchestratorResult = await callLLMWithMessagesFallback(
      runtime.apiKey,
      messages,
      orchestratorModel,
      runtime.resolveFallback('ds2_orchestrator', orchestratorModel),
      ORCHESTRATOR_MAX_TOKENS,
      0.4,
      {
        signal,
        onToken: onEvent ? (_delta, total) => onEvent({ type: 'message_delta', delta: _delta, total }) : undefined,
      },
    )
  } catch (error) {
    onEvent?.({ type: 'phase', agent: 'ds2_orchestrator', label: 'Orquestrador', status: 'error', detail: error instanceof Error ? error.message : String(error) })
    throw error
  }
  executions.push(executionFromResult('ds2_orchestrator', 'Design Studio v2: Orquestrador', orchestratorResult, runtime.sessionId))

  const parsed = parseOrchestratorResponse(orchestratorResult.content)
  if (parsed.thinking) onEvent?.({ type: 'thinking', text: parsed.thinking })
  onEvent?.({ type: 'phase', agent: 'ds2_orchestrator', label: 'Orquestrador', status: 'done', detail: parsed.intent })

  // ── Phase 2: Apply orchestrator file operations ─────────────────────────────
  let project = input.project
  const allChanges: DesignStudioFileChange[] = []
  if (parsed.files?.length) {
    const applied = applyFileOps(project, parsed.files)
    project = applied.project
    allChanges.push(...mapChanges(applied.changes))
    warnings.push(...applied.warnings)
  }
  if (parsed.previewEntry) {
    const { normalizeProjectPath, guessPreviewEntry } = await import('./project')
    const entry = normalizeProjectPath(parsed.previewEntry)
    project = { ...project, previewEntry: project.files[entry] ? entry : guessPreviewEntry(project) }
  }

  const isBuild = parsed.intent === 'build'

  // ── Phase 3: Delegations to specialists (build only) ────────────────────────
  if (isBuild && parsed.delegate?.length) {
    for (const delegation of parsed.delegate.slice(0, MAX_DELEGATIONS)) {
      if (signal?.aborted) break
      const outcome = await runSpecialist(delegation, project, input)
      project = outcome.project
      allChanges.push(...outcome.changes)
      warnings.push(...outcome.warnings)
      if (outcome.execution) executions.push(outcome.execution)
    }
  }

  // ── Phase 4: Asset generation (build only) ──────────────────────────────────
  if (isBuild && parsed.assets?.length && input.generateAsset) {
    for (const asset of parsed.assets.slice(0, MAX_ASSETS)) {
      if (signal?.aborted) break
      onEvent?.({ type: 'phase', agent: 'ds2_asset_generator', label: 'Gerador de Assets', status: 'start', detail: asset.path })
      try {
        const generated = await input.generateAsset(asset, signal)
        if (generated) {
          const applied = applyFileOps(project, [{ path: asset.path, op: 'write', content: generated.dataUrl, binary: true, summary: 'asset gerado' }])
          project = applied.project
          allChanges.push(...mapChanges(applied.changes))
          executions.push(generated.execution)
          onEvent?.({ type: 'phase', agent: 'ds2_asset_generator', label: 'Gerador de Assets', status: 'done', detail: asset.path })
        } else {
          onEvent?.({ type: 'phase', agent: 'ds2_asset_generator', label: 'Gerador de Assets', status: 'error', detail: 'sem resultado' })
        }
      } catch (error) {
        onEvent?.({ type: 'phase', agent: 'ds2_asset_generator', label: 'Gerador de Assets', status: 'error', detail: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  // ── Phase 5: Reviewer quality pass ──────────────────────────────────────────
  let reviewNote: string | undefined
  const shouldReview = isBuild && allChanges.length > 0 && Boolean(runtime.models.ds2_reviewer) && (parsed.review === true || input.mode === 'auto')
  if (shouldReview && !signal?.aborted) {
    const outcome = await runReviewer(project, input)
    project = outcome.project
    allChanges.push(...outcome.changes)
    warnings.push(...outcome.warnings)
    if (outcome.execution) executions.push(outcome.execution)
    reviewNote = outcome.note
  }

  // ── Compose the assistant message ───────────────────────────────────────────
  const previewChanged = allChanges.length > 0
  const uniqueWarnings = [...new Set(warnings)]

  let content = parsed.message
  if (reviewNote && reviewNote !== parsed.message) content += `\n\n**Revisão:** ${reviewNote}`
  if (parsed.commands?.length) {
    content += `\n\n**Comandos sugeridos:**\n${parsed.commands.map((c) => `- \`${c}\``).join('\n')}`
  }
  if (uniqueWarnings.length) {
    content += `\n\n> ${uniqueWarnings.join('\n> ')}`
  }

  const assistantMessage: DesignStudioMessageData = {
    id: randomId('dsm'),
    role: 'assistant',
    content,
    thinking: parsed.thinking,
    questions: parsed.intent === 'ask' ? parsed.questions : undefined,
    plan: parsed.intent === 'plan' && parsed.plan
      ? { summary: parsed.plan.summary, steps: parsed.plan.steps, state: 'proposed' }
      : undefined,
    file_changes: allChanges.length ? allChanges : undefined,
    preview_updated: previewChanged,
    created_at: new Date().toISOString(),
  }

  return {
    assistantMessage,
    project,
    executions,
    previewChanged,
    sessionTitle: parsed.sessionTitle,
  }
}
