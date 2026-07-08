import { useEffect, useRef, useState } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  FileCode2,
  FilePlus2,
  FileX2,
  HelpCircle,
  ListChecks,
  Loader2,
  Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import type { DesignStudioMessageData, DesignStudioProgressEvent } from '../../lib/design-studio-v2'
import StudioMarkdown from './StudioMarkdown'

interface StudioMessagesProps {
  messages: DesignStudioMessageData[]
  running: boolean
  liveThinking?: string
  trail: DesignStudioProgressEvent[]
  onPlanAction: (messageId: string, action: 'approve' | 'discard') => void
}

const OP_ICON = {
  create: FilePlus2,
  update: FileCode2,
  delete: FileX2,
} as const

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-[var(--v2-border)] bg-[rgba(15,23,42,0.03)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-[var(--v2-ink-soft)]"
      >
        <Brain className="h-3.5 w-3.5" />
        Raciocínio
        <ChevronDown className={clsx('ml-auto h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <p className="whitespace-pre-wrap px-3 pb-2.5 text-xs leading-5 text-[var(--v2-ink-soft)]">{text}</p>}
    </div>
  )
}

function PlanCard({
  message,
  onPlanAction,
}: {
  message: DesignStudioMessageData
  onPlanAction: StudioMessagesProps['onPlanAction']
}) {
  const plan = message.plan
  if (!plan) return null
  const decided = plan.state !== 'proposed'
  return (
    <div className="rounded-xl border border-[var(--v2-border)] bg-white/70 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--v2-ink-strong)]">
        <ListChecks className="h-4 w-4 text-[var(--v2-accent-strong)]" /> Plano proposto
        {plan.state === 'approved' && <span className="ml-auto text-xs font-medium text-emerald-600">Aprovado</span>}
        {plan.state === 'rejected' && <span className="ml-auto text-xs font-medium text-rose-600">Descartado</span>}
      </div>
      <p className="mt-1.5 text-sm text-[var(--v2-ink-soft)]">{plan.summary}</p>
      <ol className="mt-2 space-y-1.5">
        {plan.steps.map((step, index) => (
          <li key={index} className="rounded-lg bg-[rgba(15,23,42,0.03)] px-2.5 py-1.5 text-sm">
            <span className="font-medium text-[var(--v2-ink-strong)]">{index + 1}. {step.title}</span>
            {step.detail && <p className="mt-0.5 text-xs text-[var(--v2-ink-soft)]">{step.detail}</p>}
            {step.files?.length ? (
              <p className="mt-1 flex flex-wrap gap-1">
                {step.files.map((file) => (
                  <code key={file} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.72rem]">{file}</code>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {!decided && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onPlanAction(message.id, 'approve')}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--v2-accent-strong)] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          >
            <Check className="h-3.5 w-3.5" /> Aprovar e executar
          </button>
          <button
            type="button"
            onClick={() => onPlanAction(message.id, 'discard')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--v2-border)] px-3 py-1.5 text-xs font-semibold text-[var(--v2-ink-soft)] transition hover:bg-black/5"
          >
            Descartar
          </button>
        </div>
      )}
    </div>
  )
}

function FileChanges({ message }: { message: DesignStudioMessageData }) {
  if (!message.file_changes?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {message.file_changes.map((change, index) => {
        const Icon = OP_ICON[change.op]
        return (
          <span
            key={`${change.path}-${index}`}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] font-medium',
              change.op === 'delete'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : change.op === 'create'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-sky-200 bg-sky-50 text-sky-700',
            )}
            title={change.summary}
          >
            <Icon className="h-3 w-3" />
            <code className="font-mono">{change.path}</code>
          </span>
        )
      })}
    </div>
  )
}

function QuestionsBlock({ questions }: { questions: string[] }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <HelpCircle className="h-4 w-4" /> Preciso de alguns esclarecimentos
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-amber-900">
        {questions.map((question, index) => (
          <li key={index}>{question}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-700">Responda abaixo e eu sigo com a construção.</p>
    </div>
  )
}

function LiveTrail({ trail, liveThinking }: { trail: DesignStudioProgressEvent[]; liveThinking?: string }) {
  const phases = trail.filter((event): event is Extract<DesignStudioProgressEvent, { type: 'phase' }> => event.type === 'phase')
  return (
    <div className="rounded-xl border border-[var(--v2-border)] bg-white/70 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--v2-ink-strong)]">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--v2-accent-strong)]" /> Trabalhando…
      </div>
      {phases.length > 0 && (
        <ul className="mt-2 space-y-1">
          {phases.slice(-8).map((phase, index) => (
            <li key={index} className="flex items-center gap-2 text-xs text-[var(--v2-ink-soft)]">
              {phase.status === 'done' ? (
                <Check className="h-3 w-3 text-emerald-600" />
              ) : phase.status === 'error' ? (
                <FileX2 className="h-3 w-3 text-rose-600" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              <span className="font-medium text-[var(--v2-ink-strong)]">{phase.label}</span>
              {phase.detail && <span className="truncate">· {phase.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {liveThinking && <p className="mt-2 whitespace-pre-wrap text-xs italic leading-5 text-[var(--v2-ink-faint)]">{liveThinking}</p>}
    </div>
  )
}

export default function StudioMessages({ messages, running, liveThinking, trail, onPlanAction }: StudioMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, running, trail.length])

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
      {messages.map((message) => (
        <div key={message.id} className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
          <div
            className={clsx(
              'max-w-[92%] space-y-2 rounded-2xl px-3.5 py-2.5',
              message.role === 'user'
                ? 'bg-[var(--v2-ink-strong)] text-white'
                : 'border border-[var(--v2-border)] bg-white/85',
            )}
          >
            {message.role === 'assistant' && message.thinking && <ThinkingBlock text={message.thinking} />}
            {message.role === 'user' ? (
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
            ) : (
              <StudioMarkdown content={message.content} />
            )}
            {message.role === 'assistant' && message.questions?.length ? <QuestionsBlock questions={message.questions} /> : null}
            {message.role === 'assistant' && message.plan ? <PlanCard message={message} onPlanAction={onPlanAction} /> : null}
            {message.role === 'assistant' ? <FileChanges message={message} /> : null}
            {message.error && <p className="text-xs font-medium text-rose-600">{message.error}</p>}
          </div>
        </div>
      ))}

      {messages.length === 0 && !running && (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
          <Sparkles className="h-8 w-8 text-[var(--v2-accent-strong)]" />
          <p className="text-sm font-semibold text-[var(--v2-ink-strong)]">Comece a construir</p>
          <p className="max-w-sm text-xs leading-5 text-[var(--v2-ink-soft)]">
            Descreva o site, app ou API que você quer criar. Escolha o modo (automático, planejar ou perguntar) e o
            orquestrador desenvolve o raciocínio e o código.
          </p>
        </div>
      )}

      {running && <LiveTrail trail={trail} liveThinking={liveThinking} />}
      <div ref={bottomRef} />
    </div>
  )
}
