/**
 * Feature Flags — Canary release control for the document generation pipeline.
 *
 * Flags are resolved at runtime from build-time env vars (VITE_FF_*),
 * local storage overrides (for development/testing), and eventually
 * Firestore remote config (future enhancement).
 *
 * Resolution priority:
 *   1. Session storage override (dev tools)
 *   2. User-scoped runtime override (Firestore settings/preferences)
 *   3. Build-time env var (VITE_FF_*)
 *   4. Hardcoded default
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

export type FeatureFlagSource = 'default' | 'env' | 'runtime' | 'sessionStorage'

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
  {
    key: 'FF_PRESENTATION_V2_ENABLED',
    label: 'Gerador de Apresentação v2',
    description: 'Habilita o novo gerador multimodal de apresentações no caderno de pesquisa',
    defaultEnabled: false,
    envVar: 'VITE_FF_PRESENTATION_V2_ENABLED',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_ATTACHMENTS',
    label: 'Chat: Anexos',
    description: 'Habilita upload, drag/drop, paste e ingestão de anexos no Chat Orquestrador',
    defaultEnabled: true,
    envVar: 'VITE_FF_CHAT_ATTACHMENTS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_DELIVERABLE_BUNDLE',
    label: 'Chat: Entregáveis Obrigatórios',
    description: 'Exige e exibe pacote final de arquivos quando o usuário pede documentos/downloads',
    defaultEnabled: true,
    envVar: 'VITE_FF_CHAT_DELIVERABLE_BUNDLE',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_EXPORT_RETRY',
    label: 'Chat: Retry de Exports',
    description: 'Mostra ação de nova tentativa para exports planejados ou com falha no painel de arquivos gerados',
    defaultEnabled: true,
    envVar: 'VITE_FF_CHAT_EXPORT_RETRY',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_MULTIMODAL_ANALYSIS',
    label: 'Chat: Análise Multimodal',
    description: 'Reserva rollout para OCR, visão e transcrição de áudio/vídeo no Chat Orquestrador',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_MULTIMODAL_ANALYSIS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_ARTIFACT_VIEWERS',
    label: 'Chat: Viewers de Artefatos',
    description: 'Renderiza viewers ricos inline (apresentação, mapa mental, infográfico, tabela, quiz, flashcards, código) nos artefatos do chat',
    defaultEnabled: true,
    envVar: 'VITE_FF_CHAT_ARTIFACT_VIEWERS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_TIMELINE_V2',
    label: 'Chat: Linha do Tempo V2',
    description: 'Renderiza a trilha do orquestrador como uma linha do tempo cronológica de ocorrências agrupadas (orquestrador e cada agente em um bloco coerente, sem repetições)',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_TIMELINE_V2',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_LEAN_ORCHESTRATION',
    label: 'Chat: Orquestração Enxuta',
    description: 'O orquestrador roda sem teto de tokens (ele comanda todo o trabalho) e sem resumidor automático; reduz movimento de agentes desnecessário e o passo extra de redação quando a skill já entregou. Em tarefas de PC, também pula a passada do crítico após uma ação determinística.',
    defaultEnabled: true,
    envVar: 'VITE_FF_CHAT_LEAN_ORCHESTRATION',
    devToggleable: true,
  },
  {
    key: 'FF_DOCUMENT_GENERATION_V4',
    label: 'Documento v4 (agente único + ferramentas)',
    description: 'Habilita o novo pipeline de documentos com um único agente que usa ferramentas em loop, em paralelo ao v3',
    defaultEnabled: false,
    envVar: 'VITE_FF_DOCUMENT_GENERATION_V4',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_ORCHESTRATOR_V2',
    label: 'Orquestrador do Chat v2 (grupo enxuto + ferramentas)',
    description: 'Habilita o orquestrador do Chat v2: um grupo pequeno de agentes (líder + trabalhador + crítico) que dirige o catálogo completo de ferramentas (mídia, web, PC) em loop, em paralelo ao v1',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_ORCHESTRATOR_V2',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_PC_APPROVALS',
    label: 'Chat: Aprovação real de ações no PC',
    description: 'Exige aprovação explícita do usuário antes de escrever, apagar, renomear ou executar comandos no PC via sidecar; grava auditoria de cada ação e mostra o status do sidecar ao vivo. Leituras seguem livres.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_PC_APPROVALS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_PC_GIT',
    label: 'Chat: Operações git no PC',
    description: 'Habilita as skills de git (status, diff, commit, pull, push) no sidecar local, sujeitas à mesma aprovação das ações de escrita/execução.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_PC_GIT',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_PC_DEVICES',
    label: 'Chat: Vários PCs e pastas',
    description: 'Permite parear vários PCs (ligar um por vez) e autorizar várias pastas por PC, com "permitir desta vez / permitir sempre / negar" e lista de autorizações revogável. Sem a flag, vale o pareamento único legado.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_PC_DEVICES',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_GITHUB',
    label: 'Chat: Conector GitHub',
    description: 'Habilita o conector GitHub (token PAT salvo nas configurações) para ler repositórios, criar issues/PRs e operar git autenticado via sidecar.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_GITHUB',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_AGENT_MODES',
    label: 'Chat: Modos de execução do agente',
    description: 'Habilita o seletor de modo por conversa (automático / sempre perguntar / planejar). Em "planejar", o agente estuda o pedido e entrega um plano estruturado (passos, arquivos, comandos) para aprovar, rejeitar ou revisar antes de executar.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_AGENT_MODES',
    devToggleable: true,
  },
  {
    key: 'FF_DESIGN_STUDIO',
    label: 'Design Studio',
    description: 'Habilita o Design Studio: gera slides, sites, apps (web/mobile), wireframes, documentos e animações a partir de um briefing, com temas, amostra ao vivo, edição manual, templates (importar/criar/exportar) e exportação em HTML, JSON e Markdown. Fases seguintes adicionam agente de IA, clonagem de designs por URL e aplicação em repositórios conectados.',
    defaultEnabled: false,
    envVar: 'VITE_FF_DESIGN_STUDIO',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_ENGINE_PLUS',
    label: 'Chat: Motor aprimorado',
    description: 'Crítico ciente de domínio e multi-eixo, teto de custo em USD por esforço, cache de prompt do sistema e memória rolante entre turnos.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_ENGINE_PLUS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_CONVO_TOOLS',
    label: 'Chat: Ferramentas de conversa',
    description: 'Exportar conversa (markdown/JSON), busca e organização (fixar/arquivar) na lista de conversas e timeout em perguntas pendentes.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_CONVO_TOOLS',
    devToggleable: true,
  },
  {
    key: 'FF_CHAT_GOOGLE',
    label: 'Chat: Conectores Google (Drive + Gmail)',
    description: 'Habilita os conectores Google Drive e Gmail via OAuth client-side (Google Identity Services). Exige um OAuth Client ID configurado. Leituras livres; criar rascunho no Gmail pede aprovação.',
    defaultEnabled: false,
    envVar: 'VITE_FF_CHAT_GOOGLE',
    devToggleable: true,
  },
  {
    key: 'FF_NOTEBOOK_STUDIO_QUALITY_GATE',
    label: 'Caderno: Gate de qualidade no Estúdio',
    description: 'Após a revisão, um crítico avalia o artefato (score 0-100); se ficar abaixo do limiar do tipo, força uma rodada de revisão guiada antes de entregar.',
    defaultEnabled: false,
    envVar: 'VITE_FF_NOTEBOOK_STUDIO_QUALITY_GATE',
    devToggleable: true,
  },
  {
    key: 'FF_NOTEBOOK_AUDIO_AUTO_TTS',
    label: 'Caderno: TTS automático no áudio',
    description: 'Ao gerar um roteiro de áudio (audio_script), sintetiza o MP3 automaticamente via TTS e o persiste no storage, em vez de exigir ação manual.',
    defaultEnabled: false,
    envVar: 'VITE_FF_NOTEBOOK_AUDIO_AUTO_TTS',
    devToggleable: true,
  },
  {
    key: 'FF_NOTEBOOK_STUDIO_V2',
    label: 'Caderno: Estúdio v2 (motor de refino iterativo)',
    description: 'Substitui o pipeline fixo de 3 etapas por um motor que refina o artefato em loop (rascunho → crítica → revisão) até atingir o limiar de qualidade, limitado por nº de iterações e teto de custo. Espelha o motor de documentos v4.',
    defaultEnabled: false,
    envVar: 'VITE_FF_NOTEBOOK_STUDIO_V2',
    devToggleable: true,
  },
  {
    key: 'FF_NOTEBOOK_STUDIO_VIDEO',
    label: 'Caderno: vídeo real no roteiro de vídeo',
    description: 'Ao gerar um roteiro de vídeo (video_script), produz o MP4 via provedor de vídeo externo (VITE_EXTERNAL_VIDEO_PROVIDER) e o persiste, injetando renderedVideoUrl para reprodução. Requer provedor configurado; best-effort.',
    defaultEnabled: false,
    envVar: 'VITE_FF_NOTEBOOK_STUDIO_VIDEO',
    devToggleable: true,
  },
]

// ── Storage key ───────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'lexio:ff:'
export const FEATURE_FLAGS_UPDATED_EVENT = 'lexio:feature_flags_updated'

let runtimeFlagOverrides: Record<string, boolean> = {}

function getSessionStorageFlagState(flagKey: string): { enabled: boolean; source: 'sessionStorage' } | null {
  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${flagKey}`)
    if (stored !== null) {
      return { enabled: stored === 'true', source: 'sessionStorage' }
    }
  } catch {
    // sessionStorage might be unavailable (SSR, test env)
  }

  return null
}

function getEnvOrDefaultFlagState(flagKey: string): {
  enabled: boolean
  source: 'env' | 'default'
} {
  const def = FEATURE_FLAGS.find(f => f.key === flagKey)
  if (def) {
    try {
      const envValue = (import.meta as unknown as Record<string, unknown>).env as Record<string, string | undefined> | undefined
      const envVal = envValue?.[def.envVar]
      if (envVal !== undefined) {
        return { enabled: envVal === 'true', source: 'env' }
      }
    } catch {
      // import.meta.env might not be available in all environments
    }
  }

  return { enabled: def?.defaultEnabled ?? false, source: 'default' }
}

function dispatchFeatureFlagsUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(FEATURE_FLAGS_UPDATED_EVENT))
  } catch {
    // Never break flag resolution because the UI event could not be emitted.
  }
}

export function sanitizeFeatureFlagMap(input: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const sanitized: Record<string, boolean> = {}
  if (!input) return sanitized

  for (const flag of FEATURE_FLAGS) {
    const raw = input[flag.key]
    if (typeof raw === 'boolean') {
      sanitized[flag.key] = raw
    }
  }

  return sanitized
}

export function setRuntimeFeatureFlags(flags: Record<string, unknown>): void {
  const next = sanitizeFeatureFlagMap(flags)
  const previousSerialized = JSON.stringify(runtimeFlagOverrides)
  const nextSerialized = JSON.stringify(next)
  runtimeFlagOverrides = next
  if (previousSerialized !== nextSerialized) {
    dispatchFeatureFlagsUpdated()
  }
}

export function clearRuntimeFeatureFlags(): void {
  if (Object.keys(runtimeFlagOverrides).length === 0) return
  runtimeFlagOverrides = {}
  dispatchFeatureFlagsUpdated()
}

// ── Resolution ────────────────────────────────────────────────────────────────

/**
 * Check if a feature flag is enabled.
 *
 * Priority: session storage override > runtime override > env var > default.
 */
