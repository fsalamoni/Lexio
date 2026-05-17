import type {
  ChatAgentWorkPackage,
  ChatArtifactFormat,
  ChatArtifactKind,
  ChatArtifactRef,
} from '../firestore-types'

const MAX_RESULT_MARKDOWN_CHARS = 12_000
const MAX_CONTENT_PREVIEW_CHARS = 4_000
const MAX_MANIFEST_STRING_CHARS = 20_000
const INLINE_MEDIA_URL_PATTERN = /^(data|blob):/i

const ARTIFACT_KIND_VALUES = new Set<ChatArtifactKind>([
  'text',
  'legal_document',
  'code',
  'presentation',
  'spreadsheet',
  'audio',
  'video',
  'image',
  'data',
  'other',
])

const ARTIFACT_FORMAT_VALUES = new Set<ChatArtifactFormat>([
  'markdown',
  'json',
  'docx',
  'pdf',
  'pptx',
  'xlsx',
  'csv',
  'txt',
  'html',
  'typescript',
  'javascript',
  'python',
  'zip',
  'mp3',
  'mp4',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'wav',
  'webm',
  'other',
])

export const CHAT_AGENT_PACKAGE_PROMPT = `
Ao final da sua resposta, quando houver qualquer entrega reutilizável, documento, código, tabela, apresentação, roteiro, mídia planejada ou manifesto técnico, inclua um bloco JSON fenced com este formato:
\`\`\`json
{
  "lexio_agent_package": {
    "thought": {
      "summary": "raciocínio operacional resumido, sem chain-of-thought bruto",
      "assumptions": ["premissas relevantes"],
      "decisions": ["decisões tomadas"],
      "risks": ["riscos ou lacunas"],
      "next_steps": ["como o próximo agente deve usar a entrega"]
    },
    "result_markdown": "resultado final deste agente em markdown",
    "artifacts": [
      {
        "logical_document_id": "id-estavel-do-documento",
        "title": "Título do documento",
        "kind": "text | legal_document | code | presentation | spreadsheet | audio | video | image | data | other",
        "format": "markdown | json | docx | pdf | pptx | xlsx | csv | txt | html | typescript | javascript | python | zip | mp3 | mp4 | png | webp | other",
        "version": 1,
        "summary": "descrição curta",
        "content_preview": "conteúdo textual curto ou resumo",
        "manifest_json": { "estrutura": "JSON pequeno e seguro para Firestore" },
        "exports": [{ "label": "DOCX", "format": "docx", "status": "planned" }]
      }
    ]
  }
}
\`\`\`
Se não houver documento/artefato, ainda inclua thought + result_markdown e use "artifacts": []. Não exponha raciocínio interno longo; entregue apenas notas operacionais auditáveis.`.trim()

interface ParseAgentOutputArgs {
  rawOutput: string
  agentKey: string
  task: string
  conversationId: string
  turnId: string
  timestamp?: string
}

export interface ParsedAgentOutput {
  displayMarkdown: string
  workPackage: ChatAgentWorkPackage
}

export function parseAgentOutputPackage(args: ParseAgentOutputArgs): ParsedAgentOutput {
  const timestamp = args.timestamp ?? new Date().toISOString()
  const parsed = extractPackagePayload(args.rawOutput)
  const resultMarkdown = sanitizeText(
    typeof parsed?.result_markdown === 'string' && parsed.result_markdown.trim()
      ? parsed.result_markdown
      : stripPackageBlock(args.rawOutput).trim() || args.rawOutput.trim(),
    MAX_RESULT_MARKDOWN_CHARS,
  )
  const thought = normalizeThought(parsed?.thought, args.agentKey)
  const artifacts = Array.isArray(parsed?.artifacts)
    ? parsed.artifacts.map((artifact, index) => normalizeArtifactRef(artifact, args, index)).filter(Boolean) as ChatArtifactRef[]
    : []

  return {
    displayMarkdown: resultMarkdown,
    workPackage: {
      conversation_id: args.conversationId,
      turn_id: args.turnId,
      agent_key: args.agentKey,
      task: args.task,
      thought,
      result_markdown: resultMarkdown,
      artifacts,
      created_at: timestamp,
      completed_at: timestamp,
    },
  }
}

function extractPackagePayload(rawOutput: string): Record<string, unknown> | null {
  const fencedBlocks = [...rawOutput.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  for (const block of fencedBlocks.reverse()) {
    const parsed = parsePackageJson(block[1])
    if (parsed) return parsed
  }

  const parsedWhole = parsePackageJson(rawOutput)
  if (parsedWhole) return parsedWhole

  const match = rawOutput.match(/\{[\s\S]*"lexio_agent_package"[\s\S]*\}/)
  if (!match) return null
  return parsePackageJson(match[0])
}

function parsePackageJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value.trim()) as Record<string, unknown>
    const payload = parsed.lexio_agent_package
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
  } catch {
    return null
  }
}

function stripPackageBlock(rawOutput: string): string {
  return rawOutput.replace(/```(?:json)?\s*[\s\S]*?"lexio_agent_package"[\s\S]*?```/gi, '').trim()
}

