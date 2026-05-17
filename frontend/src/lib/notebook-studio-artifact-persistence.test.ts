import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioArtifact } from './firestore-types'

const firestoreMocks = vi.hoisted(() => ({
  getResearchNotebook: vi.fn(),
  updateResearchNotebook: vi.fn(),
}))

const exportMocks = vi.hoisted(() => ({
  materializeStudioArtifactExports: vi.fn(async (artifact: StudioArtifact, _options: { userId: string; notebookId: string }) => ({
    ...artifact,
    download_url: 'https://cdn.lexio.test/artifact.md',
    storage_path: 'notebook_artifacts/user-1/nb-1/art-1/artifact.md',
    exports: [
      { label: 'Markdown', format: 'markdown', status: 'ready', download_url: 'https://cdn.lexio.test/artifact.md', storage_path: 'notebook_artifacts/user-1/nb-1/art-1/artifact.md' },
    ],
  })),
}))

vi.mock('./firestore-service', () => ({
  getResearchNotebook: (...args: unknown[]) => firestoreMocks.getResearchNotebook(...args),
  updateResearchNotebook: (...args: unknown[]) => firestoreMocks.updateResearchNotebook(...args),
}))

vi.mock('./chat-artifact-exporters', () => ({
  materializeStudioArtifactExports: (artifact: StudioArtifact, options: { userId: string; notebookId: string }) => exportMocks.materializeStudioArtifactExports(artifact, options),
}))

import { materializeExistingStudioArtifactExports, persistStudioArtifactToNotebook } from './notebook-studio-artifact-persistence'

describe('persistStudioArtifactToNotebook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportMocks.materializeStudioArtifactExports.mockImplementation(async (artifact: StudioArtifact, _options: { userId: string; notebookId: string }) => ({
      ...artifact,
      download_url: 'https://cdn.lexio.test/artifact.md',
      storage_path: 'notebook_artifacts/user-1/nb-1/art-1/artifact.md',
      exports: [
        { label: 'Markdown', format: 'markdown', status: 'ready', download_url: 'https://cdn.lexio.test/artifact.md', storage_path: 'notebook_artifacts/user-1/nb-1/art-1/artifact.md' },
      ],
    }))
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
    const expectedArtifact = expect.objectContaining({
      id: 'art-1',
      download_url: 'https://cdn.lexio.test/artifact.md',
      exports: [expect.objectContaining({ status: 'ready', format: 'markdown' })],
    })
    expect(exportMocks.materializeStudioArtifactExports).toHaveBeenCalledWith(artifact, { userId: 'user-1', notebookId: 'nb-1' })
    expect(result.artifact).toEqual(expectedArtifact)
    expect(firestoreMocks.updateResearchNotebook).toHaveBeenCalledWith('user-1', 'nb-1', expect.objectContaining({
      artifacts: [expectedArtifact],
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

  it('materializes exports for an existing notebook artifact and replaces it in place', async () => {
    const existingArtifact: StudioArtifact = {
      id: 'legacy-art',
      type: 'relatorio',
      title: 'Relatório legado',
      content: '# Relatório legado',
      format: 'markdown',
      created_at: '2026-05-08T10:05:00.000Z',
    }
    firestoreMocks.getResearchNotebook.mockResolvedValueOnce({
      id: 'nb-1',
      title: 'Caderno',
      topic: 'Tema',
      sources: [],
      messages: [],
      artifacts: [
        { id: 'before', type: 'resumo', title: 'Antes', content: '# Antes', format: 'markdown', created_at: '2026-05-08T10:00:00.000Z' },
        existingArtifact,
      ],
      status: 'active',
      created_at: '2026-05-08T10:00:00.000Z',
      llm_executions: [],
    })

    const result = await materializeExistingStudioArtifactExports({
      uid: 'user-1',
      notebookId: 'nb-1',
      artifactId: 'legacy-art',
    })

    expect(exportMocks.materializeStudioArtifactExports).toHaveBeenCalledWith(existingArtifact, { userId: 'user-1', notebookId: 'nb-1' })
    expect(result.artifact).toEqual(expect.objectContaining({
      id: 'legacy-art',
      download_url: 'https://cdn.lexio.test/artifact.md',
      exports: [expect.objectContaining({ status: 'ready', format: 'markdown' })],
    }))
    expect(result.artifacts.map(artifact => artifact.id)).toEqual(['before', 'legacy-art'])
    expect(firestoreMocks.updateResearchNotebook).toHaveBeenCalledWith('user-1', 'nb-1', expect.objectContaining({
      artifacts: [
        expect.objectContaining({ id: 'before' }),
        expect.objectContaining({ id: 'legacy-art', download_url: 'https://cdn.lexio.test/artifact.md' }),
      ],
    }))
  })
})