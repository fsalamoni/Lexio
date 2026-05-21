/**
 * Shared chat-trail presentation pieces.
 *
 * Extracted from MessageStream so both the legacy trail (`MessageStream`) and
 * the V2 chronological timeline (`TrailTimeline`) can reuse the artifact card,
 * the markdown renderer and the small formatting helpers without duplicating
 * logic. Pure presentation — no orchestration logic lives here.
 */

import { lazy, Suspense, useState } from 'react'
import {
  Archive,
  Download,
  FileJson,
  FileText,
  Image,
  Music,
  Presentation,
  Table,
  Video,
} from 'lucide-react'
import type {
  ChatArtifactExportRef,
  ChatArtifactRef,
  ChatTurnAttachment,
  StudioArtifactType,
} from '../../lib/firestore-types'
import { isEnabled } from '../../lib/feature-flags'

// Heavy viewer chunk (charts/d3) — loaded only when a structured artifact
// is actually rendered, keeping the chat route's initial bundle lean.
const ChatArtifactRichViewer = lazy(() => import('./ChatArtifactRichViewer'))

/** Studio artifact types that have a rich inline viewer. */
const RICH_VIEWER_STUDIO_TYPES = new Set<StudioArtifactType>([
  'resumo', 'relatorio', 'documento', 'guia_estruturado',
  'apresentacao', 'apresentacao_v2', 'mapa_mental', 'cartoes_didaticos',
  'infografico', 'teste', 'tabela_dados', 'audio_script', 'video_script',
])

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  json: 'JSON',
  html: 'HTML',
}

/**
 * Maps a chat artifact to the StudioArtifactType whose rich viewer should
 * render it. Prefers the explicit `manifest_json.artifact_type` written by
 * the studio/presentation skills, then falls back to the artifact `kind`.
 * Returns `null` when no rich viewer applies (image/audio/video/code have
 * their own rendering paths).
 */
function mapChatArtifactToStudioType(artifact: ChatArtifactRef): StudioArtifactType | null {
  const declared = artifact.manifest_json?.artifact_type
  if (typeof declared === 'string' && RICH_VIEWER_STUDIO_TYPES.has(declared as StudioArtifactType)) {
    return declared as StudioArtifactType
  }
  switch (artifact.kind) {
    case 'presentation':
      return 'apresentacao_v2'
    case 'spreadsheet':
      return 'tabela_dados'
    default:
      return null
  }
}

export function getAttachmentIcon(attachment: ChatTurnAttachment) {
  if (attachment.kind === 'image') return Image
  if (attachment.kind === 'audio') return Music
  if (attachment.kind === 'video') return Video
  if (attachment.kind === 'spreadsheet') return Table
  if (attachment.kind === 'presentation') return Presentation
  if (attachment.kind === 'archive') return Archive
  return FileText
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatExportStatus(status: ChatArtifactExportRef['status']): string {
  if (status === 'ready') return 'pronto'
  if (status === 'planned') return 'planejado'
  if (status === 'retrying') return 'gerando'
  if (status === 'failed') return 'falhou'
  if (status === 'unavailable') return 'indisponivel'
  return status
}

export function ThoughtList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">{title}</div>
      <ul className="mt-1 list-disc pl-4">
        {items.map((item, idx) => <li key={`${title}-${idx}`}>{item}</li>)}
      </ul>
    </div>
  )
}

