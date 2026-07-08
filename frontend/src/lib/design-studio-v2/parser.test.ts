import { describe, expect, it } from 'vitest'
import { extractFileOps, parseOrchestratorResponse } from './parser'

describe('extractFileOps', () => {
  it('extracts write blocks with raw content (including braces and newlines)', () => {
    const raw = [
      '@@@LEXIO_WRITE src/app.js@@@',
      'function main() {',
      '  const x = { a: 1, b: "}" }',
      '  return x',
      '}',
      '@@@LEXIO_END@@@',
    ].join('\n')
    const ops = extractFileOps(raw)
    expect(ops).toHaveLength(1)
    expect(ops[0].op).toBe('write')
    expect(ops[0].path).toBe('src/app.js')
    expect(ops[0].content).toContain('const x = { a: 1, b: "}" }')
  })

  it('extracts delete blocks', () => {
    const ops = extractFileOps('@@@LEXIO_DELETE old/file.ts@@@')
    expect(ops).toEqual([{ path: 'old/file.ts', op: 'delete' }])
  })
})

describe('parseOrchestratorResponse', () => {
  it('parses a JSON envelope plus file blocks into a build intent', () => {
    const raw = [
      '```json',
      '{ "intent": "build", "message": "Criei a landing.", "thinking": "vou montar um HTML simples" }',
      '```',
      '',
      '@@@LEXIO_WRITE index.html@@@',
      '<h1>Olá</h1>',
      '@@@LEXIO_END@@@',
    ].join('\n')
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.intent).toBe('build')
    expect(parsed.message).toBe('Criei a landing.')
    expect(parsed.thinking).toContain('HTML simples')
    expect(parsed.files).toHaveLength(1)
    expect(parsed.files?.[0].path).toBe('index.html')
  })

  it('parses an ask intent with questions and no files', () => {
    const raw = '{ "intent": "ask", "message": "Preciso saber mais", "questions": ["Qual stack?", "Tem back-end?"] }'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.intent).toBe('ask')
    expect(parsed.questions).toEqual(['Qual stack?', 'Tem back-end?'])
    expect(parsed.files).toBeUndefined()
  })

  it('parses a plan intent with steps', () => {
    const raw = '{ "intent": "plan", "message": "Aqui vai o plano", "plan": { "summary": "Construir site", "steps": [{ "title": "Estrutura", "files": ["index.html"] }] } }'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.intent).toBe('plan')
    expect(parsed.plan?.summary).toBe('Construir site')
    expect(parsed.plan?.steps[0].title).toBe('Estrutura')
    expect(parsed.plan?.steps[0].files).toEqual(['index.html'])
  })

  it('reconciles intent to build when file blocks are present despite a chat envelope', () => {
    const raw = '{ "intent": "chat", "message": "feito" }\n@@@LEXIO_WRITE a.txt@@@\nhi\n@@@LEXIO_END@@@'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.intent).toBe('build')
    expect(parsed.files).toHaveLength(1)
  })

  it('falls back to a chat message when there is no envelope and no files', () => {
    const parsed = parseOrchestratorResponse('Olá! Como posso ajudar no seu projeto?')
    expect(parsed.intent).toBe('chat')
    expect(parsed.message).toContain('Como posso ajudar')
    expect(parsed.files).toBeUndefined()
  })

  it('recovers a build result when the envelope is missing but files exist', () => {
    const raw = '@@@LEXIO_WRITE index.html@@@\n<h1>x</h1>\n@@@LEXIO_END@@@'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.intent).toBe('build')
    expect(parsed.files).toHaveLength(1)
  })

  it('parses delegate and asset requests', () => {
    const raw = '{ "intent": "build", "message": "ok", "delegate": [{ "agent": "ds2_frontend_engineer", "task": "refinar UI", "files": ["index.html"] }], "assets": [{ "path": "hero.png", "prompt": "um herói" }], "review": true }'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.delegate?.[0].agent).toBe('ds2_frontend_engineer')
    expect(parsed.assets?.[0].path).toBe('hero.png')
    expect(parsed.review).toBe(true)
  })

  it('ignores an invalid delegate agent', () => {
    const raw = '{ "intent": "build", "message": "ok", "delegate": [{ "agent": "hacker", "task": "x" }] }'
    const parsed = parseOrchestratorResponse(raw)
    expect(parsed.delegate).toBeUndefined()
  })
})
