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

export interface AdaptiveConcurrencyDiagnostics {
  preferred: number
  resolved: number
  runtimeCap: number
  limiters: RuntimeConcurrencyLimiter[]
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
  const preferred = clamp(envConcurrency ?? options.fallback, min, options.max)

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

  return `auto ${diagnostics.resolved}/${diagnostics.runtimeCap} target ${diagnostics.preferred} | limits ${limits}`
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
    `target${diagnostics.preferred}`,
    `res${diagnostics.resolved}`,
    `cap${diagnostics.runtimeCap}`,
    `lim${limits}`,
  ].join('|')
}
