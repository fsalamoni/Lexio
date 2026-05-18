import { humanizeError } from '../error-humanizer'

const MAX_TECHNICAL_DETAIL_CHARS = 320

export function buildOperationalFailureMarkdown(scope: string, error: unknown): string {
  const humanized = humanizeError(error)
  const technicalDetail = extractTechnicalDetail(error)

  const lines = [
    '## Falha operacional',
    scope,
    '',
    `- Motivo: ${humanized.title}`,
  ]

  if (humanized.detail) {
    lines.push(`- Ação sugerida: ${humanized.detail}`)
  }

  if (technicalDetail && technicalDetail !== humanized.title && technicalDetail !== humanized.detail) {
    lines.push(`- Detalhe técnico: ${technicalDetail}`)
  }

  return lines.join('\n')
}

export function isOperationalFailureMarkdown(markdown: string): boolean {
  return markdown.trimStart().startsWith('## Falha operacional')
}

function extractTechnicalDetail(error: unknown): string | undefined {
  const raw = error instanceof Error ? error.message : String(error ?? '').trim()
  if (!raw) return undefined
  if (raw.length <= MAX_TECHNICAL_DETAIL_CHARS) return raw
  return `${raw.slice(0, MAX_TECHNICAL_DETAIL_CHARS - 1)}…`
}