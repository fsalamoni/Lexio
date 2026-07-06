import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  Cloud,
  Code2,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  FolderGit2,
  GitPullRequest,
  Github,
  History,
  Layers,
  Loader2,
  MessageCircle,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { V2PageHero } from '../../components/v2/V2PagePrimitives'
import AgentModePicker from '../../components/chat/AgentModePicker'
import type { ChatAgentMode } from '../../lib/firestore-types'
import { isEnabled } from '../../lib/feature-flags'
import { loadGithubConnectorConfig } from '../../lib/chat-orchestrator/github-config'
import {
  applyDesignToRepo,
  describeDesignApplyPlan,
  DESIGN_APPLY_FORMATS,
  type DesignApplyFormat,
  type DesignApplyPlan,
  type DesignApplyResult,
} from '../../lib/design-studio/repo-apply'
import {
  DESIGN_ARTIFACT_KINDS,
  designExportFileName,
  type DesignArtifactKind,
} from '../../lib/design-studio/templates'
import { DESIGN_THEMES, type DesignThemeId } from '../../lib/design-studio/themes'
import {
  DESIGN_TEMPLATE_EXTENSION,
  parseTemplateFile,
  renderSpec,
  renderSpecMarkdown,
  serializeTemplate,
  specFromBrief,
  type DesignSpec,
  type DesignTemplate,
} from '../../lib/design-studio/design-spec'
import {
  deleteDesignTemplate,
  listDesignTemplates,
  saveDesignTemplate,
} from '../../lib/design-studio/template-store'
import {
  createDesignStudioChatMessage,
  createDesignWorkspace,
  getActiveDesignWorkspaceId,
  listDesignWorkspaces,
  loadDesignWorkspace,
  saveDesignWorkspace,
  setActiveDesignWorkspaceId,
  type DesignStudioChatMessage,
  type DesignWorkspace,
  type DesignWorkspaceTarget,
} from '../../lib/design-studio/workspace-store'

type ExportFormat = 'html' | 'json' | 'markdown'

const APPLY_FORMAT_LABELS: Record<DesignApplyFormat, string> = {
  html: 'HTML',
  json: 'Template (JSON)',
  markdown: 'Markdown',
}

const OPEN_TOOL_REFERENCES = [
  { name: 'open-design', href: 'https://github.com/nexu-io/open-design', note: 'tokens, componentes e documentação de design system' },
  { name: 'Mozilla Open Design', href: 'https://github.com/mozilla/OpenDesign', note: 'processo aberto de design e colaboração' },
  { name: 'SuperDesign', href: 'https://github.com/superdesigndev/superdesign', note: 'geração visual e iteração de interface' },
  { name: 'OpenHands', href: 'https://github.com/OpenDevin/OpenHands', note: 'ambiente agentic de desenvolvimento ponta a ponta' },
  { name: 'SWE-agent', href: 'https://github.com/SWE-agent/SWE-agent', note: 'agente para issues reais e benchmark SWE-bench' },
  { name: 'Aider', href: 'https://github.com/paul-gauthier/aider', note: 'par programming git-native no terminal' },
  { name: 'Continue', href: 'https://github.com/continuedev/continue', note: 'chat e agentes dentro da IDE' },
]

function defaultOrchestratorMessage(): DesignStudioChatMessage {
  return createDesignStudioChatMessage(
    'orchestrator',
    'Indique primeiro o repositório de trabalho (GitHub ou local). Depois converse comigo: briefing, modelos e padrões são opcionais; eu posso perguntar o que faltar e encadear design + desenvolvimento.',
  )
}

