import { describe, expect, it } from 'vitest'
import { CALLABLE_AGENT_KEYS, listCallableAgentDescriptions } from './skill-registry'

describe('chat orchestrator skill registry', () => {
  it('exposes multimodal evidence specialists to the orchestrator prompt', () => {
    const descriptions = listCallableAgentDescriptions()
    const keys = descriptions.map(agent => agent.key)

    expect(keys).toEqual(expect.arrayContaining([
      'chat_image_evidence_specialist',
      'chat_audio_evidence_specialist',
      'chat_video_evidence_specialist',
      'chat_multimodal_evidence_synthesizer',
    ]))

    expect(keys).not.toContain('chat_multimodal_analysis')
    expect(keys).not.toContain('chat_audio_transcription')
    expect(descriptions.every(agent => CALLABLE_AGENT_KEYS.has(agent.key))).toBe(true)
  })
})