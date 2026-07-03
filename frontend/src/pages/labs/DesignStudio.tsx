import { useMemo, useState } from 'react'
import { Download, Layers, Loader2, Sparkles, Github, RefreshCcw, Palette } from 'lucide-react'
import { V2PageHero } from '../../components/v2/V2PagePrimitives'
import { isEnabled } from '../../lib/feature-flags'
import {
  DESIGN_ARTIFACT_KINDS,
  buildDesignPreview,
  designExportFileName,
  type DesignArtifactKind,
} from '../../lib/design-studio/templates'

/**
 * Design Studio — foundation slice (behind `FF_DESIGN_STUDIO`).
 *
 * Three-panel Claude-Design-like shell: a brief/prompt composer on the left, a
 * live sandboxed preview canvas in the centre, and an artifacts/exports rail on
 * the right. Generation is deterministic and client-side in this phase; later
 * phases wire an LLM design agent, template import/export, design cloning from
 * URLs and repository binding onto the same preview/export contract.
 */
export default function DesignStudio() {
  const enabled = isEnabled('FF_DESIGN_STUDIO')
  const [brief, setBrief] = useState('')
  const [kind, setKind] = useState<DesignArtifactKind>('site')
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [lastBrief, setLastBrief] = useState('')
  const [lastKind, setLastKind] = useState<DesignArtifactKind>('site')

  const canGenerate = brief.trim().length > 0 && !generating

  const generate = () => {
    if (!brief.trim()) return
    setGenerating(true)
    // Deterministic, offline scaffold — kept async-shaped so the LLM design
    // agent can slot in here without changing the call site.
    try {
      const html = buildDesignPreview(brief, kind)
      setPreview(html)
      setLastBrief(brief)
      setLastKind(kind)
    } finally {
      setGenerating(false)
    }
  }

  const handleExport = () => {
    if (!preview || typeof document === 'undefined') return
    const blob = new Blob([preview], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = designExportFileName(lastBrief, lastKind)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
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
          a partir de um briefing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <V2PageHero
        eyebrow={<><Sparkles className="h-3.5 w-3.5" /> Design Studio</>}
        title="Do briefing ao design, com amostra ao vivo"
        description="Descreva o que precisa e gere slides, sites, apps, wireframes, documentos e animações. Visualize em tempo real e exporte para usar em outras ferramentas ou aplicar nos repositórios conectados."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,300px)]">
        {/* Left — brief composer */}
        <section className="v2-panel flex flex-col gap-4 p-5">
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

          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                generate()
              }
            }}
            rows={7}
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
        </section>

        {/* Center — live preview canvas */}
        <section className="v2-panel flex min-h-[60vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--v2-line-soft)] px-5 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--v2-ink-strong)]">
              <Layers className="h-4 w-4 text-[var(--v2-accent-strong)]" />
              Amostra ao vivo
            </div>
            {preview && (
              <button
                type="button"
                onClick={generate}
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
                className="h-full min-h-[52vh] w-full rounded-xl border border-[var(--v2-line-soft)] bg-white"
              />
            ) : (
              <div className="flex h-full min-h-[52vh] flex-col items-center justify-center text-center text-[var(--v2-ink-soft)]">
                <Palette className="h-10 w-10 text-[var(--v2-accent-strong)]" />
                <p className="mt-4 max-w-sm text-sm leading-6">
                  Descreva seu design e clique em <strong>Gerar design</strong>. A amostra aparece aqui,
                  pronta para exportar ou aplicar em um repositório conectado.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right — artifacts / exports / repo binding */}
        <aside className="space-y-4">
          <section className="v2-panel p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--v2-ink-faint)]">Exportar</p>
            <h3 className="mt-2 text-base font-semibold text-[var(--v2-ink-strong)]">Arquivo do design</h3>
            <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
              Exporte um HTML autossuficiente para abrir em navegador ou importar em outras ferramentas.
            </p>
            <button
              type="button"
              onClick={handleExport}
              disabled={!preview}
              className="v2-btn-secondary mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Exportar HTML
            </button>
          </section>

          <section className="v2-panel p-5">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-[var(--v2-ink-strong)]" />
              <h3 className="text-base font-semibold text-[var(--v2-ink-strong)]">Aplicar em repositório</h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--v2-ink-soft)]">
              Em breve: envie o design gerado direto para um repositório conectado (mesmo conector GitHub
              do chat), respeitando os modos automático / perguntar / planejar.
            </p>
            <span className="mt-3 inline-flex items-center rounded-full bg-[rgba(15,118,110,0.1)] px-2.5 py-1 text-[11px] font-medium text-[var(--v2-accent-strong)]">
              Fase seguinte
            </span>
          </section>
        </aside>
      </div>
    </div>
  )
}
