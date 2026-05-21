/**
 * Trail projection — folds the flat `ChatTrailEvent[]` of a turn into an
 * ordered list of `TrailStep` "occurrences" for the V2 chronological timeline.
 *
 * This is a pure, deterministic view transform: every source event is folded
 * into exactly one step (`Σ step.sourceEventCount === trail.length`, counting
 * children), and steps stay in chronological (`ts`) order. Nothing is dropped
 * or hidden — related events are grouped into one coherent block instead of
 * many flat rows.
 */

import type {
  ChatAgentWorkPackage,
  ChatArtifactRef,
  ChatTrailEvent,
} from '../firestore-types'

export type TrailStepKind =
  | 'orchestrator_decision'
  | 'agent_invocation'
  | 'critic_review'
  | 'super_skill'
  | 'parallel_batch'
  | 'attachment'
  | 'approval'
  | 'clarification'
  | 'export_retry'
  | 'pc_action'
  | 'deliverables'
  | 'final'
  | 'budget'
  | 'notice'

export type TrailStepStatus = 'running' | 'done' | 'error' | 'awaiting'

export interface TrailStep {
  /** Stable id — keeps React reconciliation steady as a live step resolves. */
  id: string
  kind: TrailStepKind
  /** First source-event timestamp — drives chronological ordering. */
  ts: string
  /** Last source-event timestamp folded into this step. */
  endedAt?: string
  /** Who acted: 'Orquestrador', an agent key, or a skill name. */
  actor: string
  status: TrailStepStatus
  thought?: { stream?: string; package?: ChatAgentWorkPackage['thought'] }
  decision?: { tool: string; rationale?: string }
  /** One-line human description of what happened. */
  action?: string
  resultMarkdown?: string
  artifacts?: ChatArtifactRef[]
  critic?: { score: number; reasons: string[]; shouldStop: boolean }
  /** Inline notes/errors attached to this step. */
  notices?: string[]
  /** How many raw trail events folded into this step (audit guarantee). */
  sourceEventCount: number
  /** Sub-steps for a parallel batch. */
  children?: TrailStep[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clip(text: string, max: number): string {
  const trimmed = (text ?? '').trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

function isDecisionPayload(parsed: Record<string, unknown>): boolean {
  return typeof parsed.tool === 'string' && parsed.tool.trim().length > 0
}

/**
 * Returns the first balanced `{...}` substring of `text` that parses as JSON
 * and satisfies `accept`. String-aware brace matching avoids false matches.
 */
function findJsonObject(
  text: string,
  accept: (parsed: Record<string, unknown>) => boolean,
): string | null {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          try {
            const parsed = JSON.parse(candidate) as Record<string, unknown>
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && accept(parsed)) {
              return candidate
            }
          } catch {
            // Not valid JSON from this opening brace — try the next one.
          }
          break
        }
      }
    }
  }
  return null
}

/**
 * Separates the orchestrator's reasoning prose from the JSON decision object it
 * streams in the same response. The decision belongs in the `decision` slot of
 * the step — never rendered as a raw-JSON "Passo".
 */
export function splitOrchestratorThought(total: string): { prose: string } {
  if (!total) return { prose: '' }
  let text = total

  // Drop fenced blocks whose content is a decision object.
  text = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, inner: string) => {
    try {
      const parsed = JSON.parse(String(inner).trim()) as Record<string, unknown>
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && isDecisionPayload(parsed)
        ? ''
        : full
    } catch {
      return full
    }
  })

  // Drop a bare (un-fenced) decision object.
  const bare = findJsonObject(text, isDecisionPayload)
  if (bare) text = text.replace(bare, '')

  return { prose: text.replace(/```(?:json)?\s*```/gi, '').replace(/\n{3,}/g, '\n\n').trim() }
}

function addArtifacts(step: TrailStep, artifacts: ChatArtifactRef[] | undefined): void {
  if (!artifacts?.length) return
  const existing = step.artifacts ?? []
  const byId = new Map(existing.map(a => [a.artifact_id, a]))
  for (const artifact of artifacts) byId.set(artifact.artifact_id, artifact)
  step.artifacts = [...byId.values()]
}

// ── Projection ────────────────────────────────────────────────────────────────

/**
 * Folds a turn's trail into an ordered list of grouped step-blocks. Pure and
 * deterministic — safe to call on every render of a live turn.
 */
