import type { OrchestratorDecision, Skill } from './types'

/**
 * Build the markdown the orchestrator system prompt uses to describe its
 * available tools. Listing skills inline is cheaper and more portable
 * across models than the OpenAI tool-calling protocol — every model that
 * follows instructions can comply with the JSON contract, while many cheap
 * models (especially open-weight ones) reject native tool-calling payloads.
 */
export function renderSkillsManifest(skills: Skill[]): string {
  return skills
    .map((skill, index) => {
      const args = skill.argsHint
        ? Object.entries(skill.argsHint)
          .map(([k, v]) => `    - "${k}": ${v}`)
          .join('\n')
        : '    (sem argumentos)'
      return `${index + 1}. **${skill.name}** — ${skill.description}\n  Args:\n${args}`
    })
    .join('\n\n')
}

/**
 * Parse the orchestrator's raw response into a structured decision. The
 * orchestrator is instructed to emit ONLY JSON of the form
 * `{"tool": "...", "args": {...}, "rationale": "..."}` (rationale optional).
 *
 * In practice some models still wrap the JSON in markdown fences or add a
 * short prose preamble; we tolerate both. If parsing still fails we throw —
 * the orchestrator catches and either retries with a stricter prompt or
 * falls back to a forced finalisation.
 */
export function parseOrchestratorDecision(raw: string, allowedTools: string[]): OrchestratorDecision {
  const stripped = stripFences(raw).trim()
  const candidate = pickJsonObject(stripped)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch (err) {
    throw new OrchestratorDecisionParseError(
      `Resposta do orquestrador não é JSON válido: ${(err as Error).message}`,
      raw,
    )
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new OrchestratorDecisionParseError('Resposta do orquestrador não é objeto JSON.', raw)
  }
  const obj = parsed as Record<string, unknown>
  const tool = typeof obj.tool === 'string' ? obj.tool.trim() : ''
  if (!tool) {
    throw new OrchestratorDecisionParseError('Campo "tool" ausente ou vazio.', raw)
  }
  if (!allowedTools.includes(tool)) {
    throw new OrchestratorDecisionParseError(
      `Tool "${tool}" não está na lista permitida (${allowedTools.join(', ')}).`,
      raw,
    )
  }
  const args = obj.args && typeof obj.args === 'object' && !Array.isArray(obj.args)
    ? (obj.args as Record<string, unknown>)
    : {}
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : undefined
  return { tool, args, rationale }
}

function stripFences(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
}

function pickJsonObject(value: string): string {
  if (!value) return value
  if (value.startsWith('{')) return value
  // Attempt to find the outermost {...} block.
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return value.slice(start, end + 1)
  }
  return value
}

export class OrchestratorDecisionParseError extends Error {
  raw: string
  constructor(message: string, raw: string) {
    super(message)
    this.name = 'OrchestratorDecisionParseError'
    this.raw = raw
  }
}
