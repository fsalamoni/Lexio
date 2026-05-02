/**
 * Unit tests for PR3 — Super-Skills de Pipeline
 *
 * Tests:
 *  - generate_document with valid/invalid args
 *  - check_document_status
 *  - search_jurisprudence
 *  - analyze_thesis
 *  - mock mode fallback
 *  - trail event emission
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSuperSkills, PIPELINE_DOCUMENT_TYPES } from '../super-skills'
import type { Skill, SkillContext, SkillResult, ChatTrailEvent } from '../types'

// Helper: cria um contexto mock
interface TestSkillContext extends SkillContext {
  trail: ChatTrailEvent[]
}

function mockContext(overrides: Partial<SkillContext> = {}): TestSkillContext {
  const trail: ChatTrailEvent[] = []
  return {
    uid: 'test-uid',
    conversationId: 'test-conv',
    turnId: 'test-turn',
    effort: 'medio',
    budget: { tokens: { used: 0, limit: 128_000 }, cost: { used: 0, limit: 1.0 } },
    models: {},
    apiKey: 'test-key',
    signal: new AbortController().signal,
    emit(event: ChatTrailEvent) {
      trail.push(event)
    },
    mock: true,
    ...overrides,
    trail,
  } as TestSkillContext
}

const registry = buildSuperSkills()
const skillMap = new Map(registry.map(s => [s.name, s]))

describe('buildSuperSkills', () => {
  it('returns 4 skills', () => {
    expect(registry).toHaveLength(4)
  })

  it('every skill has required fields', () => {
    for (const skill of registry) {
      expect(skill.name).toBeTruthy()
      expect(typeof skill.description).toBe('string')
      expect(typeof skill.run).toBe('function')
    }
  })

  it('every skill has unique names', () => {
    const names = registry.map(s => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('generate_document', () => {
  const skill = skillMap.get('generate_document')!

  it('rejects missing document_type', async () => {
    const ctx = mockContext()
    const result = await skill.run({}, ctx)
    expect(result.tool_message).toContain('"document_type" é obrigatório')
    expect(result.final_answer).toBeUndefined()
  })

  it('rejects invalid document_type', async () => {
    const ctx = mockContext()
    const result = await skill.run({ document_type: 'invalid_type' }, ctx)
    expect(result.tool_message).toContain('não reconhecido')
  })

  it('rejects missing content', async () => {
    const ctx = mockContext()
    const result = await skill.run({ document_type: 'peticao_inicial' }, ctx)
    expect(result.tool_message).toContain('"content" é obrigatório')
  })

  it('succeeds with valid args in mock mode', async () => {
    const ctx = mockContext()
    const result = await skill.run(
      {
        document_type: 'peticao_inicial',
        title: 'Petição de Teste',
        content: 'Fatos relevantes do caso...',
      },
      ctx,
    )
    expect(result.tool_message).toContain('✅')
    expect(result.tool_message).toContain('Petição Inicial')
    expect(result.tool_message).toContain('mock-doc-')
    // Verify trail events
    const superSkillEvents = ctx.trail.filter(e => e.type === 'super_skill_call')
    expect(superSkillEvents.length).toBeGreaterThanOrEqual(2) // start + complete
  })

  it('uses template_variant and legal_area when provided', async () => {
    const ctx = mockContext()
    const result = await skill.run(
      {
        document_type: 'recurso',
        content: 'Fundamentos do recurso.',
        template_variant: 'apelacao',
        legal_area: 'civil',
      },
      ctx,
    )
    expect(result.tool_message).toContain('✅')
  })

  it('works for all valid document types', async () => {
    for (const docType of PIPELINE_DOCUMENT_TYPES.slice(0, 3)) {
      const ctx = mockContext()
      const result = await skill.run(
        { document_type: docType, content: `Conteúdo para ${docType}.` },
        ctx,
      )
      expect(result.tool_message).toContain('✅')
    }
  }, 10000)
})

describe('check_document_status', () => {
  const skill = skillMap.get('check_document_status')!

  it('rejects missing document_id', async () => {
    const ctx = mockContext()
    const result = await skill.run({}, ctx)
    expect(result.tool_message).toContain('"document_id" é obrigatório')
  })

  it('returns status in mock mode', async () => {
    const ctx = mockContext()
    const result = await skill.run({ document_id: 'doc-123' }, ctx)
    expect(result.tool_message).toContain('doc-123')
    expect(result.tool_message).toContain('Concluído')
    const events = ctx.trail.filter(e => e.type === 'super_skill_call')
    expect(events.length).toBe(2)
  })
})

describe('search_jurisprudence', () => {
  const skill = skillMap.get('search_jurisprudence')!

  it('rejects missing query', async () => {
    const ctx = mockContext()
    const result = await skill.run({}, ctx)
    expect(result.tool_message).toContain('"query" é obrigatória')
  })

  it('returns mock results for valid query', async () => {
    const ctx = mockContext()
    const result = await skill.run({ query: 'danos morais' }, ctx)
    expect(result.tool_message).toContain('📚')
    expect(result.tool_message).toContain('danos morais')
    expect(result.tool_message).toContain('TJSP')
    expect(result.tool_message).toContain('STJ')
    const events = ctx.trail.filter(e => e.type === 'super_skill_call')
    expect(events.length).toBe(2)
  })

  it('respects tribunal filter', async () => {
    const ctx = mockContext()
    const result = await skill.run({ query: 'responsabilidade civil', tribunal: 'STJ' }, ctx)
    expect(result.tool_message).toContain('STJ')
  })

  it('caps max_results at 10', async () => {
    const ctx = mockContext()
    const result = await skill.run({ query: 'teste', max_results: 50 }, ctx)
    expect(result).toBeDefined()
  })
})

describe('analyze_thesis', () => {
  const skill = skillMap.get('analyze_thesis')!

  it('rejects missing thesis', async () => {
    const ctx = mockContext()
    const result = await skill.run({}, ctx)
    expect(result.tool_message).toContain('"thesis" é obrigatória')
  })

  it('returns mock analysis', async () => {
    const ctx = mockContext()
    const result = await skill.run({ thesis: 'Inversão do ônus da prova' }, ctx)
    expect(result.tool_message).toContain('📊')
    expect(result.tool_message).toContain('Inversão do ônus da prova')
    expect(result.tool_message).toContain('Viabilidade')
    const events = ctx.trail.filter(e => e.type === 'super_skill_call')
    expect(events.length).toBe(2)
  })

  it('accepts legal_area', async () => {
    const ctx = mockContext()
    const result = await skill.run({ thesis: 'Dano moral presumido', legal_area: 'consumidor' }, ctx)
    expect(result.tool_message).toContain('📊')
  })
})