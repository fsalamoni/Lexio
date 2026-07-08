/**
 * Design Studio v2 — orchestrator response parser.
 *
 * The orchestrator returns a hybrid wire format: a small JSON envelope with the
 * turn metadata, followed by raw file blocks delimited by sentinels. File
 * contents are NEVER placed inside JSON strings — code routinely contains
 * newlines and quotes that make JSON invalid, so keeping bytes out of JSON is
 * what makes parsing reliable.
 *
 * Wire format:
 *
 *   ```json
 *   { "intent": "build", "message": "...", "thinking": "...", ... }
 *   ```
 *
 *   @@@LEXIO_WRITE path/to/file@@@
 *   ...raw file content (any characters)...
 *   @@@LEXIO_END@@@
 *
 *   @@@LEXIO_DELETE path/to/old@@@
 *
 * The parser is defensive: it recovers a usable result even when the envelope
 * is missing or malformed, so a formatting slip never dead-ends a turn.
 */

import type {
  DesignStudioAssetRequest,
  DesignStudioDelegation,
  DesignStudioFileOp,
  DesignStudioOrchestratorResponse,
} from './types'

const WRITE_BLOCK_RE = /@@@LEXIO_WRITE[ \t]+([^@\n]+?)[ \t]*@@@[ \t]*\r?\n([\s\S]*?)\r?\n?@@@LEXIO_END@@@/g
const DELETE_BLOCK_RE = /@@@LEXIO_DELETE[ \t]+([^@\n]+?)[ \t]*@@@/g

const VALID_INTENTS = new Set(['build', 'plan', 'ask', 'chat'])
const VALID_DELEGATE_AGENTS = new Set(['ds2_frontend_engineer', 'ds2_backend_engineer', 'ds2_designer'])

function stripFileBlocks(text: string): string {
  return text.replace(WRITE_BLOCK_RE, '').replace(DELETE_BLOCK_RE, '')
}

/** Extract raw file operations from the sentinel blocks. */
export function extractFileOps(text: string): DesignStudioFileOp[] {
  const ops: DesignStudioFileOp[] = []
  const seen = new Set<string>()

  for (const match of text.matchAll(WRITE_BLOCK_RE)) {
    const path = match[1].trim()
    if (!path) continue
    ops.push({ path, op: 'write', content: match[2] ?? '' })
    seen.add(path)
  }
  for (const match of text.matchAll(DELETE_BLOCK_RE)) {
    const path = match[1].trim()
    if (!path || seen.has(path)) continue
    ops.push({ path, op: 'delete' })
  }
  return ops
}

/** Find the JSON envelope: a ```json fence, then a bare balanced object. */
function extractEnvelopeJson(text: string): Record<string, unknown> | null {
  const withoutFiles = stripFileBlocks(text)

  const fence = withoutFiles.match(/```(?:json)?\s*\r?\n([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fence) candidates.push(fence[1])

  const firstBrace = withoutFiles.indexOf('{')
  if (firstBrace >= 0) {
    // Balanced-brace scan so trailing prose does not break the parse.
    let depth = 0
    let inString = false
    let escape = false
    for (let i = firstBrace; i < withoutFiles.length; i++) {
      const ch = withoutFiles[i]
      if (escape) { escape = false; continue }
      if (ch === '\\') { escape = true; continue }
      if (ch === '"') inString = !inString
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) { candidates.push(withoutFiles.slice(firstBrace, i + 1)); break }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asStringArray(value: unknown, cap: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.map((v) => String(v ?? '').trim()).filter(Boolean).slice(0, cap)
  return out.length ? out : undefined
}

function parsePlan(value: unknown): DesignStudioOrchestratorResponse['plan'] {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : []
  const steps = stepsRaw.slice(0, 30).map((step) => {
    const s = (step ?? {}) as Record<string, unknown>
    return {
      title: asString(s.title) || 'Passo',
      detail: asString(s.detail),
      files: asStringArray(s.files, 30),
      commands: asStringArray(s.commands, 30),
    }
  })
  return {
    summary: asString(raw.summary) || 'Plano proposto pelo estúdio.',
    steps,
  }
}

function parseAssets(value: unknown): DesignStudioAssetRequest[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: DesignStudioAssetRequest[] = []
  for (const entry of value.slice(0, 6)) {
    const e = (entry ?? {}) as Record<string, unknown>
    const path = asString(e.path)
    const prompt = asString(e.prompt)
    if (!path || !prompt) continue
    const asset: DesignStudioAssetRequest = { path, prompt }
    const aspectRatio = asString(e.aspectRatio)
    if (aspectRatio) asset.aspectRatio = aspectRatio
    out.push(asset)
  }
  return out.length ? out : undefined
}

function parseDelegations(value: unknown): DesignStudioDelegation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: DesignStudioDelegation[] = []
  for (const entry of value.slice(0, 6)) {
    const e = (entry ?? {}) as Record<string, unknown>
    const agent = asString(e.agent)
    const task = asString(e.task)
    if (!agent || !task || !VALID_DELEGATE_AGENTS.has(agent)) continue
    const delegation: DesignStudioDelegation = { agent: agent as DesignStudioDelegation['agent'], task }
    const files = asStringArray(e.files, 30)
    if (files) delegation.files = files
    out.push(delegation)
  }
  return out.length ? out : undefined
}

/**
 * Parse a raw orchestrator completion into a structured response. Always
 * returns a usable object; when the model produced no envelope, it infers a
 * sensible intent from whether any file blocks were present.
 */
export function parseOrchestratorResponse(raw: string): DesignStudioOrchestratorResponse {
  const text = String(raw ?? '')
  const files = extractFileOps(text)
  const envelope = extractEnvelopeJson(text)

  if (!envelope) {
    const fallbackMessage = stripFileBlocks(text)
      .replace(/```(?:json)?[\s\S]*?```/gi, '')
      .trim()
    return {
      intent: files.length ? 'build' : 'chat',
      message: fallbackMessage || (files.length ? 'Atualizei os arquivos do projeto.' : 'Pronto.'),
      files: files.length ? files : undefined,
    }
  }

  const rawIntent = asString(envelope.intent)
  let intent: DesignStudioOrchestratorResponse['intent'] =
    rawIntent && VALID_INTENTS.has(rawIntent) ? (rawIntent as DesignStudioOrchestratorResponse['intent']) : 'chat'

  const questions = asStringArray(envelope.questions, 8)
  const plan = parsePlan(envelope.plan)

  // Reconcile intent with the actual payload so downstream code is consistent.
  if (files.length && intent !== 'build') intent = 'build'
  else if (!files.length) {
    if (questions && intent !== 'ask' && !plan) intent = 'ask'
    else if (plan && intent !== 'plan' && !questions) intent = 'plan'
  }

  return {
    intent,
    thinking: asString(envelope.thinking),
    message: asString(envelope.message) || (files.length ? 'Atualizei o projeto.' : 'Pronto.'),
    questions: intent === 'ask' ? questions : questions,
    plan: intent === 'plan' ? plan : plan,
    files: files.length ? files : undefined,
    previewEntry: asString(envelope.previewEntry),
    commands: asStringArray(envelope.commands, 20),
    assets: parseAssets(envelope.assets),
    delegate: parseDelegations(envelope.delegate),
    review: envelope.review === true,
    sessionTitle: asString(envelope.sessionTitle),
  }
}
