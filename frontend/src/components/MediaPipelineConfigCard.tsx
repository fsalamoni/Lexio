/**
 * Media Pipeline Config Card — Admin Panel section for configuring
 * which LLM model each agent of the media production pipelines uses.
 *
 * Three groups: Video (7 agents), Audio (5 agents), Presentation (5 agents).
 * Follows the same design pattern as ResearchNotebookConfigCard.
 */

import { useEffect, useState } from 'react'
import {
  Film,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Brain,
  RefreshCw,
  Cpu,
  Coins,
  ChevronRight,
  ClipboardList,
  FileText,
  Layout,
  ZoomIn,
  Video,
  Layers,
  ClipboardCheck,
  Mic,
  Image,
  Palette,
} from 'lucide-react'
import {
  VIDEO_PIPELINE_AGENT_DEFS,
  AUDIO_PIPELINE_AGENT_DEFS,
  PRESENTATION_PIPELINE_AGENT_DEFS,
  ALL_MEDIA_PIPELINE_AGENT_DEFS,
  type MediaPipelineModelMap,
  type ModelOption,
  loadMediaPipelineModels,
  saveMediaPipelineModels,
  getDefaultMediaPipelineModelMap,
  resetMediaPipelineModels,
} from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'
import ModelSelectorModal from './ModelSelectorModal'

// ── Icon mapping ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  'clipboard-list':  ClipboardList,
  'file-text':       FileText,
  'layout':          Layout,
  'zoom-in':         ZoomIn,
  'video':           Video,
  'layers':          Layers,
  'clipboard-check': ClipboardCheck,
  'mic':             Mic,
  'image':           Image,
  'palette':         Palette,
}

// ── Modality badge labels ─────────────────────────────────────────────────────

