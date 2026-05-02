/**
 * Feature Flags — Canary release control for the document generation pipeline.
 *
 * Flags are resolved at runtime from build-time env vars (VITE_FF_*),
 * local storage overrides (for development/testing), and eventually
 * Firestore remote config (future enhancement).
 *
 * Resolution priority:
 *   1. Local storage override (dev tools)
 *   2. Build-time env var (VITE_FF_*)
 *   3. Hardcoded default
 *
 * Usage:
 *   import { isEnabled } from './feature-flags'
 *   if (isEnabled('FF_PARALLEL_ACERVO')) { ... }
 */

// ── Flag definitions ──────────────────────────────────────────────────────────

export interface FeatureFlagDefinition {
  key: string
  label: string
  description: string
  defaultEnabled: boolean
  envVar: string
  /** If true, this flag can be toggled via local storage in dev mode */
  devToggleable: boolean
}

/** All canary feature flags for Subonda 2. */
export const FEATURE_FLAGS: FeatureFlagDefinition[] = [
  {
    key: 'FF_PARALLEL_ACERVO',
    label: 'Acervo em Paralelo',
    description: 'Busca de acervo e geração de ementas rodam em paralelo com a triagem',
    defaultEnabled: true,
    envVar: 'VITE_FF_PARALLEL_ACERVO',
    devToggleable: true,
  },
  {
    key: 'FF_PARALLEL_PESQUISADOR',
    label: 'Pesquisador em Paralelo',
    description: 'Pesquisador roda junto com Compilador+Revisor do acervo',
    defaultEnabled: true,
    envVar: 'VITE_FF_PARALLEL_PESQUISADOR',
    devToggleable: true,
  },
  {
    key: 'FF_EMENTA_WARMUP_EXTENDED',
    label: 'Warm-up de Ementas Estendido',
    description: 'Aumenta o budget de warm-up de ementas para 5s (padrão 3.5s)',
    defaultEnabled: true,
    envVar: 'VITE_FF_EMENTA_WARMUP_EXTENDED',
    devToggleable: true,
  },
  {
    key: 'FF_EMENTA_CACHE',
    label: 'Cache de Ementas',
    description: 'Usa cache em memória para ementas de acervo durante a sessão',
    defaultEnabled: true,
    envVar: 'VITE_FF_EMENTA_CACHE',
    devToggleable: true,
  },
  {
    key: 'FF_CLASSIFICACAO_CACHE',
    label: 'Cache de Classificação',
    description: 'Usa cache em memória para tags de classificação do acervo',
    defaultEnabled: true,
    envVar: 'VITE_FF_CLASSIFICACAO_CACHE',
    devToggleable: true,
  },
  {
    key: 'FF_TEMPLATE_CACHE',
    label: 'Cache de Templates',
    description: 'Usa cache em memória para estruturas de tipos documentais',
    defaultEnabled: true,
    envVar: 'VITE_FF_TEMPLATE_CACHE',
    devToggleable: true,
  },
  {
    key: 'FF_HANDOFF_STATE_MACHINE',
    label: 'Máquina de Estados no Handoff',
    description: 'Usa transições explícitas de estado no AgentTrailProgressModal',
    defaultEnabled: true,
    envVar: 'VITE_FF_HANDOFF_STATE_MACHINE',
    devToggleable: true,
  },
  {
    key: 'FF_DOC_REDATOR_10K',
    label: 'Redator 10k',
    description: 'Redator usa janela reduzida de 10k tokens com fallback de qualidade',
    defaultEnabled: false, // Default OFF — conservative rollout
    envVar: 'VITE_FF_DOC_REDATOR_10K',
    devToggleable: true,
  },
  {
    key: 'FF_ACERVO_LLM_PREFILTER',
    label: 'Pré-filtro LLM do Acervo',
    description: 'Usa o Buscador LLM para ranquear documentos após pré-filtro por keywords',
    defaultEnabled: true,
    envVar: 'VITE_FF_ACERVO_LLM_PREFILTER',
    devToggleable: true,
  },
  {
    key: 'FF_ACERVO_KEYWORD_PREFILTER',
    label: 'Pré-filtro por Keywords',
    description: 'Pré-filtra documentos do acervo por keywords antes de enviar ao LLM',
    defaultEnabled: true,
    envVar: 'VITE_FF_ACERVO_KEYWORD_PREFILTER',
    devToggleable: true,
  },
  {
    key: 'FF_THESIS_PREFETCH',
    label: 'Prefetch de Teses',
    description: 'Carrega banco de teses em paralelo com a triagem (antes do resultado)',
    defaultEnabled: true,
    envVar: 'VITE_FF_THESIS_PREFETCH',
    devToggleable: true,
  },
]

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'lexio:ff:'

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled.
 *
 * Priority: local storage override > env var > default.
 */
