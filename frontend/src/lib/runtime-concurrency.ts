type ConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

type NavigatorLike = Navigator & {
  connection?: ConnectionLike
  deviceMemory?: number
}

export interface RuntimeConcurrencyHints {
  hardwareConcurrency?: number | null
  deviceMemoryGb?: number | null
  saveData?: boolean
  effectiveConnectionType?: string | null
}

export interface ResolveAdaptiveConcurrencyOptions {
  envValue?: string
  fallback: number
  max: number
  min?: number
  hints?: RuntimeConcurrencyHints
}

export type RuntimeConcurrencyLimiter = 'cpu' | 'memory' | 'network' | 'save_data'
export type RuntimeConcurrencyProfile = 'unknown' | 'constrained' | 'balanced' | 'performant' | 'high_end'
export type AdaptiveConcurrencyTargetSource = 'auto' | 'env'

export interface AdaptiveConcurrencyDiagnostics {
  preferred: number
  resolved: number
  runtimeCap: number
  limiters: RuntimeConcurrencyLimiter[]
  profile: RuntimeConcurrencyProfile
  preferredSource: AdaptiveConcurrencyTargetSource
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

export function parsePositiveInt(raw: string | null | undefined): number | null {
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function getRuntimeConcurrencyHints(): RuntimeConcurrencyHints {
  if (typeof navigator === 'undefined') {
    return {}
  }

  const nav = navigator as NavigatorLike
  const connection = nav.connection

  const hardwareConcurrency = Number.isFinite(nav.hardwareConcurrency) && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency
    : null

  const deviceMemoryGb = Number.isFinite(nav.deviceMemory) && (nav.deviceMemory ?? 0) > 0
    ? nav.deviceMemory ?? null
    : null

  const effectiveConnectionType = typeof connection?.effectiveType === 'string'
    ? connection.effectiveType.toLowerCase()
    : null

  return {
    hardwareConcurrency,
    deviceMemoryGb,
    saveData: connection?.saveData === true,
    effectiveConnectionType,
  }
}

function normalizeHint(value?: number | null): number | null {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return null
  }
  return value ?? null
}

function resolveRuntimeConcurrencyProfile(hints?: RuntimeConcurrencyHints): RuntimeConcurrencyProfile {
  const cpu = normalizeHint(hints?.hardwareConcurrency)
  const memoryGb = normalizeHint(hints?.deviceMemoryGb)
  const network = hints?.effectiveConnectionType?.toLowerCase() ?? null
  const networkIsFast = !network || network === '4g' || network === '5g' || network === 'wifi' || network === 'ethernet'

  if (hints?.saveData || network === 'slow-2g' || network === '2g') {
    return 'constrained'
  }

  if ((cpu && cpu <= 4) || (memoryGb && memoryGb <= 3)) {
    return 'constrained'
  }

  if (cpu && cpu >= 16 && memoryGb && memoryGb >= 12 && networkIsFast) {
    return 'high_end'
  }

  if (cpu && cpu >= 10 && memoryGb && memoryGb >= 8 && networkIsFast) {
    return 'performant'
  }

  if (!cpu && !memoryGb && !network) {
    return 'unknown'
  }

  return 'balanced'
}

function resolveAutoPreferredConcurrency(
  fallback: number,
  min: number,
  max: number,
  profile: RuntimeConcurrencyProfile,
): number {
  const profileFactor: Record<RuntimeConcurrencyProfile, number> = {
    unknown: 1,
    constrained: 0.75,
    balanced: 1,
    performant: 1.25,
    high_end: 1.5,
  }

  const scaled = Math.round(fallback * profileFactor[profile])
  return clamp(scaled, min, max)
}

function resolveHardwareCap(max: number, min: number, hardwareConcurrency?: number | null): {
  cap: number
  limited: boolean
} {
  if (!hardwareConcurrency || !Number.isFinite(hardwareConcurrency)) {
    return { cap: max, limited: false }
  }
  const cap = clamp(Math.floor(hardwareConcurrency / 2), min, max)
  return {
    cap,
    limited: cap < max,
  }
}

function resolveMemoryCap(max: number, deviceMemoryGb?: number | null): {
  cap: number
  limited: boolean
} {
  if (!deviceMemoryGb || !Number.isFinite(deviceMemoryGb)) {
    return { cap: max, limited: false }
  }

  let cap = max
  if (deviceMemoryGb <= 2) cap = 1
  else if (deviceMemoryGb <= 4) cap = Math.min(2, max)
  else if (deviceMemoryGb <= 8) cap = Math.min(3, max)

  return {
    cap,
    limited: cap < max,
  }
}

function resolveNetworkCap(max: number, hints?: RuntimeConcurrencyHints): {
  cap: number
  limiter: RuntimeConcurrencyLimiter | null
} {
  if (hints?.saveData) {
    return {
      cap: 1,
      limiter: 'save_data',
    }
  }

  const effectiveType = hints?.effectiveConnectionType?.toLowerCase()
  if (!effectiveType) {
    return {
      cap: max,
      limiter: null,
    }
  }

  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return {
      cap: 1,
      limiter: 'network',
    }
  }

  if (effectiveType === '3g') {
    return {
      cap: Math.min(2, max),
      limiter: 'network',
    }
  }

  return {
    cap: max,
    limiter: null,
  }
}

