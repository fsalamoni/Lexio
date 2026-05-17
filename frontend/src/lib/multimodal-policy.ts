import { IS_FIREBASE } from './firebase'
import { ensureUserSettingsMigrated, getCurrentUserId, saveUserSettings } from './firestore-service'
import { resolveProviderForModel } from './provider-credentials'
import { PROVIDER_ORDER, PROVIDERS, type ProviderId } from './providers'
import type { ModelOption } from './model-config'
import type {
  MultimodalModality,
  MultimodalModalityPolicy,
  MultimodalPolicyConfig,
  ProviderSettingsMap,
} from './firestore-types'

export const MULTIMODAL_POLICY_UPDATED_EVENT = 'lexio:multimodal_policy_updated'

export const MULTIMODAL_POLICY_MODALITIES: MultimodalModality[] = ['image', 'audio', 'video']

export const DEFAULT_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN = 4
export const HARD_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN = 12

export const DEFAULT_MULTIMODAL_FILE_LIMIT_MB: Record<MultimodalModality, number> = {
  image: 8,
  audio: 25,
  video: 50,
}

const HARD_MULTIMODAL_FILE_LIMIT_MB: Record<MultimodalModality, number> = {
  image: 64,
  audio: 100,
  video: 250,
}

const MIN_MULTIMODAL_FILE_LIMIT_MB = 1

export const MULTIMODAL_MODALITY_LABELS: Record<MultimodalModality, string> = {
  image: 'imagens',
  audio: 'audios',
  video: 'videos',
}

export interface MultimodalPolicyRuntimeConfig {
  policy: MultimodalPolicyConfig
  modelCatalog: ModelOption[]
  providerSettings: ProviderSettingsMap
}

export interface MultimodalProviderPolicyDecision {
  allowed: boolean
  providerId?: string
  providerLabel?: string
  reason?: string
}

export interface MultimodalModelSelection {
  model: string
  fallbackModels: string[]
  providerId?: string
  providerLabel?: string
  blockedReason?: string
}

export function getDefaultMultimodalPolicyConfig(): MultimodalPolicyConfig {
  return normalizeMultimodalPolicyConfig({
    enabled: true,
    max_attachments_per_turn: DEFAULT_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN,
    modalities: {
      image: { enabled: true, max_file_mb: DEFAULT_MULTIMODAL_FILE_LIMIT_MB.image },
      audio: { enabled: true, max_file_mb: DEFAULT_MULTIMODAL_FILE_LIMIT_MB.audio },
      video: { enabled: true, max_file_mb: DEFAULT_MULTIMODAL_FILE_LIMIT_MB.video },
    },
  })
}

export function normalizeMultimodalPolicyConfig(raw?: MultimodalPolicyConfig | null): MultimodalPolicyConfig {
  const source = raw ?? {}
  const modalities: Record<MultimodalModality, MultimodalModalityPolicy> = {
    image: normalizeModalityPolicy('image', source.modalities?.image),
    audio: normalizeModalityPolicy('audio', source.modalities?.audio),
    video: normalizeModalityPolicy('video', source.modalities?.video),
  }

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    max_attachments_per_turn: clampInteger(
      source.max_attachments_per_turn,
      DEFAULT_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN,
      0,
      HARD_MULTIMODAL_MAX_ATTACHMENTS_PER_TURN,
    ),
    modalities,
  }
}

export function getMultimodalModalityPolicy(
  policy: MultimodalPolicyConfig | undefined,
  modality: MultimodalModality,
): Required<Pick<MultimodalModalityPolicy, 'enabled' | 'max_file_mb' | 'allowed_provider_ids' | 'blocked_provider_ids'>> {
  const normalized = normalizeMultimodalPolicyConfig(policy)
  const entry = normalized.modalities?.[modality] ?? normalizeModalityPolicy(modality, undefined)
  return {
    enabled: entry.enabled ?? true,
    max_file_mb: entry.max_file_mb ?? DEFAULT_MULTIMODAL_FILE_LIMIT_MB[modality],
    allowed_provider_ids: entry.allowed_provider_ids ?? [],
    blocked_provider_ids: entry.blocked_provider_ids ?? [],
  }
}

export function getMultimodalFileLimitBytes(
  policy: MultimodalPolicyConfig | undefined,
  modality: MultimodalModality,
): number {
  const entry = getMultimodalModalityPolicy(policy, modality)
  return Math.round(entry.max_file_mb * 1024 * 1024)
}

export function getMultimodalModalityBlockReason(
  policy: MultimodalPolicyConfig | undefined,
  modality: MultimodalModality,
): string | null {
  const normalized = normalizeMultimodalPolicyConfig(policy)
  if (normalized.enabled === false) {
    return 'A analise multimodal automatica esta desativada pela politica do perfil.'
  }
  const entry = getMultimodalModalityPolicy(normalized, modality)
  if (entry.enabled === false) {
    return `A analise automatica de ${MULTIMODAL_MODALITY_LABELS[modality]} esta desativada pela politica do perfil.`
  }
  return null
}

