import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, RefreshCw, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { FEATURE_FLAGS, getNonRuntimeFlagState, listAllFlags, type FeatureFlagSource } from '../../lib/feature-flags'
import { hydrateRuntimeFeatureFlags, saveFeatureFlags } from '../../lib/settings-store'
import { useToast } from '../Toast'

const SOURCE_LABELS: Record<FeatureFlagSource, string> = {
  default: 'default',
  env: 'env',
  runtime: 'perfil',
  sessionStorage: 'sessão',
}

const SOURCE_BADGES: Record<FeatureFlagSource, string> = {
  default: 'border-gray-200 bg-gray-100 text-gray-600',
  env: 'border-sky-200 bg-sky-50 text-sky-700',
  runtime: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sessionStorage: 'border-amber-200 bg-amber-50 text-amber-700',
}

function buildOverrideMap(flags: Record<string, boolean>): Record<string, boolean> {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag.key, Object.prototype.hasOwnProperty.call(flags, flag.key)]),
  )
}

export default function RuntimeFeatureFlagsCard() {
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [initialDraft, setInitialDraft] = useState<Record<string, boolean>>({})
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [initialOverrides, setInitialOverrides] = useState<Record<string, boolean>>({})
  const [sources, setSources] = useState<Record<string, FeatureFlagSource>>({})
  const [inheritedStates, setInheritedStates] = useState<Record<string, boolean>>({})
  const [inheritedSources, setInheritedSources] = useState<Record<string, FeatureFlagSource>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const storedFlags = await hydrateRuntimeFeatureFlags()
      const states = listAllFlags()
      const nextOverrides = buildOverrideMap(storedFlags)
      const nextDraft = Object.fromEntries(states.map((flag) => [
        flag.key,
        nextOverrides[flag.key] ? Boolean(storedFlags[flag.key]) : flag.enabled,
      ]))
      const nextSources = Object.fromEntries(states.map((flag) => [flag.key, flag.source])) as Record<string, FeatureFlagSource>
      const inheritedEntries = FEATURE_FLAGS.map((flag) => [flag.key, getNonRuntimeFlagState(flag.key)] as const)
      setDraft(nextDraft)
      setInitialDraft(nextDraft)
      setOverrides(nextOverrides)
      setInitialOverrides(nextOverrides)
      setSources(nextSources)
      setInheritedStates(Object.fromEntries(inheritedEntries.map(([key, state]) => [key, state.enabled])))
      setInheritedSources(Object.fromEntries(inheritedEntries.map(([key, state]) => [key, state.source])) as Record<string, FeatureFlagSource>)
    } catch (err) {
      console.error(err)
      setError('Não foi possível carregar os feature flags do perfil.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const hasPendingChanges = useMemo(
    () => FEATURE_FLAGS.some((flag) => (
      draft[flag.key] !== initialDraft[flag.key]
      || Boolean(overrides[flag.key]) !== Boolean(initialOverrides[flag.key])
    )),
    [draft, initialDraft, initialOverrides, overrides],
  )

  const handleToggle = (flagKey: string) => {
    setOverrides((current) => ({
      ...current,
      [flagKey]: true,
    }))
    setSources((current) => ({
      ...current,
      [flagKey]: 'runtime',
    }))
    setDraft((current) => ({
      ...current,
      [flagKey]: !(current[flagKey] ?? false),
    }))
  }

  const handleReset = (flagKey: string) => {
    const inherited = getNonRuntimeFlagState(flagKey)
    setDraft((current) => ({
      ...current,
      [flagKey]: inherited.enabled,
    }))
    setOverrides((current) => ({
      ...current,
      [flagKey]: false,
    }))
    setInheritedStates((current) => ({
      ...current,
      [flagKey]: inherited.enabled,
    }))
    setInheritedSources((current) => ({
      ...current,
      [flagKey]: inherited.source,
    }))
    setSources((current) => ({
      ...current,
      [flagKey]: inherited.source,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = Object.fromEntries(
        FEATURE_FLAGS
          .filter((flag) => overrides[flag.key])
          .map((flag) => [flag.key, Boolean(draft[flag.key])]),
      ) as Record<string, boolean>
      const saved = await saveFeatureFlags(payload)
      const states = listAllFlags()
      const nextOverrides = buildOverrideMap(saved)
      const nextDraft = Object.fromEntries(states.map((flag) => [
        flag.key,
        nextOverrides[flag.key] ? Boolean(saved[flag.key]) : flag.enabled,
      ]))
      setDraft(nextDraft)
      setInitialDraft(nextDraft)
      setOverrides(nextOverrides)
      setInitialOverrides(nextOverrides)
      setSources(Object.fromEntries(states.map((flag) => [flag.key, flag.source])) as Record<string, FeatureFlagSource>)
      toast.success('Feature flags salvos', 'As próximas execuções já usarão os valores do seu perfil.')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro ao salvar feature flags.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] px-4 py-4">
        <p className="text-sm text-[var(--v2-ink-faint)]">Carregando feature flags do perfil...</p>
      </div>
    )
  }

  return (
    <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.68)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Rollout runtime por usuário</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--v2-ink-faint)]">
            Controla canários do frontend sem redeploy. Prioridade efetiva: sessão local para debug, perfil do usuário, env e depois default.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--v2-line-soft)] bg-white px-3 py-2 text-xs font-medium text-[var(--v2-ink-soft)] transition-colors hover:bg-[rgba(15,118,110,0.06)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!hasPendingChanges || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Salvando...' : 'Salvar Flags'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {FEATURE_FLAGS.map((flag) => {
          const enabled = Boolean(draft[flag.key])
          const source = sources[flag.key] ?? 'default'
          const inheritedEnabled = Boolean(inheritedStates[flag.key])
          const inheritedSource = inheritedSources[flag.key] ?? 'default'
          const hasOverride = Boolean(overrides[flag.key])
          const hasPendingRowChange = draft[flag.key] !== initialDraft[flag.key] || hasOverride !== Boolean(initialOverrides[flag.key])
          const resetDisabled = !hasOverride && enabled === inheritedEnabled

          return (
            <div
              key={flag.key}
              className="flex flex-col gap-3 rounded-[1rem] border border-[var(--v2-line-soft)] bg-white/80 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--v2-ink-strong)]">{flag.label}</p>
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_BADGES[source]}`}>
                    {SOURCE_LABELS[source]}
                  </span>
                  {enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      ativo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--v2-ink-faint)]">{flag.description}</p>
                <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">
                  Sem override, fica {inheritedEnabled ? 'ativado' : 'desativado'} via {SOURCE_LABELS[inheritedSource]}.
                </p>
                <p className="mt-2 text-[11px] font-mono text-[var(--v2-ink-faint)]">{flag.key}</p>
                {hasPendingRowChange && (
                  <p className="mt-2 text-[11px] font-medium text-[var(--v2-accent-strong)]">Alteração pendente de salvar.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => handleReset(flag.key)}
                  disabled={resetDisabled}
                  className="inline-flex min-w-[108px] items-center justify-center gap-2 rounded-xl border border-[var(--v2-line-soft)] bg-white px-3 py-2 text-xs font-semibold text-[var(--v2-ink-soft)] transition-colors hover:bg-[rgba(15,118,110,0.06)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Herdar
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(flag.key)}
                  className={`inline-flex min-w-[108px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                    enabled
                      ? 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  {enabled ? 'Ativado' : 'Desativado'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}