export function ArtifactCard({ artifact }: { artifact: ChatArtifactRef }) {
  const hasManifest = Boolean(artifact.manifest_json)
  const exports = artifact.exports ?? []
  const preview = getArtifactPreview(artifact)
  const [isPreviewOpen, setPreviewOpen] = useState(false)
  const Icon = getArtifactCardIcon(artifact)

  const viewersEnabled = isEnabled('FF_CHAT_ARTIFACT_VIEWERS')
  const rawContent = String(artifact.content_preview ?? '')
  const hasRawText = Boolean(rawContent.trim()) && !isPreviewSource(rawContent)
  const studioType = viewersEnabled ? mapChatArtifactToStudioType(artifact) : null
  const isCodeArtifact = viewersEnabled && artifact.kind === 'code' && hasRawText
  const showRichViewer = Boolean(studioType) && hasRawText && !isCodeArtifact

  return (
    <div className="rounded-md border border-[var(--v2-border)] bg-white px-3 py-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[var(--v2-ink-strong)]">{artifact.title}</div>
          <div className="text-[var(--v2-ink-muted)]">
            {artifact.kind}/{artifact.format} · v{artifact.version}{artifact.is_latest === false ? ' · versão anterior' : ''}
          </div>
          {artifact.summary && <p className="mt-1 text-[var(--v2-ink-muted)]">{artifact.summary}</p>}
        </div>
      </div>

      {preview && (
        <ArtifactInlinePreview
          preview={preview}
          title={artifact.title}
          onOpenImage={() => setPreviewOpen(true)}
        />
      )}

      {isCodeArtifact && <ArtifactCodeViewer code={rawContent} format={artifact.format} />}

      {showRichViewer && studioType && (
        <Suspense
          fallback={
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-3 text-center text-[11px] text-[var(--v2-ink-faint)]">
              Carregando visualização…
            </div>
          }
        >
          <ChatArtifactRichViewer artifact={artifact} studioType={studioType} />
        </Suspense>
      )}

      {hasRawText && showRichViewer && (
        <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <summary className="cursor-pointer select-none font-semibold text-slate-700">Ver conteúdo bruto</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-slate-700">
            {rawContent}
          </pre>
        </details>
      )}

      {hasRawText && !showRichViewer && !isCodeArtifact && (
        <div className="mt-2 whitespace-pre-wrap rounded bg-[rgba(15,23,42,0.04)] px-2 py-1.5 text-[var(--v2-ink-muted)]">
          {rawContent}
        </div>
      )}

      {hasManifest && (
        <details className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
          <summary className="flex cursor-pointer select-none items-center gap-1.5 font-semibold text-slate-700">
            <FileJson className="h-3.5 w-3.5" />
            Documento JSON
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-slate-700">
            {JSON.stringify(artifact.manifest_json, null, 2)}
          </pre>
        </details>
      )}

      {(artifact.download_url || exports.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {artifact.download_url && (
            <a
              href={artifact.download_url}
              download
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Download className="h-3 w-3" />
              Baixar {artifact.format.toUpperCase()}
            </a>
          )}
          {exports.map(exportRef => exportRef.download_url ? (
            <a
              key={`${artifact.artifact_id}-${exportRef.label}`}
              href={exportRef.download_url}
              download
              className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Download className="h-3 w-3" />
              {exportRef.label}
            </a>
          ) : (
            <span
              key={`${artifact.artifact_id}-${exportRef.label}`}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
            >
              {exportRef.label}: {formatExportStatus(exportRef.status)}
            </span>
          ))}
        </div>
      )}

      {preview?.kind === 'image' && isPreviewOpen && (
        <ImagePreviewModal
          title={artifact.title}
          url={preview.url}
          downloadUrl={preview.downloadUrl}
          format={artifact.format.toUpperCase()}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

function ArtifactCodeViewer({ code, format }: { code: string; format: string }) {
  const [copied, setCopied] = useState(false)
  const language = CODE_LANGUAGE_LABELS[format] ?? format.toUpperCase()
  const handleCopy = () => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => { /* clipboard indisponível — ignora */ })
  }
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-700 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="max-h-96 overflow-auto px-3 py-2 text-[12px] leading-5 text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  )
}

interface ArtifactPreview {
  kind: 'image' | 'audio' | 'video'
  url: string
  downloadUrl?: string
}

function ArtifactInlinePreview({
  preview,
  title,
  onOpenImage,
}: {
  preview: ArtifactPreview
  title: string
  onOpenImage: () => void
}) {
  if (preview.kind === 'image') {
    return (
      <button
        type="button"
        onClick={onOpenImage}
        className="mt-2 block w-full overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-left hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title="Ampliar imagem"
      >
        <img
          src={preview.url}
          alt={title}
          className="max-h-80 w-full object-contain bg-slate-100"
          loading="lazy"
        />
      </button>
    )
  }

  if (preview.kind === 'audio') {
    return (
      <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <audio controls src={preview.url} className="w-full" aria-label={title} />
      </div>
    )
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-black">
      <video controls src={preview.url} className="max-h-96 w-full" aria-label={title} />
    </div>
  )
}

function ImagePreviewModal({
  title,
  url,
  downloadUrl,
  format,
  onClose,
}: {
  title: string
  url: string
  downloadUrl?: string
  format: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{title}</div>
            <div className="text-[11px] text-[var(--v2-ink-muted)]">{format}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-auto bg-slate-950 p-4">
          <img src={url} alt={title} className="mx-auto max-h-[78vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  )
}

function getArtifactPreview(artifact: ChatArtifactRef): ArtifactPreview | null {
  if (artifact.kind !== 'image' && artifact.kind !== 'audio' && artifact.kind !== 'video') return null
  const url = getPrimaryArtifactUrl(artifact)
  if (!url) return null
  return {
    kind: artifact.kind,
    url,
    downloadUrl: getPrimaryDownloadUrl(artifact) ?? url,
  }
}

function getPrimaryArtifactUrl(artifact: ChatArtifactRef): string | null {
  const direct = [artifact.download_url, artifact.content_preview]
    .map(value => String(value ?? '').trim())
    .find(isPreviewSource)
  if (direct) return direct
  const exportUrl = (artifact.exports ?? [])
    .find(exportRef => exportRef.status === 'ready' && exportRef.download_url)
    ?.download_url
  if (exportUrl) return exportUrl
  return getManifestPreviewUrl(artifact)
}

function getPrimaryDownloadUrl(artifact: ChatArtifactRef): string | null {
  if (artifact.download_url) return artifact.download_url
  return (artifact.exports ?? [])
    .find(exportRef => exportRef.status === 'ready' && exportRef.download_url)
    ?.download_url ?? null
}

function getManifestPreviewUrl(artifact: ChatArtifactRef): string | null {
  const manifest = artifact.manifest_json ?? {}
  const keys = ['preview_url', 'image_url', 'imageUrl', 'imageDataUrl', 'renderedImageUrl', 'audioUrl', 'videoUrl', 'download_url', 'downloadUrl']
  for (const key of keys) {
    const value = manifest[key]
    if (typeof value === 'string' && isPreviewSource(value.trim())) return value.trim()
  }
  return null
}

function isPreviewSource(value: string): boolean {
  return /^data:(image|audio|video)\//i.test(value) || /^https?:\/\//i.test(value) || /^blob:/i.test(value)
}

function getArtifactCardIcon(artifact: ChatArtifactRef) {
  if (artifact.kind === 'image') return Image
  if (artifact.kind === 'audio') return Music
  if (artifact.kind === 'video') return Video
  if (artifact.kind === 'spreadsheet' || artifact.kind === 'data') return Table
  if (artifact.kind === 'presentation') return Presentation
  if (artifact.kind === 'code') return FileJson
  return FileText
}

/**
 * Tiny markdown renderer — full TipTap is overkill for assistant bubbles.
 * Preserves paragraphs, bold/italic, inline code and bullet lists.
 */
export function RenderMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/)
  const blocks: React.ReactNode[] = []
  let buffer: string[] = []
  let inList = false
  const flushBuffer = () => {
    if (!buffer.length) return
    blocks.push(<p key={`p-${blocks.length}`} className="my-1.5">{renderInline(buffer.join(' '))}</p>)
    buffer = []
  }
  const closeList = () => {
    if (!inList) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1.5 list-disc pl-5">
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    listItems.length = 0
    inList = false
  }
  const listItems: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushBuffer()
      closeList()
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushBuffer()
      inList = true
      listItems.push(line.replace(/^\s*[-*]\s+/, ''))
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushBuffer()
      closeList()
      const level = heading[1].length
      const sizes = ['text-base font-semibold', 'text-sm font-semibold', 'text-sm font-medium uppercase tracking-wide']
      const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4') as keyof JSX.IntrinsicElements
      blocks.push(<Tag key={`h-${blocks.length}`} className={`mt-3 mb-1 ${sizes[level - 1]}`}>{renderInline(heading[2])}</Tag>)
      continue
    }
    closeList()
    buffer.push(line)
  }
  flushBuffer()
  closeList()
  return <>{blocks}</>
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**')) parts.push(<strong key={`s-${key++}`}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) parts.push(<code key={`c-${key++}`} className="rounded bg-[var(--v2-border)] px-1 text-xs">{token.slice(1, -1)}</code>)
    else parts.push(<em key={`e-${key++}`}>{token.slice(1, -1)}</em>)
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
