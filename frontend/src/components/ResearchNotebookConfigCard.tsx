/**
 * Research Notebook Config Card — Admin Panel section for configuring
 * which LLM model each agent of the "Caderno de Pesquisa" pipeline uses.
 *
 * Follows the same design pattern as ThesisAnalystConfigCard but targets
 * RESEARCH_NOTEBOOK_AGENT_DEFS and research_notebook_models Firestore key.
 */

import { useEffect, useState } from 'react'
import {
  BookOpen,
  Save,
  RotateCcw,

  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Brain,
  Search,
  MessageCircle,
  FileText,
  RefreshCw,
  Cpu,
  Coins,
  ChevronRight,
  Mic,
  PenTool,
  Image,
  ClipboardCheck,
  BarChart2,
} from 'lucide-react'
import {
  RESEARCH_NOTEBOOK_AGENT_DEFS,
  type ResearchNotebookModelMap,
  type ModelOption,
  loadResearchNotebookModels,
  saveResearchNotebookModels,
  getDefaultResearchNotebookModelMap,
  resetResearchNotebookModels,
} from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'
import ModelSelectorModal from './ModelSelectorModal'

// ── Icon mapping ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  'search':          Search,
  'brain':           Brain,
  'message-circle':  MessageCircle,
  'file-text':       FileText,
  'mic':             Mic,
  'pen-tool':        PenTool,
  'image':           Image,
  'clipboard-check': ClipboardCheck,
  'bar-chart-2':     BarChart2,
}

/** Agent keys that belong to the Studio group */
const STUDIO_AGENT_KEYS = new Set([
  'studio_pesquisador', 'studio_escritor', 'studio_roteirista',
  'studio_visual', 'studio_revisor',
])

const RESEARCH_AGENTS = RESEARCH_NOTEBOOK_AGENT_DEFS.filter(a => !STUDIO_AGENT_KEYS.has(a.key))
const STUDIO_AGENTS   = RESEARCH_NOTEBOOK_AGENT_DEFS.filter(a => STUDIO_AGENT_KEYS.has(a.key))

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

