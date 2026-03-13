/**
 * Model Configuration Card — Admin Panel component for configuring
 * which LLM model each pipeline agent uses.
 *
 * Features:
 * - Visual pipeline flow showing all 8 agents in execution order
 * - Dropdown model selector per agent with available OpenRouter models
 * - Model tier badges (fast/balanced/premium)
 * - Save/reset/restore defaults
 * - Persists to Firestore /settings/platform.agent_models
 */

import { useEffect, useState } from 'react'
import {
  Brain,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Search,
  BookOpen,
  Scale,
  Shield,
  RefreshCw,
  ClipboardCheck,
  FileText,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import {
  PIPELINE_AGENT_DEFS,
  AVAILABLE_MODELS,
  type AgentModelMap,
  type ModelOption,
  loadAgentModels,
  saveAgentModels,
  getDefaultModelMap,
  resetAgentModels,
} from '../lib/model-config'

// ── Icon mapping ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  'search':          Search,
  'book-open':       BookOpen,
  'scale':           Scale,
  'shield':          Shield,
  'refresh-cw':      RefreshCw,
  'clipboard-check': ClipboardCheck,
  'file-text':       FileText,
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido' },
  balanced: { bg: 'bg-purple-50',  text: 'text-purple-700',  label: 'Equilibrado' },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ModelConfigCard() {
  const [models, setModels] = useState<AgentModelMap>({})
  const [original, setOriginal] = useState<AgentModelMap>({})
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAgentModels()
      .then(m => { setModels(m); setOriginal(m) })
      .catch(() => {
        const d = getDefaultModelMap()
        setModels(d)
        setOriginal(d)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanges = JSON.stringify(models) !== JSON.stringify(original)
  const defaults = getDefaultModelMap()
  const hasNonDefaults = JSON.stringify(models) !== JSON.stringify(defaults)

  const handleModelChange = (agentKey: string, modelId: string) => {
    setModels(prev => ({ ...prev, [agentKey]: modelId }))
    setSaved(false)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveAgentModels(models)
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
      await resetAgentModels()
      const d = getDefaultModelMap()
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
    AVAILABLE_MODELS.find(m => m.id === modelId)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6 mb-6">
        <p className="text-gray-400 text-sm">Carregando configuração de modelos...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border mb-6 overflow-hidden">
      {/* Header — collapsible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Configuração de Modelos IA</h2>
            <p className="text-sm text-gray-500">Configure qual modelo LLM cada agente do pipeline utiliza</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasNonDefaults && (
            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
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
          {/* Pipeline flow title */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-semibold text-gray-700">Fluxo do Pipeline de Geração</span>
            <span className="text-xs text-gray-400 ml-auto">8 agentes · execução sequencial</span>
          </div>

          {/* Agent pipeline flow */}
          <div className="space-y-0">
            {PIPELINE_AGENT_DEFS.map((agent, idx) => {
              const Icon = AGENT_ICONS[agent.icon] ?? Brain
              const currentModelId = models[agent.key] ?? agent.defaultModel
              const currentModel = getModelOption(currentModelId)
              const isDefault = currentModelId === agent.defaultModel
              const isLast = idx === PIPELINE_AGENT_DEFS.length - 1
              const tierStyle = currentModel
                ? TIER_STYLES[currentModel.tier]
                : TIER_STYLES[agent.recommendedTier]

              return (
                <div key={agent.key}>
                  {/* Agent card */}
                  <div className={`relative rounded-lg border p-4 transition-colors ${
                    !isDefault ? 'border-purple-200 bg-purple-50/30' : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      {/* Agent icon */}
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        !isDefault ? 'bg-purple-100' : 'bg-gray-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${!isDefault ? 'text-purple-600' : 'text-gray-600'}`} />
                      </div>

                      {/* Agent info + selector */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                          <span className="text-xs text-gray-400">#{idx + 1}</span>
                          {!isDefault && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
                              customizado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{agent.description}</p>

                        {/* Model selector */}
                        <div className="flex items-center gap-2">
                          <select
                            value={currentModelId}
                            onChange={e => handleModelChange(agent.key, e.target.value)}
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                          >
                            {AVAILABLE_MODELS.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.label} ({m.provider}) — {TIER_STYLES[m.tier].label}
                              </option>
                            ))}
                          </select>

                          {/* Tier badge */}
                          {tierStyle && (
                            <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${tierStyle.bg} ${tierStyle.text}`}>
                              {tierStyle.label}
                            </span>
                          )}
                        </div>

                        {/* Model description */}
                        {currentModel && (
                          <p className="text-[11px] text-gray-400 mt-1">{currentModel.description}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Connector arrow between agents */}
                  {!isLast && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Recommendation box */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>💡 Recomendação:</strong> Use modelos <strong>rápidos</strong> (Haiku, Flash, Mini)
              para Triagem e Fact-Checker (tarefas de extração/verificação).
              Use modelos <strong>equilibrados ou premium</strong> (Sonnet, GPT-4o, Gemini Pro)
              para os demais agentes que exigem raciocínio jurídico elaborado.
            </p>
          </div>

          {/* Error */}
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Configuração'}
            </button>

            {hasNonDefaults && (
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar Padrões
              </button>
            )}

            {hasChanges && !saved && (
              <span className="text-xs text-amber-600 ml-auto">Alterações não salvas</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
