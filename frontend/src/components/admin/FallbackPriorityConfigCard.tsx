/**
 * FallbackPriorityConfigCard — Settings UI for the user-controlled fallback
 * policy.
 *
 * Per product policy (V3 user requirement):
 *   "Em nenhuma circunstância deve haver um fallback para outro modelo não
 *    escolhido pelo usuário."
 *
 * The user picks up to 3 fallback models per agent category (extraction,
 * synthesis, reasoning, writing). When any agent's primary model fails
 * (transient/upstream error or unavailable), the platform consults the
 * category-specific list, automatically skipping the failed primary, and
 * tries each user-chosen alternative in order. The platform never injects a
 * model the user did not pick.
 *
 * UX:
 *  - One section per category, each with three "Prioridade 1/2/3" slots.
 *  - Picking a slot opens the standard `ModelSelectorModal` (same modal used
 *    everywhere else for model selection — keeps UI consistent).
 *  - "Limpar" removes a single slot. "Salvar" persists, "Restaurar padrões"
 *    clears every slot.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Layers,
  RotateCcw,
  Save,
  Scale,
  X,
} from 'lucide-react'
import {
  FALLBACK_AGENT_CATEGORIES,
  FALLBACK_PRIORITY_SLOTS,
  getDefaultFallbackPriorityConfig,
  getEmptyFallbackPriorityList,
  loadFallbackPriorityConfig,
  resetFallbackPriorityConfig,
  saveFallbackPriorityConfig,
  type AgentCategory,
  type FallbackPriorityConfig,
  type FallbackPriorityList,
} from '../../lib/model-config'
import { useCatalogModels } from '../../lib/model-catalog'
import ModelSelectorModal from '../ModelSelectorModal'

interface CategoryMeta {
  key: AgentCategory
  label: string
  description: string
  icon: typeof Layers
  tone: { headerIcon: string; chip: string }
}

const CATEGORY_META: Record<AgentCategory, CategoryMeta> = {
  extraction: {
    key: 'extraction',
    label: 'Extração',
    description: 'Agentes que extraem fatos, partes, citações e estruturam dados do caso.',
    icon: ClipboardCheck,
    tone: { headerIcon: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700' },
  },
  synthesis: {
    key: 'synthesis',
    label: 'Síntese',
    description: 'Agentes que consolidam briefings, planejam estruturas e organizam o trabalho.',
    icon: Layers,
    tone: { headerIcon: 'text-purple-600', chip: 'bg-purple-50 text-purple-700' },
  },
  reasoning: {
    key: 'reasoning',
    label: 'Raciocínio',
    description: 'Agentes que constroem teses, fazem crítica e pesquisa jurídica aprofundada.',
    icon: Scale,
    tone: { headerIcon: 'text-teal-600', chip: 'bg-teal-50 text-teal-700' },
  },
  writing: {
    key: 'writing',
    label: 'Redação',
    description: 'Agentes responsáveis por redigir e revisar o documento final.',
    icon: FileText,
    tone: { headerIcon: 'text-amber-600', chip: 'bg-amber-50 text-amber-700' },
  },
}

interface ActiveSlot {
  category: AgentCategory
  index: number
  currentModelId: string
}

function normalizeList(list: FallbackPriorityList | undefined): FallbackPriorityList {
  if (!list) return getEmptyFallbackPriorityList()
  const out: string[] = []
  for (let i = 0; i < FALLBACK_PRIORITY_SLOTS; i++) {
    out.push(typeof list[i] === 'string' ? list[i] : '')
  }
  return out as FallbackPriorityList
}

export default function FallbackPriorityConfigCard() {
  const [config, setConfig] = useState<FallbackPriorityConfig>(getDefaultFallbackPriorityConfig())
  const [original, setOriginal] = useState<FallbackPriorityConfig>(getDefaultFallbackPriorityConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null)

  const catalogModels = useCatalogModels()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadFallbackPriorityConfig()
      .then((loaded) => {
        if (cancelled) return
        setConfig(loaded)
        setOriginal(loaded)
      })
      .catch(() => {
        if (cancelled) return
        const defaults = getDefaultFallbackPriorityConfig()
        setConfig(defaults)
        setOriginal(defaults)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const hasChanges = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(original),
    [config, original],
  )

  const updateSlot = (category: AgentCategory, index: number, modelId: string) => {
    setConfig((prev) => {
      const list = normalizeList(prev[category])
      const next: FallbackPriorityList = [...list] as FallbackPriorityList
      next[index] = modelId
      return { ...prev, [category]: next }
    })
    setSaved(false)
    setError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveFallbackPriorityConfig(config)
      setOriginal(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar fallbacks.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setError(null)
    try {
      await resetFallbackPriorityConfig()
      const defaults = getDefaultFallbackPriorityConfig()
      setConfig(defaults)
      setOriginal(defaults)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar fallbacks.')
    } finally {
      setSaving(false)
    }
  }

  const getModelLabel = (modelId: string): string => {
    if (!modelId) return ''
    const found = catalogModels.find((m) => m.id === modelId)
    return found?.label ?? modelId
  }
  const getModelProvider = (modelId: string): string => {
    if (!modelId) return ''
    const found = catalogModels.find((m) => m.id === modelId)
    return found?.provider ?? ''
  }

  if (loading) {
    return (
      <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm text-[var(--v2-ink-faint)]">
        Carregando configuração de fallback...
      </div>
    )
  }

  return (
    <>
      <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.85)] p-4 text-xs text-[var(--v2-ink-soft)]">
        <p>
          <strong>Política de fallback:</strong> quando o modelo principal de um agente falhar
          (erro transitório, indisponibilidade ou timeout), a plataforma tentará, na ordem que
          você definir, os modelos abaixo. <strong>Nunca</strong> usaremos um modelo que você
          não tenha escolhido aqui. Se o modelo que falhou estiver listado, ele é
          automaticamente pulado e o próximo da fila é usado.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {FALLBACK_AGENT_CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category]
          const Icon = meta.icon
          const list = normalizeList(config[category])

          return (
            <section
              key={category}
              className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.85)] p-4"
            >
              <div className="mb-3 flex items-center gap-2 border-b border-[var(--v2-line-soft)] pb-2">
                <Icon className={`h-4 w-4 ${meta.tone.headerIcon}`} />
                <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{meta.label}</span>
                <span className="ml-auto text-xs text-[var(--v2-ink-faint)]">{meta.description}</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {list.map((modelId, index) => {
                  const provider = getModelProvider(modelId)
                  const label = getModelLabel(modelId)
                  return (
                    <div
                      key={`${category}-${index}`}
                      className="rounded-xl border border-[var(--v2-line-soft)] bg-white p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.tone.chip}`}>
                          Prioridade {index + 1}
                        </span>
                        {modelId ? (
                          <button
                            type="button"
                            onClick={() => updateSlot(category, index, '')}
                            className="text-[var(--v2-ink-faint)] hover:text-[var(--v2-ink-strong)]"
                            title="Limpar este slot"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSlot({ category, index, currentModelId: modelId })}
                        className="w-full rounded-lg border border-[var(--v2-line-soft)] bg-[rgba(248,250,252,0.85)] px-2.5 py-2 text-left text-xs hover:border-[var(--v2-accent-strong)]"
                      >
                        {modelId ? (
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--v2-ink-strong)]">{label}</div>
                            {provider ? (
                              <div className="truncate text-[10px] text-[var(--v2-ink-faint)]">{provider}</div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[var(--v2-ink-faint)]">Selecionar modelo…</span>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {error ? (
          <div className="mr-auto flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        ) : null}
        {saved && !error ? (
          <div className="mr-auto flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Configuração de fallback salva com sucesso.
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--v2-line-soft)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--v2-ink-soft)] hover:bg-slate-50 disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpar todos
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Salvando…' : 'Salvar fallbacks'}
        </button>
      </div>

      {/* ── Model selector modal ───────────────────────────────────────────── */}
      {activeSlot ? (
        <ModelSelectorModal
          open={!!activeSlot}
          onClose={() => setActiveSlot(null)}
          onSelect={(modelId) => {
            updateSlot(activeSlot.category, activeSlot.index, modelId)
            setActiveSlot(null)
          }}
          currentModelId={activeSlot.currentModelId}
          agentCategory={activeSlot.category}
          agentLabel={`Fallback de ${CATEGORY_META[activeSlot.category].label} · Prioridade ${activeSlot.index + 1}`}
          requiredCapability="text"
        />
      ) : null}
    </>
  )
}
