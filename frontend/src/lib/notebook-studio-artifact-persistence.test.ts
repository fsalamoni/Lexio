import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioArtifact } from './firestore-types'

const firestoreMocks = vi.hoisted(() => ({
  getResearchNotebook: vi.fn(),
  updateResearchNotebook: vi.fn(),
}))

vi.mock('./firestore-service', () => ({
  getResearchNotebook: (...args: unknown[]) => firestoreMocks.getResearchNotebook(...args),
  updateResearchNotebook: (...args: unknown[]) => firestoreMocks.updateResearchNotebook(...args),
}))

import { persistStudioArtifactToNotebook } from './notebook-studio-artifact-persistence'

describe('persistStudioArtifactToNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreMocks.getResearchNotebook.mockResolvedValue({
      id: 'nb-1',
      title: 'Caderno',
      topic: 'Tema',
      sources: [],
      messages: [],
      artifacts: [],
      status: 'active',
      created_at: '2026-05-08T10:00:00.000Z',
      llm_executions: [],
    })
    firestoreMocks.updateResearchNotebook.mockResolvedValue(undefined)
  })

  it('appends the artifact and maps studio executions to cost records', async () => {
    const artifact: StudioArtifact = {
      id: 'art-1',
      type: 'resumo',
      title: 'Resumo - Tema',
      content: '# Resumo',
      format: 'markdown',
      created_at: '2026-05-08T10:05:00.000Z',
    }

    const result = await persistStudioArtifactToNotebook({
      uid: 'user-1',
      notebookId: 'nb-1',
      artifact,
      executions: [
        {
          phase: 'pesquisa',
          agent_name: 'studio_pesquisador',
          model: 'model-a',
          tokens_in: 100,
          tokens_out: 80,
          cost_usd: 0.01,
          duration_ms: 1200,
        },
      ],
    })

    expect(result.executionCount).toBe(1)
    expect(firestoreMocks.updateResearchNotebook).toHaveBeenCalledWith('user-1', 'nb-1', expect.objectContaining({
      artifacts: [artifact],
      llm_executions: [expect.objectContaining({
        source_type: 'caderno_pesquisa',
        source_id: 'nb-1',
        agent_name: 'studio_pesquisador',
        total_tokens: 180,
        cost_usd: 0.01,
      })],
    }))
  })

  it('throws when the notebook does not exist', async () => {
    firestoreMocks.getResearchNotebook.mockResolvedValueOnce(null)

    await expect(persistStudioArtifactToNotebook({
      uid: 'user-1',
      notebookId: 'missing',
      artifact: {
        id: 'art-1',
        type: 'resumo',
        title: 'Resumo',
        content: '# Resumo',
        format: 'markdown',
        created_at: '2026-05-08T10:05:00.000Z',
      },
      executions: [],
    })).rejects.toThrow('Caderno missing')
  })
})