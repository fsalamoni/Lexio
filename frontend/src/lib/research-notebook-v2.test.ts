import { describe, expect, it } from 'vitest'
import {
  buildNotebookSourcePreview,
  buildNotebookSavedSearchTags,
  buildNotebookSavedSearchTitle,
  buildResearchNotebookV2Snapshot,
  canOpenNotebookSourceViewer,
  countNotebookSavedSearchesByVariant,
  filterNotebookAcervoCandidates,
  filterNotebookSavedSearches,
  normalizeNotebookSavedSearchTags,
} from './research-notebook-v2'
import type { AcervoDocumentData, NotebookSavedSearchEntry, ResearchNotebookData } from './firestore-types'

describe('research-notebook-v2', () => {
  it('builds a compact operational snapshot for a notebook', () => {
    const notebook: ResearchNotebookData = {
      id: 'nb-1',
      title: 'Caderno teste',
      topic: 'Tema teste',
      description: 'Descricao',
      created_at: '2026-04-18T08:00:00.000Z',
      updated_at: '2026-04-18T10:00:00.000Z',
      status: 'active',
      sources: [
        {
          id: 'source-1',
          type: 'acervo',
          name: 'Documento base',
          reference: 'doc-1',
          text_content: 'conteudo relevante',
          status: 'indexed',
          added_at: '2026-04-18T09:00:00.000Z',
        },
        {
          id: 'source-2',
          type: 'jurisprudencia',
          name: 'Pesquisa DataJud',
          reference: 'consulta',
          status: 'pending',
          added_at: '2026-04-18T09:30:00.000Z',
        },
      ],
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Pergunta',
          created_at: '2026-04-18T10:30:00.000Z',
        },
      ],
      artifacts: [
        {
          id: 'artifact-1',
          type: 'resumo',
          title: 'Resumo',
          content: 'Conteudo',
          format: 'markdown',
          created_at: '2026-04-18T11:00:00.000Z',
        },
      ],
      saved_searches: [{
        id: 'saved-1',
        title: 'Busca salva',
        query: 'tema',
        variant: 'external',
        mode: 'executed',
        queryChars: 4,
        totalContextChars: 120,
        created_at: '2026-04-18T11:10:00.000Z',
        updated_at: '2026-04-18T11:10:00.000Z',
      }],
      research_audits: [{
        variant: 'external',
        mode: 'executed',
        query: 'tema',
        queryChars: 4,
        totalContextChars: 120,
        created_at: '2026-04-18T11:15:00.000Z',
      }],
    }

    const snapshot = buildResearchNotebookV2Snapshot(notebook)

    expect(snapshot.sourceCount).toBe(2)
    expect(snapshot.indexedSourceCount).toBe(1)
    expect(snapshot.textReadySourceCount).toBe(1)
    expect(snapshot.webSourceCount).toBe(1)
    expect(snapshot.savedSearchCount).toBe(1)
    expect(snapshot.latestActivityAt).toBe('2026-04-18T11:15:00.000Z')
  })

  it('filters acervo candidates excluding already linked sources', () => {
    const notebook = {
      sources: [
        {
          id: 'source-1',
          type: 'acervo',
          name: 'Documento 1',
          reference: 'doc-1',
          status: 'indexed',
          added_at: '2026-04-18T09:00:00.000Z',
        },
      ],
    } as ResearchNotebookData

    const acervoDocs: AcervoDocumentData[] = [
      {
        id: 'doc-1',
        filename: 'Documento 1',
        content_type: 'text/plain',
        size_bytes: 10,
        text_content: 'abc',
        chunks_count: 1,
        status: 'indexed',
        created_at: '2026-04-18T08:00:00.000Z',
      },
      {
        id: 'doc-2',
        filename: 'Nepotismo administrativo',
        content_type: 'text/plain',
        size_bytes: 10,
        text_content: 'abc',
        chunks_count: 1,
        status: 'indexed',
        created_at: '2026-04-18T08:00:00.000Z',
        assuntos: ['controle interno'],
      },
    ]

    const filtered = filterNotebookAcervoCandidates(acervoDocs, notebook, 'nepotismo')

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('doc-2')
  })

  it('builds viewer availability and preview text for notebook sources', () => {
    const longSource = {
      id: 'source-1',
      type: 'upload',
      name: 'Documento estruturado',
      reference: 'upload-1',
      text_content: 'A'.repeat(3300),
      status: 'indexed',
      added_at: '2026-04-18T09:00:00.000Z',
    } as ResearchNotebookData['sources'][number]

    const jurisprudenceSource = {
      id: 'source-2',
      type: 'jurisprudencia',
      name: 'Pesquisa DataJud',
      reference: 'consulta',
      results_raw: JSON.stringify([{ id: 1 }, { id: 2 }]),
      status: 'indexed',
      added_at: '2026-04-18T09:30:00.000Z',
    } as ResearchNotebookData['sources'][number]

    expect(canOpenNotebookSourceViewer(longSource)).toBe(true)
    expect(buildNotebookSourcePreview(longSource)).toContain('[...]')
    expect(canOpenNotebookSourceViewer(jurisprudenceSource)).toBe(true)
    expect(buildNotebookSourcePreview(jurisprudenceSource)).toContain('viewer avançado deste workbench')
    expect(canOpenNotebookSourceViewer(null)).toBe(false)
  })

  it('builds saved search labels and semantic tags from audit data', () => {
    const title = buildNotebookSavedSearchTitle({
      variant: 'jurisprudencia',
      mode: 'executed',
      query: 'Controle de constitucionalidade concentrado em ações diretas no STF',
      queryChars: 64,
      tribunalCount: 3,
      legalArea: 'constitutional',
      dateRangeLabel: '2024-2026',
      usedSnippetFallback: true,
      totalContextChars: 240,
      created_at: '2026-04-18T11:15:00.000Z',
    })

    const tags = buildNotebookSavedSearchTags({
      variant: 'jurisprudencia',
      mode: 'executed',
      query: 'Controle de constitucionalidade',
      queryChars: 28,
      tribunalCount: 3,
      legalArea: 'constitutional',
      dateRangeLabel: '2024-2026',
      usedSnippetFallback: true,
      totalContextChars: 240,
      created_at: '2026-04-18T11:15:00.000Z',
    })

    expect(title).toContain('Jurisprudência:')
    expect(tags).toEqual(expect.arrayContaining([
      'jurisprudencia',
      'constitucional',
      'recorte-temporal',
      'tribunais',
      'fallback-snippets',
    ]))
  })

  it('filters and sorts saved searches with pinned entries first', () => {
    const savedSearches: NotebookSavedSearchEntry[] = [
      {
        id: 'search-1',
        title: 'Pesquisa externa: Tema A',
        query: 'Tema A',
        variant: 'external',
        mode: 'executed',
        queryChars: 6,
        totalContextChars: 120,
        updated_at: '2026-04-18T09:00:00.000Z',
        created_at: '2026-04-18T08:00:00.000Z',
        tags: ['pesquisa-externa'],
      },
      {
        id: 'search-2',
        title: 'Jurisprudência: Tema B',
        query: 'Tema B',
        variant: 'jurisprudencia',
        mode: 'executed',
        queryChars: 6,
        totalContextChars: 140,
        updated_at: '2026-04-18T11:00:00.000Z',
        created_at: '2026-04-18T10:00:00.000Z',
        pinned: true,
        tags: ['jurisprudencia', 'stf'],
      },
      {
        id: 'search-3',
        title: 'Pesquisa profunda: Tema C',
        query: 'Tema C',
        variant: 'deep',
        mode: 'executed',
        queryChars: 6,
        totalContextChars: 200,
        updated_at: '2026-04-18T10:00:00.000Z',
        created_at: '2026-04-18T09:30:00.000Z',
        tags: ['pesquisa-profunda'],
      },
    ]

    const filtered = filterNotebookSavedSearches(savedSearches, 'tema', 'all')

    expect(filtered.map((item) => item.id)).toEqual(['search-2', 'search-3', 'search-1'])
    expect(filterNotebookSavedSearches(savedSearches, 'stf', 'all').map((item) => item.id)).toEqual(['search-2'])
    expect(filterNotebookSavedSearches(savedSearches, '', 'deep').map((item) => item.id)).toEqual(['search-3'])
    expect(countNotebookSavedSearchesByVariant(savedSearches)).toEqual({
      all: 3,
      external: 1,
      deep: 1,
      jurisprudencia: 1,
    })
  })

  it('normalizes manual saved search tags', () => {
    expect(normalizeNotebookSavedSearchTags(' STF, controle, stf,  , Constitucional ')).toEqual([
      'stf',
      'controle',
      'constitucional',
    ])
  })
})