export function isEnabled(flagKey: string): boolean {
  const sessionOverride = getSessionStorageFlagState(flagKey)
  if (sessionOverride) {
    return sessionOverride.enabled
  }

  // 2. User-scoped runtime override
  if (flagKey in runtimeFlagOverrides) {
    return runtimeFlagOverrides[flagKey]
  }

  return getEnvOrDefaultFlagState(flagKey).enabled
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
    dispatchFeatureFlagsUpdated()
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
    dispatchFeatureFlagsUpdated()
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the effective state and source of a flag (for debug UI).
 */
export function getFlagState(flagKey: string): {
  enabled: boolean
  source: FeatureFlagSource
} {
  const sessionOverride = getSessionStorageFlagState(flagKey)
  if (sessionOverride) {
    return sessionOverride
  }

  if (flagKey in runtimeFlagOverrides) {
    return { enabled: runtimeFlagOverrides[flagKey], source: 'runtime' }
  }

  return getEnvOrDefaultFlagState(flagKey)
}

/**
 * Resolve the inherited state of a flag without considering user runtime overrides.
 * Useful when the UI needs to reset a single flag back to session/env/default behavior.
 */
export function getNonRuntimeFlagState(flagKey: string): {
  enabled: boolean
  source: Exclude<FeatureFlagSource, 'runtime'>
} {
  const sessionOverride = getSessionStorageFlagState(flagKey)
  if (sessionOverride) {
    return sessionOverride
  }

  return getEnvOrDefaultFlagState(flagKey)
}

/**
 * List all flags with their current state (useful for debug panel).
 */
export function listAllFlags(): Array<FeatureFlagDefinition & { enabled: boolean; source: FeatureFlagSource }> {
  return FEATURE_FLAGS.map(def => ({
    ...def,
    ...getFlagState(def.key),
  }))
}