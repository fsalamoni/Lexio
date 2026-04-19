import { useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDown,
  Brain,
  CheckCircle2,
  ChevronRight,
  Coins,
  Cpu,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react'
import type { AgentCategory, ModelCapability, ModelOption } from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'
import ModelSelectorModal from './ModelSelectorModal'

export interface AgentModelConfigDef {
  key: string
  label: string
  description: string
  icon: string
  defaultModel: string
  recommendedTier: ModelOption['tier']
  agentCategory: AgentCategory
  requiredCapability?: ModelCapability
  bestModelNote?: string
}

export interface AgentModelConfigTone {
  headerIcon: string
  customCard: string
  customIconSurface: string
  customIcon: string
  customBadge: string
  customSelector: string
  selectorHover: string
  noteText: string
  infoBox: string
  primaryButton: string
  connector: string
}

export interface AgentModelConfigSection {
  id: string
  title: string
  titleIcon: ElementType
  subtitle?: string
  agents: readonly AgentModelConfigDef[]
  tone: AgentModelConfigTone
  showIndex?: boolean
  beforeContent?: ReactNode
  afterContent?: ReactNode
}

interface AgentModelConfigCardProps<T extends Record<string, string>> {
  loadingMessage: string
  sections: AgentModelConfigSection[]
  agentIcons: Record<string, ElementType>
  loadModels: () => Promise<T>
  saveModels: (models: T) => Promise<void>
  resetModels: () => Promise<void>
  getDefaultModels: () => T
  afterSections?: ReactNode
}

const TIER_STYLES: Record<ModelOption['tier'], { badge: string; label: string }> = {
  fast: { badge: 'bg-emerald-50 text-emerald-700', label: 'Rápido' },
  balanced: { badge: 'bg-teal-50 text-teal-700', label: 'Equilibrado' },
  premium: { badge: 'bg-amber-50 text-amber-700', label: 'Premium' },
}

const CAPABILITY_BADGES: Record<ModelCapability, { badge: string; label: string }> = {
  text: { badge: 'bg-slate-100 text-slate-700', label: '📝 Requer Texto' },
  image: { badge: 'bg-pink-100 text-pink-700', label: '🖼️ Requer Imagem' },
  audio: { badge: 'bg-violet-100 text-violet-700', label: '🔊 Requer Áudio' },
  video: { badge: 'bg-red-100 text-red-700', label: '🎬 Requer Vídeo' },
}

const AGENT_CARD_BASE = 'rounded-[1.35rem] border p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] transition-colors'
const AGENT_CARD_DEFAULT = 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)]'
const ICON_SURFACE_DEFAULT = 'bg-[rgba(15,23,42,0.08)]'
const ICON_DEFAULT = 'text-[var(--v2-ink-soft)]'
const SELECTOR_BASE = 'w-full rounded-[1rem] border px-3 py-2 text-left text-sm transition-all hover:-translate-y-[1px]'
const SELECTOR_DEFAULT = 'border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.88)]'
const SAVE_BUTTON_BASE = 'inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(15,23,42,0.12)] transition-colors disabled:cursor-not-allowed disabled:opacity-40'

export const V2_AGENT_CONFIG_INFO_BOX_BASE = 'rounded-[1.15rem] border p-3 text-xs leading-6'
export const V2_AGENT_CONFIG_PANEL_BASE = 'rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3 text-xs text-[var(--v2-ink-strong)]'

