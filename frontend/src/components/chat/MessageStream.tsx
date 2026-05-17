import { useEffect, useRef } from 'react'
import {
  AlertCircle,
  Archive,
  Bot,
  Brain,
  CheckCircle2,
  CircleDot,
  Cpu,
  Download,
  FileJson,
  FileText,
  Image,
  Music,
  GaugeCircle,
  HelpCircle,
  Hourglass,
  ListChecks,
  PackageCheck,
  Presentation,
  RefreshCw,
  Sparkles,
  Table,
  Upload as UploadIcon,
  User,
  Video,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import type {
  ChatAgentWorkPackage,
  ChatArtifactExportRef,
  ChatArtifactRef,
  ChatDeliverableBundle,
  ChatDeliverableItem,
  ChatTrailEvent,
  ChatTurnAttachment,
  ChatTurnData,
} from '../../lib/firestore-types'
import { buildChatDeliverableBundleForTurn, type ChatExportRetryRequest } from '../../lib/chat-deliverable-bundles'
import { isEnabled } from '../../lib/feature-flags'

interface MessageStreamProps {
  turns: ChatTurnData[]
  liveTurn: ChatTurnData | null
  emptyState?: React.ReactNode
  onSendPendingAnswer?: (answer: string) => void
  onRetryExport?: (request: ChatExportRetryRequest) => void
}

export default function MessageStream({ turns, liveTurn, emptyState, onSendPendingAnswer, onRetryExport }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, liveTurn?.trail.length])

  const allTurns = liveTurn ? [...turns, liveTurn] : turns
  if (!allTurns.length && emptyState) {
    return <div className="flex h-full flex-1 items-center justify-center">{emptyState}</div>
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto overflow-x-hidden px-4 py-6 flex-1 min-h-0 chat-stream-scrollbar">
      {allTurns.map((turn, idx) => (
        <TurnBlock
          key={turn.id ?? `t-${idx}`}
          turn={turn}
          live={turn === liveTurn}
          onSendPendingAnswer={onSendPendingAnswer}
          onRetryExport={onRetryExport}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function findActiveAgent(trail: ChatTrailEvent[]): string | null {
  let pendingAgent: string | null = null
  for (const event of trail) {
    if (event.type === 'agent_call') {
      pendingAgent = event.agent_key
    } else if (event.type === 'agent_response') {
      if (pendingAgent === event.agent_key) {
        pendingAgent = null
      }
    }
  }
  return pendingAgent
}

function TurnBlock({
  turn,
  live,
  onSendPendingAnswer,
  onRetryExport,
}: {
  turn: ChatTurnData
  live: boolean
  onSendPendingAnswer?: (answer: string) => void
  onRetryExport?: (request: ChatExportRetryRequest) => void
}) {
  const thoughtSegments = collectThoughtSegments(turn.trail)
  const trailWithoutThoughts = turn.trail.filter(e => e.type !== 'orchestrator_thought')
  const activeAgent = findActiveAgent(turn.trail)
  const showThoughtPanel = thoughtSegments.length > 0
  const deliverablesEnabled = isEnabled('FF_CHAT_DELIVERABLE_BUNDLE')
  const retryEnabled = isEnabled('FF_CHAT_EXPORT_RETRY')
  const deliverableBundle = deliverablesEnabled ? (turn.deliverable_bundles?.[0] ?? buildChatDeliverableBundleForTurn(turn)) : null

  return (
    <div className="flex flex-col gap-3">
      <UserBubble text={turn.user_input} attachments={turn.input_attachments} />
      {showThoughtPanel && (
        <OrchestratorThinkingTimeline
          segments={thoughtSegments}
          live={live}
          activeAgent={activeAgent}
        />
      )}
      {trailWithoutThoughts.length > 0 && <AgentTrail events={trailWithoutThoughts} live={live} />}
      {turn.pending_question && (
        <PendingQuestion
          question={turn.pending_question.text}
          options={turn.pending_question.options}
          onSendPendingAnswer={onSendPendingAnswer}
        />
      )}
      {turn.assistant_markdown && <AssistantBubble markdown={turn.assistant_markdown} />}
      {deliverableBundle && (
        <DeliverablesPanel
          bundle={deliverableBundle}
          onRetryExport={retryEnabled ? onRetryExport : undefined}
        />
      )}
      {live && !turn.assistant_markdown && (
        <div className="flex items-center gap-2 text-xs text-[var(--v2-ink-faint)]">
          <Hourglass className="h-3.5 w-3.5 animate-pulse" />
          {activeAgent ? `Agente "${activeAgent}" em execução…` : 'Orquestrador processando…'}
        </div>
      )}
      {turn.status === 'cancelled' && (
        <div className="text-xs text-amber-600">Turno cancelado pelo usuário.</div>
      )}
      {turn.status === 'error' && (
        <div className="flex items-center gap-2 text-xs text-rose-600">
          <AlertCircle className="h-3.5 w-3.5" />
          Erro ao executar este turno.
        </div>
      )}
    </div>
  )
}

function collectThoughtSegments(trail: ChatTrailEvent[]): Array<{ text: string; ts: string }> {
  const segments: Array<{ text: string; ts: string }> = []
  let previousWasThought = false
  for (const event of trail) {
    if (event.type === 'orchestrator_thought') {
      const last = segments[segments.length - 1]
      if (last && previousWasThought) {
        last.text = event.total
        last.ts = event.ts
      } else {
        segments.push({ text: event.total, ts: event.ts })
      }
      previousWasThought = true
      continue
    }
    previousWasThought = false
  }
  return segments.filter(segment => segment.text.trim())
}

function UserBubble({ text, attachments }: { text: string; attachments?: ChatTurnAttachment[] }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
        <User className="h-4 w-4" />
      </div>
      <div className="max-w-3xl rounded-2xl bg-teal-50 px-4 py-2.5 text-sm text-[var(--v2-ink-strong)]">
        <div className="whitespace-pre-wrap">{text}</div>
        {attachments?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachments.map(attachment => {
              const Icon = getAttachmentIcon(attachment)
              return (
                <span
                  key={attachment.attachment_id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-teal-200 bg-white/75 px-2 py-1 text-[11px] text-teal-800"
                  title={`${attachment.filename} · ${formatBytes(attachment.size_bytes)}`}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span className="max-w-[14rem] truncate font-medium">{attachment.filename}</span>
                  <span className="shrink-0 opacity-75">{attachment.upload_status ?? attachment.extraction.status}</span>
                </span>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getAttachmentIcon(attachment: ChatTurnAttachment) {
  if (attachment.kind === 'image') return Image
  if (attachment.kind === 'audio') return Music
  if (attachment.kind === 'video') return Video
  if (attachment.kind === 'spreadsheet') return Table
  if (attachment.kind === 'presentation') return Presentation
  if (attachment.kind === 'archive') return Archive
  return FileText
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AssistantBubble({ markdown }: { markdown: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="max-w-3xl rounded-2xl border border-[var(--v2-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--v2-ink-strong)]">
        <RenderMarkdown markdown={markdown} />
      </div>
    </div>
  )
}

function PendingQuestion({
  question,
  options,
  onSendPendingAnswer,
}: {
  question: string
  options?: string[]
  onSendPendingAnswer?: (answer: string) => void
}) {
  return (
    <div className="ml-11 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
        <HelpCircle className="h-3.5 w-3.5" />
        Pergunta do orquestrador
      </div>
      <p className="whitespace-pre-wrap text-sm">{question}</p>
      {options && options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onSendPendingAnswer?.(opt)}
              className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!onSendPendingAnswer}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-amber-700">Use uma opção ou responda no campo abaixo para continuar.</p>
    </div>
  )
}

function AgentTrail({ events, live }: { events: ChatTrailEvent[]; live: boolean }) {
  return (
    <div className="ml-11 flex flex-col gap-1.5 rounded-xl border border-[var(--v2-border)] bg-[rgba(99,102,241,0.04)] px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
        <Sparkles className="h-3 w-3" />
        Trilha de agentes {live && <CircleDot className="h-3 w-3 animate-pulse text-indigo-500" />}
      </div>
      <ul className="flex flex-col gap-1.5">
        {events.map((event, idx) => (
          <TrailEventRow key={`ev-${idx}`} event={event} />
        ))}
      </ul>
    </div>
  )
}

function TrailEventRow({ event }: { event: ChatTrailEvent }) {
  if (event.type === 'agent_work_package') {
    return <AgentWorkPackageCard workPackage={event.package} />
  }

  const meta = describeEvent(event)
  return (
    <li className="flex items-start gap-2 text-xs">
      <meta.Icon className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0', meta.iconClass)} />
      <div className="flex-1">
        <div className="font-medium text-[var(--v2-ink-strong)]">{meta.title}</div>
        {meta.subtitle && <div className="text-[var(--v2-ink-muted)]">{meta.subtitle}</div>}
      </div>
    </li>
  )
}

function AgentWorkPackageCard({ workPackage }: { workPackage: ChatAgentWorkPackage }) {
  const artifacts = workPackage.artifacts ?? []
  return (
    <li className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-[var(--v2-ink-strong)]">
      <div className="flex items-start gap-2">
        <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-emerald-800">Pacote de trabalho · {workPackage.agent_key}</div>
          {workPackage.task && <div className="mt-0.5 text-[var(--v2-ink-muted)]">{workPackage.task}</div>}
        </div>
      </div>

      {workPackage.result_markdown && (
        <div className="mt-2 rounded-md bg-white/70 px-3 py-2 leading-5">
          <RenderMarkdown markdown={workPackage.result_markdown} />
        </div>
      )}

      {workPackage.thought && (
        <details className="mt-2 rounded-md border border-emerald-200 bg-white/65 px-3 py-2">
          <summary className="cursor-pointer select-none font-semibold text-emerald-800">Pensamento do agente</summary>
          <div className="mt-2 space-y-2 leading-5 text-[var(--v2-ink-muted)]">
            <p>{workPackage.thought.summary}</p>
            <ThoughtList title="Premissas" items={workPackage.thought.assumptions} />
            <ThoughtList title="Decisões" items={workPackage.thought.decisions} />
            <ThoughtList title="Riscos" items={workPackage.thought.risks} />
            <ThoughtList title="Próximo uso" items={workPackage.thought.next_steps} />
          </div>
        </details>
      )}

      {artifacts.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {artifacts.map(artifact => (
            <ArtifactCard key={artifact.artifact_id} artifact={artifact} />
          ))}
        </div>
      )}
    </li>
  )
}

function ThoughtList({ title, items }: { title: string; items?: string[] }) {
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

function ArtifactCard({ artifact }: { artifact: ChatArtifactRef }) {
  const hasManifest = Boolean(artifact.manifest_json)
  const exports = artifact.exports ?? []
  return (
    <div className="rounded-md border border-[var(--v2-border)] bg-white px-3 py-2">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[var(--v2-ink-strong)]">{artifact.title}</div>
          <div className="text-[var(--v2-ink-muted)]">
            {artifact.kind}/{artifact.format} · v{artifact.version}{artifact.is_latest === false ? ' · versão anterior' : ''}
          </div>
          {artifact.summary && <p className="mt-1 text-[var(--v2-ink-muted)]">{artifact.summary}</p>}
        </div>
      </div>

      {artifact.content_preview && (
        <div className="mt-2 whitespace-pre-wrap rounded bg-[rgba(15,23,42,0.04)] px-2 py-1.5 text-[var(--v2-ink-muted)]">
          {artifact.content_preview}
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
    </div>
  )
}

function DeliverablesPanel({
  bundle,
  onRetryExport,
}: {
  bundle: ChatDeliverableBundle
  onRetryExport?: (request: ChatExportRetryRequest) => void
}) {
  const readyZipExports = bundle.items.flatMap(item =>
    item.exports
      .filter(exportRef => exportRef.format === 'zip' && exportRef.status === 'ready' && exportRef.download_url)
      .map(exportRef => ({ item, exportRef })),
  )

  return (
    <div className="ml-11 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <PackageCheck className="h-3.5 w-3.5" />
            Arquivos gerados
          </div>
          <div className="mt-1 text-xs text-emerald-900">
            {bundle.ready_count} prontos · {bundle.failed_count} falharam · {bundle.planned_count} pendentes
          </div>
        </div>
        {readyZipExports.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {readyZipExports.map(({ item, exportRef }) => (
              <a
                key={`${item.item_id}-${exportRef.export_id ?? exportRef.label}-zip`}
                href={exportRef.download_url}
                download
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                title={`Baixar ZIP de ${item.title}`}
              >
                <Download className="h-3 w-3" />
                Baixar ZIP
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {bundle.items.map(item => (
          <DeliverableItemRow
            key={item.item_id}
            bundle={bundle}
            item={item}
            onRetryExport={onRetryExport}
          />
        ))}
      </div>
    </div>
  )
}

function DeliverableItemRow({
  bundle,
  item,
  onRetryExport,
}: {
  bundle: ChatDeliverableBundle
  item: ChatDeliverableItem
  onRetryExport?: (request: ChatExportRetryRequest) => void
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--v2-ink-strong)]">{item.title}</div>
          <div className="text-[11px] text-[var(--v2-ink-muted)]">
            {item.kind}/{item.format} · v{item.version}{item.source_agent_key ? ` · ${item.source_agent_key}` : ''}
          </div>
          {item.summary && <div className="mt-1 text-xs text-[var(--v2-ink-muted)]">{item.summary}</div>}
        </div>
        <StatusPill status={item.status} />
      </div>

      {item.exports.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.exports.map(exportRef => (
            <ExportAction
              key={`${item.item_id}-${exportRef.export_id ?? exportRef.label}-${exportRef.format}`}
              turnId={bundle.turn_id}
              artifactId={item.artifact_id}
              exportRef={exportRef}
              onRetryExport={onRetryExport}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ExportAction({
  turnId,
  artifactId,
  exportRef,
  onRetryExport,
}: {
  turnId: string
  artifactId: string
  exportRef: ChatArtifactExportRef
  onRetryExport?: (request: ChatExportRetryRequest) => void
}) {
  if (exportRef.status === 'ready' && exportRef.download_url) {
    return (
      <a
        href={exportRef.download_url}
        download
        className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
      >
        <Download className="h-3 w-3" />
        {exportRef.label}
      </a>
    )
  }

  const retryable = exportRef.status === 'failed' || exportRef.status === 'planned'
  if (retryable) {
    return (
      <button
        type="button"
        onClick={() => onRetryExport?.({
          turnId,
          artifactId,
          format: exportRef.format,
          exportId: exportRef.export_id,
        })}
        disabled={!onRetryExport}
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        title={exportRef.reason || undefined}
      >
        <RefreshCw className="h-3 w-3" />
        {exportRef.status === 'failed' ? `Tentar ${exportRef.label}` : `Gerar ${exportRef.label}`}
      </button>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
      title={exportRef.reason || undefined}
    >
      {exportRef.label}: {formatExportStatus(exportRef.status)}
    </span>
  )
}

function StatusPill({ status }: { status: ChatDeliverableItem['status'] }) {
  const className = status === 'ready'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'partial'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'failed'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'
  return (
    <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', className)}>
      {formatDeliverableStatus(status)}
    </span>
  )
}

function formatDeliverableStatus(status: ChatDeliverableItem['status']): string {
  if (status === 'ready') return 'pronto'
  if (status === 'partial') return 'parcial'
  if (status === 'failed') return 'falhou'
  if (status === 'planned') return 'pendente'
  return 'indisponivel'
}

function formatExportStatus(status: ChatArtifactExportRef['status']): string {
  if (status === 'ready') return 'pronto'
  if (status === 'planned') return 'planejado'
  if (status === 'retrying') return 'gerando'
  if (status === 'failed') return 'falhou'
  if (status === 'unavailable') return 'indisponivel'
  return status
}

/**
 * Painel que exibe o pensamento ao vivo do orquestrador enquanto ele decide.
 * Renderiza o texto acumulado em uma caixa estilizada com animação de digitação
 * e um indicador pulsante de "pensando".
 */
function OrchestratorThinkingTimeline({
  segments,
  live,
  activeAgent,
}: {
  segments: Array<{ text: string; ts: string }>
  live: boolean
  activeAgent?: string | null
}) {
  return (
    <div
      className={clsx(
        'ml-11 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 shadow-sm',
        live && 'animate-fade-in',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
        <Brain className="h-3.5 w-3.5" />
        Pensamento do orquestrador
        {live && <CircleDot className="h-3 w-3 animate-pulse text-indigo-500" />}
      </div>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto text-xs leading-5 text-indigo-900/80">
        {segments.map((segment, segmentIdx) => {
          const lines = (segment.text || 'Analisando o pedido…').split(/\r?\n/).filter(Boolean)
          return (
            <div key={`${segment.ts}-${segmentIdx}`} className="rounded-xl bg-white/45 px-3 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-500">
                Passo {segmentIdx + 1}
              </div>
              <div className="whitespace-pre-wrap">
                {lines.map((line, idx) => (
                  <div key={idx} className={clsx('py-0.5', live && segmentIdx === segments.length - 1 && 'animate-stream-line')}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {live && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-indigo-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          {activeAgent ? `delegando para "${activeAgent}"…` : 'processando próximo passo…'}
        </div>
      )}
    </div>
  )
}

function describeEvent(event: ChatTrailEvent): {
  Icon: typeof Sparkles
  iconClass: string
  title: string
  subtitle?: string
  fullContent?: string
} {
  switch (event.type) {
    case 'attachment_upload_started':
      return {
        Icon: UploadIcon,
        iconClass: 'text-teal-600',
        title: `Anexo recebido: ${event.filename}`,
        subtitle: `${formatBytes(event.size_bytes)} · salvando arquivo bruto`,
      }
    case 'attachment_processed':
      return {
        Icon: FileText,
        iconClass: event.attachment.upload_status === 'failed' ? 'text-rose-600' : 'text-teal-600',
        title: `Anexo processado: ${event.attachment.filename}`,
        subtitle: `${event.attachment.kind} · ${event.attachment.extraction.status}${event.attachment.upload_status ? ` · ${event.attachment.upload_status}` : ''}`,
      }
    case 'attachment_failed':
      return {
        Icon: AlertCircle,
        iconClass: 'text-rose-600',
        title: `Falha no anexo: ${event.filename}`,
        subtitle: event.message,
      }
    case 'multimodal_analysis_started':
      return {
        Icon: Sparkles,
        iconClass: 'text-fuchsia-600',
        title: `Análise multimodal: ${event.filename}`,
        subtitle: `${event.mode} · ${event.model}`,
      }
    case 'multimodal_analysis_completed':
      return {
        Icon: CheckCircle2,
        iconClass: 'text-emerald-600',
        title: `Multimodal concluído: ${event.filename}`,
        subtitle: `${event.status} · ${event.model}`,
      }
    case 'multimodal_analysis_failed':
      return {
        Icon: AlertCircle,
        iconClass: 'text-rose-600',
        title: `Falha multimodal: ${event.filename}`,
        subtitle: event.message,
      }
    case 'multimodal_analysis_skipped':
      return {
        Icon: AlertCircle,
        iconClass: 'text-amber-600',
        title: `Multimodal ignorado: ${event.filename}`,
        subtitle: event.reason,
      }
    case 'iteration_start':
      return { Icon: ListChecks, iconClass: 'text-indigo-500', title: `Iteração ${event.i}` }
    case 'decision':
      return {
        Icon: Wrench,
        iconClass: 'text-indigo-500',
        title: `Decidiu: ${event.tool}`,
        subtitle: event.rationale,
      }
    case 'agent_call':
      return {
        Icon: Cpu,
        iconClass: 'text-violet-600',
        title: `Chama ${event.agent_key}`,
        subtitle: event.task,
      }
    case 'agent_response':
      return {
        Icon: Bot,
        iconClass: 'text-emerald-600',
        title: `Resposta de ${event.agent_key}`,
        subtitle: event.output.length > 220 ? `${event.output.slice(0, 219)}…` : event.output,
      }
    case 'agent_artifact_created':
    case 'agent_artifact_updated':
      return {
        Icon: FileText,
        iconClass: 'text-emerald-600',
        title: event.type === 'agent_artifact_created' ? 'Artefato criado' : 'Artefato atualizado',
        subtitle: `${event.artifact.title} · ${event.artifact.kind}/${event.artifact.format} v${event.artifact.version}`,
      }
    case 'artifact_export_ready':
      return {
        Icon: Download,
        iconClass: 'text-indigo-600',
        title: `Export pronto: ${event.export_ref.label}`,
        subtitle: `${event.logical_document_id} · ${event.export_ref.format}`,
      }
    case 'deliverable_bundle_ready':
      return {
        Icon: PackageCheck,
        iconClass: 'text-emerald-600',
        title: `${event.bundle.title}: ${formatDeliverableStatus(event.bundle.status)}`,
        subtitle: `${event.bundle.ready_count} prontos · ${event.bundle.failed_count} falharam · ${event.bundle.planned_count} pendentes`,
      }
    case 'export_retry_requested':
      return {
        Icon: RefreshCw,
        iconClass: 'text-amber-600',
        title: `Retry solicitado: ${event.retry.format.toUpperCase()}`,
        subtitle: event.retry.logical_document_id,
      }
    case 'export_retry_completed':
      return {
        Icon: event.retry.status === 'ready' ? CheckCircle2 : AlertCircle,
        iconClass: event.retry.status === 'ready' ? 'text-emerald-600' : 'text-rose-600',
        title: event.retry.status === 'ready' ? `Export recuperado: ${event.retry.format.toUpperCase()}` : `Retry falhou: ${event.retry.format.toUpperCase()}`,
        subtitle: event.retry.error,
      }
    case 'pipeline_progress':
      return {
        Icon: Hourglass,
        iconClass: 'text-indigo-500',
        title: `${event.pipeline}: ${event.phase}`,
        subtitle: typeof event.progress === 'number' ? `${Math.round(event.progress)}%` : undefined,
      }
    case 'approval_requested':
      return { Icon: HelpCircle, iconClass: 'text-amber-600', title: event.title, subtitle: event.summary }
    case 'approval_resolved':
      return {
        Icon: event.approved ? CheckCircle2 : AlertCircle,
        iconClass: event.approved ? 'text-emerald-600' : 'text-rose-600',
        title: event.approved ? 'Aprovação concedida' : 'Aprovação negada',
        subtitle: event.reason,
      }
    case 'parallel_agents':
      return {
        Icon: ListChecks,
        iconClass: 'text-indigo-500',
        title: `Paralelo (${event.calls.length} agentes)`,
        subtitle: event.calls.map(c => c.agent_key).join(', '),
      }
    case 'super_skill_call':
      return {
        Icon: Sparkles,
        iconClass: 'text-fuchsia-600',
        title: `Super-skill: ${event.skill}`,
        subtitle: event.result_summary,
      }
    case 'fs_action':
      return { Icon: Wrench, iconClass: 'text-sky-600', title: `FS: ${event.op}`, subtitle: event.path }
    case 'shell_action':
      return { Icon: Wrench, iconClass: 'text-sky-700', title: `Shell: ${event.cmd}` }
    case 'critic':
      return {
        Icon: GaugeCircle,
        iconClass: event.should_stop ? 'text-emerald-600' : 'text-amber-600',
        title: `Crítico · score ${event.score}${event.should_stop ? ' · pronto' : ' · iterar mais'}`,
        subtitle: event.reasons.join(' · '),
      }
    case 'clarification_request':
      return { Icon: HelpCircle, iconClass: 'text-amber-600', title: 'Pergunta para o usuário', subtitle: event.question }
    case 'final_answer':
      return { Icon: CheckCircle2, iconClass: 'text-emerald-600', title: 'Resposta final emitida' }
    case 'budget_hit':
      return { Icon: AlertCircle, iconClass: 'text-rose-500', title: 'Orçamento atingido', subtitle: event.reason }
    case 'agent_token':
      return {
        Icon: Cpu,
        iconClass: 'text-violet-500',
        title: `${event.agent_key}`,
        subtitle: `Streaming (${event.total.length} caracteres)`,
        fullContent: event.total,
      }
    case 'error':
      return { Icon: AlertCircle, iconClass: 'text-rose-600', title: 'Erro', subtitle: event.message }
    default:
      return { Icon: Sparkles, iconClass: 'text-[var(--v2-ink-faint)]', title: 'Evento' }
  }
}

/**
 * Tiny markdown renderer — full TipTap is overkill for assistant bubbles.
 * Preserves paragraphs, bold/italic, inline code and bullet lists.
 */
function RenderMarkdown({ markdown }: { markdown: string }) {
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
