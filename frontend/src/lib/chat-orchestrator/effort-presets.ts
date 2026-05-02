import type { ChatEffortLevel, EffortPreset } from './types'

/**
 * Effort-knob → caps mapping consumed by the orchestrator loop. The numbers
 * are deliberately conservative for `rapido` (cheap, single-shot answers)
 * and aggressive for `profundo` (long research-style turns). `medio` is the
 * default for new conversations.
 *
 * Invariants enforced by the unit test:
 *  - `maxFanOut <= maxIterations`
 *  - `perCallTokenCap < maxTokens`
 *  - `summarizeAt` strictly between 0 and 1 (used as ratio of `maxTokens`)
 */
export const EFFORT_PRESETS: Record<ChatEffortLevel, EffortPreset> = {
  rapido: {
    maxIterations: 3,
    maxFanOut: 2,
    maxTokens: 50_000,
    perCallTokenCap: 8_000,
    criticInterval: 99,
    summarizeAt: 0.8,
  },
  medio: {
    maxIterations: 8,
    maxFanOut: 3,
    maxTokens: 150_000,
    perCallTokenCap: 16_000,
    criticInterval: 2,
    summarizeAt: 0.7,
  },
  profundo: {
    maxIterations: 14,
    maxFanOut: 4,
    maxTokens: 350_000,
    perCallTokenCap: 24_000,
    criticInterval: 2,
    summarizeAt: 0.6,
  },
}

export const EFFORT_LABELS: Record<ChatEffortLevel, string> = {
  rapido: 'Rápido',
  medio: 'Médio',
  profundo: 'Profundo',
}

export const EFFORT_DESCRIPTIONS: Record<ChatEffortLevel, string> = {
  rapido: 'Resposta direta · até 3 iterações, sem crítico',
  medio: 'Equilibrado · até 8 iterações, crítico a cada 2',
  profundo: 'Investigação completa · até 14 iterações, crítico a cada 2',
}

export function isEffortLevel(value: unknown): value is ChatEffortLevel {
  return value === 'rapido' || value === 'medio' || value === 'profundo'
}

export const DEFAULT_EFFORT: ChatEffortLevel = 'medio'