export const V2_AGENT_CONFIG_TONES = {
  brand: {
    headerIcon: 'text-brand-600',
    customCard: 'border-purple-200 bg-[rgba(147,51,234,0.08)]',
    customIconSurface: 'bg-purple-100',
    customIcon: 'text-purple-600',
    customBadge: 'bg-purple-100 text-purple-700',
    customSelector: 'border-purple-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-purple-300 hover:bg-[rgba(147,51,234,0.08)]',
    noteText: 'text-purple-700',
    infoBox: 'border-blue-200 bg-[rgba(59,130,246,0.08)] text-blue-900',
    primaryButton: 'bg-brand-600 hover:bg-brand-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  teal: {
    headerIcon: 'text-teal-600',
    customCard: 'border-teal-200 bg-[rgba(13,148,136,0.08)]',
    customIconSurface: 'bg-teal-100',
    customIcon: 'text-teal-600',
    customBadge: 'bg-teal-100 text-teal-700',
    customSelector: 'border-teal-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-teal-300 hover:bg-[rgba(13,148,136,0.08)]',
    noteText: 'text-teal-700',
    infoBox: 'border-teal-200 bg-[rgba(13,148,136,0.08)] text-teal-900',
    primaryButton: 'bg-teal-600 hover:bg-teal-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  purple: {
    headerIcon: 'text-purple-600',
    customCard: 'border-purple-200 bg-[rgba(147,51,234,0.08)]',
    customIconSurface: 'bg-purple-100',
    customIcon: 'text-purple-600',
    customBadge: 'bg-purple-100 text-purple-700',
    customSelector: 'border-purple-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-purple-300 hover:bg-[rgba(147,51,234,0.08)]',
    noteText: 'text-purple-700',
    infoBox: 'border-purple-200 bg-[rgba(147,51,234,0.08)] text-purple-900',
    primaryButton: 'bg-purple-600 hover:bg-purple-700',
    connector: 'text-purple-300',
  },
  indigo: {
    headerIcon: 'text-indigo-600',
    customCard: 'border-indigo-200 bg-[rgba(99,102,241,0.08)]',
    customIconSurface: 'bg-indigo-100',
    customIcon: 'text-indigo-600',
    customBadge: 'bg-indigo-100 text-indigo-700',
    customSelector: 'border-indigo-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-indigo-300 hover:bg-[rgba(99,102,241,0.08)]',
    noteText: 'text-indigo-700',
    infoBox: 'border-indigo-200 bg-[rgba(99,102,241,0.08)] text-indigo-900',
    primaryButton: 'bg-indigo-600 hover:bg-indigo-700',
    connector: 'text-indigo-300',
  },
  rose: {
    headerIcon: 'text-rose-600',
    customCard: 'border-rose-200 bg-[rgba(244,63,94,0.08)]',
    customIconSurface: 'bg-rose-100',
    customIcon: 'text-rose-600',
    customBadge: 'bg-rose-100 text-rose-700',
    customSelector: 'border-rose-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-rose-300 hover:bg-[rgba(244,63,94,0.08)]',
    noteText: 'text-rose-700',
    infoBox: 'border-rose-200 bg-[rgba(244,63,94,0.08)] text-rose-900',
    primaryButton: 'bg-rose-600 hover:bg-rose-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  violet: {
    headerIcon: 'text-violet-600',
    customCard: 'border-violet-200 bg-[rgba(139,92,246,0.08)]',
    customIconSurface: 'bg-violet-100',
    customIcon: 'text-violet-600',
    customBadge: 'bg-violet-100 text-violet-700',
    customSelector: 'border-violet-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-violet-300 hover:bg-[rgba(139,92,246,0.08)]',
    noteText: 'text-violet-700',
    infoBox: 'border-violet-200 bg-[rgba(139,92,246,0.08)] text-violet-900',
    primaryButton: 'bg-violet-600 hover:bg-violet-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  sky: {
    headerIcon: 'text-sky-600',
    customCard: 'border-sky-200 bg-[rgba(14,165,233,0.08)]',
    customIconSurface: 'bg-sky-100',
    customIcon: 'text-sky-600',
    customBadge: 'bg-sky-100 text-sky-700',
    customSelector: 'border-sky-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-sky-300 hover:bg-[rgba(14,165,233,0.08)]',
    noteText: 'text-sky-700',
    infoBox: 'border-sky-200 bg-[rgba(14,165,233,0.08)] text-sky-900',
    primaryButton: 'bg-sky-600 hover:bg-sky-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  emerald: {
    headerIcon: 'text-emerald-600',
    customCard: 'border-emerald-200 bg-[rgba(16,185,129,0.08)]',
    customIconSurface: 'bg-emerald-100',
    customIcon: 'text-emerald-600',
    customBadge: 'bg-emerald-100 text-emerald-700',
    customSelector: 'border-emerald-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-emerald-300 hover:bg-[rgba(16,185,129,0.08)]',
    noteText: 'text-emerald-700',
    infoBox: 'border-emerald-200 bg-[rgba(16,185,129,0.08)] text-emerald-900',
    primaryButton: 'bg-emerald-600 hover:bg-emerald-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
  blue: {
    headerIcon: 'text-blue-600',
    customCard: 'border-blue-200 bg-[rgba(59,130,246,0.08)]',
    customIconSurface: 'bg-blue-100',
    customIcon: 'text-blue-600',
    customBadge: 'bg-blue-100 text-blue-700',
    customSelector: 'border-blue-200 bg-[rgba(255,255,255,0.92)]',
    selectorHover: 'hover:border-blue-300 hover:bg-[rgba(59,130,246,0.08)]',
    noteText: 'text-blue-700',
    infoBox: 'border-blue-200 bg-[rgba(59,130,246,0.08)] text-blue-900',
    primaryButton: 'bg-blue-600 hover:bg-blue-700',
    connector: 'text-[rgba(15,23,42,0.18)]',
  },
} satisfies Record<string, AgentModelConfigTone>

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000) return `${tokens / 1_000}K`
  return String(tokens)
}

