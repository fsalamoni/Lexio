/**
 * GithubConnectorCard — configures the GitHub connector used by the chat.
 *
 * The app has no backend, so GitHub auth is a fine-grained Personal Access
 * Token (PAT) the user pastes here (stored in their own settings, like the
 * OpenRouter/DataJud keys). "Testar conexão" calls `GET /user` to validate it.
 */
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Github, RotateCcw, Save } from 'lucide-react'
import {
  getDefaultGithubConnectorConfig,
  invalidateGithubConnectorCache,
  loadGithubConnectorConfig,
  saveGithubConnectorConfig,
  type GithubConnectorConfig,
} from '../../lib/chat-orchestrator/github-config'
import { githubGetAuthenticatedUser } from '../../lib/chat-orchestrator/github-client'

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; login: string }
  | { kind: 'error'; message: string }

export default function GithubConnectorCard() {
  const [config, setConfig] = useState<GithubConnectorConfig>(getDefaultGithubConnectorConfig())
  const [tokenInput, setTokenInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [test, setTest] = useState<TestState>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await loadGithubConnectorConfig()
      if (cancelled) return
      setConfig(loaded)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const tokenIsSet = Boolean(config.token)
  const effectiveToken = tokenInput.trim() || config.token

  const handleTest = async () => {
    if (!effectiveToken) { setTest({ kind: 'error', message: 'Informe um token primeiro.' }); return }
    setTest({ kind: 'testing' })
    try {
      const user = await githubGetAuthenticatedUser(effectiveToken)
      setTest({ kind: 'ok', login: user.login })
    } catch (err) {
      setTest({ kind: 'error', message: (err as Error).message })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const next: GithubConnectorConfig = {
        token: tokenInput.trim() || config.token,
        default_owner: config.default_owner,
        default_repo: config.default_repo,
      }
      await saveGithubConnectorConfig(next)
      invalidateGithubConnectorCache()
      setConfig(next)
      setTokenInput('')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      const cleared = getDefaultGithubConnectorConfig()
      await saveGithubConnectorConfig(cleared)
      invalidateGithubConnectorCache()
      setConfig(cleared)
      setTokenInput('')
      setTest({ kind: 'idle' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--v2-ink-faint)]">Carregando…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <Github className="h-5 w-5" />
        </div>
        <p className="text-sm text-[var(--v2-ink-soft)]">
          Cole um <strong>token fine-grained</strong> do GitHub (Settings → Developer settings → Personal access tokens).
          Conceda apenas os escopos necessários (Contents, Issues, Pull requests) nos repositórios desejados.
          O token fica salvo somente nas suas configurações.
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-[var(--v2-ink-soft)]">Token (PAT)</span>
        <input
          type="password"
          value={tokenInput}
          onChange={e => setTokenInput(e.target.value)}
          placeholder={tokenIsSet ? 'Token configurado — deixe vazio para manter' : 'github_pat_...'}
          className="mt-1 w-full rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-[var(--v2-ink-soft)]">Owner padrão (opcional)</span>
          <input
            type="text"
            value={config.default_owner ?? ''}
            onChange={e => setConfig(c => ({ ...c, default_owner: e.target.value }))}
            placeholder="ex.: fsalamoni"
            className="mt-1 w-full rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[var(--v2-ink-soft)]">Repositório padrão (opcional)</span>
          <input
            type="text"
            value={config.default_repo ?? ''}
            onChange={e => setConfig(c => ({ ...c, default_repo: e.target.value }))}
            placeholder="ex.: Lexio"
            className="mt-1 w-full rounded-lg border border-[var(--v2-border)] px-3 py-2 text-sm"
          />
        </label>
      </div>

      {test.kind === 'ok' && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Conectado como <strong>{test.login}</strong>.
        </p>
      )}
      {test.kind === 'error' && (
        <p className="flex items-center gap-1.5 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" /> {test.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={test.kind === 'testing'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--v2-border)] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[var(--v2-border)] disabled:opacity-60"
        >
          {test.kind === 'testing' ? 'Testando…' : 'Testar conexão'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> Salvar
        </button>
        {tokenIsSet && (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" /> Remover token
          </button>
        )}
      </div>
    </div>
  )
}
