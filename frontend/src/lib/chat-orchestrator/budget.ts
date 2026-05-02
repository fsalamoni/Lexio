import type { UsageExecutionRecord } from '../cost-analytics'
import type { BudgetTracker } from './types'

/**
 * Build a budget tracker for one turn. The tracker accumulates token /
 * cost usage records (so cost-analytics surfaces the chat as a normal
 * pipeline) and enforces the `maxTokens` cap. A skill or critic can also
 * trigger an explicit hard-stop with a reason; the orchestrator surfaces
 * that as a `budget_hit` trail event.
 */
export function createBudget(maxTokens: number): BudgetTracker {
  let tokens = 0
  let cost = 0
  let hardStopReason: string | undefined
  const records: UsageExecutionRecord[] = []

  return {
    recordUsage(record) {
      const t = Number(record.total_tokens ?? 0)
      const c = Number(record.cost_usd ?? 0)
      tokens += Number.isFinite(t) ? t : 0
      cost += Number.isFinite(c) ? c : 0
      // We only push records that look like full UsageExecutionRecord
      // shapes — partial entries from skills are still counted toward
      // the running totals but not persisted in `llm_executions`.
      const candidate = record as Partial<UsageExecutionRecord>
      if (
        candidate.source_type
        && candidate.source_id
        && candidate.created_at
        && candidate.function_key
        && typeof candidate.total_tokens === 'number'
      ) {
        records.push(candidate as UsageExecutionRecord)
      }
    },
    used() {
      return { tokens, cost_usd: cost }
    },
    usedRatio() {
      if (maxTokens <= 0) return 1
      return tokens / maxTokens
    },
    exceeded() {
      if (hardStopReason) return true
      return tokens >= maxTokens
    },
    hardStop(reason) {
      hardStopReason = reason
    },
    isHardStopped() {
      return { stopped: Boolean(hardStopReason), reason: hardStopReason }
    },
    records() {
      return records.slice()
    },
  }
}
