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

function resolveHardwareCap(max: number, min: number, hardwareConcurrency?: number | null): number {
  if (!hardwareConcurrency || !Number.isFinite(hardwareConcurrency)) return max
  return clamp(Math.floor(hardwareConcurrency / 2), min, max)
}

function resolveMemoryCap(max: number, deviceMemoryGb?: number | null): number {
  if (!deviceMemoryGb || !Number.isFinite(deviceMemoryGb)) return max
  if (deviceMemoryGb <= 2) return 1
  if (deviceMemoryGb <= 4) return Math.min(2, max)
  if (deviceMemoryGb <= 8) return Math.min(3, max)
  return max
}

function resolveNetworkCap(max: number, hints?: RuntimeConcurrencyHints): number {
  if (hints?.saveData) return 1

  const effectiveType = hints?.effectiveConnectionType?.toLowerCase()
  if (!effectiveType) return max
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 1
  if (effectiveType === '3g') return Math.min(2, max)
  return max
}

export function resolveAdaptiveConcurrency(options: ResolveAdaptiveConcurrencyOptions): number {
  const min = options.min ?? 1
  const envConcurrency = parsePositiveInt(options.envValue)
  const preferred = envConcurrency ?? options.fallback

  const hardwareCap = resolveHardwareCap(options.max, min, options.hints?.hardwareConcurrency)
  const memoryCap = resolveMemoryCap(options.max, options.hints?.deviceMemoryGb)
  const networkCap = resolveNetworkCap(options.max, options.hints)
  const runtimeCap = Math.max(min, Math.min(options.max, hardwareCap, memoryCap, networkCap))

  return clamp(preferred, min, runtimeCap)
}
