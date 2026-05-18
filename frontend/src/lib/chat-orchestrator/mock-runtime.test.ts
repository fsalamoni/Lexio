import { describe, expect, it } from 'vitest'

import { createBudget } from './budget'
import { mockOrchestratorLLM } from './mock-runtime'
import type { OrchestratorMessage } from './types'

function makeParams(history: OrchestratorMessage[]) {
  return {
    systemPrompt: 'system',
    history,
    modelKey: 'chat_orchestrator',
    models: {
      chat_orchestrator: 'mock/orchestrator',
      chat_image_generator: 'mock/image',
    },
    fallbackModels: {},
    apiKey: '',
    signal: new AbortController().signal,
    budget: createBudget(4096),
    perCallTokenCap: 1024,
  }
}

describe('mockOrchestratorLLM', () => {
  it('routes literal image requests to generate_image before finalizing', async () => {
    const response = await mockOrchestratorLLM(makeParams([
      { role: 'user', content: 'Crie uma imagem do painel jurídico em 16:9.' },
    ]))

    expect(JSON.parse(response.raw)).toEqual({
      tool: 'generate_image',
      args: expect.objectContaining({
        prompt: 'Crie uma imagem do painel jurídico em 16:9.',
        aspect_ratio: '16:9',
        approved: true,
      }),
      rationale: 'Pedido exige imagem literal; o mock deve acionar a skill real de imagem.',
    })
  })

  it('keeps the planner-first flow for non-artifact requests', async () => {
    const response = await mockOrchestratorLLM(makeParams([
      { role: 'user', content: 'Quais riscos jurídicos eu devo analisar neste caso?' },
    ]))

    expect(JSON.parse(response.raw)).toEqual({
      tool: 'call_agent',
      args: {
        agent_key: 'chat_planner',
        task: 'Decomponha o pedido do usuário em passos curtos: "Quais riscos jurídicos eu devo analisar neste caso?"',
      },
      rationale: 'Planejar antes de redigir.',
    })
  })
})