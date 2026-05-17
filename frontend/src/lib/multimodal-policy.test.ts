import { describe, expect, it } from 'vitest'
import {
  evaluateMultimodalProviderPolicy,
  getMultimodalFileLimitBytes,
  normalizeMultimodalPolicyConfig,
  selectMultimodalModelForPolicy,
} from './multimodal-policy'

describe('multimodal policy', () => {
  it('normalizes missing fields, clamps limits, and filters provider ids', () => {
    const policy = normalizeMultimodalPolicyConfig({
      max_attachments_per_turn: 99,
      modalities: {
        image: {
          max_file_mb: 500,
          allowed_provider_ids: ['openai', 'missing-provider', 'OPENAI'],
          blocked_provider_ids: ['anthropic', ''],
        },
        audio: {
          enabled: false,
          max_file_mb: -5,
        },
      },
    })

    expect(policy.max_attachments_per_turn).toBe(12)
    expect(policy.modalities?.image?.max_file_mb).toBe(64)
    expect(policy.modalities?.image?.allowed_provider_ids).toEqual(['openai'])
    expect(policy.modalities?.image?.blocked_provider_ids).toEqual(['anthropic'])
    expect(policy.modalities?.audio?.enabled).toBe(false)
    expect(policy.modalities?.audio?.max_file_mb).toBe(1)
    expect(policy.modalities?.video?.max_file_mb).toBe(50)
  })

  it('returns byte limits from the normalized modality policy', () => {
    const policy = normalizeMultimodalPolicyConfig({
      modalities: {
        image: { max_file_mb: 3 },
      },
    })

    expect(getMultimodalFileLimitBytes(policy, 'image')).toBe(3 * 1024 * 1024)
    expect(getMultimodalFileLimitBytes(policy, 'audio')).toBe(25 * 1024 * 1024)
  })

  it('blocks providers outside an allow-list', () => {
    const policy = normalizeMultimodalPolicyConfig({
      modalities: {
        image: { allowed_provider_ids: ['openai'] },
      },
    })

    const decision = evaluateMultimodalProviderPolicy({
      modelId: 'anthropic/claude-sonnet-4',
      modality: 'image',
      policy,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.providerId).toBe('anthropic')
    expect(decision.reason).toContain('nao esta na lista')
  })

  it('selects the first fallback model allowed by provider policy', () => {
    const policy = normalizeMultimodalPolicyConfig({
      modalities: {
        image: { allowed_provider_ids: ['openai'] },
      },
    })

    const selection = selectMultimodalModelForPolicy({
      model: 'anthropic/claude-sonnet-4',
      fallbackModels: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash'],
      modality: 'image',
      policy,
    })

    expect(selection.model).toBe('openai/gpt-4o-mini')
    expect(selection.fallbackModels).toEqual([])
    expect(selection.blockedReason).toBeUndefined()
  })
})
