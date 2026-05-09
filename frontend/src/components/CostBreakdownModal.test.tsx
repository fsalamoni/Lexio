// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CostBreakdownModal from './CostBreakdownModal'

vi.mock('./DraggablePanel', () => ({
  default: ({ open, title, children }: any) => (open ? <section><h2>{title}</h2>{children}</section> : null),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Bar: () => <div />,
}))

afterEach(() => {
  cleanup()
})

describe('CostBreakdownModal', () => {
  it('shows the loading state when there is no breakdown yet', () => {
    render(<CostBreakdownModal open breakdown={null} loading onClose={() => {}} />)
    expect(screen.getByText('Carregando detalhamento...')).toBeTruthy()
  })

  it('renders cost highlights, charts, and tables when a breakdown is available', () => {
    const row = {
      key: 'openrouter',
      label: 'OpenRouter',
      calls: 3,
      tokens_in: 1000,
      tokens_out: 500,
      total_tokens: 1500,
      cost_usd: 1.5,
      cost_brl: 7.5,
    }

    render(
      <CostBreakdownModal
        open
        loading={false}
        onClose={() => {}}
        breakdown={{
          total_cost_usd: 10,
          total_cost_brl: 50,
          total_tokens_in: 4000,
          total_tokens_out: 2000,
          total_tokens: 6000,
          total_calls: 9,
          exchange_rate_brl: 5,
          by_provider: [row],
          by_model: [{ ...row, key: 'model-a', label: 'Modelo A' }],
          by_function: [{ ...row, key: 'reasoning', label: 'Raciocínio' }],
          by_document_type: [{ ...row, key: 'petition', label: 'Petição' }],
          by_phase: [{ ...row, key: 'phase-1', label: 'Triagem' }],
          by_agent: [{ ...row, key: 'agent-1', label: 'Agente 1' }],
          by_agent_function: [{ ...row, key: 'agent-fn', label: 'Analista / Raciocínio' }],
        } as any}
      />,
    )

    expect(screen.getByText('Detalhamento de custos e tokens')).toBeTruthy()
    expect(screen.getByText('Custo total (USD)')).toBeTruthy()
    expect(screen.getByText('Maior custo por API')).toBeTruthy()
    expect(screen.getByText('Modelo mais oneroso')).toBeTruthy()
    expect(screen.getByText('Conversão com cotação referencial de 5.00 BRL/USD.')).toBeTruthy()
    expect(screen.getAllByText('OpenRouter').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Modelo A').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Tabela de Por API / provedor')).toBeTruthy()
  })
})