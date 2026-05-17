import { useEffect, useMemo, useState, type ElementType } from 'react'
import { AlertCircle, CheckCircle2, Image as ImageIcon, Loader2, Mic, RotateCcw, Save, Shield, Video } from 'lucide-react'
import {
  getDefaultMultimodalPolicyConfig,
  getProvidersForMultimodalModality,
  loadMultimodalPolicyConfig,
  MULTIMODAL_POLICY_MODALITIES,
  normalizeMultimodalPolicyConfig,
  saveMultimodalPolicyConfig,
} from '../../lib/multimodal-policy'
import { PROVIDERS } from '../../lib/providers'
import type { MultimodalModality, MultimodalPolicyConfig } from '../../lib/firestore-types'
import { useToast } from '../Toast'

const MODALITY_META: Record<MultimodalModality, { label: string; Icon: ElementType; accent: string; surface: string }> = {
  image: { label: 'Imagens', Icon: ImageIcon, accent: 'text-pink-700', surface: 'bg-pink-50 border-pink-100' },
  audio: { label: 'Audios', Icon: Mic, accent: 'text-violet-700', surface: 'bg-violet-50 border-violet-100' },
  video: { label: 'Videos', Icon: Video, accent: 'text-rose-700', surface: 'bg-rose-50 border-rose-100' },
}