export function evaluateMultimodalProviderPolicy(args: {
  modelId: string
  modality: MultimodalModality
  policy?: MultimodalPolicyConfig
  modelCatalog?: ModelOption[]
  providerSettings?: ProviderSettingsMap
}): MultimodalProviderPolicyDecision {
  const modalityPolicy = getMultimodalModalityPolicy(args.policy, args.modality)
  const providerId = resolveProviderForModel(args.modelId, args.modelCatalog ?? [], args.providerSettings ?? {})
  const provider = PROVIDERS[providerId as ProviderId]
  const providerLabel = provider?.label ?? providerId

  if (modalityPolicy.blocked_provider_ids.includes(providerId)) {
    return {
      allowed: false,
      providerId,
      providerLabel,
      reason: `${providerLabel} esta bloqueado para ${MULTIMODAL_MODALITY_LABELS[args.modality]} pela politica multimodal.`,
    }
  }

  if (modalityPolicy.allowed_provider_ids.length > 0 && !modalityPolicy.allowed_provider_ids.includes(providerId)) {
    return {
      allowed: false,
      providerId,
      providerLabel,
      reason: `${providerLabel} nao esta na lista de provedores liberados para ${MULTIMODAL_MODALITY_LABELS[args.modality]}.`,
    }
  }

  return { allowed: true, providerId, providerLabel }
}

export function selectMultimodalModelForPolicy(args: {
  model: string
  fallbackModels?: string[]
  modality: MultimodalModality
  policy?: MultimodalPolicyConfig
  modelCatalog?: ModelOption[]
  providerSettings?: ProviderSettingsMap
}): MultimodalModelSelection {
  const candidates = uniqueNonEmpty([args.model, ...(args.fallbackModels ?? [])])
  const allowedCandidates: Array<{ model: string; decision: MultimodalProviderPolicyDecision }> = []
  const blockedReasons: string[] = []

  for (const candidate of candidates) {
    const decision = evaluateMultimodalProviderPolicy({
      modelId: candidate,
      modality: args.modality,
      policy: args.policy,
      modelCatalog: args.modelCatalog,
      providerSettings: args.providerSettings,
    })
    if (decision.allowed) {
      allowedCandidates.push({ model: candidate, decision })
    } else if (decision.reason) {
      blockedReasons.push(decision.reason)
    }
  }

  const selected = allowedCandidates[0]
  if (!selected) {
    return {
      model: args.model,
      fallbackModels: [],
      blockedReason: blockedReasons[0] ?? `Nenhum provedor liberado para ${MULTIMODAL_MODALITY_LABELS[args.modality]}.`,
    }
  }

  return {
    model: selected.model,
    fallbackModels: allowedCandidates.slice(1).map(candidate => candidate.model),
    providerId: selected.decision.providerId,
    providerLabel: selected.decision.providerLabel,
  }
}

export async function loadMultimodalPolicyRuntimeConfig(uid?: string): Promise<MultimodalPolicyRuntimeConfig> {
  if (!IS_FIREBASE) {
    return {
      policy: getDefaultMultimodalPolicyConfig(),
      modelCatalog: [],
      providerSettings: {},
    }
  }
  const resolvedUid = uid ?? getCurrentUserId() ?? undefined
  if (!resolvedUid) {
    return {
      policy: getDefaultMultimodalPolicyConfig(),
      modelCatalog: [],
      providerSettings: {},
    }
  }
  const settings = await ensureUserSettingsMigrated(resolvedUid)
  return {
    policy: normalizeMultimodalPolicyConfig(settings.multimodal_policy),
    modelCatalog: settings.model_catalog ?? [],
    providerSettings: settings.provider_settings ?? {},
  }
}

export async function loadMultimodalPolicyConfig(uid?: string): Promise<MultimodalPolicyConfig> {
  const runtime = await loadMultimodalPolicyRuntimeConfig(uid)
  return runtime.policy
}

export async function saveMultimodalPolicyConfig(
  policy: MultimodalPolicyConfig,
  uid?: string,
): Promise<MultimodalPolicyConfig> {
  const normalized = normalizeMultimodalPolicyConfig(policy)
  if (!IS_FIREBASE) return normalized

  const resolvedUid = uid ?? getCurrentUserId()
  if (!resolvedUid) throw new Error('Usuario nao autenticado.')
  await saveUserSettings(resolvedUid, { multimodal_policy: normalized })
  emitMultimodalPolicyUpdated()
  return normalized
}

export function emitMultimodalPolicyUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(MULTIMODAL_POLICY_UPDATED_EVENT))
  } catch {
    // Non-critical UI refresh signal.
  }
}

export function getProvidersForMultimodalModality(modality: MultimodalModality): ProviderId[] {
  return PROVIDER_ORDER.filter((providerId) => {
    const capabilities = PROVIDERS[providerId]?.capabilities ?? []
    if (modality === 'video') return capabilities.includes('video') || capabilities.includes('image')
    return capabilities.includes(modality)
  })
}

function normalizeModalityPolicy(
  modality: MultimodalModality,
  raw?: MultimodalModalityPolicy,
): MultimodalModalityPolicy {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : true,
    max_file_mb: clampNumber(
      raw?.max_file_mb,
      DEFAULT_MULTIMODAL_FILE_LIMIT_MB[modality],
      MIN_MULTIMODAL_FILE_LIMIT_MB,
      HARD_MULTIMODAL_FILE_LIMIT_MB[modality],
    ),
    allowed_provider_ids: normalizeProviderIds(raw?.allowed_provider_ids),
    blocked_provider_ids: normalizeProviderIds(raw?.blocked_provider_ids),
  }
}

function normalizeProviderIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return uniqueNonEmpty(raw.map(value => String(value).trim().toLowerCase()))
    .filter(providerId => providerId in PROVIDERS)
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function clampInteger(raw: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(clampNumber(raw, fallback, min, max))
}
