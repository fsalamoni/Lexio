/**
 * FeatureFlagsCard — per-user toggles for the chat beta feature flags.
 *
 * The new Chat Orchestrator capabilities ship behind flags that default to OFF.
 * This card lets a user enable them for their own account (persisted to
 * `settings/preferences.feature_flags` and applied at runtime via
 * `saveFeatureFlags`) so they can validate in production before a broader
 * rollout. Only `FF_CHAT_*` flags are surfaced here.
 */
import { useEffect, useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { listAllFlags } from '../../lib/feature-flags'
import { loadFeatureFlags, saveFeatureFlags } from '../../lib/settings-store'

const CHAT_FLAG_PREFIX = 'FF_CHAT_'

export default function FeatureFlagsCard() {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chatFlags = listAllFlags().filter(flag => flag.key.startsWith(CHAT_FLAG_PREFIX))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const saved = await loadFeatureFlags()
        if (!cancelled) setOverrides(saved)
      } catch {
        // best-effort; fall back to defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const isOn = (key: string, fallback: boolean) => (key in overrides ? overrides[key] : fallback)

  const toggle = async (key: string, next: boolean) => {
    setSavingKey(key)
    setError(null)
    const nextOverrides = { ...overrides, [key]: next }
    try {
      const saved = await saveFeatureFlags(nextOverrides)
      setOverrides(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--v2-ink-faint)]">Carregando…</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <FlaskConical className="h-5 w-5" />
        </div>
        <p className="text-sm text-[var(--v2-ink-soft)]">
          Recursos beta do Chat Orquestrador. Ligar aqui afeta <strong>somente a sua conta</strong> —
          ideal para validar em produção antes de um rollout amplo. Algumas exigem o sidecar
          <code className="mx-1">@lexio/desktop</code> ou um token GitHub (configurados acima).
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">{error}</p>
      )}

      <ul className="divide-y divide-[var(--v2-border)] rounded-lg border border-[var(--v2-border)]">
        {chatFlags.map(flag => {
          const on = isOn(flag.key, flag.defaultEnabled)
          const saving = savingKey === flag.key
          return (
            <li key={flag.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{flag.label}</span>
                  <code className="text-[10px] text-[var(--v2-ink-faint)]">{flag.key}</code>
                </div>
                <p className="text-xs text-[var(--v2-ink-faint)]">{flag.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${flag.label}: ${on ? 'ligado' : 'desligado'}`}
                disabled={saving}
                onClick={() => toggle(flag.key, !on)}
                className={clsx(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                  on ? 'bg-violet-600' : 'bg-slate-300',
                  saving && 'opacity-60',
                )}
              >
                {saving
                  ? <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
                  : <span className={clsx('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform', on ? 'translate-x-5' : 'translate-x-1')} />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