export function isEnabled(flagKey: string): boolean {
  // 1. Local storage override (dev tools)
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${flagKey}`)
    if (stored !== null) {
      return stored === 'true'
    }
  } catch {
    // sessionStorage might be unavailable (SSR, test env)
  }

  // 2. Build-time env var
  const def = FEATURE_FLAGS.find(f => f.key === flagKey)
  if (def) {
    try {
      const envValue = (import.meta as unknown as Record<string, unknown>).env as Record<string, string | undefined> | undefined
      const envVal = envValue?.[def.envVar]
      if (envVal !== undefined) {
        return envVal === 'true'
      }
    } catch {
      // import.meta.env might not be available in all environments
    }
  }

  // 3. Default
  return def?.defaultEnabled ?? false
}

/**
 * Legacy support — kept for backward compatibility with existing isTruthyFlag calls.
 * Resolves a direct VITE_* env var value (not a FF_* key).
 */
export function isTruthyFlag(rawValue: string | null | undefined): boolean {
  if (rawValue === undefined || rawValue === null) return false
  const lower = rawValue.toLowerCase().trim()
  return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'enabled' || lower === 'on'
}

/**
 * Check if a flag definition supports the canary approach
 * (i.e., it has been defined and is toggleable).
 */
export function isCanaryFlag(flagKey: string): boolean {
  return FEATURE_FLAGS.some(f => f.key === flagKey)
}

/**
 * Set a feature flag override in session storage (dev only).
 * Clears on page refresh.
 */
export function setFlagOverride(flagKey: string, enabled: boolean): void {
  try {
    sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${flagKey}`, String(enabled))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Remove a feature flag override, reverting to env/default.
 */
export function clearFlagOverride(flagKey: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${flagKey}`)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the effective state and source of a flag (for debug UI).
 */
export function getFlagState(flagKey: string): {
  enabled: boolean
  source: 'default' | 'env' | 'sessionStorage'
} {
  // Check session storage first
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${flagKey}`)
    if (stored !== null) {
      return { enabled: stored === 'true', source: 'sessionStorage' }
    }
  } catch { /* ignore */ }

  // Check env var
  const def = FEATURE_FLAGS.find(f => f.key === flagKey)
  if (def) {
    try {
      const envValue = (import.meta as unknown as Record<string, unknown>).env as Record<string, string | undefined> | undefined
      if (envValue?.[def.envVar] !== undefined) {
        return { enabled: envValue[def.envVar] === 'true', source: 'env' }
      }
    } catch { /* ignore */ }
  }

  return { enabled: def?.defaultEnabled ?? false, source: 'default' }
}

/**
 * List all flags with their current state (useful for debug panel).
 */
export function listAllFlags(): Array<FeatureFlagDefinition & { enabled: boolean; source: 'default' | 'env' | 'sessionStorage' }> {
  return FEATURE_FLAGS.map(def => ({
    ...def,
    ...getFlagState(def.key),
  }))
}