export default function ResearchNotebookConfigCard() {
  const catalogModels = useCatalogModels()
  const [models, setModels]     = useState<ResearchNotebookModelMap>({})
  const [original, setOriginal] = useState<ResearchNotebookModelMap>({})
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  // Modal state
  const [modalOpen,      setModalOpen]      = useState(false)
  const [activeAgentKey, setActiveAgentKey] = useState<string | null>(null)

  useEffect(() => {
    loadResearchNotebookModels()
      .then(m => { setModels(m); setOriginal(m) })
      .catch(() => {
        const d = getDefaultResearchNotebookModelMap()
        setModels(d)
        setOriginal(d)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanges     = JSON.stringify(models) !== JSON.stringify(original)
  const defaults       = getDefaultResearchNotebookModelMap()
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
      await saveResearchNotebookModels(models)
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
      await resetResearchNotebookModels()
      const d = getDefaultResearchNotebookModelMap()
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
    ? RESEARCH_NOTEBOOK_AGENT_DEFS.find(a => a.key === activeAgentKey)
    : null

  if (loading) {
    return <p className="text-gray-400 text-sm">Carregando configuração do Caderno de Pesquisa...</p>
  }

  return (
    <>
      {/* ── Research & Analysis Agents ── */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-700">Pesquisa & Análise</span>
              <span className="text-xs text-gray-400 ml-auto">{RESEARCH_AGENTS.length} agentes</span>
            </div>

            <div className="p-3 mb-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-xs text-indigo-800">
                <strong>🔎 Pesquisadores de Fontes:</strong> além do assistente padrão, o caderno pode usar
                <strong> Pesquisa Externa</strong>, <strong>Pesquisa Externa Profunda</strong> e
                <strong> Pesquisa de Jurisprudência (DataJud)</strong> para criar novas fontes automaticamente.
              </p>
            </div>

            <div className="space-y-0 mb-6">
              {RESEARCH_AGENTS.map((agent, idx) => {
                const Icon         = AGENT_ICONS[agent.icon] ?? Brain
                const currentModelId = models[agent.key] ?? agent.defaultModel
                const currentModel = getModelOption(currentModelId)
                const isDefault    = currentModelId === agent.defaultModel
                const tierStyle    = currentModel
                  ? TIER_STYLES[currentModel.tier]
                  : TIER_STYLES[agent.recommendedTier]
                const isLast = idx === RESEARCH_AGENTS.length - 1

                return (
                  <div key={agent.key}>
                    <div className={`relative rounded-lg border p-4 transition-colors ${
                      !isDefault ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          !isDefault ? 'bg-indigo-100' : 'bg-gray-100'
                        }`}>
                          <Icon className={`w-4 h-4 ${!isDefault ? 'text-indigo-600' : 'text-gray-600'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                            {!isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
                                customizado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mb-2">{agent.description}</p>

                          {/* Model selector button */}
                          <button
                            type="button"
                            onClick={() => openModal(agent.key)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 ${
                              !isDefault
                                ? 'border-indigo-200 bg-white'
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
                        <ArrowDown className="w-4 h-4 text-gray-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Studio Agents ── */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <PenTool className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-gray-700">Estúdio de Criação</span>
              <span className="text-xs text-gray-400 ml-auto">{STUDIO_AGENTS.length} agentes · pipeline multi-agente</span>
            </div>

            <div className="p-3 mb-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-800">
                <strong>🎨 Pipeline do Estúdio:</strong> Cada artefato passa por 3 etapas —
                <strong> Pesquisador</strong> extrai dados relevantes →
                <strong> Especialista</strong> (Escritor, Roteirista ou Designer) cria o conteúdo →
                <strong> Revisor</strong> aprimora e garante qualidade de nível superior.
              </p>
            </div>

            <div className="p-3 mb-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-xs text-indigo-800">
                <strong>🖼️ Saída visual real:</strong> quando o estúdio produz <strong>infográficos</strong>,
                <strong> mapas mentais</strong> ou <strong>tabelas de dados</strong>, o notebook executa uma etapa
                automática de <strong>renderização final em imagem</strong> depois da revisão, persiste o PNG no
                notebook e registra a operação no demonstrativo de execuções/custos.
              </p>
            </div>

            <div className="space-y-0 mb-4">
              {STUDIO_AGENTS.map((agent, idx) => {
                const Icon         = AGENT_ICONS[agent.icon] ?? Brain
                const currentModelId = models[agent.key] ?? agent.defaultModel
                const currentModel = getModelOption(currentModelId)
                const isDefault    = currentModelId === agent.defaultModel
                const tierStyle    = currentModel
                  ? TIER_STYLES[currentModel.tier]
                  : TIER_STYLES[agent.recommendedTier]
                const isLast = idx === STUDIO_AGENTS.length - 1

                return (
                  <div key={agent.key}>
                    <div className={`relative rounded-lg border p-4 transition-colors ${
                      !isDefault ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-white'
                    }`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          !isDefault ? 'bg-purple-100' : 'bg-gray-100'
                        }`}>
                          <Icon className={`w-4 h-4 ${!isDefault ? 'text-purple-600' : 'text-gray-600'}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                            {!isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                                customizado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mb-2">{agent.description}</p>

                          <button
                            type="button"
                            onClick={() => openModal(agent.key)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors hover:border-purple-300 hover:bg-purple-50/50 ${
                              !isDefault
                                ? 'border-purple-200 bg-white'
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
                        <ArrowDown className="w-4 h-4 text-purple-300" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Info box */}
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-xs text-indigo-800">
                <strong>📖 Sobre estes agentes:</strong> O Caderno de Pesquisa conta com {RESEARCH_NOTEBOOK_AGENT_DEFS.length} agentes especializados em dois grupos.
                <strong> Pesquisa & Análise</strong> — Pesquisador indexa fontes, Analista sintetiza descobertas, Assistente responde perguntas.
                <strong> Estúdio de Criação</strong> — pipeline de 3 etapas (pesquisa → criação especializada → revisão de qualidade) para cada artefato.
                Escritor redige textos, Roteirista cria scripts de áudio/vídeo, Designer Visual estrutura apresentações e infográficos, e a etapa automática de mídia transforma os artefatos visuais em imagens persistidas.
                Modelos <strong>✦ Grátis</strong> são uma ótima opção para testes e redução de custos.
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
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
