import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  FolderGit2,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import JSZip from 'jszip'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/Toast'
import { IS_FIREBASE } from '../../lib/firebase'
import { isEnabled } from '../../lib/feature-flags'
import { buildUsageSummary, type UsageExecutionRecord } from '../../lib/cost-analytics'
import { buildWorkspaceShellPath } from '../../lib/workspace-routes'
import type { ChatAgentMode, DesignStudioMessageData } from '../../lib/firestore-types'
import {
  buildAssetGenerator,
  buildPreviewHtml,
  buildStudioRuntime,
  createEmptyProject,
  createGithubConnectorFromConfig,
  createLocalConnector,
  projectFromFiles,
  projectToFiles,
  runStudioTurn,
  type DesignStudioProgressEvent,
  type DesignStudioProject,
  type DesignStudioRepoRef,
  type DesignStudioRuntime,
  type RepoConnector,
} from '../../lib/design-studio-v2'
import {
  createDesignStudioSession,
  deleteDesignStudioSession,
  getDesignStudioSession,
  listDesignStudioSessions,
  updateDesignStudioSession,
} from '../../lib/firestore-service'
import StudioComposer from '../../components/design-studio-v2/StudioComposer'
import StudioMessages from '../../components/design-studio-v2/StudioMessages'
import StudioPreview from '../../components/design-studio-v2/StudioPreview'
import StudioRepoModal, { type GithubRepoSelection } from '../../components/design-studio-v2/StudioRepoModal'

interface SessionSummary {
  id: string
  title: string
  updated_at?: string
}

function newMessageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function DesignStudioV2() {
  const { userId } = useAuth()
  const toast = useToast()
  const enabled = isEnabled('FF_DESIGN_STUDIO_V2')

  const [runtime, setRuntime] = useState<DesignStudioRuntime | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [title, setTitle] = useState('Nova sessão')
  const [repo, setRepo] = useState<DesignStudioRepoRef | undefined>(undefined)
  const [mode, setMode] = useState<ChatAgentMode>('auto')
  const [project, setProject] = useState<DesignStudioProject>(() => createEmptyProject())
  const [messages, setMessages] = useState<DesignStudioMessageData[]>([])
  const [executions, setExecutions] = useState<UsageExecutionRecord[]>([])

  const [running, setRunning] = useState(false)
  const [trail, setTrail] = useState<DesignStudioProgressEvent[]>([])
  const [liveThinking, setLiveThinking] = useState('')
  const [applying, setApplying] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(0)

  const [repoModalOpen, setRepoModalOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)

  const connectorRef = useRef<RepoConnector | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const preview = useMemo(() => buildPreviewHtml(project), [project, previewNonce])

  // ── Runtime + sessions bootstrap ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    buildStudioRuntime({ uid: userId || undefined })
      .then((built) => {
        if (cancelled) return
        setRuntime(built)
        if (!built.apiKey) setRuntimeError('Configure sua chave OpenRouter em Configurações → API Keys para usar o Design Studio.')
        else if (!built.models.ds2_orchestrator) setRuntimeError('Configure o modelo do Orquestrador em Configurações → Design Studio v2.')
        else setRuntimeError(null)
      })
      .catch((error) => {
        if (!cancelled) setRuntimeError(error instanceof Error ? error.message : 'Falha ao carregar a configuração do estúdio.')
      })
    return () => {
      cancelled = true
    }
  }, [enabled, userId])

  const refreshSessions = useCallback(() => {
    if (!IS_FIREBASE || !userId) return
    listDesignStudioSessions(userId, { limit: 30 })
      .then((result) => setSessions(result.items.map((item) => ({ id: item.id || '', title: item.title, updated_at: item.updated_at })).filter((item) => item.id)))
      .catch(() => { /* non-critical */ })
  }, [userId])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  const resetToNewSession = useCallback(() => {
    abortRef.current?.abort()
    setSessionId(null)
    setTitle('Nova sessão')
    setRepo(undefined)
    setMode('auto')
    setProject(createEmptyProject())
    setMessages([])
    setExecutions([])
    setTrail([])
    setLiveThinking('')
    connectorRef.current = null
    setSessionMenuOpen(false)
  }, [])

  const openSession = useCallback(async (id: string) => {
    if (!IS_FIREBASE || !userId) return
    setSessionMenuOpen(false)
    try {
      const session = await getDesignStudioSession(userId, id)
      if (!session) {
        toast.error('Sessão não encontrada.')
        return
      }
      abortRef.current?.abort()
      setSessionId(session.id || id)
      setTitle(session.title)
      setRepo(session.repo)
      setMode(session.mode || 'auto')
      setProject(projectFromFiles(session.files, session.preview_entry))
      setMessages(session.messages || [])
      setExecutions(session.llm_executions || [])
      connectorRef.current = null // rebuilt lazily on apply
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao abrir a sessão.')
    }
  }, [toast, userId])

  // ── Persistence ─────────────────────────────────────────────────────────────
  const persist = useCallback(async (
    ensuredId: string | null,
    next: {
      title: string
      repo?: DesignStudioRepoRef
      mode: ChatAgentMode
      project: DesignStudioProject
      messages: DesignStudioMessageData[]
      executions: UsageExecutionRecord[]
    },
  ): Promise<string | null> => {
    if (!IS_FIREBASE || !userId) return ensuredId
    const payload = {
      title: next.title,
      repo: next.repo,
      mode: next.mode,
      files: projectToFiles(next.project),
      preview_entry: next.project.previewEntry,
      messages: next.messages,
      llm_executions: next.executions,
      usage_summary: buildUsageSummary(next.executions),
      status: 'active' as const,
    }
    try {
      if (ensuredId) {
        await updateDesignStudioSession(userId, ensuredId, payload)
        return ensuredId
      }
      const created = await createDesignStudioSession(userId, payload)
      refreshSessions()
      return created
    } catch (error) {
      console.warn('[DesignStudioV2] persistência falhou:', error)
      return ensuredId
    }
  }, [refreshSessions, userId])

  // ── Turn execution ──────────────────────────────────────────────────────────
  const runTurn = useCallback(async (userText: string, turnMode: ChatAgentMode) => {
    if (!runtime) {
      toast.error('Configuração do estúdio ainda carregando.')
      return
    }
    if (!runtime.models.ds2_orchestrator) {
      setRuntimeError('Configure o modelo do Orquestrador em Configurações → Design Studio v2.')
      toast.error('Configure o modelo do Orquestrador do Design Studio v2.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)
    setTrail([])
    setLiveThinking('')

    const userMessage: DesignStudioMessageData = {
      id: newMessageId('usr'),
      role: 'user',
      content: userText,
      mode: turnMode,
      created_at: new Date().toISOString(),
    }
    const history = messages
    setMessages((prev) => [...prev, userMessage])

    // Ensure a session exists so usage is attributed to a stable id.
    let ensuredId = sessionId
    if (!ensuredId && IS_FIREBASE && userId) {
      ensuredId = await persist(null, { title, repo, mode: turnMode, project, messages: [...history, userMessage], executions })
      if (ensuredId) setSessionId(ensuredId)
    }

    try {
      const result = await runStudioTurn({
        userMessage: userText,
        mode: turnMode,
        project,
        repo,
        history,
        runtime: { ...runtime, sessionId: ensuredId || runtime.sessionId },
        signal: controller.signal,
        generateAsset: buildAssetGenerator({ ...runtime, sessionId: ensuredId || runtime.sessionId }),
        onEvent: (event) => {
          if (event.type === 'phase') setTrail((prev) => [...prev, event])
          else if (event.type === 'thinking') setLiveThinking(event.text)
        },
      })

      const nextMessages = [...history, userMessage, result.assistantMessage]
      const nextExecutions = [...executions, ...result.executions]
      const nextTitle = !sessionId && result.sessionTitle ? result.sessionTitle : title

      setMessages(nextMessages)
      setProject(result.project)
      setExecutions(nextExecutions)
      if (nextTitle !== title) setTitle(nextTitle)
      if (result.previewChanged) setPreviewNonce((n) => n + 1)

      const savedId = await persist(ensuredId, {
        title: nextTitle,
        repo,
        mode: turnMode,
        project: result.project,
        messages: nextMessages,
        executions: nextExecutions,
      })
      if (savedId && savedId !== sessionId) setSessionId(savedId)
      refreshSessions()
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((prev) => [...prev, {
          id: newMessageId('sys'),
          role: 'system',
          content: 'Geração interrompida.',
          created_at: new Date().toISOString(),
        }])
      } else {
        const message = error instanceof Error ? error.message : 'Falha ao processar o pedido.'
        setMessages((prev) => [...prev, {
          id: newMessageId('err'),
          role: 'assistant',
          content: 'Não consegui concluir este pedido.',
          error: message,
          created_at: new Date().toISOString(),
        }])
        toast.error(message)
      }
    } finally {
      setRunning(false)
      setLiveThinking('')
      abortRef.current = null
    }
  }, [executions, messages, mode, persist, project, refreshSessions, repo, runtime, sessionId, title, toast, userId])

  const handleSend = useCallback((text: string) => {
    void runTurn(text, mode)
  }, [mode, runTurn])

  const handlePlanAction = useCallback((messageId: string, action: 'approve' | 'discard') => {
    setMessages((prev) => prev.map((message) => {
      if (message.id !== messageId || !message.plan) return message
      return { ...message, plan: { ...message.plan, state: action === 'approve' ? 'approved' : 'rejected' } }
    }))
    if (action === 'approve') {
      void runTurn('Aprovado. Execute o plano proposto.', 'auto')
    }
  }, [runTurn])

  const handleEditFile = useCallback((path: string, content: string) => {
    setProject((prev) => {
      const next: DesignStudioProject = {
        files: { ...prev.files, [path]: { path, content, ...(prev.files[path]?.binary ? { binary: true } : {}) } },
        previewEntry: prev.previewEntry,
      }
      void persist(sessionId, { title, repo, mode, project: next, messages, executions })
      return next
    })
    setPreviewNonce((n) => n + 1)
  }, [executions, messages, mode, persist, repo, sessionId, title])

  // ── Repository connection ───────────────────────────────────────────────────
  const connectLocal = useCallback(() => {
    const connector = createLocalConnector()
    connectorRef.current = connector
    setRepo(connector.ref)
    setRepoModalOpen(false)
    toast.success('Workspace local conectado.')
  }, [toast])

  const connectGithub = useCallback(async (selection: GithubRepoSelection) => {
    setRepoModalOpen(false)
    setRunning(true)
    setTrail([{ type: 'phase', agent: 'repo', label: 'Importando repositório', status: 'start' }])
    try {
      const connector = await createGithubConnectorFromConfig(selection, userId || undefined)
      if (!connector) {
        toast.error('Configure um token do GitHub em Configurações → Conector GitHub.')
        return
      }
      const imported = await connector.importProject()
      connectorRef.current = connector
      setRepo(connector.ref)
      setProject(imported.project)
      setPreviewNonce((n) => n + 1)
      if (imported.note) toast.info(imported.note)
      else toast.success(`Conectado a ${connector.ref.label}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao conectar o repositório.')
    } finally {
      setRunning(false)
      setTrail([])
    }
  }, [toast, userId])

  const downloadZip = useCallback(async () => {
    const zip = new JSZip()
    for (const file of projectToFiles(project)) {
      if (file.binary && /^data:/.test(file.content)) {
        const base64 = file.content.split(',')[1] ?? ''
        zip.file(file.path, base64, { base64: true })
      } else {
        zip.file(file.path, file.content)
      }
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(title || 'design-studio').replace(/[^\w.-]+/g, '-').toLowerCase()}.zip`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [project, title])

  const handleApply = useCallback(async () => {
    if (projectToFiles(project).length === 0) {
      toast.info('Nada para aplicar ainda — construa algo primeiro.')
      return
    }
    if (!repo || repo.provider === 'local') {
      await downloadZip()
      toast.success('Projeto exportado como ZIP.')
      return
    }
    // GitHub apply.
    setApplying(true)
    try {
      let connector = connectorRef.current
      if (!connector && repo.owner && repo.repo) {
        connector = await createGithubConnectorFromConfig({ owner: repo.owner, repo: repo.repo, branch: repo.branch, defaultBranch: repo.default_branch }, userId || undefined)
        connectorRef.current = connector
      }
      if (!connector) {
        toast.error('Não foi possível reconectar ao GitHub. Verifique o token nas Configurações.')
        return
      }
      const commitMessage = `feat: alterações do Design Studio (${new Date().toLocaleDateString('pt-BR')})`
      const result = await connector.apply(project, { commitMessage, openPullRequest: true, prTitle: title })
      if (result.prUrl) {
        toast.success('Pull request criado no GitHub.')
        window.open(result.prUrl, '_blank', 'noopener,noreferrer')
      } else if (result.commitUrl) {
        toast.success(`Commit aplicado na branch ${result.branch}.`)
        window.open(result.commitUrl, '_blank', 'noopener,noreferrer')
      } else {
        toast.info(result.note || 'Nada foi aplicado.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao aplicar no repositório.')
    } finally {
      setApplying(false)
    }
  }, [downloadZip, project, repo, title, toast, userId])

  const handleDeleteSession = useCallback(async (id: string) => {
    if (!IS_FIREBASE || !userId) return
    try {
      await deleteDesignStudioSession(userId, id)
      refreshSessions()
      if (id === sessionId) resetToNewSession()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao excluir a sessão.')
    }
  }, [refreshSessions, resetToNewSession, sessionId, toast, userId])

  if (!enabled) {
    return (
      <div className="v2-panel p-8 text-center">
        <h1 className="v2-display text-xl">Design Studio v2</h1>
        <p className="mt-2 text-sm text-[var(--v2-ink-soft)]">Este recurso está desativado. Ative a flag <code>FF_DESIGN_STUDIO_V2</code> em Configurações.</p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[520px] flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--v2-ink-strong)] text-[var(--v2-canvas)]">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="v2-display truncate text-lg leading-tight">{title}</h1>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Design Studio v2</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Sessions menu */}
          {IS_FIREBASE && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSessionMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-strong)]"
              >
                Sessões <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {sessionMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--v2-border)] bg-[var(--v2-canvas)] p-1 shadow-xl">
                  {sessions.length === 0 && <p className="px-2 py-3 text-xs text-[var(--v2-ink-faint)]">Nenhuma sessão salva.</p>}
                  {sessions.map((item) => (
                    <div key={item.id} className={clsx('group flex items-center gap-1 rounded-lg px-1 hover:bg-black/5', item.id === sessionId && 'bg-black/5')}>
                      <button type="button" onClick={() => openSession(item.id)} className="flex-1 truncate px-1.5 py-1.5 text-left text-xs text-[var(--v2-ink-strong)]" title={item.title}>
                        {item.title}
                      </button>
                      <button type="button" onClick={() => handleDeleteSession(item.id)} aria-label="Excluir sessão" className="rounded p-1 text-[var(--v2-ink-faint)] opacity-0 transition group-hover:opacity-100 hover:text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={resetToNewSession}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-strong)]"
          >
            <Plus className="h-3.5 w-3.5" /> Nova
          </button>

          <button
            type="button"
            onClick={() => setRepoModalOpen(true)}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition',
              repo ? 'border border-[var(--v2-border)] bg-white/80 text-[var(--v2-ink-strong)]' : 'bg-[var(--v2-accent-strong)] text-white',
            )}
          >
            <FolderGit2 className="h-3.5 w-3.5" />
            {repo ? repo.label : 'Conectar repositório'}
          </button>
        </div>
      </div>

      {runtimeError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>{runtimeError}</span>
          <Link to={buildWorkspaceShellPath('/settings')} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold underline">
            <Settings2 className="h-3.5 w-3.5" /> Configurações
          </Link>
        </div>
      )}

      {/* Split workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(340px,420px)_1fr]">
        <section className="flex min-h-0 flex-col rounded-2xl border border-[var(--v2-border)] bg-white/60 p-2">
          <StudioMessages
            messages={messages}
            running={running}
            liveThinking={liveThinking}
            trail={trail}
            onPlanAction={handlePlanAction}
          />
          <div className="pt-2">
            <StudioComposer
              mode={mode}
              onModeChange={setMode}
              onSend={handleSend}
              onStop={() => abortRef.current?.abort()}
              running={running}
              disabled={!!runtimeError && !runtime?.models.ds2_orchestrator}
              targetRepo={repo?.provider === 'github' ? repo.label : undefined}
            />
          </div>
        </section>

        <section className="hidden min-h-0 overflow-hidden rounded-2xl border border-[var(--v2-border)] bg-white/60 lg:flex lg:flex-col">
          <StudioPreview
            project={project}
            preview={preview}
            repo={repo}
            applying={applying}
            onApply={handleApply}
            onDownload={downloadZip}
            onRefresh={() => setPreviewNonce((n) => n + 1)}
            onEditFile={handleEditFile}
          />
        </section>
      </div>

      <StudioRepoModal
        open={repoModalOpen}
        uid={userId || undefined}
        onClose={() => setRepoModalOpen(false)}
        onSelectLocal={connectLocal}
        onSelectGithub={connectGithub}
      />
    </div>
  )
}