export function resolveAdaptiveConcurrencyWithDiagnostics(
  options: ResolveAdaptiveConcurrencyOptions,
): AdaptiveConcurrencyDiagnostics {
  const min = options.min ?? 1
  const envConcurrency = parsePositiveInt(options.envValue)
  const profile = resolveRuntimeConcurrencyProfile(options.hints)
  const preferredSource: AdaptiveConcurrencyTargetSource = envConcurrency ? 'env' : 'auto'
  const autoPreferred = resolveAutoPreferredConcurrency(options.fallback, min, options.max, profile)
  const preferred = clamp(envConcurrency ?? autoPreferred, min, options.max)

  const hardware = resolveHardwareCap(options.max, min, options.hints?.hardwareConcurrency)
  const memory = resolveMemoryCap(options.max, options.hints?.deviceMemoryGb)
  const network = resolveNetworkCap(options.max, options.hints)
  const runtimeCap = Math.max(min, Math.min(options.max, hardware.cap, memory.cap, network.cap))

  const limiters = new Set<RuntimeConcurrencyLimiter>()
  if (hardware.limited) limiters.add('cpu')
  if (memory.limited) limiters.add('memory')
  if (network.limiter) limiters.add(network.limiter)

  return {
    preferred,
    resolved: clamp(preferred, min, runtimeCap),
    runtimeCap,
    limiters: Array.from(limiters),
    profile,
    preferredSource,
  }
}

export function resolveAdaptiveConcurrency(options: ResolveAdaptiveConcurrencyOptions): number {
  return resolveAdaptiveConcurrencyWithDiagnostics(options).resolved
}

export function formatRuntimeHints(hints?: RuntimeConcurrencyHints): string {
  if (!hints) return 'runtime unknown'

  const parts: string[] = []
  if (hints.hardwareConcurrency && Number.isFinite(hints.hardwareConcurrency)) {
    parts.push(`cpu ${Math.round(hints.hardwareConcurrency)}`)
  }
  if (hints.deviceMemoryGb && Number.isFinite(hints.deviceMemoryGb)) {
    parts.push(`mem ${hints.deviceMemoryGb}GB`)
  }
  if (hints.effectiveConnectionType) {
    parts.push(`net ${hints.effectiveConnectionType}`)
  }
  if (hints.saveData) {
    parts.push('save-data')
  }

  return parts.length > 0 ? parts.join(' | ') : 'runtime unknown'
}

export function formatAdaptiveConcurrency(diagnostics: AdaptiveConcurrencyDiagnostics): string {
  const limits = diagnostics.limiters.length > 0
    ? diagnostics.limiters.join('+')
    : 'none'

  return `auto ${diagnostics.resolved}/${diagnostics.runtimeCap} target ${diagnostics.preferred} profile ${diagnostics.profile} source ${diagnostics.preferredSource} | limits ${limits}`
}

export function buildRuntimeProfileKey(
  hints: RuntimeConcurrencyHints,
  diagnostics: AdaptiveConcurrencyDiagnostics,
): string {
  const cpu = hints.hardwareConcurrency && Number.isFinite(hints.hardwareConcurrency)
    ? `cpu${Math.round(hints.hardwareConcurrency)}`
    : 'cpu?'
  const mem = hints.deviceMemoryGb && Number.isFinite(hints.deviceMemoryGb)
    ? `mem${hints.deviceMemoryGb}g`
    : 'mem?'
  const net = hints.effectiveConnectionType ? `net${hints.effectiveConnectionType}` : 'net?'
  const save = hints.saveData ? 'save1' : 'save0'
  const limits = diagnostics.limiters.length > 0 ? diagnostics.limiters.join('+') : 'none'

  return [
    cpu,
    mem,
    net,
    save,
    `profile${diagnostics.profile}`,
    `src${diagnostics.preferredSource}`,
    `target${diagnostics.preferred}`,
    `res${diagnostics.resolved}`,
    `cap${diagnostics.runtimeCap}`,
    `lim${limits}`,
  ].join('|')
}

/**
 * Run an array of async tasks with at most `limit` running concurrently. The
 * results array preserves the input order. The first rejection aborts the
 * remaining queued tasks (already-running ones still finish to avoid orphaned
 * promises) and the error is propagated.
 *
 * Used by the v3 document orchestrator to throttle parallel `Promise.all`
 * fan-outs (Fase 1 / Fase 2 retrievers / Fase 3 / Fase 3+outline) so that we
 * respect provider rate-limits even when the user configured cheap free-tier
 * models.
 */
export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const safeLimit = Math.max(1, Math.floor(limit))
  if (tasks.length === 0) return []
  if (safeLimit >= tasks.length) {
    return Promise.all(tasks.map(t => t()))
  }

  const results: T[] = new Array(tasks.length)
  let nextIndex = 0
  let firstError: unknown
  let aborted = false

  const worker = async (): Promise<void> => {
    while (!aborted) {
      const current = nextIndex++
      if (current >= tasks.length) return
      try {
        results[current] = await tasks[current]()
      } catch (err) {
        if (!aborted) {
          firstError = err
          aborted = true
        }
        return
      }
    }
  }

  const workers = Array.from({ length: Math.min(safeLimit, tasks.length) }, () => worker())
  await Promise.all(workers)

  if (aborted && firstError !== undefined) {
    throw firstError
  }
  return results
}

/** Default concurrency cap for v3 parallel phases (aligned with OpenRouter free tier). */
export const DOCUMENT_V3_DEFAULT_PARALLEL_LIMIT = 3
