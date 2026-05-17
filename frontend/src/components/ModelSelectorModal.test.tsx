// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const selectorMocks = vi.hoisted(() => ({
  models: [
    {
      id: 'audio-free',
      label: 'Modelo Audio Gratis',
      provider: 'Google',
      tier: 'fast',
      description: 'Modelo gratuito com suporte a áudio',
      contextWindow: 128000,
      inputCost: 0,
      outputCost: 0,
      isFree: true,
      agentFit: { extraction: 6, synthesis: 5, reasoning: 7, writing: 4 },
      capabilities: ['audio'],
    },
    {
      id: 'audio-paid',
      label: 'Modelo Audio Pago',
      provider: 'OpenAI',
      tier: 'balanced',
      description: 'Modelo pago com suporte a áudio',
      contextWindow: 256000,
      inputCost: 1.2,
      outputCost: 4.8,
      isFree: false,
      agentFit: { extraction: 7, synthesis: 8, reasoning: 9, writing: 7 },
      capabilities: ['audio', 'text'],
    },
    {
      id: 'text-premium',
      label: 'Modelo Texto Premium',
      provider: 'Anthropic',
      tier: 'premium',
      description: 'Modelo premium focado em texto',
      contextWindow: 200000,
      inputCost: 3,
      outputCost: 15,
      isFree: false,
      agentFit: { extraction: 5, synthesis: 8, reasoning: 10, writing: 9 },
      capabilities: ['text'],
    },
    {
      id: 'image-unknown-pricing',
      label: 'Modelo Imagem Sem Preço',
      provider: 'Google',
      tier: 'balanced',
      description: 'Modelo multimodal sem tabela local',
      contextWindow: 512000,
      inputCost: 0,
      outputCost: 0,
      isFree: false,
      agentFit: { extraction: 4, synthesis: 9, reasoning: 5, writing: 4 },
      capabilities: ['image'],
    },
  ],
}))

vi.mock('../lib/model-catalog', () => ({
  useCatalogModels: () => selectorMocks.models,
}))

vi.mock('../lib/model-config', () => ({
  AVAILABLE_MODELS: [],
  FREE_TIER_RATE_LIMITS: { rpm: 20, rpd: 200 },
}))

vi.mock('../lib/currency-utils', () => ({
  formatCost: (value: number) => `$${value.toFixed(2)}`,
}))

vi.mock('../lib/media-capability-guidance', () => ({
  getMediaCapabilityGuidance: (capability?: string) => capability === 'image'
    ? {
        capability: 'image',
        summary: 'Nenhum modelo com capacidade real de imagem esta disponivel no catalogo pessoal deste usuario.',
        routeHint: 'Configuracoes -> Provedores de IA -> Catalogos por Provedor -> Catalogo de Modelos.',
        steps: [],
        recommendedModels: [
          { providerLabel: 'OpenAI direto', models: ['gpt-image-1'] },
          { providerLabel: 'OpenRouter', models: ['google/gemini-2.5-flash-image'] },
        ],
      }
    : null,
}))

vi.mock('./DraggablePanel', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (
    open ? <div><h1>{title}</h1>{children}</div> : null
  ),
}))

import ModelSelectorModal from './ModelSelectorModal'

describe('ModelSelectorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('filters by required capability and price, warns about free-tier limits, and selects a model', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(
      <ModelSelectorModal
        open
        onClose={onClose}
        onSelect={onSelect}
        currentModelId="audio-free"
        agentCategory="reasoning"
        agentLabel="Narrador"
        requiredCapability="audio"
      />,
    )

    expect(screen.getByText(/selecionar modelo — narrador/i)).toBeTruthy()
    expect(screen.getByText(/máximo de/i)).toBeTruthy()
    expect(screen.queryByText('Modelo Texto Premium')).toBeNull()
    expect(screen.getByText('Modelo Audio Gratis')).toBeTruthy()
    expect(screen.getByText('Modelo Audio Pago')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /pagos/i }))

    expect(screen.queryByText(/máximo de/i)).toBeNull()
    expect(screen.queryByText('Modelo Audio Gratis')).toBeNull()
    expect(screen.getByText('Modelo Audio Pago')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /modelo audio pago/i }))

    expect(onSelect).toHaveBeenCalledWith('audio-paid')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('supports provider filtering and empty search states', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(
      <ModelSelectorModal
        open
        onClose={onClose}
        onSelect={onSelect}
        currentModelId="text-premium"
        agentCategory="reasoning"
        agentLabel="Jurista"
      />,
    )

    const providerSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(providerSelect, { target: { value: 'Anthropic' } })

    expect(screen.getByText('Modelo Texto Premium')).toBeTruthy()
    expect(screen.queryByText('Modelo Audio Pago')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/buscar modelo/i), { target: { value: 'inexistente' } })

    expect(screen.getByText(/nenhum modelo encontrado com esses filtros/i)).toBeTruthy()
  })

  it('shows N/D when pricing is unknown in the local catalog', () => {
    render(
      <ModelSelectorModal
        open
        onClose={() => {}}
        onSelect={() => {}}
        currentModelId="image-unknown-pricing"
        agentCategory="synthesis"
        agentLabel="Gerador de Imagens"
        requiredCapability="image"
      />,
    )

    expect(screen.getByText('Modelo Imagem Sem Preço')).toBeTruthy()
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
    expect(screen.getByText(/n\/d = preço não disponível no catálogo local/i)).toBeTruthy()
  })

  it('shows precise provider/model guidance when no compatible capability exists in the personal catalog', () => {
    selectorMocks.models = [
      {
        id: 'text-only',
        label: 'Modelo Texto',
        provider: 'Anthropic',
        tier: 'balanced',
        description: 'Texto puro',
        contextWindow: 128000,
        inputCost: 1,
        outputCost: 2,
        isFree: false,
        agentFit: { extraction: 7, synthesis: 7, reasoning: 7, writing: 7 },
        capabilities: ['text'],
      },
    ]

    render(
      <ModelSelectorModal
        open
        onClose={() => {}}
        onSelect={() => {}}
        currentModelId=""
        agentCategory="synthesis"
        agentLabel="Gerador de Imagens"
        requiredCapability="image"
      />,
    )

    expect(screen.getByText(/nenhum modelo com capacidade real de imagem/i)).toBeTruthy()
    expect(screen.getByText(/openai direto:/i)).toBeTruthy()
    expect(screen.getByText(/gpt-image-1/i)).toBeTruthy()
    expect(screen.getByText(/catalogos por provedor/i)).toBeTruthy()
  })
})