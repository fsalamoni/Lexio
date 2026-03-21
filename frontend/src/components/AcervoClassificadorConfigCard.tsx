/**
 * Acervo Classificador Config Card — Admin Panel section for configuring
 * which LLM model the "Classificar Acervo" agent uses.
 *
 * Follows the same design pattern as ContextDetailConfigCard
 * but targets the ACERVO_CLASSIFICADOR_AGENT_DEFS and acervo_classificador_models Firestore key.
 */

import { useEffect, useState } from 'react'
import {
  Tags,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Brain,
  Search,
  RefreshCw,
} from 'lucide-react'
import {
  ACERVO_CLASSIFICADOR_AGENT_DEFS,
  type AcervoClassificadorModelMap,
  type ModelOption,
  loadAcervoClassificadorModels,
  saveAcervoClassificadorModels,
  getDefaultAcervoClassificadorModelMap,
  resetAcervoClassificadorModels,
} from '../lib/model-config'
import { useCatalogModels } from '../lib/model-catalog'

// ── Icon mapping ──────────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ElementType> = {
  'search': Search,
  'brain':  Brain,
  'tag':    Tags,
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  fast:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Rápido'       },
  balanced: { bg: 'bg-teal-50',    text: 'text-teal-700',    label: 'Equilibrado'  },
  premium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Premium'      },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AcervoClassificadorConfigCard() {
  const catalogModels = useCatalogModels()
  const [models, setModels]     = useState<AcervoClassificadorModelMap>({})
  const [original, setOriginal] = useState<AcervoClassificadorModelMap>({})
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    loadAcervoClassificadorModels()
      .then(m => { setModels(m); setOriginal(m) })
      .catch(() => {
        const d = getDefaultAcervoClassificadorModelMap()
        setModels(d)
        setOriginal(d)
      })
      .finally(() => setLoading(false))
  }, [])

  const hasChanges     = JSON.stringify(models) !== JSON.stringify(original)
  const defaults       = getDefaultAcervoClassificadorModelMap()
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
      await saveAcervoClassificadorModels(models)
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
      await resetAcervoClassificadorModels()
      const d = getDefaultAcervoClassificadorModelMap()
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-6 mb-6">
        <p className="text-gray-400 text-sm">Carregando configuração do Classificador de Acervo...</p>
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
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
            <Tags className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Classificador de Acervo</h2>
            <p className="text-sm text-gray-500">Configure o modelo LLM que classifica documentos do acervo com tags</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasNonDefaults && (
            <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700 font-medium">
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
          {/* Pipeline header */}
          <div className="flex items-center gap-2 mb-4 pb-3 border-b">
            <Tags className="w-4 h-4 text-teal-500" />
            <span className="text-sm font-semibold text-gray-700">Agente Classificador</span>
            <span className="text-xs text-gray-400 ml-auto">1 agente · acionado pelo usuário</span>
          </div>

          {/* Agent card */}
          <div className="space-y-0">
            {ACERVO_CLASSIFICADOR_AGENT_DEFS.map((agent) => {
              const Icon = AGENT_ICONS[agent.icon] ?? Brain
              const currentModelId = models[agent.key] ?? agent.defaultModel
              const currentModel   = getModelOption(currentModelId)
              const isDefault      = currentModelId === agent.defaultModel
              const tierStyle      = currentModel
                ? TIER_STYLES[currentModel.tier]
                : TIER_STYLES[agent.recommendedTier]

              return (
                <div key={agent.key}>
                  <div className={`relative rounded-lg border p-4 transition-colors ${
                    !isDefault ? 'border-teal-200 bg-teal-50/30' : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        !isDefault ? 'bg-teal-100' : 'bg-gray-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${!isDefault ? 'text-teal-600' : 'text-gray-600'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{agent.label}</span>
                          {!isDefault && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600 font-medium">
                              customizado
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-2">{agent.description}</p>

                        <div className="flex items-center gap-2">
                          <select
                            value={currentModelId}
                            onChange={e => handleModelChange(agent.key, e.target.value)}
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          >
                            {catalogModels.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.label} ({m.provider}) — {TIER_STYLES[m.tier]?.label ?? m.tier}
                              </option>
                            ))}
                          </select>
                          {tierStyle && (
                            <span className={`text-[10px] px-2 py-1 rounded-full font-medium whitespace-nowrap ${tierStyle.bg} ${tierStyle.text}`}>
                              {tierStyle.label}
                            </span>
                          )}
                        </div>

                        {currentModel && (
                          <p className="text-[11px] text-gray-400 mt-1">{currentModel.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Info box */}
          <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <p className="text-xs text-teal-800">
              <strong>🏷️ Sobre este agente:</strong> O Classificador de Acervo analisa documentos e gera tags
              de classificação (natureza, área do direito, assuntos e contexto). Um modelo <strong>rápido</strong>{' '}
              é recomendado por ser eficiente e econômico para esta tarefa de classificação estruturada.
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
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
  )
}
