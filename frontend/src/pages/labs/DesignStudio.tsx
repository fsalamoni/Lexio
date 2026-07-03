import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  ExternalLink,
  FileJson,
  FileText,
  GitPullRequest,
  Github,
  Layers,
  Loader2,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { V2PageHero } from '../../components/v2/V2PagePrimitives'
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

type ExportFormat = 'html' | 'json' | 'markdown'

type ApplyMode = 'auto' | 'ask' | 'plan'

const APPLY_MODE_OPTIONS: Array<{ mode: ApplyMode; label: string; hint: string }> = [
  { mode: 'auto', label: 'Automático', hint: 'Aplica direto ao clicar.' },
  { mode: 'ask', label: 'Perguntar', hint: 'Mostra um resumo para confirmar.' },
  { mode: 'plan', label: 'Planejar', hint: 'Só descreve o que faria.' },
]

const APPLY_FORMAT_LABELS: Record<DesignApplyFormat, string> = {
  html: 'HTML',
  json: 'Template (JSON)',
  markdown: 'Markdown',
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
  const [applyMode, setApplyMode] = useState<ApplyMode>('ask')
  const [applyFormats, setApplyFormats] = useState<DesignApplyFormat[]>(['html', 'json'])
  const [applying, setApplying] = useState(false)
  const [applyPlan, setApplyPlan] = useState<DesignApplyPlan | null>(null)
  const [applyResult, setApplyResult] = useState<DesignApplyResult | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

  const canGenerate = brief.trim().length > 0 && !generating

  useEffect(() => {
    if (enabled) setTemplates(listDesignTemplates())
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

  const preview = useMemo(() => (spec ? renderSpec(spec) : null), [spec])

  const refreshTemplates = () => setTemplates(listDesignTemplates())

  const flash = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 4000)
  }

  const generate = () => {
    if (!brief.trim()) return
    setGenerating(true)
    try {
      setSpec(specFromBrief(brief, kind, theme))
    } finally {
      setGenerating(false)
    }
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
    if (applyMode === 'auto') {
      void runApply()
      return
    }
    // ask / plan: preview the branch, files and commit before any network call.
    setApplyResult(null)
    setApplyPlan(describeDesignApplyPlan(spec, applyOptions()))
  }

  const activeKindMeta = useMemo(
    () => DESIGN_ARTIFACT_KINDS.find((entry) => entry.kind === kind),
    [kind],
  )

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
    <div className="space-y-6">
      <V2PageHero
        eyebrow={<><Sparkles className="h-3.5 w-3.5" /> Design Studio</>}
        title="Do briefing ao design, com amostra ao vivo"
        description="Descreva o que precisa e gere slides, sites, apps, wireframes, documentos e animações. Escolha um tema, edite à mão, salve e reutilize templates, e exporte em HTML, JSON ou Markdown para outras ferramentas."
      />

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-[rgba(15,118,110,0.3)] bg-[rgba(15,118,110,0.08)] px-4 py-2 text-sm text-[var(--v2-accent-strong)]"
        >
          {notice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,320px)]">
        {/* Left — brief composer + templates */}
        <section className="flex flex-col gap-4">
          <div className="v2-panel flex flex-col gap-4 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Briefing</p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--v2-ink-strong)]">O que vamos criar?</h2>
            </div>

            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">Tipo de artefato</label>
            <div className="grid grid-cols-2 gap-2">
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
              <p className="text-xs leading-5 text-[var(--v2-ink-soft)]">{activeKindMeta.description}</p>
            )}

            <label htmlFor="design-theme" className="text-xs font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">
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
              className="v2-field"
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
              rows={6}
              placeholder="Ex.: landing page para um escritório trabalhista, com hero, três diferenciais e chamada para agendamento…"
              aria-label="Briefing do design"
              className="v2-field resize-none"
            />

            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className="v2-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? 'Gerando…' : 'Gerar design'}
            </button>
            <p className="text-[11px] text-[var(--v2-ink-faint)]">⌘/Ctrl + Enter gera · a amostra abre ao lado</p>
          </div>

          {/* Templates gallery */}
          <div className="v2-panel flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
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

            <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
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

            <div className="flex items-center gap-2">
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
        </section>

        {/* Center — live preview canvas */}
        <section className="v2-panel flex min-h-[60vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--v2-line-soft)] px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--v2-ink-strong)]">
              <Layers className="h-4 w-4 text-[var(--v2-accent-strong)]" />
              Amostra ao vivo
            </div>
            {spec && (
              <button
                type="button"
                onClick={generate}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--v2-line-soft)] bg-white/70 px-2.5 py-1 text-[11px] font-medium text-[var(--v2-ink-soft)] transition-colors hover:border-[var(--v2-line-strong)]"
              >
                <RefreshCcw className="h-3 w-3" /> Regerar do briefing
              </button>
            )}
          </div>
          <div className="flex-1 bg-[rgba(15,23,42,0.03)] p-4">
            {preview ? (
              <iframe
                title="Amostra do design"
                sandbox="allow-same-origin"
                srcDoc={preview}
                className="h-full min-h-[52vh] w-full rounded-xl border border-[var(--v2-line-soft)] bg-white"
              />
            ) : (
              <div className="flex h-full min-h-[52vh] flex-col items-center justify-center text-center text-[var(--v2-ink-soft)]">
                <Palette className="h-10 w-10 text-[var(--v2-accent-strong)]" />
                <p className="mt-4 max-w-sm text-sm leading-6">
                  Descreva seu design e clique em <strong>Gerar design</strong>. A amostra aparece aqui,
                  pronta para editar, exportar ou aplicar em um repositório conectado.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right — manual editor + exports + repo binding */}
        <aside className="space-y-4">
          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Edição manual</p>
            <h3 className="mt-2 text-base font-semibold text-[var(--v2-ink-strong)]">Ajuste o conteúdo</h3>
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
                <div className="space-y-2">
                  <span className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Seções</span>
                  {spec.points.map((point, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={point}
                        onChange={(event) => updatePoint(index, event.target.value)}
                        aria-label={`Seção ${index + 1}`}
                        className="v2-field flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => removePoint(index)}
                        aria-label={`Remover seção ${index + 1}`}
                        className="rounded-lg p-1.5 text-[var(--v2-ink-faint)] transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addPoint}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--v2-accent-strong)] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar seção
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
                Gere um design para editar título e seções manualmente. As mudanças aparecem na amostra ao vivo.
              </p>
            )}
          </section>

          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Exportar</p>
            <h3 className="mt-2 text-base font-semibold text-[var(--v2-ink-strong)]">Arquivos do design</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
              HTML autossuficiente para abrir no navegador, JSON de template para reimportar aqui ou em outras ferramentas,
              e Markdown para documentos e wikis.
            </p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => handleExport('html')}
                disabled={!spec}
                className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Exportar HTML
              </button>
              <button
                type="button"
                onClick={() => handleExport('json')}
                disabled={!spec}
                className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileJson className="h-4 w-4" /> Exportar template (JSON)
              </button>
              <button
                type="button"
                onClick={() => handleExport('markdown')}
                disabled={!spec}
                className="v2-btn-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-4 w-4" /> Exportar Markdown
              </button>
            </div>
          </section>

          <section className="v2-panel p-5">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-[var(--v2-ink-strong)]" />
              <h3 className="text-base font-semibold text-[var(--v2-ink-strong)]">Aplicar em repositório</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
              Envie o design gerado direto para um repositório conectado (mesmo conector GitHub do chat).
              O envio cria sempre uma nova branch — nunca escreve em main/master — e pode abrir um pull request.
            </p>

            {!githubEnabled ? (
              <p className="mt-3 rounded-lg bg-[rgba(15,23,42,0.04)] px-3 py-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                Ative o sinalizador <code>FF_CHAT_GITHUB</code> para conectar um repositório.
              </p>
            ) : ghConfigLoaded && !hasToken ? (
              <p className="mt-3 rounded-lg bg-[rgba(15,23,42,0.04)] px-3 py-2 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                Nenhum token configurado. Adicione um token (PAT) em Configurações → Conector GitHub para aplicar.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="apply-owner" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Owner</label>
                    <input
                      id="apply-owner"
                      value={repoOwner}
                      onChange={(event) => setRepoOwner(event.target.value)}
                      placeholder="org ou usuário"
                      aria-label="Proprietário do repositório"
                      className="v2-field mt-1"
                    />
                  </div>
                  <div>
                    <label htmlFor="apply-repo" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Repositório</label>
                    <input
                      id="apply-repo"
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      placeholder="nome-do-repo"
                      aria-label="Nome do repositório"
                      className="v2-field mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="apply-base" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Branch base</label>
                    <input
                      id="apply-base"
                      value={baseBranch}
                      onChange={(event) => setBaseBranch(event.target.value)}
                      placeholder="main"
                      aria-label="Branch base"
                      className="v2-field mt-1"
                    />
                  </div>
                  <div>
                    <label htmlFor="apply-dir" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Pasta de destino</label>
                    <input
                      id="apply-dir"
                      value={targetDir}
                      onChange={(event) => setTargetDir(event.target.value)}
                      placeholder="design"
                      aria-label="Pasta de destino"
                      className="v2-field mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="apply-message" className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Mensagem do commit (opcional)</label>
                  <input
                    id="apply-message"
                    value={commitMessage}
                    onChange={(event) => setCommitMessage(event.target.value)}
                    placeholder={spec ? `Design Studio: ${spec.title} (${spec.kind})` : 'Design Studio: …'}
                    aria-label="Mensagem do commit"
                    className="v2-field mt-1"
                  />
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

                <div>
                  <span className="text-[11px] font-medium text-[var(--v2-ink-faint)]">Modo de execução</span>
                  <div className="mt-1 grid grid-cols-3 gap-1.5">
                    {APPLY_MODE_OPTIONS.map((option) => (
                      <button
                        key={option.mode}
                        type="button"
                        aria-pressed={applyMode === option.mode}
                        title={option.hint}
                        onClick={() => {
                          setApplyMode(option.mode)
                          setApplyPlan(null)
                        }}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          applyMode === option.mode
                            ? 'border-[rgba(15,118,110,0.4)] bg-[rgba(15,118,110,0.1)] text-[var(--v2-ink-strong)]'
                            : 'border-[var(--v2-line-soft)] bg-white/70 text-[var(--v2-ink-soft)] hover:border-[var(--v2-line-strong)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply}
                  className="v2-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                  {applying ? 'Aplicando…' : applyMode === 'plan' ? 'Planejar envio' : 'Aplicar no repositório'}
                </button>
                {!spec && (
                  <p className="text-[11px] text-[var(--v2-ink-faint)]">Gere um design para habilitar o envio.</p>
                )}

                {applyPlan && (
                  <div className="rounded-xl border border-[var(--v2-line-soft)] bg-white/70 p-3 text-[11px] leading-5 text-[var(--v2-ink-soft)]">
                    <p className="font-semibold text-[var(--v2-ink-strong)]">
                      {applyMode === 'plan' ? 'Plano do envio' : 'Confirme o envio'}
                    </p>
                    <p className="mt-1">
                      Repositório <strong>{applyPlan.owner}/{applyPlan.repo}</strong> · nova branch{' '}
                      <strong>{applyPlan.branch}</strong> a partir de <strong>{applyPlan.baseBranch}</strong>.
                    </p>
                    <ul className="mt-1 list-disc pl-4">
                      {applyPlan.files.map((file) => (
                        <li key={file} className="break-all">{file}</li>
                      ))}
                    </ul>
                    <p className="mt-1">
                      Commit: “{applyPlan.commitMessage}”. {applyPlan.openPr ? 'Abre um pull request.' : 'Sem pull request.'}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void runApply()}
                        disabled={applying}
                        className="v2-btn-primary justify-center px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                        Aplicar agora
                      </button>
                      <button
                        type="button"
                        onClick={() => setApplyPlan(null)}
                        className="v2-btn-secondary justify-center px-3 py-1.5 text-[11px]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {applyResult && (
                  <div className="rounded-xl border border-[rgba(15,118,110,0.3)] bg-[rgba(15,118,110,0.08)] p-3 text-[11px] leading-5 text-[var(--v2-accent-strong)]">
                    <p className="font-semibold">Design aplicado em {applyResult.branch}.</p>
                    <div className="mt-1 flex flex-col gap-1">
                      {applyResult.commitUrl && (
                        <a
                          href={applyResult.commitUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver commit
                        </a>
                      )}
                      {applyResult.prUrl && (
                        <a
                          href={applyResult.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver pull request #{applyResult.prNumber}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {applyError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700"
                  >
                    {applyError}
                  </div>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