export default function MultimodalPolicyCard() {
  const toast = useToast()
  const defaultPolicy = useMemo(() => getDefaultMultimodalPolicyConfig(), [])
  const [policy, setPolicy] = useState<MultimodalPolicyConfig>(defaultPolicy)
  const [original, setOriginal] = useState<MultimodalPolicyConfig>(defaultPolicy)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    loadMultimodalPolicyConfig()
      .then((loaded) => {
        if (ignore) return
        const normalized = normalizeMultimodalPolicyConfig(loaded)
        setPolicy(normalized)
        setOriginal(normalized)
        setError(null)
      })
      .catch((caughtError: unknown) => {
        if (ignore) return
        setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel carregar a politica multimodal.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => { ignore = true }
  }, [])

  const normalizedPolicy = useMemo(() => normalizeMultimodalPolicyConfig(policy), [policy])
  const hasChanges = JSON.stringify(normalizedPolicy) !== JSON.stringify(original)

  const updatePolicy = (updater: (current: MultimodalPolicyConfig) => MultimodalPolicyConfig) => {
    setPolicy(current => normalizeMultimodalPolicyConfig(updater(normalizeMultimodalPolicyConfig(current))))
    setSaved(false)
    setError(null)
  }

  const updateModality = (
    modality: MultimodalModality,
    patch: Partial<NonNullable<NonNullable<MultimodalPolicyConfig['modalities']>[MultimodalModality]>>,
  ) => {
    updatePolicy(current => ({
      ...current,
      modalities: {
        ...current.modalities,
        [modality]: {
          ...(current.modalities?.[modality] ?? {}),
          ...patch,
        },
      },
    }))
  }

  const toggleAllowedProvider = (modality: MultimodalModality, providerId: string) => {
    const current = normalizedPolicy.modalities?.[modality]?.allowed_provider_ids ?? []
    const next = current.includes(providerId)
      ? current.filter(id => id !== providerId)
      : [...current, providerId]
    updateModality(modality, { allowed_provider_ids: next })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const savedPolicy = await saveMultimodalPolicyConfig(normalizedPolicy)
      setPolicy(savedPolicy)
      setOriginal(savedPolicy)
      setSaved(true)
      toast.success('Politica multimodal salva', 'As proximas execucoes ja usam estes limites e provedores.')
      setTimeout(() => setSaved(false), 3000)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Erro ao salvar politica multimodal.'
      setError(message)
      toast.error('Erro ao salvar politica multimodal', message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setError(null)
    try {
      const next = getDefaultMultimodalPolicyConfig()
      const savedPolicy = await saveMultimodalPolicyConfig(next)
      setPolicy(savedPolicy)
      setOriginal(savedPolicy)
      setSaved(true)
      toast.success('Politica multimodal restaurada')
      setTimeout(() => setSaved(false), 3000)
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Erro ao restaurar politica multimodal.'
      setError(message)
      toast.error('Erro ao restaurar politica multimodal', message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-[1.15rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] px-4 py-3 text-sm text-[var(--v2-ink-faint)]">
        Carregando politica multimodal...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-teal-50 text-teal-700">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Governanca multimodal</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-soft)]">
              Limites por turno, tamanho maximo de arquivo e provedores permitidos para anexos do chat e rotas multimodais iniciais.
            </p>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.78)] px-3 py-2 text-sm font-medium text-[var(--v2-ink-strong)]">
          <input
            type="checkbox"
            checked={normalizedPolicy.enabled ?? true}
            onChange={event => updatePolicy(current => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 rounded border-[var(--v2-line-strong)] text-teal-600 focus:ring-[rgba(15,118,110,0.18)]"
          />
          Processamento automatico
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block rounded-[1.1rem] border border-[var(--v2-line-soft)] bg-[rgba(255,255,255,0.72)] p-3 text-sm">
          <span className="text-xs font-medium text-[var(--v2-ink-soft)]">Anexos por turno</span>
          <input
            type="number"
            min={0}
            max={12}
            step={1}
            value={normalizedPolicy.max_attachments_per_turn ?? 4}
            onChange={event => updatePolicy(current => ({ ...current, max_attachments_per_turn: Number(event.target.value) }))}
            className="mt-2 w-full rounded-[0.9rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {MULTIMODAL_POLICY_MODALITIES.map((modality) => {
          const meta = MODALITY_META[modality]
          const Icon = meta.Icon
          const modalityPolicy = normalizedPolicy.modalities?.[modality]
          const allowedProviderIds = modalityPolicy?.allowed_provider_ids ?? []
          const providerIds = getProvidersForMultimodalModality(modality)
          return (
            <section key={modality} className={`rounded-[1.15rem] border p-4 ${meta.surface}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${meta.accent}`} />
                  <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{meta.label}</span>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--v2-ink-soft)]">
                  <input
                    type="checkbox"
                    checked={modalityPolicy?.enabled ?? true}
                    onChange={event => updateModality(modality, { enabled: event.target.checked })}
                    className="h-4 w-4 rounded border-[var(--v2-line-strong)] text-teal-600 focus:ring-[rgba(15,118,110,0.18)]"
                  />
                  Ativo
                </label>
              </div>

              <label className="mt-4 block text-xs font-medium text-[var(--v2-ink-soft)]">
                Limite por arquivo (MB)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={modalityPolicy?.max_file_mb ?? ''}
                  onChange={event => updateModality(modality, { max_file_mb: Number(event.target.value) })}
                  className="mt-1 w-full rounded-[0.9rem] border border-[var(--v2-line-soft)] bg-[var(--v2-panel-strong)] px-3 py-2 text-sm text-[var(--v2-ink-strong)] outline-none focus:border-[rgba(15,118,110,0.34)] focus:ring-4 focus:ring-[rgba(15,118,110,0.12)]"
                />
              </label>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--v2-ink-soft)]">Provedores</span>
                  <button
                    type="button"
                    onClick={() => updateModality(modality, { allowed_provider_ids: [] })}
                    className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]"
                  >
                    Todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {providerIds.map((providerId) => {
                    const provider = PROVIDERS[providerId]
                    const selected = allowedProviderIds.length === 0 || allowedProviderIds.includes(providerId)
                    return (
                      <button
                        key={providerId}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleAllowedProvider(modality, providerId)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${selected ? 'border-teal-200 bg-white text-teal-800' : 'border-slate-200 bg-white/45 text-slate-500'}`}
                      >
                        {provider.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-[1rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--v2-line-soft)] pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_38px_rgba(15,23,42,0.12)] transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved && !hasChanges ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : saved && !hasChanges ? 'Salvo!' : 'Salvar politica'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="v2-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar padrao
        </button>
        {hasChanges ? <span className="text-xs text-amber-700">Ha alteracoes pendentes.</span> : null}
      </div>
    </div>
  )
}
