/**
 * Presentation Pipeline Config Card — Admin Panel section for configuring
 * which LLM model each agent of the presentation generation pipeline uses.
 *
 * Follows the same design pattern as ThesisAnalystConfigCard but targets the
 * PRESENTATION_PIPELINE_AGENT_DEFS and presentation_pipeline_models Firestore key.
 */

import { useEffect, useState } from 'react'
import {
  Presentation,
  Save,
  RotateCcw,

  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Brain,
  ClipboardCheck,
  FileText,
  Search,
  PenTool,
  Cpu,
  Coins,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import {
  PRESENTATION_PIPELINE_AGENT_DEFS,
  type PresentationPipelineModelMap,
  type ModelOption,
  loadPresentationPipelineModels,
  savePresentationPipelineModels,
  getDefaultPresentationPipelineModelMap,
  resetPresentationPipelineModels,
} from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'
import ModelSelectorModal from './ModelSelectorModal'

// ── Icon mapping ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  'clipboard-check': ClipboardCheck,
  'file-text':       FileText,
  'search':          Search,
  'pen-tool':        PenTool,
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido'       },
  balanced: { bg: 'bg-teal-50',    text: 'text-teal-700',    label: 'Equilibrado'  },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium'      },
}

const CAPABILITY_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  text:  { bg: 'bg-slate-100',  text: 'text-slate-700',  label: '📝 Requer Texto'  },
  image: { bg: 'bg-pink-100',   text: 'text-pink-700',   label: '🖼️ Requer Imagem' },
  audio: { bg: 'bg-violet-100', text: 'text-violet-700', label: '🔊 Requer Áudio'  },
  video: { bg: 'bg-red-100',    text: 'text-red-700',    label: '🎬 Requer Vídeo'  },
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`
  if (tokens >= 1_000)     return `${tokens / 1_000}K`
  return String(tokens)
}

function formatCost(usd: number): string {
  if (usd === 0) return 'Grátis'
  if (usd < 1)   return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PresentationPipelineConfigCard() {
  const catalogModels = useCatalogModels()
  const [models, setModels]     = useState<PresentationPipelineModelMap>({})
  const [original, setOriginal] = useState<PresentationPipelineModelMap>({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  // Modal state
  const [modalOpen,      setModalOpen]      = useState(false)
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null)

  useEffect(() => {
    loadPresentationPipelineModels()
      .then(m => { setModels(m); setOriginal(m) })
      .catch(() => {
        const d = getDefaultPresentationPipelineModelMap()
        setModels(d)
        setOriginal(d)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanges    = JSON.stringify(models) !== JSON.stringify(original)
  const defaults      = getDefaultPresentationPipelineModelMap()
  const hasNonDefaults = JSON.stringify(models) !== JSON.stringify(defaults)

  const handleModelChange = (agentKey: string, modelId: string) => {
    setModels(prev => ({ ...prev, [agentKey]: modelId }))
    setSaved(false)
    setError(null)
  }

  const openModal = (agentKey: string) => {
    setActiveAgentKey(agentKey)
    setModalOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await savePresentationPipelineModels(models)
      setOriginal({ ...models })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setError(null)
    try {
      await resetPresentationPipelineModels()
      const d = getDefaultPresentationPipelineModelMap()
      setModels(d)
      setOriginal(d)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao restaurar configurações.')
    } finally {
      setSaving(false)
    }
  }

  const getModelOption = (modelId: string): ModelOption | undefined =>
    catalogModels.find(m => m.id === modelId)

  const activeAgentDef = activeAgentKey
    ? PRESENTATION_PIPELINE_AGENT_DEFS.find(a => a.key === activeAgentKey)
    : null

  if (loading) {
    return <p className="text-gray-400 text-sm">Carregando configuração do Pipeline de Apresentação...</p>
  }

  return (
    <>
      {/* Pipeline header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Presentation className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-semibold text-gray-700">Trilha Multiagente de Apresentação</span>
              <span className="text-xs text-gray-400 ml-auto">5 agentes · criação de apresentação profissional</span>
            </div>

            {/* Agent flow */}
            <div className="space-y-0">
              {PRESENTATION_PIPELINE_AGENT_DEFS.map((agent, idx) => {
                const Icon         = AGENT_ICONS[agent.icon] ?? Brain
                const currentModelId = models[agent.key] ?? agent.defaultModel
                const currentModel = getModelOption(currentModelId)
                const isDefault    = currentModelId === agent.defaultModel
                const isLast       = idx === PRESENTATION_PIPELINE_AGENT_DEFS.length - 1
                const tierStyle    = currentModel
                  ? TIER_STYLES[currentModel.tier]
                  : TIER_STYLES[agent.recommendedTier]
                const capBadge = agent.requiredCapability
                  ? CAPABILITY_BADGE[agent.requiredCapability]
                  : null

                return (
                  <div key={agent.key}>
                    <div className={`relative rounded-lg border p-4 transition-colors ${
                      !isDefault ? 'border-sky-200 bg-sky-50/30' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          !isDefault ? 'bg-sky-100' : 'bg-gray-100'
                        }`}>
                          <Icon className={`w-4 h-4 ${!isDefault ? 'text-sky-600' : 'text-gray-600'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                            <span className="text-xs text-gray-400">#{idx + 1}</span>
                            {capBadge && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${capBadge.bg} ${capBadge.text}`}>
                                {capBadge.label}
                              </span>
                            )}
                            {!isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-600 font-medium">
                                customizado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mb-1">{agent.description}</p>
                          {agent.bestModelNote && (
                            <p className="text-[11px] italic text-sky-600 mb-2">{agent.bestModelNote}</p>
                          )}

                          {/* Model selector button */}
                          <button
                            type="button"
                            onClick={() => openModal(agent.key)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:border-sky-300 hover:bg-sky-50/50 ${
                              !isDefault
                                ? 'border-sky-200 bg-white'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {tierStyle && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 ${tierStyle.bg} ${tierStyle.text}`}>
                                  {tierStyle.label}
                                </span>
                              )}
                              {currentModel?.isFree && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold whitespace-nowrap flex-shrink-0">
                                  ✦ GRÁTIS
                                </span>
                              )}
                              <span className="font-medium text-gray-900 truncate">
                                {currentModel?.label ?? currentModelId}
                              </span>
                              <span className="text-gray-400 text-xs truncate hidden sm:block">
                                {currentModel?.provider}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {currentModel && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                  <Cpu className="w-3 h-3" />
                                  {formatContext(currentModel.contextWindow)}
                                </span>
                              )}
                              {currentModel && (
                                <span className={`flex items-center gap-1 text-[11px] ${currentModel.isFree ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                                  <Coins className="w-3 h-3" />
                                  {formatCost(currentModel.inputCost)}
                                </span>
                              )}
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </div>
                          </button>

                          {currentModel && (
                            <p className="text-[11px] text-gray-400 mt-1">{currentModel.description}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isLast && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Info box */}
            <div className="mt-4 p-3 bg-sky-50 border border-sky-200 rounded-lg">
              <p className="text-xs text-sky-800">
                <strong>💡 Informações:</strong> Para etapas de design visual, <strong>modelos de geração de
                imagem</strong> produzem resultados muito melhores, criando assets visuais reais para os slides.
                Modelos somente de texto geram apenas <strong>descrições de layout</strong>, sem imagens ou
                gráficos reais. O agente <strong>Designer</strong> marcado com ⚠️ requer modelo de imagem.
              </p>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t">
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {saving
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando...</>
                  : saved && !hasChanges
                    ? <><CheckCircle2 className="w-4 h-4" /> Salvo!</>
                    : <><Save className="w-4 h-4" /> Salvar configurações</>
                }
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving || !hasNonDefaults}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar padrões
              </button>
            </div>

      {/* Model selector modal */}
      {activeAgentDef && (
        <ModelSelectorModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={modelId => handleModelChange(activeAgentDef.key, modelId)}
          currentModelId={models[activeAgentDef.key] ?? activeAgentDef.defaultModel}
          agentCategory={activeAgentDef.agentCategory}
          agentLabel={activeAgentDef.label}
          requiredCapability={activeAgentDef.requiredCapability}
        />
      )}
    </>
  )
}