export function projectTrailToSteps(trail: ChatTrailEvent[]): TrailStep[] {
  const steps: TrailStep[] = []
  let seq = 0
  const mkId = (kind: string, ts: string): string => `${kind}-${seq++}-${ts}`

  let orchestrator: TrailStep | null = null
  const agents = new Map<string, TrailStep>()
  const attachments = new Map<string, TrailStep>()
  const approvals = new Map<string, TrailStep>()
  const retries = new Map<string, TrailStep>()
  let parallel: TrailStep | null = null
  let superSkill: TrailStep | null = null

  const lastStep = (): TrailStep | null => (steps.length ? steps[steps.length - 1] : null)

  const placeStep = (step: TrailStep): TrailStep => {
    if (parallel && parallel.status === 'running' && step.kind === 'agent_invocation') {
      parallel.children = [...(parallel.children ?? []), step]
    } else {
      steps.push(step)
    }
    return step
  }

  const findArtifactStep = (artifactId: string): TrailStep | null => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i]
      if (step.artifacts?.some(a => a.artifact_id === artifactId)) return step
      const child = step.children?.find(c => c.artifacts?.some(a => a.artifact_id === artifactId))
      if (child) return child
    }
    return null
  }

  for (const event of trail) {
    switch (event.type) {
      case 'iteration_start': {
        superSkill = null
        parallel = null
        orchestrator = {
          id: mkId('orch', event.ts),
          kind: 'orchestrator_decision',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'running',
          sourceEventCount: 1,
        }
        steps.push(orchestrator)
        break
      }

      case 'orchestrator_thought': {
        if (!orchestrator || orchestrator.status !== 'running') {
          orchestrator = {
            id: mkId('orch', event.ts),
            kind: 'orchestrator_decision',
            ts: event.ts,
            actor: 'Orquestrador',
            status: 'running',
            sourceEventCount: 0,
          }
          steps.push(orchestrator)
        }
        orchestrator.thought = {
          ...orchestrator.thought,
          stream: splitOrchestratorThought(event.total).prose,
        }
        orchestrator.sourceEventCount++
        break
      }

      case 'decision': {
        if (!orchestrator || orchestrator.status !== 'running') {
          orchestrator = {
            id: mkId('orch', event.ts),
            kind: 'orchestrator_decision',
            ts: event.ts,
            actor: 'Orquestrador',
            status: 'running',
            sourceEventCount: 0,
          }
          steps.push(orchestrator)
        }
        orchestrator.decision = { tool: event.tool, rationale: event.rationale }
        orchestrator.action = `Decidiu: ${event.tool}`
        orchestrator.status = 'done'
        orchestrator.endedAt = event.ts
        orchestrator.sourceEventCount++
        orchestrator = null
        break
      }

      case 'agent_call': {
        superSkill = null
        const isCritic = event.agent_key === 'chat_critic'
        const step: TrailStep = {
          id: mkId('agent', event.ts),
          kind: isCritic ? 'critic_review' : 'agent_invocation',
          ts: event.ts,
          actor: event.agent_key,
          status: 'running',
          action: event.task ? clip(event.task, 240) : `Chamou ${event.agent_key}`,
          sourceEventCount: 1,
        }
        placeStep(step)
        agents.set(event.agent_key, step)
        break
      }

      case 'parallel_agents': {
        superSkill = null
        parallel = {
          id: mkId('parallel', event.ts),
          kind: 'parallel_batch',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'running',
          action: `Agentes em paralelo: ${event.calls.map(c => c.agent_key).join(', ')}`,
          sourceEventCount: 1,
          children: [],
        }
        steps.push(parallel)
        break
      }

      case 'agent_token': {
        let step = agents.get(event.agent_key)
        if (!step) {
          step = {
            id: mkId('agent', event.ts),
            kind: event.agent_key === 'chat_critic' ? 'critic_review' : 'agent_invocation',
            ts: event.ts,
            actor: event.agent_key,
            status: 'running',
            sourceEventCount: 0,
          }
          placeStep(step)
          agents.set(event.agent_key, step)
        }
        step.thought = { ...step.thought, stream: event.total }
        step.sourceEventCount++
        break
      }

      case 'agent_response': {
        const step = agents.get(event.agent_key)
        if (step) {
          if (!step.resultMarkdown) step.resultMarkdown = clip(event.output, 8_000)
          step.sourceEventCount++
        } else {
          steps.push({
            id: mkId('agent', event.ts),
            kind: event.agent_key === 'chat_critic' ? 'critic_review' : 'agent_invocation',
            ts: event.ts,
            actor: event.agent_key,
            status: 'done',
            endedAt: event.ts,
            resultMarkdown: clip(event.output, 8_000),
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'agent_work_package': {
        const pkg = event.package
        const open = agents.get(pkg.agent_key)
        if (open) {
          open.thought = { ...open.thought, package: pkg.thought }
          if (pkg.result_markdown) open.resultMarkdown = pkg.result_markdown
          addArtifacts(open, pkg.artifacts)
          open.status = 'done'
          open.endedAt = event.ts
          open.sourceEventCount++
          agents.delete(pkg.agent_key)
        } else if (superSkill) {
          // Work package produced internally by the active super-skill.
          superSkill.thought = { ...superSkill.thought, package: pkg.thought }
          if (pkg.result_markdown && !superSkill.resultMarkdown) superSkill.resultMarkdown = pkg.result_markdown
          addArtifacts(superSkill, pkg.artifacts)
          superSkill.sourceEventCount++
        } else {
          steps.push({
            id: mkId('agent', event.ts),
            kind: 'agent_invocation',
            ts: event.ts,
            actor: pkg.agent_key,
            status: 'done',
            endedAt: event.ts,
            action: `Pacote de ${pkg.agent_key}`,
            thought: { package: pkg.thought },
            resultMarkdown: pkg.result_markdown || undefined,
            artifacts: pkg.artifacts?.length ? [...pkg.artifacts] : undefined,
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'critic': {
        const open = agents.get('chat_critic')
        const target = open && open.kind === 'critic_review' ? open : null
        if (target) {
          target.critic = { score: event.score, reasons: event.reasons, shouldStop: event.should_stop }
          target.status = 'done'
          target.endedAt = event.ts
          target.sourceEventCount++
          agents.delete('chat_critic')
        } else {
          steps.push({
            id: mkId('critic', event.ts),
            kind: 'critic_review',
            ts: event.ts,
            actor: 'chat_critic',
            status: 'done',
            endedAt: event.ts,
            critic: { score: event.score, reasons: event.reasons, shouldStop: event.should_stop },
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'super_skill_call': {
        if (superSkill && superSkill.actor === event.skill) {
          // Same skill, still the active context — fold into one step.
          if (event.result_summary) superSkill.action = clip(event.result_summary, 240)
          superSkill.endedAt = event.ts
          superSkill.status = 'done'
          superSkill.sourceEventCount++
        } else {
          superSkill = {
            id: mkId('skill', event.ts),
            kind: 'super_skill',
            ts: event.ts,
            actor: event.skill,
            status: 'running',
            action: clip(event.result_summary || event.args_summary || `Super-skill: ${event.skill}`, 240),
            sourceEventCount: 1,
          }
          steps.push(superSkill)
        }
        break
      }

      case 'pipeline_progress': {
        const target = superSkill ?? lastStep()
        if (target) {
          target.sourceEventCount++
        } else {
          steps.push({
            id: mkId('notice', event.ts),
            kind: 'notice',
            ts: event.ts,
            actor: event.pipeline,
            status: 'running',
            action: `${event.pipeline}: ${event.phase}`,
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'agent_artifact_created':
      case 'agent_artifact_updated': {
        const open = agents.get(event.agent_key)
        const target = open ?? superSkill ?? lastStep()
        if (target) {
          addArtifacts(target, [event.artifact])
          target.sourceEventCount++
        } else {
          steps.push({
            id: mkId('agent', event.ts),
            kind: 'agent_invocation',
            ts: event.ts,
            actor: event.agent_key,
            status: 'done',
            endedAt: event.ts,
            action: `Artefato de ${event.agent_key}`,
            artifacts: [event.artifact],
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'artifact_export_ready': {
        const target = findArtifactStep(event.artifact_id) ?? superSkill ?? lastStep()
        if (target) {
          target.sourceEventCount++
        } else {
          steps.push({
            id: mkId('notice', event.ts),
            kind: 'notice',
            ts: event.ts,
            actor: 'Exportação',
            status: event.export_ref.status === 'ready' ? 'done' : 'running',
            action: `Export ${event.export_ref.label}: ${event.export_ref.status}`,
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'attachment_upload_started':
      case 'attachment_processed':
      case 'attachment_failed':
      case 'multimodal_analysis_started':
      case 'multimodal_analysis_completed':
      case 'multimodal_analysis_failed':
      case 'multimodal_analysis_skipped': {
        const attachmentId = event.type === 'attachment_processed'
          ? event.attachment.attachment_id
          : event.attachment_id
        const filename = event.type === 'attachment_processed'
          ? event.attachment.filename
          : event.filename
        let step = attachments.get(attachmentId)
        if (!step) {
          step = {
            id: mkId('attach', event.ts),
            kind: 'attachment',
            ts: event.ts,
            actor: filename,
            status: 'running',
            action: `Anexo: ${filename}`,
            sourceEventCount: 0,
          }
          steps.push(step)
          attachments.set(attachmentId, step)
        }
        step.sourceEventCount++
        step.endedAt = event.ts
        if (event.type === 'attachment_failed' || event.type === 'multimodal_analysis_failed') {
          step.status = 'error'
          step.notices = [...(step.notices ?? []), event.message]
        } else if (event.type === 'attachment_processed' || event.type === 'multimodal_analysis_completed') {
          step.status = 'done'
        } else if (event.type === 'multimodal_analysis_skipped') {
          step.status = 'done'
          step.notices = [...(step.notices ?? []), event.reason]
        }
        break
      }

      case 'approval_requested': {
        const step: TrailStep = {
          id: mkId('approval', event.ts),
          kind: 'approval',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'awaiting',
          action: `Aprovação solicitada: ${event.title}`,
          notices: [event.summary],
          sourceEventCount: 1,
        }
        steps.push(step)
        approvals.set(event.approval_id, step)
        break
      }

      case 'approval_resolved': {
        const step = approvals.get(event.approval_id)
        if (step) {
          step.status = event.approved ? 'done' : 'error'
          step.action = event.approved ? 'Aprovado pelo usuário' : 'Recusado pelo usuário'
          step.endedAt = event.ts
          if (event.reason) step.notices = [...(step.notices ?? []), event.reason]
          step.sourceEventCount++
        } else {
          steps.push({
            id: mkId('approval', event.ts),
            kind: 'approval',
            ts: event.ts,
            actor: 'Orquestrador',
            status: event.approved ? 'done' : 'error',
            action: event.approved ? 'Aprovado pelo usuário' : 'Recusado pelo usuário',
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'clarification_request': {
        steps.push({
          id: mkId('clarify', event.ts),
          kind: 'clarification',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'awaiting',
          action: 'Pediu esclarecimento ao usuário',
          resultMarkdown: event.question,
          sourceEventCount: 1,
        })
        break
      }

      case 'export_retry_requested': {
        const step: TrailStep = {
          id: mkId('retry', event.ts),
          kind: 'export_retry',
          ts: event.ts,
          actor: 'Exportação',
          status: 'running',
          action: `Nova tentativa de export (${event.retry.format})`,
          sourceEventCount: 1,
        }
        steps.push(step)
        retries.set(event.retry.retry_id, step)
        break
      }

      case 'export_retry_completed': {
        const step = retries.get(event.retry.retry_id)
        if (step) {
          step.status = event.retry.status === 'ready' ? 'done' : 'error'
          step.action = `Export ${event.retry.format}: ${event.retry.status}`
          step.endedAt = event.ts
          step.sourceEventCount++
        } else {
          steps.push({
            id: mkId('retry', event.ts),
            kind: 'export_retry',
            ts: event.ts,
            actor: 'Exportação',
            status: event.retry.status === 'ready' ? 'done' : 'error',
            action: `Export ${event.retry.format}: ${event.retry.status}`,
            sourceEventCount: 1,
          })
        }
        break
      }

      case 'fs_action':
      case 'shell_action': {
        steps.push({
          id: mkId('pc', event.ts),
          kind: 'pc_action',
          ts: event.ts,
          actor: 'Sidecar',
          status: event.type === 'shell_action' && event.exit_code !== 0 ? 'error' : 'done',
          endedAt: event.ts,
          action: event.type === 'fs_action'
            ? `${event.op} ${event.path}`
            : `$ ${clip(event.cmd, 200)}`,
          sourceEventCount: 1,
        })
        break
      }

      case 'deliverable_bundle_ready': {
        steps.push({
          id: mkId('deliver', event.ts),
          kind: 'deliverables',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'done',
          endedAt: event.ts,
          action: `Arquivos gerados: ${event.bundle.ready_count} prontos · ${event.bundle.failed_count} falharam`,
          sourceEventCount: 1,
        })
        break
      }

      case 'final_answer': {
        superSkill = null
        parallel = null
        steps.push({
          id: mkId('final', event.ts),
          kind: 'final',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'done',
          endedAt: event.ts,
          action: 'Resposta final emitida',
          sourceEventCount: 1,
        })
        break
      }

      case 'budget_hit': {
        superSkill = null
        steps.push({
          id: mkId('budget', event.ts),
          kind: 'budget',
          ts: event.ts,
          actor: 'Orquestrador',
          status: 'error',
          endedAt: event.ts,
          action: `Orçamento atingido: ${event.reason}`,
          sourceEventCount: 1,
        })
        break
      }

      case 'error': {
        const open = lastStep()
        if (open && open.status === 'running') {
          open.status = 'error'
          open.notices = [...(open.notices ?? []), event.message]
          open.sourceEventCount++
        } else {
          steps.push({
            id: mkId('notice', event.ts),
            kind: 'notice',
            ts: event.ts,
            actor: 'Sistema',
            status: 'error',
            endedAt: event.ts,
            action: event.message,
            sourceEventCount: 1,
          })
        }
        break
      }

      default: {
        // Exhaustiveness guard — any new ChatTrailEvent variant must be mapped.
        const exhaustive: never = event
        void exhaustive
        break
      }
    }
  }

  return steps
}

/** Total raw events folded across all steps and their children. */
export function countProjectedEvents(steps: TrailStep[]): number {
  return steps.reduce(
    (sum, step) => sum + step.sourceEventCount + countProjectedEvents(step.children ?? []),
    0,
  )
}
