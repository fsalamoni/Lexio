/**
 * SidecarConnectionCard — configures the "Pasta local (PC)" connection that
 * lets the chat orchestrator read/write files and run commands on the user's
 * machine, inside a sandboxed workspace folder.
 *
 * Flow (like Claude Desktop / Manus / AionUI local connectors):
 *  1. User runs `npx @lexio/desktop --root <pasta>` locally.
 *  2. The sidecar prints a pairing token + the workspace path.
 *  3. User pastes the token here, clicks "Testar conexão" → handshake shows the
 *     real workspace root + permissions the local process granted.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, FolderCog, Plug, RotateCcw, Save, WifiOff } from 'lucide-react'
import { checkSidecarStatus } from '../../lib/chat-orchestrator'
import {
  buildSidecarWsUrl,
  getDefaultSidecarConnectionConfig,
  invalidateSidecarConnectionCache,
  loadSidecarConnectionConfig,
  saveSidecarConnectionConfig,
  type SidecarConnectionConfig,
} from '../../lib/chat-orchestrator/sidecar-config'

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; version?: string; root?: string; permissions?: string[] }
  | { kind: 'fail'; error: string }

export default function SidecarConnectionCard() {
  const [config, setConfig] = useState<SidecarConnectionConfig>(getDefaultSidecarConnectionConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false
    loadSidecarConnectionConfig().then(loaded => {
      if (!cancelled) { setConfig(loaded); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  function patch(next: Partial<SidecarConnectionConfig>) {
    setConfig(prev => ({ ...prev, ...next }))
    setDirty(true)
    setTest({ kind: 'idle' })
  }

  async function handleTest() {
    setTest({ kind: 'testing' })
    const status = await checkSidecarStatus({ wsUrl: buildSidecarWsUrl(config) })
    if (status.available) {
      setTest({ kind: 'ok', version: status.version, root: status.root, permissions: status.permissions })
    } else {
      setTest({ kind: 'fail', error: status.error ?? 'Sidecar indisponível.' })
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await saveSidecarConnectionConfig(config)
      invalidateSidecarConnectionCache()
      setDirty(false)
      setMessage({ text: 'Conexão com o PC salva.', kind: 'ok' })
    } catch (err) {
      setMessage({ text: `Falha ao salvar: ${(err as Error).message}`, kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setConfig(getDefaultSidecarConnectionConfig())
    setDirty(true)
    setTest({ kind: 'idle' })
    setMessage(null)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando configuração da pasta local…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FolderCog className="h-4 w-4 text-indigo-600" />
            Pasta local (PC) — ações de arquivos e comandos
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Permite que o orquestrador do chat leia, escreva e execute comandos <strong>dentro de uma pasta de trabalho</strong> no seu computador (sandbox). Requer o agente local <code>@lexio/desktop</code> em execução.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={handleReset} className="inline-flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !dirty} className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`px-6 py-2 text-sm flex items-center gap-2 ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      <div className="px-6 py-4 space-y-4">
        {/* Step-by-step setup */}
        <ol className="text-sm text-slate-600 space-y-1 list-decimal list-inside bg-slate-50 rounded-lg p-3">
          <li>No seu computador, rode: <code className="text-slate-800">npx @lexio/desktop --root "/caminho/da/pasta" --permissions read,write,execute</code></li>
          <li>O agente exibirá um <strong>token de pareamento</strong> e a pasta de trabalho.</li>
          <li>Cole o token abaixo e clique em <strong>Testar conexão</strong>.</li>
        </ol>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-700">Habilitar ações no PC</span>
          <button
            type="button"
            onClick={() => patch({ enabled: !config.enabled })}
            className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
            aria-label={config.enabled ? 'Desabilitar' : 'Habilitar'}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
          </button>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Token de pareamento</span>
          <input
            type="password"
            value={config.token}
            onChange={e => patch({ token: e.target.value })}
            placeholder="cole aqui o token exibido pelo @lexio/desktop"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Host</span>
            <input
              type="text"
              value={config.host}
              onChange={e => patch({ host: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Porta</span>
            <input
              type="number"
              value={config.port}
              onChange={e => patch({ port: Number(e.target.value) || config.port })}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={!config.token || test.kind === 'testing'}
            className="inline-flex items-center gap-1 rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plug className="h-3.5 w-3.5" /> {test.kind === 'testing' ? 'Testando…' : 'Testar conexão'}
          </button>

          {test.kind === 'ok' && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Conectado{test.version ? ` (v${test.version})` : ''}
            </span>
          )}
          {test.kind === 'fail' && (
            <span className="inline-flex items-center gap-1 text-sm text-rose-700">
              <WifiOff className="h-4 w-4" /> {test.error}
            </span>
          )}
        </div>

        {test.kind === 'ok' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p><strong>Pasta de trabalho:</strong> <code>{test.root ?? '—'}</code></p>
            <p className="mt-1"><strong>Permissões concedidas:</strong> {(test.permissions ?? []).join(', ') || '—'}</p>
            <p className="mt-1 text-emerald-700">O agente só pode atuar dentro desta pasta. Nada fora dela é acessível.</p>
          </div>
        )}

        <p className="text-xs text-slate-500">
          🔒 Segurança: a conexão é apenas local (<code>ws://{config.host}:{config.port}</code>), autenticada pelo token. O agente local recusa comandos destrutivos e qualquer caminho fora da pasta escolhida. Pare o processo a qualquer momento para revogar o acesso.
        </p>
      </div>
    </div>
  )
}
