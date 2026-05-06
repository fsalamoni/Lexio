import { describe, expect, it } from 'vitest'

import { resolveProviderForModel } from './provider-credentials'
import type { ModelOption } from './model-config'
import type { ProviderSettingsMap } from './firestore-types'

function mkModel(overrides: Partial<ModelOption>): ModelOption {
  return {
    id: overrides.id ?? 'openai/gpt-4.1-mini',
    label: overrides.label ?? 'Model',
    provider: overrides.provider ?? 'OpenRouter',
    providerId: overrides.providerId,
    tier: overrides.tier ?? 'balanced',
    description: overrides.description ?? 'desc',
    contextWindow: overrides.contextWindow ?? 128_000,
    inputCost: overrides.inputCost ?? 1,
    outputCost: overrides.outputCost ?? 1,
    isFree: overrides.isFree ?? false,
    agentFit: overrides.agentFit ?? {
      extraction: 7,
      synthesis: 7,
      reasoning: 7,
      writing: 7,
    },
    capabilities: overrides.capabilities ?? ['text'],
  }
}

describe('resolveProviderForModel', () => {
  it('uses explicit providerId from catalog entries', () => {
    const catalog = [mkModel({ id: 'groq/llama-3.3-70b-versatile', providerId: 'groq', provider: 'Groq' })]

    expect(resolveProviderForModel('groq/llama-3.3-70b-versatile', catalog)).toBe('groq')
  })

  it('maps provider labels when providerId is absent', () => {
    const catalog = [mkModel({ id: 'groq/llama-3.3-70b-versatile', providerId: undefined, provider: 'Groq' })]

    expect(resolveProviderForModel('groq/llama-3.3-70b-versatile', catalog)).toBe('groq')
  })

  it('keeps legacy catalog entries on OpenRouter when provider metadata is missing', () => {
    const catalog = [mkModel({ id: 'anthropic/claude-sonnet-4', providerId: undefined, provider: '' })]

    expect(resolveProviderForModel('anthropic/claude-sonnet-4', catalog)).toBe('openrouter')
  })

  it('finds provider by saved_models when model is not in catalog', () => {
    const providerSettings: ProviderSettingsMap = {
      elevenlabs: {
        enabled: true,
        saved_models: [mkModel({ id: 'eleven_multilingual_v2', providerId: 'elevenlabs', provider: 'ElevenLabs' })],
      },
    }

    expect(resolveProviderForModel('eleven_multilingual_v2', [], providerSettings)).toBe('elevenlabs')
  })

  it('uses provider prefix only as last-resort for uncatalogued models', () => {
    expect(resolveProviderForModel('qwen/qwen3-235b-a22b')).toBe('qwen')
  })

  it('routes NVIDIA catalog entries to the direct NVIDIA provider', () => {
    const catalog = [
      mkModel({
        id: 'nvidia/llama-3.1-nemotron-70b-instruct',
        providerId: 'nvidia',
        provider: 'NVIDIA',
      }),
    ]

    expect(resolveProviderForModel('nvidia/llama-3.1-nemotron-70b-instruct', catalog)).toBe('nvidia')
  })

  it('defaults to openrouter for unknown model identifiers', () => {
    expect(resolveProviderForModel('my-custom-model-without-prefix')).toBe('openrouter')
  })
})
