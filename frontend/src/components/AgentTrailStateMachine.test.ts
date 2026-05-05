import { describe, expect, it } from 'vitest'
import {
  canTransition,
  deriveHandoff,
  executionStateToAgentState,
  getHandoffMessage,
  isActive,
  isTerminal,
  type AgentSlot,
} from './AgentTrailStateMachine'

describe('AgentTrailStateMachine', () => {
  it('derives previous, active and incoming desks from explicit agent states', () => {
    const slots: AgentSlot[] = [
      { key: 'triagem', label: 'Triagem', state: 'completed' },
      { key: 'pesquisador', label: 'Pesquisador', state: 'running' },
      { key: 'jurista', label: 'Jurista', state: 'idle' },
    ]

    const handoff = deriveHandoff(slots)

    expect(handoff.previous?.key).toBe('triagem')
    expect(handoff.active?.key).toBe('pesquisador')
    expect(handoff.incoming?.key).toBe('jurista')
  })

  it('exposes the first idle desk as incoming when no agent is active yet', () => {
    const slots: AgentSlot[] = [
      { key: 'triagem', label: 'Triagem', state: 'completed' },
      { key: 'pesquisador', label: 'Pesquisador', state: 'idle' },
      { key: 'jurista', label: 'Jurista', state: 'idle' },
    ]

    const handoff = deriveHandoff(slots)

    expect(handoff.previous?.key).toBe('triagem')
    expect(handoff.active).toBeNull()
    expect(handoff.incoming?.key).toBe('pesquisador')
  })

  it('maps pipeline execution states to agent runtime states', () => {
    expect(executionStateToAgentState('running')).toBe('running')
    expect(executionStateToAgentState('retrying')).toBe('running')
    expect(executionStateToAgentState('persisting')).toBe('running')
    expect(executionStateToAgentState('waiting_io')).toBe('waiting_io')
    expect(executionStateToAgentState('completed')).toBe('completed')
    expect(executionStateToAgentState('cancelled')).toBe('error')
    expect(executionStateToAgentState('failed')).toBe('error')
  })

  it('keeps transition and guard semantics coherent', () => {
    expect(canTransition('idle', 'running')).toBe(true)
    expect(canTransition('completed', 'running')).toBe(false)
    expect(isActive('running')).toBe(true)
    expect(isActive('waiting_io')).toBe(true)
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('error')).toBe(true)
    expect(getHandoffMessage(null, 'running')).not.toHaveLength(0)
  })
})