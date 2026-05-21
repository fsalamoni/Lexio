import { describe, expect, it } from 'vitest'

import { parseAgentOutputPackage, stripAgentPackageArtifacts } from './agent-output'

const baseArgs = {
  agentKey: 'chat_writer',
  task: 'Criar minuta',
  conversationId: 'conv-1',
  turnId: 'turn-1',
  timestamp: '2026-05-16T10:00:00.000Z',
}

describe('parseAgentOutputPackage', () => {
  it('creates a safe fallback package from plain markdown', () => {
    const parsed = parseAgentOutputPackage({
      ...baseArgs,
      rawOutput: '## Resultado\nTexto simples do agente.',
    })

    expect(parsed.displayMarkdown).toContain('Texto simples')
    expect(parsed.workPackage.agent_key).toBe('chat_writer')
    expect(parsed.workPackage.result_markdown).toContain('Resultado')
    expect(parsed.workPackage.artifacts).toEqual([])
    expect(parsed.workPackage.thought?.summary).toMatch(/sem pacote operacional estruturado/i)
  })

  it('extracts structured package JSON and normalizes artifacts', () => {
    const parsed = parseAgentOutputPackage({
      ...baseArgs,
      rawOutput: `Resposta visível fora do pacote.

\`\`\`json
{
  "lexio_agent_package": {
    "thought": {
      "summary": "Organizei a minuta em uma estrutura baixável.",
      "assumptions": ["Sem número de processo informado"],
      "decisions": ["Usar markdown como fonte canônica"],
      "risks": ["Citações dependem de validação"],
      "next_steps": ["Exportar para DOCX"]
    },
    "result_markdown": "## Minuta\\nConteúdo final.",
    "artifacts": [
      {
        "logical_document_id": "Minuta Principal",
        "title": "Minuta Principal",
        "kind": "legal_document",
        "format": "markdown",
        "version": 2,
        "summary": "Minuta pronta para revisão.",
        "content_preview": "Prévia textual",
        "download_url": "data:text/plain;base64,AAAA",
        "manifest_json": {
          "sections": ["Fatos", "Direito"],
          "unsafeUrl": "blob:http://localhost/abc"
        },
        "exports": [
          { "label": "DOCX", "format": "docx", "status": "planned" }
        ]
      }
    ]
  }
}
\`\`\``
    })

    expect(parsed.displayMarkdown).toBe('## Minuta\nConteúdo final.')
    expect(parsed.workPackage.thought?.decisions).toContain('Usar markdown como fonte canônica')
    expect(parsed.workPackage.artifacts).toHaveLength(1)
    const artifact = parsed.workPackage.artifacts?.[0]
    expect(artifact?.logical_document_id).toBe('minuta-principal')
    expect(artifact?.artifact_id).toBe('minuta-principal-v2')
    expect(artifact?.download_url).toBeUndefined()
    expect(artifact?.exports?.[0]).toMatchObject({ label: 'DOCX', format: 'docx', status: 'planned' })
  })
})

describe('stripAgentPackageArtifacts', () => {
  it('removes a fenced lexio_agent_package block but keeps the prose', () => {
    const markdown = [
      '# Resposta final',
      '',
      '```json',
      JSON.stringify({ lexio_agent_package: { result_markdown: 'x' } }),
      '```',
    ].join('\n')
    const out = stripAgentPackageArtifacts(markdown)
    expect(out).toContain('# Resposta final')
    expect(out).not.toContain('lexio_agent_package')
  })

  it('removes a bare un-fenced lexio_agent_package object', () => {
    const markdown = `Texto final.\n\n${JSON.stringify({ lexio_agent_package: { result_markdown: 'x' } })}`
    expect(stripAgentPackageArtifacts(markdown)).toBe('Texto final.')
  })

  it('keeps a fenced json block that is not an agent package', () => {
    const markdown = ['Exemplo de config:', '```json', '{"porta": 3000}', '```'].join('\n')
    expect(stripAgentPackageArtifacts(markdown)).toContain('"porta"')
  })

  it('returns ordinary markdown untouched', () => {
    expect(stripAgentPackageArtifacts('## Título\nParágrafo simples.')).toBe('## Título\nParágrafo simples.')
  })
})
