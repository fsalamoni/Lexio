/**
 * Supervisor — rule-based decision helper for the v3 orchestrator.
 *
 * The supervisor is intentionally LLM-free for the common cases (to reduce
 * latency and cost). It inspects an agent's output/status and decides whether
 * to accept, retry with the same model, or escalate to a more capable model
 * (the "supervisor model" configured by the admin).
 */

export type SupervisorDecision = 'accept' | 'retry' | 'escalate'

export interface SupervisorEvaluation<T> {
  decision: SupervisorDecision
  reason: string
  output: T
}

export interface SupervisorOptions<T> {
  /** Maximum retries with the SAME model before escalating. */
  maxRetries?: number
  /** Optional validator returning `null` when output is acceptable, error message otherwise. */
  validate?: (output: T) => string | null
}

/**
 * Run an agent through the supervisor with retry/escalation. The runner is
 * called with a `model` parameter so the orchestrator can swap it on escalation.
 */
export async function superviseAgent<T>(
  options: {
    agentLabel: string
    primaryModel: string
    escalationModel?: string | null
    maxRetries?: number
    validate?: (output: T) => string | null
    runner: (model: string, attempt: number) => Promise<T>
  },
): Promise<{ output: T; attempts: number; usedEscalation: boolean; reason: string }> {
  const maxRetries = Math.max(0, options.maxRetries ?? 1)
  let lastReason = 'ok'
  let attempt = 0

  for (; attempt <= maxRetries; attempt++) {
    try {
      const output = await options.runner(options.primaryModel, attempt)
      const validationError = options.validate ? options.validate(output) : null
      if (!validationError) {
        return { output, attempts: attempt + 1, usedEscalation: false, reason: 'ok' }
      }
      lastReason = validationError
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastReason = err instanceof Error ? err.message : String(err)
    }
  }

  // Escalate to the supervisor model when configured.
  if (options.escalationModel && options.escalationModel !== options.primaryModel) {
    try {
      const output = await options.runner(options.escalationModel, attempt)
      const validationError = options.validate ? options.validate(output) : null
      if (!validationError) {
        return {
          output,
          attempts: attempt + 1,
          usedEscalation: true,
          reason: `escalated_after_${lastReason}`,
        }
      }
      lastReason = validationError
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      lastReason = err instanceof Error ? err.message : String(err)
    }
  }

  throw new Error(`Supervisor: ${options.agentLabel} falhou após ${attempt} tentativas (${lastReason}).`)
}