function formatCost(usd: number): string {
  if (usd === 0) return 'Grátis'
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

export default function AgentModelConfigCard<T extends Record<string, string>>({
  loadingMessage,
  sections,
  agentIcons,
  loadModels,
  saveModels,
  resetModels,
  getDefaultModels,
  afterSections,
}: AgentModelConfigCardProps<T>) {
  const catalogModels = useCatalogModels()
  const defaults = useMemo(() => getDefaultModels(), [getDefaultModels])
  const [models, setModels] = useState<T>(defaults)
  const [original, setOriginal] = useState<T>(defaults)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    setLoading(true)
    loadModels()
      .then((loadedModels) => {
        if (ignore) return
        setModels(loadedModels)
        setOriginal(loadedModels)
      })
      .catch(() => {
        if (ignore) return
        setModels(defaults)
        setOriginal(defaults)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [defaults, loadModels])

  const hasChanges = JSON.stringify(models) !== JSON.stringify(original)
  const hasNonDefaults = JSON.stringify(models) !== JSON.stringify(defaults)
  const allAgents = sections.flatMap(section => section.agents)
  const actionTone = sections[0]?.tone ?? V2_AGENT_CONFIG_TONES.teal
  const activeAgentDef = activeAgentKey ? allAgents.find(agent => agent.key === activeAgentKey) ?? null : null

  const getModelOption = (modelId: string): ModelOption | undefined =>
    catalogModels.find(model => model.id === modelId)

  const handleModelChange = (agentKey: string, modelId: string) => {
    setModels(previous => ({ ...previous, [agentKey]: modelId }))
    setSaved(false)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveModels(models)
      setOriginal({ ...models })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : 'Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setError(null)
    try {
      await resetModels()
      setModels(defaults)
      setOriginal(defaults)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : 'Erro ao restaurar configurações.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm text-[var(--v2-ink-faint)]">
        {loadingMessage}
      </div>
    )
  }

  return (
    <>
      {sections.map((section, sectionIndex) => {
        const SectionIcon = section.titleIcon

        return (
          <section key={section.id} className={sectionIndex === 0 ? '' : 'mt-8'}>
            <div className="mb-4 flex items-center gap-2 border-b border-[var(--v2-line-soft)] pb-3">
              <SectionIcon className={`h-4 w-4 ${section.tone.headerIcon}`} />
              <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{section.title}</span>
              {section.subtitle ? (
                <span className="ml-auto text-xs text-[var(--v2-ink-faint)]">{section.subtitle}</span>
              ) : null}
            </div>

            {section.beforeContent ? <div className="mb-4 space-y-3">{section.beforeContent}</div> : null}

            <div className="space-y-0">
              {section.agents.map((agent, index) => {
                const Icon = agentIcons[agent.icon] ?? Brain
                const currentModelId = models[agent.key] ?? agent.defaultModel
                const currentModel = getModelOption(currentModelId)
                const isDefault = currentModelId === agent.defaultModel
                const isLast = index === section.agents.length - 1
                const tierStyle = currentModel ? TIER_STYLES[currentModel.tier] : TIER_STYLES[agent.recommendedTier]
                const capabilityBadge = agent.requiredCapability ? CAPABILITY_BADGES[agent.requiredCapability] : null

                return (
                  <div key={agent.key}>
                    <div className={`${AGENT_CARD_BASE} ${isDefault ? AGENT_CARD_DEFAULT : section.tone.customCard}`}>
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[1rem] ${isDefault ? ICON_SURFACE_DEFAULT : section.tone.customIconSurface}`}>
                          <Icon className={`h-4 w-4 ${isDefault ? ICON_DEFAULT : section.tone.customIcon}`} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{agent.label}</span>
                            {section.showIndex ? (
                              <span className="text-xs text-[var(--v2-ink-faint)]">#{index + 1}</span>
                            ) : null}
                            {capabilityBadge ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${capabilityBadge.badge}`}>
                                {capabilityBadge.label}
                              </span>
                            ) : null}
                            {!isDefault ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${section.tone.customBadge}`}>
                                customizado
                              </span>
                            ) : null}
                          </div>

                          <p className="text-xs text-[var(--v2-ink-soft)]">{agent.description}</p>
                          {agent.bestModelNote ? (
                            <p className={`mt-1 text-[11px] italic ${section.tone.noteText}`}>{agent.bestModelNote}</p>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => {
                              setActiveAgentKey(agent.key)
                              setModalOpen(true)
                            }}
                            className={`${SELECTOR_BASE} ${isDefault ? SELECTOR_DEFAULT : section.tone.customSelector} ${section.tone.selectorHover} mt-3`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${tierStyle.badge}`}>
                                  {tierStyle.label}
                                </span>
                                {currentModel?.isFree ? (
                                  <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 whitespace-nowrap">
                                    ✦ GRÁTIS
                                  </span>
                                ) : null}
                                <span className="truncate font-medium text-[var(--v2-ink-strong)]">
                                  {currentModel?.label ?? currentModelId}
                                </span>
                                <span className="hidden truncate text-xs text-[var(--v2-ink-faint)] sm:block">
                                  {currentModel?.provider}
                                </span>
                              </div>

                              <div className="flex flex-shrink-0 items-center gap-3">
                                {currentModel ? (
                                  <span className="flex items-center gap-1 text-[11px] text-[var(--v2-ink-soft)]">
                                    <Cpu className="h-3 w-3" />
                                    {formatContext(currentModel.contextWindow)}
                                  </span>
                                ) : null}
                                {currentModel ? (
                                  <span className={`flex items-center gap-1 text-[11px] ${currentModel.isFree ? 'font-semibold text-green-600' : 'text-[var(--v2-ink-soft)]'}`}>
                                    <Coins className="h-3 w-3" />
                                    {formatCost(currentModel.inputCost)}
                                  </span>
                                ) : null}
                                <ChevronRight className="h-4 w-4 text-[var(--v2-ink-faint)]" />
                              </div>
                            </div>
                          </button>

                          {currentModel ? (
                            <p className="mt-1 text-[11px] leading-5 text-[var(--v2-ink-faint)]">{currentModel.description}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {!isLast ? (
                      <div className="flex justify-center py-1">
                        <ArrowDown className={`h-4 w-4 ${section.tone.connector}`} />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {section.afterContent ? <div className="mt-4 space-y-3">{section.afterContent}</div> : null}
          </section>
        )
      })}

      {afterSections ? <div className="mt-4 space-y-3">{afterSections}</div> : null}

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-[1.15rem] border border-red-200 bg-[rgba(254,226,226,0.72)] p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--v2-line-soft)] pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`${SAVE_BUTTON_BASE} ${actionTone.primaryButton}`}
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : saved && !hasChanges ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Salvo!
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Salvar configurações
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={saving || !hasNonDefaults}
          className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar padrões
        </button>

        {hasChanges && !saved ? (
          <span className="ml-auto text-xs font-semibold text-amber-700">Alterações não salvas</span>
        ) : null}
      </div>

      {activeAgentDef ? (
        <ModelSelectorModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={(modelId) => handleModelChange(activeAgentDef.key, modelId)}
          currentModelId={models[activeAgentDef.key] ?? activeAgentDef.defaultModel}
          agentCategory={activeAgentDef.agentCategory}
          agentLabel={activeAgentDef.label}
          requiredCapability={activeAgentDef.requiredCapability}
        />
      ) : null}
    </>
  )
}