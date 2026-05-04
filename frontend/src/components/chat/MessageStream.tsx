import { useEffect, useRef } from 'react'
import {
  AlertCircle,
  Bot,
  Brain,
  CheckCircle2,
  CircleDot,
  Cpu,
  GaugeCircle,
  HelpCircle,
  Hourglass,
  ListChecks,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import type { ChatTrailEvent, ChatTurnData } from '../../lib/firestore-types'

interface MessageStreamProps {
  turns: ChatTurnData[]
  liveTurn: ChatTurnData | null
  emptyState?: React.ReactNode
}

export default function MessageStream({ turns, liveTurn, emptyState }: MessageStreamProps) {
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
        <TurnBlock key={turn.id ?? `t-${idx}`} turn={turn} live={turn === liveTurn} />
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

function TurnBlock({ turn, live }: { turn: ChatTurnData; live: boolean }) {
  const thinkerEvents = turn.trail.filter(e => e.type === 'orchestrator_thought')
  const latestThought = thinkerEvents.length > 0 ? thinkerEvents[thinkerEvents.length - 1] : null
  const trailWithoutThoughts = turn.trail.filter(e => e.type !== 'orchestrator_thought')
  const activeAgent = findActiveAgent(turn.trail)
  const showThoughtPanel = latestThought && (live || thinkerEvents.length >= 3)

  return (
    <div className="flex flex-col gap-3">
      <UserBubble text={turn.user_input} />
      {showThoughtPanel && (
        <OrchestratorThinkingPanel
          text={latestThought!.total}
          live={live}
          activeAgent={activeAgent}
          collapsed={!live}
        />
      )}
      {trailWithoutThoughts.length > 0 && <AgentTrail events={trailWithoutThoughts} live={live} />}
      {turn.pending_question && (
        <PendingQuestion question={turn.pending_question.text} options={turn.pending_question.options} />
      )}
      {turn.assistant_markdown && <AssistantBubble markdown={turn.assistant_markdown} />}
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

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
        <User className="h-4 w-4" />
      </div>
      <div className="max-w-3xl whitespace-pre-wrap rounded-2xl bg-teal-50 px-4 py-2.5 text-sm text-[var(--v2-ink-strong)]">
        {text}
      </div>
    </div>
  )
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

function PendingQuestion({ question, options }: { question: string; options?: string[] }) {
  return (
    <div className="ml-11 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
        <HelpCircle className="h-3.5 w-3.5" />
        Pergunta do orquestrador
      </div>
      <p className="whitespace-pre-wrap text-sm">{question}</p>
      {options && options.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs">
          {options.map(opt => (
            <li key={opt}>{opt}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-amber-700">Responda no campo abaixo para continuar.</p>
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

/**
 * Painel que exibe o pensamento ao vivo do orquestrador enquanto ele decide.
 * Renderiza o texto acumulado em uma caixa estilizada com animação de digitação
 * e um indicador pulsante de "pensando".
 */
function OrchestratorThinkingPanel({
  text,
  live,
  activeAgent,
  collapsed = false,
}: {
  text: string
  live: boolean
  activeAgent?: string | null
  collapsed?: boolean
}) {
  const displayText = text || 'Analisando o pedido…'
  const lines = displayText.split(/\r?\n/).filter(Boolean)
  const previewText = displayText.slice(0, 180)
  const isTruncated = displayText.length > 180
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
      <div className="text-xs leading-5 text-indigo-900/80 whitespace-pre-wrap max-h-48 overflow-y-auto">
        {lines.map((line, idx) => (
          <div key={idx} className={clsx('py-0.5', live && 'animate-stream-line')}>
            {line}
          </div>
        ))}
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
} {
  switch (event.type) {
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
 * Preserves paragraphs, bold/italic, inline code and bullet lists. PR3 will
 * upgrade this to a richer renderer with citations/links.
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
