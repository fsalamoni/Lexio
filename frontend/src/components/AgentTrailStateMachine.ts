/**
 * AgentTrail State Machine (Subonda 2 — Bloco 3)
 *
 * Defines the handoff lifecycle of each agent desk using explicit states
 * and guards. Integrates with AgentTrailProgressModal to drive the
 * "Mesa atual / Próxima mesa" visual transition.
 *
 * States:
 *   idle       — Agent has not started yet
 *   running    — Agent is actively processing
 *   waiting_io — Agent is waiting for I/O (network, LLM response)
 *   completed  — Agent finished successfully
 *   error      — Agent encountered a terminal error
 */

import type { PipelineExecutionState } from '../lib/pipeline-execution-contract'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentState =
  | 'idle'
  | 'running'
  | 'waiting_io'
  | 'completed'
  | 'error'

export interface AgentSlot {
  key: string
  label: string
  detail?: string
  meta?: string
  state: AgentState
  startedAt?: number
  completedAt?: number
}

export interface HandoffState {
  previous: AgentSlot | null
  active: AgentSlot | null
  incoming: AgentSlot | null
}

// ── Transitions ───────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['running'],
  running: ['waiting_io', 'completed', 'error'],
  waiting_io: ['running', 'completed', 'error'],
  completed: [],
  error: [],
}

export function canTransition(from: AgentState, to: AgentState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ── Guards ────────────────────────────────────────────────────────────────────

export function isTerminal(state: AgentState): boolean {
  return state === 'completed' || state === 'error'
}

export function isActive(state: AgentState): boolean {
  return state === 'running' || state === 'waiting_io'
}

// ── State derivation ──────────────────────────────────────────────────────────

/**
 * Derive handoff state from a flat array of agent slots.
 * The pipeline advances agents sequentially, so the handoff is:
 *   previous = last completed agent
 *   active   = first non-idle, non-terminal agent
 *   incoming = next idle agent after active
 */
export function deriveHandoff(slots: AgentSlot[]): HandoffState {
  const completed = slots.filter(s => s.state === 'completed')
  const previous = completed.length > 0 ? completed[completed.length - 1] : null

  const activeIndex = slots.findIndex(s => isActive(s.state))
  const active = activeIndex >= 0 ? slots[activeIndex] : null

  const incomingIndex = slots.findIndex(
    (s, i) => s.state === 'idle' && (activeIndex < 0 || i > activeIndex),
  )
  const incoming = incomingIndex >= 0 ? slots[incomingIndex] : null

  return { previous, active, incoming }
}

// ── Map PipelineExecutionState → AgentState ───────────────────────────────────

/**
 * Convert the pipeline execution state (from the progress callback) into
 * an AgentState for the state machine.
 */
export function executionStateToAgentState(exec: PipelineExecutionState): AgentState {
  switch (exec) {
    case 'running':
    case 'retrying':
    case 'persisting':
      return 'running'
    case 'waiting_io':
      return 'waiting_io'
    case 'completed':
      return 'completed'
    case 'cancelled':
    case 'failed':
      return 'error'
    default:
      return 'idle'
  }
}

// ── Message interpolation ─────────────────────────────────────────────────────

const HANDOFF_MESSAGES: Record<string, string[]> = {
  'idle->running': [
    'Iniciando análise...',
    'Agente assumindo a mesa...',
    'Processando solicitação...',
  ],
  'running->waiting_io': [
    'Aguardando resposta do modelo...',
    'Consultando base de conhecimento...',
    'Pesquisando referências...',
  ],
  'waiting_io->running': [
    'Resposta recebida, continuando...',
    'Processando resultado...',
    'Avançando na análise...',
  ],
  'running->completed': [
    'Análise concluída com sucesso.',
    'Resultado entregue.',
  ],
  'waiting_io->completed': [
    'Última resposta processada.',
    'Agente finalizou a tarefa.',
    'Etapa concluída.',
  ],
  'running->error': [
    'Erro encontrado na execução.',
    'Falha ao processar.',
  ],
  'waiting_io->error': [
    'Falha na comunicação com o modelo.',
    'Timeout excedido.',
  ],
}

export function getHandoffMessage(
  from: AgentState | null,
  to: AgentState,
): string {
  const key = `${from ?? 'idle'}->${to}`
  const messages = HANDOFF_MESSAGES[key]
  if (messages && messages.length > 0) {
    return messages[Math.floor(Math.random() * messages.length)]
  }
  return 'Transição de estado...'
}