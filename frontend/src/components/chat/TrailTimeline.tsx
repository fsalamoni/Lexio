/**
 * TrailTimeline — V2 chronological renderer for a chat orchestrator turn.
 *
 * Renders the projected `TrailStep[]` as a single vertical timeline of grouped
 * occurrences. The orchestrator and every called agent appear as one coherent
 * card (thought + action + result + artifacts), in chronological order, with
 * no repeated rows. Nothing is hidden — thoughts render in a collapsed
 * `<details>` the user can expand, and grouped steps disclose their event
 * count. Gated behind FF_CHAT_TIMELINE_V2.
 */

import {
  AlertCircle,
  Brain,
  CheckCircle2,
  CircleDot,
  Cpu,
  FileText,
  GaugeCircle,
  HelpCircle,
  Hourglass,
  ListChecks,
  PackageCheck,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import type {
  TrailStep,
  TrailStepKind,
  TrailStepStatus,
} from '../../lib/chat-orchestrator/trail-projection'
import { ArtifactCard, RenderMarkdown, ThoughtList } from './trail-shared'

interface StepKindMeta {
  Icon: typeof Sparkles
  label: string
  accent: string
}

const STEP_KIND_META: Record<TrailStepKind, StepKindMeta> = {
  orchestrator_decision: { Icon: Brain, label: 'Orquestrador', accent: 'text-indigo-600' },
  agent_invocation: { Icon: Cpu, label: 'Agente', accent: 'text-violet-600' },
  critic_review: { Icon: GaugeCircle, label: 'Crítico', accent: 'text-amber-600' },
  super_skill: { Icon: Sparkles, label: 'Super-skill', accent: 'text-fuchsia-600' },
  parallel_batch: { Icon: ListChecks, label: 'Lote paralelo', accent: 'text-indigo-600' },
  attachment: { Icon: FileText, label: 'Anexo', accent: 'text-teal-600' },
  approval: { Icon: HelpCircle, label: 'Aprovação', accent: 'text-amber-600' },
  clarification: { Icon: HelpCircle, label: 'Esclarecimento', accent: 'text-amber-600' },
  export_retry: { Icon: RefreshCw, label: 'Export', accent: 'text-amber-600' },
  pc_action: { Icon: Wrench, label: 'Ação no PC', accent: 'text-sky-600' },
  deliverables: { Icon: PackageCheck, label: 'Entregáveis', accent: 'text-emerald-600' },
  final: { Icon: CheckCircle2, label: 'Final', accent: 'text-emerald-600' },
  budget: { Icon: AlertCircle, label: 'Orçamento', accent: 'text-rose-600' },
  notice: { Icon: AlertCircle, label: 'Aviso', accent: 'text-rose-600' },
}

function formatClockTime(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatStepDuration(step: TrailStep): string | null {
  if (!step.endedAt) return null
  const start = new Date(step.ts).getTime()
  const end = new Date(step.endedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  const seconds = Math.round((end - start) / 1000)
  return seconds > 0 ? `${seconds}s` : null
}

function statusBorderClass(status: TrailStepStatus): string {
  switch (status) {
    case 'error':
      return 'border-rose-200 bg-rose-50/50'
    case 'awaiting':
      return 'border-amber-200 bg-amber-50/50'
    case 'running':
      return 'border-indigo-200 bg-white'
    default:
      return 'border-[var(--v2-border)] bg-white'
  }
}

function StatusDot({ status }: { status: TrailStepStatus }) {
  if (status === 'running') return <CircleDot className="h-3 w-3 animate-pulse text-indigo-500" />
  if (status === 'error') return <AlertCircle className="h-3 w-3 text-rose-500" />
  if (status === 'awaiting') return <Hourglass className="h-3 w-3 animate-pulse text-amber-500" />
  return <CheckCircle2 className="h-3 w-3 text-emerald-500" />
}

function TrailStepCard({ step }: { step: TrailStep }) {
  const meta = STEP_KIND_META[step.kind]
  const Icon = meta.Icon
  const duration = formatStepDuration(step)
  const clock = formatClockTime(step.ts)
  const thoughtPackage = step.thought?.package
  const thoughtStream = step.thought?.stream?.trim()
  const hasThought = Boolean(thoughtStream || thoughtPackage)
  const artifacts = step.artifacts ?? []
  const children = step.children ?? []

  return (
    <li className="relative pl-7">
      <span className="absolute left-1 top-2.5 flex h-3 w-3 items-center justify-center rounded-full bg-white">
        <StatusDot status={step.status} />
      </span>
      <div className={clsx('rounded-xl border px-3 py-2 text-xs', statusBorderClass(step.status))}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Icon className={clsx('h-3.5 w-3.5 shrink-0', meta.accent)} />
          <span className="font-semibold text-[var(--v2-ink-strong)]">{step.actor}</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--v2-ink-faint)]">
            {meta.label}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-[var(--v2-ink-faint)]">
            {duration && <span>{duration}</span>}
            {clock && <span>{clock}</span>}
          </span>
        </div>

        {step.decision ? (
          <div className="mt-1.5 text-[var(--v2-ink-strong)]">
            Decidiu chamar{' '}
            <code className="rounded bg-[var(--v2-border)] px-1">{step.decision.tool}</code>
            {step.decision.rationale && (
              <span className="text-[var(--v2-ink-muted)]"> — {step.decision.rationale}</span>
            )}
          </div>
        ) : step.action ? (
          <div className="mt-1 text-[var(--v2-ink-muted)]">{step.action}</div>
        ) : null}

        {hasThought && (
          <details className="mt-1.5 rounded-md border border-[var(--v2-border)] bg-[rgba(15,23,42,0.02)] px-2.5 py-1.5">
            <summary className="cursor-pointer select-none text-[11px] font-semibold text-[var(--v2-ink-strong)]">
              {step.kind === 'orchestrator_decision' ? 'Pensamento do orquestrador' : 'Pensamento do agente'}
            </summary>
            <div className="mt-1.5 space-y-2 leading-5 text-[var(--v2-ink-muted)]">
              {thoughtStream && <p className="whitespace-pre-wrap">{thoughtStream}</p>}
              {thoughtPackage && (
                <>
                  {thoughtPackage.summary && <p>{thoughtPackage.summary}</p>}
                  <ThoughtList title="Premissas" items={thoughtPackage.assumptions} />
                  <ThoughtList title="Decisões" items={thoughtPackage.decisions} />
                  <ThoughtList title="Riscos" items={thoughtPackage.risks} />
                  <ThoughtList title="Próximo uso" items={thoughtPackage.next_steps} />
                </>
              )}
            </div>
          </details>
        )}

        {step.critic && (
          <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[var(--v2-ink-muted)]">
            <span className="font-semibold text-amber-800">
              Score {step.critic.score}/100 · {step.critic.shouldStop ? 'pronto' : 'iterar mais'}
            </span>
            {step.critic.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {step.critic.reasons.map((reason, idx) => <li key={idx}>{reason}</li>)}
              </ul>
            )}
          </div>
        )}

        {step.resultMarkdown && (
          <div className="mt-1.5 rounded-md bg-[rgba(15,23,42,0.03)] px-2.5 py-1.5 leading-5">
            <RenderMarkdown markdown={step.resultMarkdown} />
          </div>
        )}

        {artifacts.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {artifacts.map(artifact => (
              <ArtifactCard key={artifact.artifact_id} artifact={artifact} />
            ))}
          </div>
        )}

        {step.notices?.map((notice, idx) => (
          <div key={idx} className="mt-1.5 rounded-md border border-[var(--v2-border)] bg-[rgba(15,23,42,0.02)] px-2.5 py-1.5 text-[var(--v2-ink-muted)]">
            {notice}
          </div>
        ))}

        {children.length > 0 && (
          <ol className="mt-2 flex flex-col gap-2">
            {children.map(child => <TrailStepCard key={child.id} step={child} />)}
          </ol>
        )}

        {step.sourceEventCount > 1 && (
          <div className="mt-1.5 text-[10px] text-[var(--v2-ink-faint)]">
            {step.sourceEventCount} eventos agrupados nesta ocorrência
          </div>
        )}
      </div>
    </li>
  )
}

export default function TrailTimeline({ steps, live }: { steps: TrailStep[]; live: boolean }) {
  if (steps.length === 0) return null

  return (
    <div className="ml-11 rounded-2xl border border-[var(--v2-border)] bg-[rgba(99,102,241,0.04)] px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
        <Sparkles className="h-3 w-3" />
        Trilha de agentes
        {live && <CircleDot className="h-3 w-3 animate-pulse text-indigo-500" />}
        <span className="ml-auto font-normal normal-case tracking-normal text-[var(--v2-ink-faint)]">
          {steps.length} {steps.length === 1 ? 'ocorrência' : 'ocorrências'}
        </span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute bottom-2 left-[10px] top-2 w-px bg-indigo-100" aria-hidden />
        <ol className="flex flex-col gap-2">
          {steps.map(step => <TrailStepCard key={step.id} step={step} />)}
        </ol>
      </div>
    </div>
  )
}
