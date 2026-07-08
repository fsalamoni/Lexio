import { useMemo, useState } from 'react'
import {
  Code2,
  Download,
  Eye,
  FileText,
  GitPullRequestArrow,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
} from 'lucide-react'
import clsx from 'clsx'
import type { DesignStudioProject, DesignStudioRepoRef, PreviewResult } from '../../lib/design-studio-v2'
import { listProjectPaths } from '../../lib/design-studio-v2'

interface StudioPreviewProps {
  project: DesignStudioProject
  preview: PreviewResult
  repo?: DesignStudioRepoRef
  applying: boolean
  onApply: () => void
  onDownload: () => void
  onRefresh: () => void
  onEditFile: (path: string, content: string) => void
}

type Tab = 'preview' | 'code'
type Device = 'desktop' | 'mobile'

export default function StudioPreview({
  project,
  preview,
  repo,
  applying,
  onApply,
  onDownload,
  onRefresh,
  onEditFile,
}: StudioPreviewProps) {
  const [tab, setTab] = useState<Tab>('preview')
  const [device, setDevice] = useState<Device>('desktop')
  const paths = useMemo(() => listProjectPaths(project), [project])
  const [selected, setSelected] = useState<string | undefined>(() => project.previewEntry ?? paths[0])
  const activePath = selected && project.files[selected] ? selected : paths[0]
  const activeFile = activePath ? project.files[activePath] : undefined

  const applyLabel = repo?.provider === 'github' ? 'Aplicar (branch + PR)' : 'Baixar projeto (ZIP)'
  const ApplyIcon = repo?.provider === 'github' ? GitPullRequestArrow : Download

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[var(--v2-border)] px-3 py-2">
        <div className="inline-flex rounded-full border border-[var(--v2-border)] bg-white/70 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1', tab === 'preview' ? 'bg-[var(--v2-accent-strong)] text-white' : 'text-[var(--v2-ink-soft)]')}
          >
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button
            type="button"
            onClick={() => setTab('code')}
            className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1', tab === 'code' ? 'bg-[var(--v2-accent-strong)] text-white' : 'text-[var(--v2-ink-soft)]')}
          >
            <Code2 className="h-3.5 w-3.5" /> Código
            <span className="ml-0.5 rounded-full bg-black/10 px-1.5 text-[0.65rem]">{paths.length}</span>
          </button>
        </div>

        {tab === 'preview' && (
          <div className="hidden items-center gap-1 sm:flex">
            <button type="button" onClick={() => setDevice('desktop')} title="Desktop" className={clsx('rounded-md p-1.5', device === 'desktop' ? 'bg-black/10' : 'text-[var(--v2-ink-faint)]')}>
              <Monitor className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setDevice('mobile')} title="Mobile" className={clsx('rounded-md p-1.5', device === 'mobile' ? 'bg-black/10' : 'text-[var(--v2-ink-faint)]')}>
              <Smartphone className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRefresh} title="Recarregar preview" className="rounded-md p-1.5 text-[var(--v2-ink-faint)] hover:bg-black/5">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={applying || paths.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v2-ink-strong)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ApplyIcon className="h-3.5 w-3.5" />}
            {applyLabel}
          </button>
        </div>
      </div>

      {/* Body */}
      {tab === 'preview' ? (
        <div className="flex min-h-0 flex-1 flex-col bg-[rgba(15,23,42,0.04)]">
          {preview.note && (
            <p className="border-b border-[var(--v2-border)] bg-amber-50 px-3 py-1.5 text-[0.72rem] leading-4 text-amber-800">{preview.note}</p>
          )}
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-3">
            <iframe
              title="Pré-visualização do Design Studio"
              srcDoc={preview.html}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className={clsx(
                'h-full rounded-lg border border-[var(--v2-border)] bg-white shadow-sm transition-all',
                device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full',
              )}
            />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,220px)_1fr]">
          <div className="min-h-0 overflow-y-auto border-r border-[var(--v2-border)] bg-white/50 py-1">
            {paths.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--v2-ink-faint)]">Nenhum arquivo ainda.</p>
            ) : (
              paths.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setSelected(path)}
                  className={clsx(
                    'flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs',
                    path === activePath ? 'bg-[var(--v2-accent-strong)]/10 font-semibold text-[var(--v2-ink-strong)]' : 'text-[var(--v2-ink-soft)] hover:bg-black/5',
                  )}
                  title={path}
                >
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                  <span className="truncate font-mono">{path}</span>
                </button>
              ))
            )}
          </div>
          <div className="min-h-0 overflow-auto">
            {activeFile ? (
              activeFile.binary ? (
                <div className="flex h-full items-center justify-center p-4">
                  {/^data:image\//.test(activeFile.content) ? (
                    <img src={activeFile.content} alt={activePath} className="max-h-full max-w-full rounded-lg border border-[var(--v2-border)]" />
                  ) : (
                    <p className="text-xs text-[var(--v2-ink-faint)]">Asset binário ({activePath}).</p>
                  )}
                </div>
              ) : (
                <textarea
                  key={activePath}
                  defaultValue={activeFile.content}
                  spellCheck={false}
                  onBlur={(e) => {
                    if (activePath && e.target.value !== activeFile.content) onEditFile(activePath, e.target.value)
                  }}
                  className="h-full w-full resize-none border-0 bg-[#0b0f14] p-3 font-mono text-[0.8rem] leading-5 text-[#e6edf3] focus:outline-none"
                />
              )
            ) : (
              <p className="p-4 text-xs text-[var(--v2-ink-faint)]">Selecione um arquivo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