function downloadFile(filename: string, contents: string, mime: string) {
  if (typeof document === 'undefined') return
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Design Studio — Claude-Design-like shell (behind `FF_DESIGN_STUDIO`).
 *
 * Left: brief composer (artifact kind + theme + prompt) and template gallery.
 * Center: live sandboxed preview of the current {@link DesignSpec}.
 * Right: manual editor (title + sections) and multi-format export / repo apply.
 *
 * Generation is deterministic and client-side; the spec is the single source of
 * truth so "create by text", "edit by hand", "import/export template" and
 * "apply to repository" all operate on one contract. A later phase can slot an
 * LLM design agent onto the same spec/preview/export surface.
 */
export default function DesignStudio() {
  const enabled = isEnabled('FF_DESIGN_STUDIO')
  const [brief, setBrief] = useState('')
  const [kind, setKind] = useState<DesignArtifactKind>('site')
  const [theme, setTheme] = useState<DesignThemeId>('studio')
  const [generating, setGenerating] = useState(false)
  const [spec, setSpec] = useState<DesignSpec | null>(null)
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Workspace / repository scope state ──────────────────────────────────────
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const [workspaceId, setWorkspaceId] = useState('')
  const [workTarget, setWorkTarget] = useState<DesignWorkspaceTarget>('github')
  const [localRepoPath, setLocalRepoPath] = useState('')
  const [recentWorkspaces, setRecentWorkspaces] = useState<DesignWorkspace[]>([])
  const [messages, setMessages] = useState<DesignStudioChatMessage[]>(() => [defaultOrchestratorMessage()])
  const [chatInput, setChatInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(true)
  const [agentMode, setAgentMode] = useState<ChatAgentMode>('ask')

  // ── Repository apply (connector) state ──────────────────────────────────────
  const githubEnabled = isEnabled('FF_CHAT_GITHUB')
  const [ghToken, setGhToken] = useState('')
  const [ghConfigLoaded, setGhConfigLoaded] = useState(false)
  const [repoOwner, setRepoOwner] = useState('')
  const [repoName, setRepoName] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [targetDir, setTargetDir] = useState('design')
  const [commitMessage, setCommitMessage] = useState('')
  const [openPr, setOpenPr] = useState(true)
  const [applyFormats, setApplyFormats] = useState<DesignApplyFormat[]>(['html', 'json'])
  const [applying, setApplying] = useState(false)
  const [applyPlan, setApplyPlan] = useState<DesignApplyPlan | null>(null)
  const [applyResult, setApplyResult] = useState<DesignApplyResult | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const hasWorkspaceTarget =
    workTarget === 'local'
      ? localRepoPath.trim().length > 0
      : repoOwner.trim().length > 0 && repoName.trim().length > 0
  const canGenerate = hasWorkspaceTarget && !generating

  const loadWorkspaceIntoState = (workspace: DesignWorkspace) => {
    setWorkspaceId(workspace.id)
    setWorkTarget(workspace.repository.target)
    setRepoOwner(workspace.repository.owner)
    setRepoName(workspace.repository.repo)
    setBaseBranch(workspace.repository.baseBranch)
    setTargetDir(workspace.repository.targetDir)
    setLocalRepoPath(workspace.repository.localPath)
    setBrief(workspace.brief)
    setKind(workspace.kind)
    setTheme(workspace.theme)
    setTemplateName(workspace.templateName)
    setSpec(workspace.spec)
    setMessages(workspace.messages.length ? workspace.messages : [defaultOrchestratorMessage()])
    setApplyPlan(null)
    setApplyResult(null)
    setApplyError(null)
  }

  useEffect(() => {
    if (enabled) setTemplates(listDesignTemplates())
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const recent = listDesignWorkspaces()
    const activeId = getActiveDesignWorkspaceId()
    const active = activeId ? loadDesignWorkspace(activeId) : null
    const workspace = active || recent[0] || createDesignWorkspace({ messages: [defaultOrchestratorMessage()] })
    setRecentWorkspaces(recent)
    loadWorkspaceIntoState(workspace)
    setActiveDesignWorkspaceId(workspace.id)
    setWorkspaceLoaded(true)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !githubEnabled) return
    let active = true
    loadGithubConnectorConfig()
      .then((cfg) => {
        if (!active) return
        setGhToken(cfg.token)
        if (cfg.default_owner) setRepoOwner((current) => current || cfg.default_owner || '')
        if (cfg.default_repo) setRepoName((current) => current || cfg.default_repo || '')
      })
      .catch(() => {
        // connector optional; leave fields empty
      })
      .finally(() => {
        if (active) setGhConfigLoaded(true)
      })
    return () => {
      active = false
    }
  }, [enabled, githubEnabled])

  useEffect(() => {
    if (!enabled || !workspaceLoaded || !workspaceId) return
    const handle = window.setTimeout(() => {
      const saved = saveDesignWorkspace({
        id: workspaceId,
        name: spec?.title || brief.trim().slice(0, 80) || 'Novo trabalho',
        updatedAt: new Date().toISOString(),
        repository: {
          target: workTarget,
          owner: repoOwner,
          repo: repoName,
          baseBranch,
          targetDir,
          localPath: localRepoPath,
        },
        brief,
        kind,
        theme,
        templateName,
        spec,
        messages,
      })
      if (saved) {
        setWorkspaceId(saved.id)
        setActiveDesignWorkspaceId(saved.id)
        setRecentWorkspaces(listDesignWorkspaces())
      }
    }, 350)
    return () => window.clearTimeout(handle)
  }, [
    enabled,
    workspaceLoaded,
    workspaceId,
    workTarget,
    repoOwner,
    repoName,
    baseBranch,
    targetDir,
    localRepoPath,
    brief,
    kind,
    theme,
    templateName,
    spec,
    messages,
  ])

  const preview = useMemo(() => (spec ? renderSpec(spec) : null), [spec])

  const refreshTemplates = () => setTemplates(listDesignTemplates())

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000)
  }

  const activeKindMeta = useMemo(
    () => DESIGN_ARTIFACT_KINDS.find((entry) => entry.kind === kind),
    [kind],
  )

  const workspaceLabel =
    workTarget === 'local'
      ? localRepoPath.trim() || 'repositório local'
      : repoOwner.trim() && repoName.trim()
        ? `${repoOwner.trim()}/${repoName.trim()}`
        : 'repositório GitHub'

  const buildWorkingBrief = (source?: string) => {
    const text = (source ?? brief).trim()
    if (text) return text
    const label = activeKindMeta?.label || 'artefato'
    return `Criar ${label} com desenvolvimento e design no repositório ${workspaceLabel}, incluindo UX, código, revisão, testes e entrega.`
  }

  const generate = (source?: string) => {
    if (!hasWorkspaceTarget) {
      flash('Indique primeiro o repositório de trabalho para iniciar o desenvolvimento/design.')
      return
    }
    const nextBrief = buildWorkingBrief(source)
    setGenerating(true)
    try {
      setBrief(nextBrief)
      setSpec(specFromBrief(nextBrief, kind, theme))
    } finally {
      setGenerating(false)
    }
  }

  const startNewWorkspace = () => {
    const workspace = createDesignWorkspace({ messages: [defaultOrchestratorMessage()] })
    loadWorkspaceIntoState(workspace)
    setActiveDesignWorkspaceId(workspace.id)
    setRecentWorkspaces(listDesignWorkspaces())
    setWorkspaceLoaded(true)
    flash('Novo trabalho iniciado. Indique o repositório para começar.')
  }

  const resumeWorkspace = (workspace: DesignWorkspace) => {
    loadWorkspaceIntoState(workspace)
    setActiveDesignWorkspaceId(workspace.id)
    flash(`Trabalho “${workspace.name}” retomado com contexto e repositório salvos.`)
  }

  const handleSendChat = () => {
    const content = chatInput.trim()
    if (!content) return
    if (!hasWorkspaceTarget) {
      flash('Escolha GitHub ou local e informe o repositório antes de conversar com o orquestrador.')
      return
    }
    const userMessage = createDesignStudioChatMessage('user', content)
    const nextBrief = brief.trim() ? `${brief.trim()}\n${content}` : content
    const nextSpec = specFromBrief(nextBrief, kind, theme)
    const repoHint = workTarget === 'local'
      ? `no repositório local ${localRepoPath.trim()}`
      : `em ${repoOwner.trim()}/${repoName.trim()}`
    const reply = createDesignStudioChatMessage(
      'orchestrator',
      `Entendido. Atualizei o contexto ${repoHint}, gerei um artefato de ${activeKindMeta?.label || kind} e vou seguir no modo ${agentMode === 'auto' ? 'automático' : agentMode === 'plan' ? 'planejar' : 'perguntar'}, preservando UX, código, revisão e entrega.`,
    )
    setChatInput('')
    setBrief(nextBrief)
    setSpec(nextSpec)
    setMessages((current) => [...current, userMessage, reply].slice(-24))
  }

  const updateSpec = (patch: Partial<DesignSpec>) => {
    setSpec((current) => (current ? { ...current, ...patch } : current))
  }

  const updatePoint = (index: number, value: string) => {
    setSpec((current) => {
      if (!current) return current
      const points = current.points.slice()
      points[index] = value
      return { ...current, points }
    })
  }

  const addPoint = () => {
    setSpec((current) => (current ? { ...current, points: [...current.points, 'Nova seção'] } : current))
  }

  const removePoint = (index: number) => {
    setSpec((current) => {
      if (!current) return current
      return { ...current, points: current.points.filter((_, position) => position !== index) }
    })
  }

  const handleExport = (format: ExportFormat) => {
    if (!spec) return
    if (format === 'html') {
      downloadFile(designExportFileName(spec.title, spec.kind, 'html'), renderSpec(spec), 'text/html')
    } else if (format === 'json') {
      downloadFile(
        designExportFileName(spec.title, spec.kind, DESIGN_TEMPLATE_EXTENSION),
        serializeTemplate(templateName || spec.title, spec),
        'application/json',
      )
    } else {
      downloadFile(designExportFileName(spec.title, spec.kind, 'md'), renderSpecMarkdown(spec), 'text/markdown')
    }
  }

  const applyTemplate = (template: DesignTemplate) => {
    setSpec(template.spec)
    setBrief(template.spec.brief)
    setKind(template.spec.kind)
    setTheme(template.spec.theme)
    setTemplateName(template.name)
    flash(`Template “${template.name}” carregado.`)
  }

  const handleSaveTemplate = () => {
    if (!spec) return
    const saved = saveDesignTemplate(templateName || spec.title, spec)
    if (saved) {
      refreshTemplates()
      flash(`Template “${saved.name}” salvo.`)
    } else {
      flash('Não foi possível salvar o template neste navegador.')
    }
  }

  const handleDeleteTemplate = (template: DesignTemplate) => {
    if (deleteDesignTemplate(template.id)) {
      refreshTemplates()
      flash(`Template “${template.name}” removido.`)
    }
  }

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseTemplateFile(typeof reader.result === 'string' ? reader.result : '')
      if (!parsed) {
        flash('Arquivo inválido: não foi possível ler o design.')
        return
      }
      setSpec(parsed.spec)
      setBrief(parsed.spec.brief)
      setKind(parsed.spec.kind)
      setTheme(parsed.spec.theme)
      setTemplateName(parsed.name)
      flash(`Design “${parsed.name}” importado.`)
    }
    reader.onerror = () => flash('Não foi possível ler o arquivo.')
    reader.readAsText(file)
  }

  // ── Repository apply handlers ───────────────────────────────────────────────
  const hasToken = ghToken.trim().length > 0
  const canApply =
    !!spec &&
    workTarget === 'github' &&
    githubEnabled &&
    hasToken &&
    repoOwner.trim().length > 0 &&
    repoName.trim().length > 0 &&
    baseBranch.trim().length > 0 &&
    applyFormats.length > 0 &&
    !applying

  const toggleApplyFormat = (format: DesignApplyFormat) => {
    setApplyPlan(null)
    setApplyResult(null)
    setApplyFormats((current) =>
      current.includes(format) ? current.filter((entry) => entry !== format) : [...current, format],
    )
  }

  const applyOptions = () => ({
    owner: repoOwner,
    repo: repoName,
    baseBranch,
    dir: targetDir,
    formats: applyFormats,
    templateName: templateName || undefined,
    commitMessage: commitMessage || undefined,
    openPr,
  })

  const runApply = async () => {
    if (!spec) return
    setApplying(true)
    setApplyError(null)
    setApplyResult(null)
    try {
      const result = await applyDesignToRepo(spec, { token: ghToken, ...applyOptions() })
      setApplyResult(result)
      setApplyPlan(null)
      flash(
        result.prUrl
          ? `Design aplicado: PR #${result.prNumber} aberto.`
          : `Design aplicado na branch ${result.branch}.`,
      )
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : 'Falha ao aplicar o design no repositório.')
    } finally {
      setApplying(false)
    }
  }

  const handleApply = () => {
    if (!spec || !canApply) return
    setApplyError(null)
    if (agentMode === 'auto') {
      void runApply()
      return
    }
    // ask / plan: preview the branch, files and commit before any network call.
    setApplyResult(null)
    setApplyPlan(describeDesignApplyPlan(spec, applyOptions()))
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Palette className="mx-auto h-10 w-10 text-[var(--v2-accent-strong)]" />
        <h1 className="v2-display mt-4 text-2xl text-[var(--v2-ink-strong)]">Design Studio</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--v2-ink-soft)]">
          O Design Studio está por trás do sinalizador <code>FF_DESIGN_STUDIO</code>. Ative-o nas
          configurações de recursos para gerar slides, sites, apps, wireframes, documentos e animações
          a partir de um briefing, com temas, edição manual, templates e exportação.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-28">
      <V2PageHero
        eyebrow={<><Sparkles className="h-3.5 w-3.5" /> Design + Desenvolvimento</>}
        title="Design Studio limpo, conversacional e focado na amostra"
        description="Escolha o repositório uma vez, ajuste configurações quando precisar e trabalhe pelo chat com visualização central, resultados claros e entrega controlada."
      />

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-[rgba(15,118,110,0.3)] bg-[rgba(15,118,110,0.08)] px-4 py-2 text-sm text-[var(--v2-accent-strong)]"
        >
          {notice}
        </div>
      )}

      <section className="v2-panel overflow-hidden p-0">
        <button
          type="button"
          onClick={() => setSettingsOpen((current) => !current)}
          aria-expanded={settingsOpen}
          aria-controls="design-studio-settings"
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[rgba(15,23,42,0.03)]"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="rounded-2xl bg-[rgba(15,118,110,0.1)] p-2 text-[var(--v2-accent-strong)]">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">
                Configurações do workspace
              </span>
              <span className="mt-1 block truncate text-lg font-semibold text-[var(--v2-ink-strong)]">
                {hasWorkspaceTarget ? workspaceLabel : 'Defina o repositório para começar'}
              </span>
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-2 text-xs text-[var(--v2-ink-soft)] sm:flex">
            {activeKindMeta?.label || 'Artefato'} · {agentMode === 'auto' ? 'Automático' : agentMode === 'plan' ? 'Planejar' : 'Perguntar'}
            <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {settingsOpen && (
          <div id="design-studio-settings" className="border-t border-[var(--v2-line-soft)] p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">
                      1 · Repositório escolhido
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-[var(--v2-ink-strong)]">Contexto único do trabalho</h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--v2-ink-soft)]">
                      O Design Studio usa este escopo para chat, geração, prévia e entrega — sem repetir seleção na etapa final.
                    </p>
                  </div>
                  <button type="button" onClick={startNewWorkspace} className="v2-btn-secondary shrink-0 justify-center">
                    <Plus className="h-4 w-4" /> Novo
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {([
                    { target: 'github' as const, label: 'Nuvem GitHub', icon: Cloud, hint: 'Branch, commit e PR pelo conector GitHub.' },
                    { target: 'local' as const, label: 'Repositório local', icon: FolderGit2, hint: 'Escopo local persistido para continuidade.' },
                  ]).map((option) => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.target}
                        type="button"
                        aria-pressed={workTarget === option.target}
                        onClick={() => {
                          setWorkTarget(option.target)
                          setApplyPlan(null)
                        }}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          workTarget === option.target
                            ? 'border-[rgba(15,118,110,0.45)] bg-[rgba(15,118,110,0.1)] text-[var(--v2-ink-strong)]'
                            : 'border-[var(--v2-line-soft)] bg-white/70 text-[var(--v2-ink-soft)] hover:border-[var(--v2-line-strong)]'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <Icon className="h-4 w-4" /> {option.label}
                        </span>
                        <span className="mt-1 block text-[11px] leading-4">{option.hint}</span>
                      </button>
                    )
                  })}
                </div>

                {workTarget === 'github' ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
                    <div>
                      <label htmlFor="workspace-owner" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Owner</label>
                      <input
                        id="workspace-owner"
                        value={repoOwner}
                        onChange={(event) => {
                          setRepoOwner(event.target.value)
                          setApplyPlan(null)
                        }}
                        placeholder="org ou usuário"
                        aria-label="Owner do repositório de trabalho"
                        className="v2-field mt-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="workspace-repo" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Repositório</label>
                      <input
                        id="workspace-repo"
                        value={repoName}
                        onChange={(event) => {
                          setRepoName(event.target.value)
                          setApplyPlan(null)
                        }}
                        placeholder="nome-do-repo"
                        aria-label="Nome do repositório de trabalho"
                        className="v2-field mt-1"
                      />
                    </div>
                    <div>
                      <label htmlFor="workspace-base" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Branch</label>
                      <input
                        id="workspace-base"
                        value={baseBranch}
                        onChange={(event) => {
                          setBaseBranch(event.target.value)
                          setApplyPlan(null)
                        }}
                        placeholder="main"
                        aria-label="Branch base do trabalho"
                        className="v2-field mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <label htmlFor="workspace-local-path" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">
                      Caminho local do repositório
                    </label>
                    <input
                      id="workspace-local-path"
                      value={localRepoPath}
                      onChange={(event) => setLocalRepoPath(event.target.value)}
                      placeholder="/caminho/para/meu-repositorio"
                      aria-label="Caminho local do repositório de trabalho"
                      className="v2-field mt-1"
                    />
                    <p className="mt-1 text-[11px] text-[var(--v2-ink-faint)]">
                      No navegador, o caminho é contexto persistido. Escrita local automática depende de runtime desktop/sidecar.
                    </p>
                  </div>
                )}

                {!hasWorkspaceTarget && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Informe o repositório para liberar o chat e a geração.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">2 · Direção criativa</p>
                <h2 className="mt-1 text-base font-semibold text-[var(--v2-ink-strong)]">Briefing, artefato e tema</h2>

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">Tipo de artefato</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DESIGN_ARTIFACT_KINDS.map((entry) => (
                    <button
                      key={entry.kind}
                      type="button"
                      aria-pressed={entry.kind === kind}
                      onClick={() => setKind(entry.kind)}
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${
                        entry.kind === kind
                          ? 'border-[rgba(15,118,110,0.4)] bg-[rgba(15,118,110,0.1)] text-[var(--v2-ink-strong)]'
                          : 'border-[var(--v2-line-soft)] bg-white/70 text-[var(--v2-ink-soft)] hover:border-[var(--v2-line-strong)]'
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                {activeKindMeta && (
                  <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">{activeKindMeta.description}</p>
                )}

                <label htmlFor="design-theme" className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">
                  Tema
                </label>
                <select
                  id="design-theme"
                  value={theme}
                  onChange={(event) => {
                    const nextTheme = event.target.value as DesignThemeId
                    setTheme(nextTheme)
                    updateSpec({ theme: nextTheme })
                  }}
                  aria-label="Tema do design"
                  className="v2-field mt-2"
                >
                  {DESIGN_THEMES.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label} — {entry.description}
                    </option>
                  ))}
                </select>

                <textarea
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      generate()
                    }
                  }}
                  rows={4}
                  placeholder="Opcional: landing page para um escritório trabalhista, com hero, diferenciais e chamada para agendamento…"
                  aria-label="Briefing do design"
                  className="v2-field mt-3 resize-none"
                />

                <button
                  type="button"
                  onClick={() => generate()}
                  disabled={!canGenerate}
                  className="v2-btn-primary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {generating ? 'Gerando…' : 'Gerar design/código'}
                </button>
                <p className="mt-2 text-[11px] text-[var(--v2-ink-faint)]">
                  ⌘/Ctrl + Enter gera · briefing, modelos e padrões são facultativos
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Templates</p>
                    <h3 className="mt-1 text-base font-semibold text-[var(--v2-ink-strong)]">Modelos e padrões</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-line-soft)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[var(--v2-ink-soft)] transition-colors hover:border-[var(--v2-line-strong)]"
                  >
                    <Upload className="h-3 w-3" /> Importar
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    aria-label="Importar template de design"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </div>

                <ul className="mt-3 flex max-h-56 flex-col gap-2 overflow-auto">
                  {templates.map((template) => (
                    <li
                      key={template.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[var(--v2-line-soft)] bg-white/70 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => applyTemplate(template)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-[var(--v2-ink-strong)]">{template.name}</span>
                        <span className="block truncate text-[11px] text-[var(--v2-ink-faint)]">
                          {template.spec.kind} · {template.builtIn ? 'padrão' : 'meu template'}
                        </span>
                      </button>
                      {!template.builtIn && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(template)}
                          aria-label={`Remover template ${template.name}`}
                          className="rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder="Nome do template"
                    aria-label="Nome do template"
                    className="v2-field flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTemplate}
                    disabled={!spec}
                    className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> Salvar
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Saída e entrega</p>
                <h3 className="mt-1 text-base font-semibold text-[var(--v2-ink-strong)]">Editar, exportar e publicar</h3>

                {spec ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label htmlFor="design-title" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Título</label>
                      <input
                        id="design-title"
                        value={spec.title}
                        onChange={(event) => updateSpec({ title: event.target.value })}
                        aria-label="Título do design"
                        className="v2-field mt-1"
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <button type="button" onClick={() => handleExport('html')} disabled={!spec} className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        <Download className="h-4 w-4" /> Exportar HTML
                      </button>
                      <button type="button" onClick={() => handleExport('json')} disabled={!spec} className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        <FileJson className="h-4 w-4" /> Exportar template (JSON)
                      </button>
                      <button type="button" onClick={() => handleExport('markdown')} disabled={!spec} className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50">
                        <FileText className="h-4 w-4" /> Exportar Markdown
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
                    Gere um design para editar, exportar e preparar a entrega.
                  </p>
                )}

                <div className="mt-4 rounded-xl border border-[var(--v2-line-soft)] bg-[rgba(15,23,42,0.02)] p-3">
                  <div className="flex items-center gap-2">
                    <Github className="h-4 w-4 text-[var(--v2-ink-strong)]" />
                    <h4 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Entrega no escopo selecionado</h4>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                    Publica em <strong>{workspaceLabel}</strong>, sempre em nova branch e nunca diretamente em main/master.
                  </p>

                  {workTarget === 'local' ? (
                    <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                      O contexto local fica salvo; commits automáticos locais exigem runtime desktop/sidecar.
                    </p>
                  ) : !githubEnabled ? (
                    <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                      Ative o sinalizador <code>FF_CHAT_GITHUB</code> para conectar um repositório.
                    </p>
                  ) : ghConfigLoaded && !hasToken ? (
                    <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                      Nenhum token configurado. Adicione um token (PAT) em Configurações → Conector GitHub para publicar.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label htmlFor="apply-dir" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Pasta de destino</label>
                          <input
                            id="apply-dir"
                            value={targetDir}
                            onChange={(event) => {
                              setTargetDir(event.target.value)
                              setApplyPlan(null)
                            }}
                            placeholder="design"
                            aria-label="Pasta de destino"
                            className="v2-field mt-1"
                          />
                        </div>
                        <div>
                          <label htmlFor="apply-message" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Commit</label>
                          <input
                            id="apply-message"
                            value={commitMessage}
                            onChange={(event) => setCommitMessage(event.target.value)}
                            placeholder={spec ? `Design Studio: ${spec.title} (${spec.kind})` : 'Design Studio: …'}
                            aria-label="Mensagem do commit"
                            className="v2-field mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Arquivos</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {DESIGN_APPLY_FORMATS.map((format) => (
                            <button
                              key={format}
                              type="button"
                              aria-pressed={applyFormats.includes(format)}
                              onClick={() => toggleApplyFormat(format)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                applyFormats.includes(format)
                                  ? 'border-[rgba(15,118,110,0.4)] bg-[rgba(15,118,110,0.1)] text-[var(--v2-ink-strong)]'
                                  : 'border-[var(--v2-line-soft)] bg-white/70 text-[var(--v2-ink-soft)] hover:border-[var(--v2-line-strong)]'
                              }`}
                            >
                              {APPLY_FORMAT_LABELS[format]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-[var(--v2-ink-soft)]">
                        <input
                          type="checkbox"
                          checked={openPr}
                          onChange={(event) => {
                            setOpenPr(event.target.checked)
                            setApplyPlan(null)
                          }}
                          aria-label="Abrir pull request"
                        />
                        Abrir pull request para {baseBranch.trim() || 'a branch base'}
                      </label>

                      <button
                        type="button"
                        onClick={handleApply}
                        disabled={!canApply}
                        className="v2-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                        {applying ? 'Publicando…' : agentMode === 'plan' ? 'Planejar publicação' : 'Publicar no repositório'}
                      </button>
                      {!spec && <p className="text-[11px] text-[var(--v2-ink-faint)]">Gere um design para habilitar a publicação.</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                  <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Trabalhos recentes</h3>
                </div>
                {recentWorkspaces.length === 0 ? (
                  <p className="mt-3 text-xs leading-5 text-[var(--v2-ink-soft)]">
                    Nenhum trabalho salvo ainda. Assim que você indicar um repositório ou conversar, ele aparece aqui.
                  </p>
                ) : (
                  <ul className="mt-3 grid max-h-44 gap-2 overflow-auto sm:grid-cols-2">
                    {recentWorkspaces.map((workspace) => (
                      <li key={workspace.id}>
                        <button
                          type="button"
                          onClick={() => resumeWorkspace(workspace)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            workspace.id === workspaceId
                              ? 'border-[rgba(15,118,110,0.4)] bg-[rgba(15,118,110,0.08)]'
                              : 'border-[var(--v2-line-soft)] bg-white hover:border-[var(--v2-line-strong)]'
                          }`}
                        >
                          <span className="block truncate text-sm font-medium text-[var(--v2-ink-strong)]">{workspace.name}</span>
                          <span className="block truncate text-[11px] text-[var(--v2-ink-faint)]">
                            {workspace.repository.target === 'local'
                              ? workspace.repository.localPath || 'local'
                              : `${workspace.repository.owner || 'owner'}/${workspace.repository.repo || 'repo'}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--v2-line-soft)] bg-white/70 p-4">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-[var(--v2-accent-strong)]" />
                  <h3 className="text-sm font-semibold text-[var(--v2-ink-strong)]">Ferramentas de referência</h3>
                </div>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {OPEN_TOOL_REFERENCES.slice(0, 4).map((tool) => (
                    <li key={tool.href} className="rounded-xl border border-[var(--v2-line-soft)] bg-white/70 px-3 py-2">
                      <a href={tool.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--v2-ink-strong)] hover:underline">
                        {tool.name} <ExternalLink className="h-3 w-3" />
                      </a>
                      <p className="mt-1 text-[11px] leading-4 text-[var(--v2-ink-soft)]">{tool.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section className="v2-panel flex min-h-[64vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--v2-line-soft)] px-5 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Resultado / visualização / amostra</p>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--v2-ink-strong)]">
                <Layers className="h-4 w-4 text-[var(--v2-accent-strong)]" /> Canvas principal
              </div>
            </div>
            {spec && (
              <button
                type="button"
                onClick={() => generate()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-line-soft)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[var(--v2-ink-soft)] transition-colors hover:border-[var(--v2-line-strong)]"
              >
                <RefreshCcw className="h-3 w-3" /> Regerar
              </button>
            )}
          </div>
          <div className="flex-1 bg-[rgba(15,23,42,0.03)] p-4">
            {preview ? (
              <iframe
                title="Amostra do design"
                sandbox="allow-same-origin"
                srcDoc={preview}
                className="h-full min-h-[56vh] w-full rounded-xl border border-[var(--v2-line-soft)] bg-white shadow-sm"
              />
            ) : (
              <div className="flex h-full min-h-[56vh] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--v2-line-soft)] bg-white/70 text-center text-[var(--v2-ink-soft)]">
                <Palette className="h-10 w-10 text-[var(--v2-accent-strong)]" />
                <p className="mt-4 max-w-sm text-sm leading-6">
                  Defina o repositório e use a barra de chat para criar. A amostra aparece aqui limpa, pronta para revisar, exportar ou publicar.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="v2-panel p-5">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-[var(--v2-accent-strong)]" />
              <h3 className="text-base font-semibold text-[var(--v2-ink-strong)]">Histórico do chat</h3>
            </div>
            <div className="mt-3 max-h-[42vh] space-y-2 overflow-auto rounded-xl border border-[var(--v2-line-soft)] bg-white/70 p-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-3 py-2 text-xs leading-5 ${
                    message.role === 'user'
                      ? 'ml-6 bg-[rgba(15,118,110,0.12)] text-[var(--v2-ink-strong)]'
                      : 'mr-6 bg-[rgba(15,23,42,0.04)] text-[var(--v2-ink-soft)]'
                  }`}
                >
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">
                    {message.role === 'user' ? <Code2 className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                    {message.role === 'user' ? 'Você' : 'Orquestrador'}
                  </span>
                  {message.content}
                </div>
              ))}
            </div>
          </section>

          {(applyPlan || applyResult || applyError) && (
            <section className="v2-panel p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Resultado da entrega</p>
              {applyPlan && (
                <div className="mt-3 rounded-xl border border-[var(--v2-line-soft)] bg-white/70 p-3 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                  <p className="font-semibold text-[var(--v2-ink-strong)]">
                    {agentMode === 'plan' ? 'Plano da publicação' : 'Confirme a publicação'}
                  </p>
                  <p className="mt-1">
                    Repositório <strong>{applyPlan.owner}/{applyPlan.repo}</strong> · nova branch{' '}
                    <strong>{applyPlan.branch}</strong> a partir de <strong>{applyPlan.baseBranch}</strong>.
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {applyPlan.files.map((file) => <li key={file} className="break-all">{file}</li>)}
                  </ul>
                  <p className="mt-1">
                    Commit: “{applyPlan.commitMessage}”. {applyPlan.openPr ? 'Abre um pull request.' : 'Sem pull request.'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void runApply()} disabled={applying} className="v2-btn-primary justify-center px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50">
                      {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                      Publicar agora
                    </button>
                    <button type="button" onClick={() => setApplyPlan(null)} className="v2-btn-secondary justify-center px-3 py-1.5 text-[11px]">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {applyResult && (
                <div className="mt-3 rounded-xl border border-[rgba(15,118,110,0.3)] bg-[rgba(15,118,110,0.08)] p-3 text-[11px] leading-5 text-[var(--v2-accent-strong)]">
                  <p className="font-semibold">Design aplicado em {applyResult.branch}.</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {applyResult.commitUrl && (
                      <a href={applyResult.commitUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        <ExternalLink className="h-3 w-3" /> Ver commit
                      </a>
                    )}
                    {applyResult.prUrl && (
                      <a href={applyResult.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                        <ExternalLink className="h-3 w-3" /> Ver pull request #{applyResult.prNumber}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {applyError && (
                <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700">
                  {applyError}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      <section className="v2-panel fixed inset-x-4 bottom-4 z-20 mx-auto max-w-6xl border border-[rgba(15,118,110,0.24)] bg-white/95 p-3 shadow-2xl backdrop-blur">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Barra do chat</p>
            <p className="text-xs text-[var(--v2-ink-soft)]">Modo de execução e comando principal sempre à mão.</p>
          </div>
          <AgentModePicker value={agentMode} onChange={setAgentMode} targetRepo={hasWorkspaceTarget ? workspaceLabel : undefined} />
        </div>
        <div className="flex gap-2">
          <textarea
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                handleSendChat()
              }
            }}
            rows={2}
            disabled={!hasWorkspaceTarget}
            placeholder={hasWorkspaceTarget ? 'Peça uma tela, componente, revisão UX ou ajuste de código/design…' : 'Informe o repositório nas configurações para iniciar'}
            aria-label="Mensagem para o orquestrador"
            className="v2-field resize-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSendChat}
            disabled={!hasWorkspaceTarget || !chatInput.trim()}
            aria-label="Enviar mensagem ao orquestrador"
            className="v2-btn-primary min-w-[52px] justify-center px-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  )
}
