/**
 * Testes unitários para as super-skills (PR3).
 *
 * Cobre especificamente a super-skill hybrid_search, incluindo:
 *  - Validação de argumentos (query obrigatória)
 *  - Modo mock com resultados simulados
 *  - Cenário de resultados vazios
 *  - Propagação de AbortError
 *  - Emissão de eventos ChatTrailEvent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock do módulo search-client para isolar a skill ────────────────────────────

const mockHybridSearch = vi.fn()

vi.mock('../search-client', () => ({
  hybridSearch: (...args: unknown[]) => mockHybridSearch(...args),
}))

// Importa depois que o mock está instalado
import { buildSuperSkills } from './super-skills'
import type { BudgetTracker, Skill, SkillContext, SkillResult } from './types'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function createBudgetTracker(): BudgetTracker {
  return {
    recordUsage: vi.fn(),
    used: () => ({ tokens: 0, cost_usd: 0 }),
    usedRatio: () => 0,
    exceeded: () => false,
    hardStop: vi.fn(),
    isHardStopped: () => ({ stopped: false }),
    records: () => [],
  }
}

function mockContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    uid: 'test-user',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    effort: 'medio',
    budget: createBudgetTracker(),
    emit: vi.fn(),
    models: {},
    signal: new AbortController().signal,
    mock: false,
    apiKey: '',
    ...overrides,
  }
}

async function findAndRunSkill(
  name: string,
  args: Record<string, unknown>,
  ctx: SkillContext,
): Promise<SkillResult> {
  const skills = buildSuperSkills()
  const skill = skills.find(s => s.name === name)
  if (!skill) throw new Error(`Skill "${name}" not found in registry`)
  return skill.run(args, ctx)
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

function sampleSearchResults() {
  return {
    results: [
      {
        source: 'DataJud',
        content: 'EMENTA — Responsabilidade civil. Dano ambiental. Dever de reparação.',
        score: 0.94,
        origin: 'datajud',
        process_number: 'REsp 1.950.500/SP',
      },
      {
        source: 'Qdrant',
        content: 'SÚMULA 618/STJ — Inversão do ônus da prova em ações ambientais.',
        score: 0.82,
        origin: 'qdrant',
        origins: ['qdrant'],
      },
    ],
    stats: {
      query: 'dano ambiental',
      semantic_count: 10,
      semantic_time_ms: 342,
      lexical_count: 8,
      lexical_time_ms: 567,
      fused_count: 2,
      total_time_ms: 1234,
      semantic_weight: 0.5,
      lexical_weight: 0.5,
    },
  }
}

// ── Testes ──────────────────────────────────────────────────────────────────────

describe('buildSuperSkills', () => {
  it('deve incluir hybrid_search skill no registro', () => {
    const skills = buildSuperSkills()
    const hybridSkill = skills.find(s => s.name === 'hybrid_search')
    expect(hybridSkill).toBeDefined()
    expect(hybridSkill?.description).toContain('híbrida')
    expect(hybridSkill?.argsHint).toBeDefined()
    expect(hybridSkill?.argsHint?.query).toBeDefined()
  })

  it('deve incluir generate_document, search_jurisprudence, analyze_thesis e check_document_status', () => {
    const skills = buildSuperSkills()
    const names = skills.map(s => s.name)
    expect(names).toContain('generate_document')
    expect(names).toContain('check_document_status')
    expect(names).toContain('search_jurisprudence')
    expect(names).toContain('analyze_thesis')
    expect(names).toContain('hybrid_search')
  })
})

describe('hybrid_search skill', () => {
  beforeEach(() => {
    mockHybridSearch.mockClear()
  })

  it('deve rejeitar quando query está vazia', async () => {
    const ctx = mockContext()
    const result = await findAndRunSkill('hybrid_search', { query: '' }, ctx)
    expect(result.tool_message).toContain('Erro')
    expect(result.tool_message).toContain('query')
  })

  it('deve rejeitar quando query não é fornecida', async () => {
    const ctx = mockContext()
    const result = await findAndRunSkill('hybrid_search', {}, ctx)
    expect(result.tool_message).toContain('Erro')
    expect(result.tool_message).toContain('query')
  })

  it('deve emitir evento de início e conclusão em modo mock', async () => {
    const emit = vi.fn()
    const ctx = mockContext({ mock: true, emit })

    const result = await findAndRunSkill(
      'hybrid_search',
      { query: 'dano ambiental', top_k: 3 },
      ctx,
    )

    // Deve ter emitido pelo menos 2 eventos
    expect(emit).toHaveBeenCalled()
    const calls = emit.mock.calls

    // Primeiro evento: start
    const startEvent = calls[0][0]
    expect(startEvent.type).toBe('super_skill_call')
    expect(startEvent.skill).toBe('hybrid_search')
    expect(startEvent.result_summary).toContain('Pesquisando')

    // Último evento: resultado
    const lastEvent = calls[calls.length - 1][0]
    expect(lastEvent.type).toBe('super_skill_call')
    expect(lastEvent.skill).toBe('hybrid_search')
    expect(lastEvent.result_summary).toContain('resultado(s)')

    // Resultado deve conter os itens mock
    expect(result.tool_message).toContain('busca híbrida')
    expect(result.tool_message).toContain('dano ambiental')
    expect(result.tool_message).toContain('DataJud')
    expect(result.tool_message).toContain('Qdrant')
  })

  it('deve retornar mensagem apropriada quando não houver resultados (modo mock)', async () => {
    const emit = vi.fn()
    const ctx = mockContext({
      mock: true,
      emit,
      // Não mockamos o hybridSearch aqui — o modo mock do skill usa dados internos.
      // Precisamos de um jeito de forçar resultados vazios no mock.
      // O mock do skill tem resultados fixos (sempre 4 itens).
      // Para testar resultados vazios, usamos o mock do search-client.
    })

    // Configura o mock do hybridSearch para retornar array vazio
    mockHybridSearch.mockResolvedValueOnce({
      results: [],
      stats: { fused_count: 0, total_time_ms: 500 },
    })

    const result = await findAndRunSkill(
      'hybrid_search',
      { query: 'consulta sem resultados' },
      { ...ctx, mock: false },
    )

    expect(result.tool_message).toContain('Nenhum resultado')
  })

  it('deve respeitar top_k máximo de 20', async () => {
    mockHybridSearch.mockResolvedValueOnce(sampleSearchResults())
    const ctx = mockContext({ mock: false })

    await findAndRunSkill(
      'hybrid_search',
      { query: 'teste', top_k: 100 },
      ctx,
    )

    // Verifica que topK foi clampado para 20
    const [query, opts] = mockHybridSearch.mock.calls[0]
    expect(query).toBe('teste')
    expect(opts.topK).toBe(20)
  })

  it('deve respeitar top_k mínimo de 1', async () => {
    mockHybridSearch.mockResolvedValueOnce(sampleSearchResults())
    const ctx = mockContext({ mock: false })

    await findAndRunSkill(
      'hybrid_search',
      { query: 'teste', top_k: 0 },
      ctx,
    )

    const [, opts] = mockHybridSearch.mock.calls[0]
    expect(opts.topK).toBe(1)
  })

  it('deve clamp semantic_weight e lexical_weight entre 0 e 1', async () => {
    mockHybridSearch.mockResolvedValueOnce(sampleSearchResults())
    const ctx = mockContext({ mock: false })

    await findAndRunSkill(
      'hybrid_search',
      { query: 'teste', semantic_weight: -0.5, lexical_weight: 1.5 },
      ctx,
    )

    const [, opts] = mockHybridSearch.mock.calls[0]
    expect(opts.semanticWeight).toBe(0)
    expect(opts.lexicalWeight).toBe(1)
  })

  it('deve propagar AbortError sem capturar', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    mockHybridSearch.mockRejectedValueOnce(abortError)
    const ctx = mockContext({ mock: false })

    await expect(
      findAndRunSkill('hybrid_search', { query: 'teste' }, ctx),
    ).rejects.toThrow('Aborted')
  })

  it('deve capturar erros comuns e retornar tool_message', async () => {
    mockHybridSearch.mockRejectedValueOnce(new Error('Network failure'))
    const emit = vi.fn()
    const ctx = mockContext({ mock: false, emit })

    const result = await findAndRunSkill(
      'hybrid_search',
      { query: 'teste' },
      ctx,
    )

    expect(result.tool_message).toContain('Erro na busca híbrida')
    expect(result.tool_message).toContain('Network failure')
  })

  it('deve incluir process_number e origins nos resultados quando disponíveis', async () => {
    const emit = vi.fn()
    const ctx = mockContext({ mock: true, emit })

    const result = await findAndRunSkill(
      'hybrid_search',
      { query: 'teste process_number' },
      ctx,
    )

    expect(result.tool_message).toContain('REsp')
    expect(result.tool_message).toContain('Processo:')
  })

  it('deve reportar o tempo de execução nos eventos', async () => {
    mockHybridSearch.mockResolvedValueOnce({
      results: [
        {
          source: 'Qdrant',
          content: 'Teste.',
          score: 0.9,
          origin: 'qdrant',
        },
      ],
      stats: { fused_count: 1, total_time_ms: 3456 },
    })
    const emit = vi.fn()
    const ctx = mockContext({ mock: false, emit })

    await findAndRunSkill('hybrid_search', { query: 'tempo' }, ctx)

    const completeEvent = emit.mock.calls[emit.mock.calls.length - 1][0]
    expect(completeEvent.result_summary).toContain('3.5s') // 3456ms = 3.5s
  })

  it('deve usar valores default quando argumentos não fornecidos', async () => {
    mockHybridSearch.mockResolvedValueOnce(sampleSearchResults())
    const ctx = mockContext({ mock: false })

    await findAndRunSkill('hybrid_search', { query: 'defaults' }, ctx)

    const [, opts] = mockHybridSearch.mock.calls[0]
    expect(opts.topK).toBe(5) // default
    expect(opts.semanticWeight).toBe(0.5)
    expect(opts.lexicalWeight).toBe(0.5)
  })
})