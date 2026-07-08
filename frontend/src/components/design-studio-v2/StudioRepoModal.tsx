import { useEffect, useState } from 'react'
import { Github, HardDrive, Loader2, X } from 'lucide-react'
import clsx from 'clsx'
import { loadGithubConnectorConfig } from '../../lib/chat-orchestrator/github-config'
import { githubListRepos, type GithubRepoSummary } from '../../lib/chat-orchestrator/github-client'

export interface GithubRepoSelection {
  owner: string
  repo: string
  branch?: string
  defaultBranch?: string
}

interface StudioRepoModalProps {
  open: boolean
  uid?: string
  onClose: () => void
  onSelectLocal: () => void
  onSelectGithub: (selection: GithubRepoSelection) => void
}

export default function StudioRepoModal({ open, uid, onClose, onSelectLocal, onSelectGithub }: StudioRepoModalProps) {
  const [mode, setMode] = useState<'choose' | 'github'>('choose')
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [repos, setRepos] = useState<GithubRepoSummary[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [manual, setManual] = useState('')
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setMode('choose')
      setError(null)
      return
    }
    let cancelled = false
    loadGithubConnectorConfig(uid)
      .then((config) => {
        if (cancelled) return
        setHasToken(Boolean(config.token))
        if (config.default_owner && config.default_repo) setManual(`${config.default_owner}/${config.default_repo}`)
      })
      .catch(() => !cancelled && setHasToken(false))
    return () => {
      cancelled = true
    }
  }, [open, uid])

  const openGithub = async () => {
    setMode('github')
    setError(null)
    if (hasToken === false) return
    setLoadingRepos(true)
    try {
      const config = await loadGithubConnectorConfig(uid)
      if (!config.token) {
        setHasToken(false)
        return
      }
      const list = await githubListRepos(config.token)
      setRepos(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao listar repositórios.')
    } finally {
      setLoadingRepos(false)
    }
  }

  const connectManual = () => {
    const value = manual.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '')
    const [owner, repo] = value.split('/')
    if (!owner || !repo) {
      setError('Informe no formato owner/repo.')
      return
    }
    onSelectGithub({ owner, repo, branch: branch.trim() || undefined })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Conectar repositório">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--v2-border)] bg-[var(--v2-canvas)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--v2-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Conectar repositório</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-1 text-[var(--v2-ink-faint)] hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {mode === 'choose' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onSelectLocal}
                className="flex flex-col items-start gap-2 rounded-xl border border-[var(--v2-border)] bg-white/70 p-4 text-left transition hover:border-[var(--v2-accent-strong)]"
              >
                <HardDrive className="h-6 w-6 text-[var(--v2-accent-strong)]" />
                <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">Workspace local</span>
                <span className="text-xs leading-5 text-[var(--v2-ink-soft)]">
                  Trabalhe no navegador. Os arquivos vivem no estúdio e podem ser exportados como ZIP. Nada sai do seu navegador.
                </span>
              </button>
              <button
                type="button"
                onClick={openGithub}
                className="flex flex-col items-start gap-2 rounded-xl border border-[var(--v2-border)] bg-white/70 p-4 text-left transition hover:border-[var(--v2-accent-strong)]"
              >
                <Github className="h-6 w-6 text-[var(--v2-ink-strong)]" />
                <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">GitHub</span>
                <span className="text-xs leading-5 text-[var(--v2-ink-soft)]">
                  Importe um repositório e aplique as mudanças em uma nova branch com pull request opcional (via token PAT).
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hasToken === false ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  Nenhum token do GitHub configurado. Adicione um Personal Access Token (fine-grained) em
                  <strong> Configurações → Conector GitHub</strong> para conectar um repositório na nuvem.
                </div>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-[var(--v2-ink-soft)]">
                    Escolher da sua conta
                    {loadingRepos && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
                  </label>
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--v2-border)] bg-white/60 p-1">
                    {repos.length === 0 && !loadingRepos && <p className="px-2 py-3 text-xs text-[var(--v2-ink-faint)]">Nenhum repositório carregado.</p>}
                    {repos.map((repo) => (
                      <button
                        key={repo.full_name}
                        type="button"
                        onClick={() => {
                          const [owner, name] = repo.full_name.split('/')
                          onSelectGithub({ owner, repo: name, defaultBranch: repo.default_branch })
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-black/5"
                      >
                        <Github className="h-3.5 w-3.5 flex-shrink-0 text-[var(--v2-ink-faint)]" />
                        <span className="truncate font-medium text-[var(--v2-ink-strong)]">{repo.full_name}</span>
                        {repo.private && <span className="ml-auto rounded bg-black/10 px-1.5 py-0.5 text-[0.62rem]">privado</span>}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-[var(--v2-border)]" />
                    <span className="text-[0.68rem] uppercase tracking-wide text-[var(--v2-ink-faint)]">ou manualmente</span>
                    <div className="h-px flex-1 bg-[var(--v2-border)]" />
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={manual}
                      onChange={(e) => setManual(e.target.value)}
                      placeholder="owner/repo"
                      className="flex-1 rounded-lg border border-[var(--v2-border)] bg-white/80 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--v2-accent-strong)]"
                    />
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="branch (opcional)"
                      className="w-36 rounded-lg border border-[var(--v2-border)] bg-white/80 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--v2-accent-strong)]"
                    />
                    <button
                      type="button"
                      onClick={connectManual}
                      className="rounded-lg bg-[var(--v2-accent-strong)] px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Conectar
                    </button>
                  </div>
                </>
              )}
              {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
              <button
                type="button"
                onClick={() => setMode('choose')}
                className={clsx('text-xs font-medium text-[var(--v2-ink-soft)] hover:text-[var(--v2-ink-strong)]')}
              >
                ← Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
