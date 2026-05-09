// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ThesisAnalysisCard from './ThesisAnalysisCard'

const thesisAnalysisMocks = vi.hoisted(() => ({
  analyzeThesisBank: vi.fn(),
  createThesis: vi.fn().mockResolvedValue(undefined),
  deleteThesis: vi.fn().mockResolvedValue(undefined),
  getAcervoAnalysisStatus: vi.fn(),
  getLastThesisAnalysisSession: vi.fn(),
  listTheses: vi.fn(),
  loadApiKeyValues: vi.fn(),
  loadThesisAnalystModels: vi.fn(),
  markAcervoDocumentsAnalyzed: vi.fn().mockResolvedValue(undefined),
  saveThesisAnalysisSession: vi.fn().mockResolvedValue(undefined),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  updateThesis: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./AgentTrailProgressModal', () => ({
  default: ({ isOpen, currentMessage, percent }: any) => (
    isOpen ? <div>{`${currentMessage} (${percent}%)`}</div> : null
  ),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}))

vi.mock('./Toast', () => ({
  useToast: () => thesisAnalysisMocks.toast,
}))

vi.mock('../lib/settings-store', () => ({
  loadApiKeyValues: (...args: unknown[]) => thesisAnalysisMocks.loadApiKeyValues(...args),
}))

vi.mock('../lib/firestore-service', () => ({
  listTheses: (...args: unknown[]) => thesisAnalysisMocks.listTheses(...args),
  getAcervoAnalysisStatus: (...args: unknown[]) => thesisAnalysisMocks.getAcervoAnalysisStatus(...args),
  markAcervoDocumentsAnalyzed: (...args: unknown[]) => thesisAnalysisMocks.markAcervoDocumentsAnalyzed(...args),
  saveThesisAnalysisSession: (...args: unknown[]) => thesisAnalysisMocks.saveThesisAnalysisSession(...args),
  getLastThesisAnalysisSession: (...args: unknown[]) => thesisAnalysisMocks.getLastThesisAnalysisSession(...args),
  createThesis: (...args: unknown[]) => thesisAnalysisMocks.createThesis(...args),
  updateThesis: (...args: unknown[]) => thesisAnalysisMocks.updateThesis(...args),
  deleteThesis: (...args: unknown[]) => thesisAnalysisMocks.deleteThesis(...args),
}))

vi.mock('../lib/thesis-analyzer', () => ({
  analyzeThesisBank: (...args: unknown[]) => thesisAnalysisMocks.analyzeThesisBank(...args),
}))

vi.mock('../lib/model-config', () => ({
  ModelsNotConfiguredError: class ModelsNotConfiguredError extends Error {},
  loadThesisAnalystModels: (...args: unknown[]) => thesisAnalysisMocks.loadThesisAnalystModels(...args),
}))

vi.mock('../lib/firebase-auth-retry', () => ({
  withTransientFirebaseAuthRetry: (fn: () => unknown) => Promise.resolve(fn()),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ThesisAnalysisCard', () => {
  it('loads thesis-bank stats, runs the analysis pipeline, renders suggestions, and applies a create suggestion', async () => {
    thesisAnalysisMocks.loadApiKeyValues.mockResolvedValue({ openrouter_api_key: 'sk-test-key' })
    thesisAnalysisMocks.getAcervoAnalysisStatus
      .mockResolvedValueOnce({ analyzed_count: 12, unanalyzed_count: 2, unanalyzed_docs: [{ id: 'doc-1' }, { id: 'doc-2' }] })
      .mockResolvedValueOnce({ analyzed_count: 12, unanalyzed_count: 2, unanalyzed_docs: [{ id: 'doc-1' }, { id: 'doc-2' }] })
    thesisAnalysisMocks.getLastThesisAnalysisSession.mockResolvedValue({
      created_at: '2026-05-01T12:00:00.000Z',
      suggestions_count: 3,
      accepted_count: 1,
    })
    thesisAnalysisMocks.listTheses.mockResolvedValue({ items: [{ id: 'thesis-1', title: 'Tese atual' }] })
    thesisAnalysisMocks.loadThesisAnalystModels.mockResolvedValue({ analyst: 'model-1' })
    thesisAnalysisMocks.analyzeThesisBank.mockImplementation(async (_apiKey, _theses, _docs, _modelMap, onProgress) => {
      onProgress([
        { key: 'catalogador', label: 'Catalogador', status: 'done', executionState: 'completed', message: 'Catálogo consolidado' },
        { key: 'compilador', label: 'Compilador', status: 'done', executionState: 'completed', message: 'Sugestões geradas' },
      ])
      return {
        created_at: '2026-05-09T12:00:00.000Z',
        total_theses_analyzed: 1,
        total_docs_analyzed: 2,
        new_doc_count: 2,
        executive_summary: 'Há oportunidades de criar novas teses.',
        suggestions: [
          {
            id: 'suggestion-create-1',
            type: 'create',
            priority: 'high',
            title: 'Criar tese sobre tema recorrente',
            description: 'Os documentos novos apontam um novo entendimento.',
            impact_score: 9,
            rationale: 'Nova linha argumentativa identificada.',
            affected_thesis_ids: [],
            affected_thesis_titles: [],
            proposed_thesis: {
              title: 'Nova tese estratégica',
              summary: 'Resumo da nova tese',
              content: 'Conteúdo consolidado da nova tese',
              tags: ['estratégia', 'processual'],
            },
          },
        ],
        usage_summary: {},
        llm_executions: [],
        pipeline_meta: {},
      }
    })

    render(<ThesisAnalysisCard onThesesChanged={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Análise do Banco de Teses')).toBeTruthy()
      expect(screen.getByText('12')).toBeTruthy()
      expect(screen.getByText('2')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Analisar Teses/i }))

    await waitFor(() => {
      expect(thesisAnalysisMocks.analyzeThesisBank).toHaveBeenCalled()
      expect(screen.getByText('Há oportunidades de criar novas teses.')).toBeTruthy()
      expect(screen.getByText('Criar tese sobre tema recorrente')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Aceitar/i }))

    await waitFor(() => {
      expect(thesisAnalysisMocks.createThesis).toHaveBeenCalledWith('user-1', expect.objectContaining({
        title: 'Nova tese estratégica',
        source_type: 'curated',
        usage_count: 0,
      }))
      expect(thesisAnalysisMocks.markAcervoDocumentsAnalyzed).toHaveBeenCalledWith('user-1', ['doc-1', 'doc-2'])
      expect(thesisAnalysisMocks.saveThesisAnalysisSession).toHaveBeenCalled()
      expect(thesisAnalysisMocks.toast.success).toHaveBeenCalledWith('Sugestão aplicada com sucesso')
      expect(screen.getByText('Aplicado com sucesso')).toBeTruthy()
    })
  })
})