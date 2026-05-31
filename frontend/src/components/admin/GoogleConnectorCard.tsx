/**
 * GoogleConnectorCard — configures the Google Drive + Gmail connector.
 *
 * No backend: the user pastes a **public OAuth Client ID** (created in Google
 * Cloud) and clicks "Conectar", which runs the GIS consent popup (user gesture)
 * and caches a short-lived access token in memory. See
 * docs/guides/operacao-e-conectores.md for the Google Cloud setup.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Cloud, RotateCcw, Save } from 'lucide-react'
import {
  getDefaultGoogleConnectorConfig,
  invalidateGoogleConnectorCache,
  loadGoogleConnectorConfig,
  saveGoogleConnectorConfig,
  type GoogleConnectorConfig,
} from '../../lib/chat-orchestrator/google-config'
import { connectGoogle, disconnectGoogle, googleConnectionStatus } from '../../lib/chat-orchestrator/google-auth'

export default function GoogleConnectorCard() {
  const [config, setConfig] = useState<GoogleConnectorConfig>(getDefaultGoogleConnectorConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<{ connected: boolean; expiresAt?: number }>({ connected: false })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await loadGoogleConnectorConfig()
      if (cancelled) return
      setConfig(loaded)
      setStatus(googleConnectionStatus())
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const handleSaveClientId = async () => {
    setSaving(true)
    try {
      await saveGoogleConnectorConfig(config)
      invalidateGoogleConnectorCache()
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    const clientId = config.client_id.trim()
    if (!clientId) { setError('Informe o Client ID primeiro.'); return }
    setConnecting(true)
    setError(null)
    try {
      await saveGoogleConnectorConfig(config)
      invalidateGoogleConnectorCache()
      await connectGoogle(clientId)
      setStatus(googleConnectionStatus())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = () => {
    disconnectGoogle()
    setStatus(googleConnectionStatus())
  }

  if (loading) return <p className="text-sm text-[var(--v2-ink-faint)]">Carregando…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Cloud className="h-5 w-5" />
        </div>
        <p className="text-sm text-[var(--v2-ink-soft)]">
          Conecte <strong>Google Drive</strong> (leitura) e <strong>Gmail</strong> (ler + criar rascunho).
          Sem backend: cole o <strong>OAuth Client ID</strong> público criado no Google Cloud. O passo a passo
          (habilitar APIs, tela de consentimento, origens autorizadas) está em
          <code className="mx-1">docs/guides/operacao-e-conectores.md</code>.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-[var(--v2-ink-soft)]">OAuth Client ID</span>
        <input
          type="text"
          value={config.client_id}
          onChange={e => setConfig({ client_id: e.target.value })}
          placeholder="000000000000-xxxx.apps.googleusercontent.com"
          className="mt-1 w-full rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm"
        />
      </label>

      {status.connected ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Conectado{status.expiresAt ? ` · expira ${new Date(status.expiresAt).toLocaleTimeString('pt-BR')}` : ''}.
        </p>
      ) : (
        <p className="text-xs text-[var(--v2-ink-faint)]">Não conectado. O consentimento dura ~1h; reconecte quando expirar.</p>
      )}
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-rose-700"><AlertCircle className="h-4 w-4" /> {error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || !config.client_id.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
        >
          <Cloud className="h-4 w-4" /> {connecting ? 'Conectando…' : 'Conectar'}
        </button>
        <button
          type="button"
          onClick={handleSaveClientId}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--v2-border)] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[var(--v2-border)] disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> Salvar Client ID
        </button>
        {status.connected && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100"
          >
            <RotateCcw className="h-4 w-4" /> Desconectar
          </button>
        )}
      </div>
    </div>
  )
}