function normalizeThought(value: unknown, agentKey: string): NonNullable<ChatAgentWorkPackage['thought']> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const summary = asNonEmptyString(source.summary)
    || `O agente ${agentKey} produziu uma entrega textual sem pacote operacional estruturado.`

  return {
    summary: sanitizeText(summary, 600),
    assumptions: normalizeStringList(source.assumptions),
    decisions: normalizeStringList(source.decisions),
    risks: normalizeStringList(source.risks),
    next_steps: normalizeStringList(source.next_steps),
  }
}

function normalizeArtifactRef(value: unknown, args: ParseAgentOutputArgs, index: number): ChatArtifactRef | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const title = asNonEmptyString(source.title) || `Artefato de ${args.agentKey} ${index + 1}`
  const logicalDocumentId = normalizeId(asNonEmptyString(source.logical_document_id) || `${args.agentKey}-${slugify(title) || index + 1}`)
  const version = normalizeVersion(source.version)
  const kind = normalizeKind(source.kind)
  const format = normalizeFormat(source.format)
  const artifactId = normalizeId(asNonEmptyString(source.artifact_id) || `${logicalDocumentId}-v${version}`)
  const manifestJson = sanitizeManifestJson(source.manifest_json)
  const exports = Array.isArray(source.exports)
    ? source.exports.map(normalizeExportRef).filter(Boolean) as ChatArtifactRef['exports']
    : undefined

  return {
    artifact_id: artifactId,
    logical_document_id: logicalDocumentId,
    version,
    title: sanitizeText(title, 160),
    kind,
    format,
    summary: sanitizeOptionalText(source.summary, 500),
    manifest_json: manifestJson,
    content_preview: sanitizeOptionalText(source.content_preview, MAX_CONTENT_PREVIEW_CHARS),
    storage_path: sanitizePersistedUrl(source.storage_path),
    download_url: sanitizePersistedUrl(source.download_url),
    mime_type: sanitizeOptionalText(source.mime_type, 120),
    extension: sanitizeOptionalText(source.extension, 24),
    supersedes_artifact_id: sanitizeOptionalText(source.supersedes_artifact_id, 160),
    is_latest: source.is_latest === undefined ? true : Boolean(source.is_latest),
    ...(exports?.length ? { exports } : {}),
  }
}

function normalizeExportRef(value: unknown): NonNullable<ChatArtifactRef['exports']>[number] | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const label = asNonEmptyString(source.label) || String(source.format ?? 'Export')
  const rawStatus = String(source.status ?? 'planned')
  const status = rawStatus === 'ready' || rawStatus === 'failed' || rawStatus === 'unavailable' ? rawStatus : 'planned'
  return {
    export_id: sanitizeOptionalText(source.export_id, 160),
    label: sanitizeText(label, 80),
    format: normalizeFormat(source.format),
    status,
    mime_type: sanitizeOptionalText(source.mime_type, 120),
    extension: sanitizeOptionalText(source.extension, 24),
    download_url: sanitizePersistedUrl(source.download_url),
    storage_path: sanitizePersistedUrl(source.storage_path),
    reason: sanitizeOptionalText(source.reason, 300),
  }
}

function normalizeKind(value: unknown): ChatArtifactKind {
  const normalized = String(value ?? '').trim().toLowerCase() as ChatArtifactKind
  return ARTIFACT_KIND_VALUES.has(normalized) ? normalized : 'other'
}

function normalizeFormat(value: unknown): ChatArtifactFormat {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^\./, '') as ChatArtifactFormat
  return ARTIFACT_FORMAT_VALUES.has(normalized) ? normalized : 'other'
}

function normalizeVersion(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 1
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map(item => sanitizeText(String(item ?? '').trim(), 220))
    .filter(Boolean)
    .slice(0, 8)
  return items.length ? items : undefined
}

function sanitizeManifestJson(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const sanitized = sanitizeJsonValue(value, 0)
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return undefined
  return sanitized as Record<string, unknown>
}

function sanitizeJsonValue(value: unknown, depth: number): unknown {
  if (depth > 6) return '[profundidade resumida]'
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (INLINE_MEDIA_URL_PATTERN.test(value.trim())) return '[media inline removida]'
    return sanitizeText(value, MAX_MANIFEST_STRING_CHARS)
  }
  if (Array.isArray(value)) return value.slice(0, 80).map(item => sanitizeJsonValue(item, depth + 1))
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 80)
    return Object.fromEntries(entries.map(([key, item]) => [sanitizeText(key, 120), sanitizeJsonValue(item, depth + 1)]))
  }
  return undefined
}

function sanitizePersistedUrl(value: unknown): string | undefined {
  const text = asNonEmptyString(value)
  if (!text) return undefined
  if (INLINE_MEDIA_URL_PATTERN.test(text.trim())) return undefined
  if (text.length > 32_768) return undefined
  return text
}

function sanitizeOptionalText(value: unknown, maxChars: number): string | undefined {
  const text = asNonEmptyString(value)
  return text ? sanitizeText(text, maxChars) : undefined
}

function sanitizeText(value: string, maxChars: number): string {
  const normalized = value.replace(/\u0000/g, '').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 1)}…`
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeId(value: string): string {
  return slugify(value).slice(0, 96) || `artifact-${Date.now()}`
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
