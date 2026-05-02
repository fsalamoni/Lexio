import { Construction, MessagesSquare, Sparkles } from 'lucide-react'
import { CHAT_ORCHESTRATOR_AGENT_DEFS } from '../lib/model-config'

/**
 * Chat — orchestrated multi-agent conversation page.
 *
 * PR1 ships only the route stub, the agent registry and the data layer. The
 * runtime loop (PR2), specialists + super-skills (PR3) and sidecar PC access
 * (PR4) land in subsequent PRs.
 */
export default function Chat() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
        <MessagesSquare className="h-9 w-9" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-[var(--v2-ink-strong)]">Chat</h1>
        <p className="text-sm text-[var(--v2-ink-muted)]">
          Conversa orquestrada com {CHAT_ORCHESTRATOR_AGENT_DEFS.length} agentes especialistas, super-skills dos
          pipelines do Lexio e ações no PC via sidecar local.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
        <Construction className="h-4 w-4" />
        Em construção · PR1 (fundação) entregue · runtime do orquestrador chega no PR2
      </div>

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {CHAT_ORCHESTRATOR_AGENT_DEFS.map(agent => (
          <div
            key={agent.key}
            className="flex flex-col gap-1 rounded-xl border border-[var(--v2-border)] bg-white/60 p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-semibold text-[var(--v2-ink-strong)]">{agent.label}</span>
            </div>
            <p className="text-xs leading-5 text-[var(--v2-ink-muted)]">{agent.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