const MODALITY_BADGE_LABELS: Record<string, string> = {
  video: 'Requer: Vídeo IA',
  tts:   'Requer: TTS / Voz',
  image: 'Requer: Imagem IA',
  audio: 'Requer: Áudio IA',
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido'       },
  balanced: { bg: 'bg-teal-50',    text: 'text-teal-700',    label: 'Equilibrado'  },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium'      },
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

export default function MediaPipelineConfigCard() {
  const catalogModels = useCatalogModels()
  const [models, setModels]     = useState<MediaPipelineModelMap>({})
  const [original, setOriginal] = useState<MediaPipelineModelMap>({})
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  // Modal state
  const [modalOpen,      setModalOpen]      = useState(false)
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null)

  useEffect(() => {
    loadMediaPipelineModels()
      .then(m => { setModels(m); setOriginal(m) })
      .catch(() => {
        const d = getDefaultMediaPipelineModelMap()
        setModels(d)
        setOriginal(d)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanges     = JSON.stringify(models) !== JSON.stringify(original)
  const defaults       = getDefaultMediaPipelineModelMap()
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
      await saveMediaPipelineModels(models)
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
      await resetMediaPipelineModels()
      const d = getDefaultMediaPipelineModelMap()
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
    ? ALL_MEDIA_PIPELINE_AGENT_DEFS.find(a => a.key === activeAgentKey)
    : null

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6 mb-6">
        <p className="text-gray-400 text-sm">Carregando configuração de Produção de Mídia...</p>
      </div>
    )
  }

  // ── Render a group of agents ──────────────────────────────────────────────

  const renderAgentGroup = (
    agents: typeof VIDEO_PIPELINE_AGENT_DEFS,
    colorScheme: { border: string; bg: string; iconBg: string; iconText: string; hover: string; arrow: string },
  ) => (
    <div className="space-y-0 mb-6">
      {agents.map((agent, idx) => {
        const Icon           = AGENT_ICONS[agent.icon] ?? Brain
        const currentModelId = models[agent.key] ?? agent.defaultModel
        const currentModel   = getModelOption(currentModelId)
        const isDefault      = currentModelId === agent.defaultModel
        const tierStyle      = currentModel
          ? TIER_STYLES[currentModel.tier]
          : TIER_STYLES[agent.recommendedTier]
        const isLast = idx === agents.length - 1

        return (
          <div key={agent.key}>
            <div className={`relative rounded-lg border p-4 transition-colors ${
              !isDefault ? `${colorScheme.border} ${colorScheme.bg}` : 'border-gray-200 bg-white'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  !isDefault ? colorScheme.iconBg : 'bg-gray-100'
                }`}>
                  <Icon className={`w-4 h-4 ${!isDefault ? colorScheme.iconText : 'text-gray-600'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                    {agent.requiredModality && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                        {MODALITY_BADGE_LABELS[agent.requiredModality] ?? `Requer: ${agent.requiredModality}`}
                      </span>
                    )}
                    {!isDefault && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">
                        customizado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-1">{agent.description}</p>

                  {/* Model note in amber */}
                  {agent.modelNote && (
                    <p className="text-[11px] text-amber-600 mb-2">{agent.modelNote}</p>
                  )}

                  {/* Model selector button */}
                  <button
                    type="button"
                    onClick={() => openModal(agent.key)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${colorScheme.hover} ${
                      !isDefault
                        ? `${colorScheme.border} bg-white`
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

            {/* Pipeline arrow */}
            {!isLast && (
              <div className="flex justify-center py-1">
                <ArrowDown className={`w-4 h-4 ${colorScheme.arrow}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ── Color schemes per group ───────────────────────────────────────────────

  const videoColors = {
    border:   'border-violet-200',
    bg:       'bg-violet-50/30',
    iconBg:   'bg-violet-100',
    iconText: 'text-violet-600',
    hover:    'hover:border-violet-300 hover:bg-violet-50/50',
    arrow:    'text-violet-300',
  }

  const audioColors = {
    border:   'border-fuchsia-200',
    bg:       'bg-fuchsia-50/30',
    iconBg:   'bg-fuchsia-100',
    iconText: 'text-fuchsia-600',
    hover:    'hover:border-fuchsia-300 hover:bg-fuchsia-50/50',
    arrow:    'text-fuchsia-300',
  }

  const presentationColors = {
    border:   'border-purple-200',
    bg:       'bg-purple-50/30',
    iconBg:   'bg-purple-100',
    iconText: 'text-purple-600',
    hover:    'hover:border-purple-300 hover:bg-purple-50/50',
    arrow:    'text-purple-300',
  }

  return (
    <>
      <div className="bg-white rounded-xl border mb-6 overflow-hidden">
        {/* Header — collapsible */}
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Film className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Produção de Mídia</h2>
              <p className="text-sm text-gray-500">Configure os modelos para pipelines de geração de vídeo, áudio e apresentações avançadas</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasNonDefaults && (
              <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                Personalizado
              </span>
            )}
            {expanded
              ? <ChevronUp className="w-5 h-5 text-gray-400" />
              : <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="px-6 pb-6">
            {/* ── Video Pipeline ── */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Video className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-gray-700">Pipeline de Vídeo</span>
              <span className="text-xs text-gray-400 ml-auto">{VIDEO_PIPELINE_AGENT_DEFS.length} agentes</span>
            </div>

            <div className="p-3 mb-4 bg-violet-50 border border-violet-200 rounded-lg">
              <p className="text-xs text-violet-800">
                <strong>Pipeline de Vídeo:</strong> Planejador cria o roteiro e estrutura →
                Roteirista escreve cenas e diálogos →
                Storyboarder define composição visual →
                Detalhista de Cena expande prompts →
                <strong> Gerador de Cena</strong> (IA de Vídeo) produz cada cena →
                Compositor organiza a edição final →
                Revisor verifica qualidade.
              </p>
            </div>

            {renderAgentGroup(VIDEO_PIPELINE_AGENT_DEFS, videoColors)}

            {/* ── Audio Pipeline ── */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Mic className="w-4 h-4 text-fuchsia-500" />
              <span className="text-sm font-semibold text-gray-700">Pipeline de Áudio</span>
              <span className="text-xs text-gray-400 ml-auto">{AUDIO_PIPELINE_AGENT_DEFS.length} agentes</span>
            </div>

            <div className="p-3 mb-4 bg-fuchsia-50 border border-fuchsia-200 rounded-lg">
              <p className="text-xs text-fuchsia-800">
                <strong>Pipeline de Áudio:</strong> Planejador define roteiro e vozes →
                Roteirista escreve narração e diálogos →
                Detalhista prepara segmentos para TTS →
                <strong> Gerador de Voz</strong> (TTS) converte texto em áudio →
                Revisor verifica qualidade.
              </p>
            </div>

            {renderAgentGroup(AUDIO_PIPELINE_AGENT_DEFS, audioColors)}

            {/* ── Presentation Pipeline ── */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <Image className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-gray-700">Pipeline de Apresentação</span>
              <span className="text-xs text-gray-400 ml-auto">{PRESENTATION_PIPELINE_AGENT_DEFS.length} agentes</span>
            </div>

            <div className="p-3 mb-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-800">
                <strong>Pipeline de Apresentação:</strong> Planejador define estrutura e seções →
                Designer cria tema visual e layout →
                Conteudista redige textos e bullets →
                <strong> Gerador de Visuais</strong> (IA de Imagem) produz ilustrações →
                Revisor verifica coerência.
              </p>
            </div>

            {renderAgentGroup(PRESENTATION_PIPELINE_AGENT_DEFS, presentationColors)}

            {/* Info box */}
            <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
              <p className="text-xs text-violet-800">
                <strong>Sobre estes agentes:</strong> A Produção de Mídia conta com {ALL_MEDIA_PIPELINE_AGENT_DEFS.length} agentes especializados em três pipelines.
                <strong> Vídeo</strong> — 7 agentes incluindo geração de cenas por IA de vídeo.
                <strong> Áudio</strong> — 5 agentes incluindo conversão text-to-speech.
                <strong> Apresentação</strong> — 5 agentes incluindo geração de imagens por IA.
                Agentes com badge de modalidade requerem modelos específicos (não modelos de texto).
                Modelos <strong>✦ Grátis</strong> são uma ótima opção para agentes de texto.
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
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
          </div>
        )}
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
          requiredModality={activeAgentDef.requiredModality}
          modelNote={activeAgentDef.modelNote}
        />
      )}
    </>
  )
}
