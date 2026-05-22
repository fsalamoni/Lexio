// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CostBreakdown } from '../lib/cost-analytics'

const costPageMocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  saveUserSettings: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}))

vi.mock('../components/Toast', () => ({
  useToast: () => costPageMocks.toast,
}))

vi.mock('../lib/firebase', () => ({
  IS_FIREBASE: false,
}))

vi.mock('../lib/firestore-service', () => ({
  getCostBreakdown: vi.fn(),
  getUserSettings: vi.fn(),
  saveUserSettings: (...args: unknown[]) => costPageMocks.saveUserSettings(...args),
}))

vi.mock('../lib/firebase-auth-retry', () => ({
  withTransientFirebaseAuthRetry: <T,>(operation: () => Promise<T>) => operation(),
}))

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => costPageMocks.apiGet(...args),
  },
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="recharts-responsive">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="recharts-barchart">{children}</div>,
  Bar: () => <div data-testid="recharts-bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}))

import CostTokensPage from './CostTokensPage'

function makeCostBreakdown(): CostBreakdown {
  return {
    total_cost_usd: 0.0369,
    total_cost_brl: 0.21,
    exchange_rate_brl: 5.7,
    month_cost_usd: 0.0369,
    today_cost_usd: 0.0369,
    total_tokens_in: 22000,
    total_tokens_out: 9300,
    total_tokens: 31300,
    total_calls: 14,
    by_provider: [],
    by_model: [],
    by_function: [
      {
        key: 'presentation_pipeline',
        label: 'Pipeline de Apresentação',
        calls: 2,
        tokens_in: 1400,
        tokens_out: 600,
        total_tokens: 2000,
        cost_usd: 0.0028,
        cost_brl: 0.016,
        avg_duration_ms: 1800,
      },
    ],
    by_phase: [],
    by_execution_state: [],
    by_agent: [],
    by_agent_function: [],
    by_document_type: [],
    by_model_per_function: {
      presentation_pipeline: [],
    },
    by_phase_per_function: {
      presentation_pipeline: [],
    },
    by_provider_per_function: {
      presentation_pipeline: [],
    },
    by_execution_state_per_function: {
      presentation_pipeline: [],
    },
  }
}

function makeV2CostBreakdown(): CostBreakdown {
  return {
    total_cost_usd: 0.084,
    total_cost_brl: 0.48,
    exchange_rate_brl: 5.7,
    month_cost_usd: 0.084,
    today_cost_usd: 0.084,
    total_tokens_in: 48000,
    total_tokens_out: 15600,
    total_tokens: 63600,
    total_calls: 19,
    by_provider: [],
    by_model: [],
    by_function: [
      {
        key: 'presentation_pipeline_v2',
        label: 'Gerador de Apresentação v2',
        calls: 5,
        tokens_in: 8200,
        tokens_out: 2600,
        total_tokens: 10800,
        cost_usd: 0.021,
        cost_brl: 0.12,
        avg_duration_ms: 2400,
      },
    ],
    by_phase: [],
    by_execution_state: [],
    by_agent: [],
    by_agent_function: [
      {
        key: 'presentation_pipeline_v2::presentation_v2_reviewer',
        label: 'presentation_pipeline_v2 · Revisor Multimodal',
        calls: 2,
        tokens_in: 2200,
        tokens_out: 700,
        total_tokens: 2900,
        cost_usd: 0.006,
        cost_brl: 0.0342,
        avg_duration_ms: 1900,
      },
    ],
    by_document_type: [],
    by_model_per_function: {
      presentation_pipeline_v2: [
        {
          key: 'gpt-4.1',
          label: 'GPT-4.1',
          calls: 5,
          tokens_in: 8200,
          tokens_out: 2600,
          total_tokens: 10800,
          cost_usd: 0.021,
          cost_brl: 0.12,
          avg_duration_ms: 2400,
        },
      ],
    },
    by_phase_per_function: {
      presentation_pipeline_v2: [
        {
          key: 'review',
          label: 'Review',
          calls: 2,
          tokens_in: 2200,
          tokens_out: 700,
          total_tokens: 2900,
          cost_usd: 0.006,
          cost_brl: 0.0342,
          avg_duration_ms: 1900,
        },
      ],
    },
    by_provider_per_function: {
      presentation_pipeline_v2: [
        {
          key: 'openai',
          label: 'OpenAI',
          calls: 5,
          tokens_in: 8200,
          tokens_out: 2600,
          total_tokens: 10800,
          cost_usd: 0.021,
          cost_brl: 0.12,
          avg_duration_ms: 2400,
        },
      ],
    },
    by_execution_state_per_function: {
      presentation_pipeline_v2: [
        {
          key: 'completed',
          label: 'Concluído',
          calls: 5,
          tokens_in: 8200,
          tokens_out: 2600,
          total_tokens: 10800,
          cost_usd: 0.021,
          cost_brl: 0.12,
          avg_duration_ms: 2400,
        },
      ],
    },
  }
}

describe('CostTokensPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    costPageMocks.apiGet.mockResolvedValue({ data: makeCostBreakdown() })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders a dedicated presentation v2 section even when only v1 presentation costs exist', async () => {
    render(<CostTokensPage />)

    await waitFor(() => {
      expect(costPageMocks.apiGet).toHaveBeenCalledWith('/stats/cost-breakdown')
    })

    expect(await screen.findByRole('heading', { name: /custos e tokens/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pipeline de Apresentação' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pipeline de Apresentação v2' })).toBeTruthy()
    expect(screen.getByText('Nenhum dado de custo para o pipeline de apresentação v2.')).toBeTruthy()
  })

  it('renders presentation pipeline v2 breakdown data when v2 usage exists', async () => {
    costPageMocks.apiGet.mockResolvedValue({ data: makeV2CostBreakdown() })

    render(<CostTokensPage />)

    await waitFor(() => {
      expect(costPageMocks.apiGet).toHaveBeenCalledWith('/stats/cost-breakdown')
    })

    expect((await screen.findAllByRole('heading', { name: 'Pipeline de Apresentação v2' })).length).toBeGreaterThan(0)
    expect(screen.queryByText('Nenhum dado de custo para o pipeline de apresentação v2.')).toBeNull()
    expect(screen.getAllByText('GPT-4.1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Revisor Multimodal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Concluído').length).toBeGreaterThan(0)
  })
})