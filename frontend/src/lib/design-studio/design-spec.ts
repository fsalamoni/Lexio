/**
 * Design Studio — the serializable design specification.
 *
 * A {@link DesignSpec} is the single source of truth for a design: the brief it
 * came from, the artifact kind, the chosen theme and the (optionally
 * hand-edited) title and sections. Because it is plain JSON it can be:
 *   - hand-edited in the studio (manual editing path),
 *   - saved as a reusable template,
 *   - exported to / imported from a `.lexio-design.json` file (interop), and
 *   - rendered to HTML / Markdown deterministically and offline.
 *
 * This keeps the "create by text", "edit manually" and "import/export template"
 * requirements on one well-typed contract with zero network cost.
 */

import {
  DESIGN_ARTIFACT_KINDS,
  deriveTitle,
  derivePoints,
  isDesignArtifactKind,
  renderArtifact,
  type DesignArtifactKind,
} from './templates'
import {
  DEFAULT_DESIGN_THEME_ID,
  isDesignThemeId,
  resolvePalette,
  type DesignThemeId,
} from './themes'

/** Current schema version of an exported design/template file. */
export const DESIGN_SPEC_VERSION = 1

/** File extension marker used for exported design templates. */
export const DESIGN_TEMPLATE_EXTENSION = 'lexio-design.json'

export interface DesignSpec {
  /** Free-text brief the design started from (kept for regeneration). */
  brief: string
  kind: DesignArtifactKind
  theme: DesignThemeId
  /** Display title — derived from the brief but editable by hand. */
  title: string
  /** Ordered sections / bullet points — derived but editable by hand. */
  points: string[]
}

/** A named, reusable design template (a spec plus identity + timestamp). */
export interface DesignTemplate {
  id: string
  name: string
  spec: DesignSpec
  /** ISO timestamp of when the template was created / last saved. */
  updatedAt: string
  /** True for the read-only starter templates that ship with the studio. */
  builtIn?: boolean
}

/** The envelope written to / read from an exported template file. */
export interface DesignTemplateFile {
  format: 'lexio-design'
  version: number
  name: string
  spec: DesignSpec
}

/** Builds a fresh spec from a free-text brief. */
export function specFromBrief(
  brief: string,
  kind: DesignArtifactKind,
  theme: DesignThemeId = DEFAULT_DESIGN_THEME_ID,
): DesignSpec {
  return {
    brief,
    kind,
    theme,
    title: deriveTitle(brief),
    points: derivePoints(brief),
  }
}

/** Renders a spec to a self-contained HTML document. */
export function renderSpec(spec: DesignSpec): string {
  return renderArtifact(spec.kind, spec.title, spec.points, resolvePalette(spec.theme))
}

/**
 * Renders a spec to a portable Markdown document. Useful for documents, specs
 * and for handing content to other tools (docs, wikis, issue trackers).
 */
export function renderSpecMarkdown(spec: DesignSpec): string {
  const lines: string[] = [`# ${spec.title.trim() || 'Projeto de design'}`, '']
  if (spec.brief.trim()) {
    lines.push(`> ${spec.brief.replace(/\s+/g, ' ').trim()}`, '')
  }
  for (const point of spec.points) {
    const clean = point.trim()
    if (clean) lines.push(`- ${clean}`)
  }
  if (spec.points.length === 0) {
    lines.push('- (sem seções)')
  }
  lines.push('', `_Design Studio · ${spec.kind}_`)
  return `${lines.join('\n')}\n`
}

/** Normalises an arbitrary value into a valid {@link DesignSpec}. */
export function coerceSpec(value: unknown): DesignSpec | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const kind = isDesignArtifactKind(record.kind)
    ? (record.kind as DesignArtifactKind)
    : DESIGN_ARTIFACT_KINDS[1].kind
  const theme = isDesignThemeId(record.theme)
    ? (record.theme as DesignThemeId)
    : DEFAULT_DESIGN_THEME_ID
  const brief = typeof record.brief === 'string' ? record.brief : ''
  const rawPoints = Array.isArray(record.points) ? record.points : []
  const points = rawPoints
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 24)
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim().slice(0, 160)
      : deriveTitle(brief)
  return { brief, kind, theme, title, points }
}

/** Serializes a template to the exportable JSON envelope string. */
export function serializeTemplate(name: string, spec: DesignSpec): string {
  const file: DesignTemplateFile = {
    format: 'lexio-design',
    version: DESIGN_SPEC_VERSION,
    name: name.trim() || spec.title || 'Template',
    spec,
  }
  return JSON.stringify(file, null, 2)
}

/**
 * Parses an exported template file. Accepts both the full envelope and a bare
 * spec object, and always returns a sanitised result (or `null` when the input
 * is not usable JSON at all).
 */
export function parseTemplateFile(raw: string): { name: string; spec: DesignSpec } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Record<string, unknown>
  // Envelope form: { format, version, name, spec }
  if (record.spec && typeof record.spec === 'object') {
    const spec = coerceSpec(record.spec)
    if (!spec) return null
    const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : spec.title
    return { name: name.slice(0, 120), spec }
  }
  // Bare spec form.
  const spec = coerceSpec(record)
  if (!spec) return null
  return { name: spec.title.slice(0, 120), spec }
}

/** Read-only starter templates shipped with the studio. */
export const STARTER_DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: 'starter-saas-landing',
    name: 'Landing SaaS',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    spec: {
      brief: 'Landing page para um SaaS jurídico com automação de petições',
      kind: 'site',
      theme: 'studio',
      title: 'Automação de petições para escritórios',
      points: [
        'Gere petições em minutos',
        'Modelos revisados por especialistas',
        'Integração com seu repositório de documentos',
        'Segurança e sigilo de ponta a ponta',
      ],
    },
  },
  {
    id: 'starter-pitch-deck',
    name: 'Pitch deck',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    spec: {
      brief: 'Deck de investimento para uma legaltech',
      kind: 'slides',
      theme: 'corporate',
      title: 'Legaltech · Rodada seed',
      points: ['O problema', 'A solução', 'Mercado e tração', 'Modelo de negócio', 'O time'],
    },
  },
  {
    id: 'starter-mobile-app',
    name: 'App mobile',
    builtIn: true,
    updatedAt: '1970-01-01T00:00:00.000Z',
    spec: {
      brief: 'Protótipo de app mobile para consulta de processos',
      kind: 'app',
      theme: 'vibrant',
      title: 'Meus processos',
      points: ['Andamentos em tempo real', 'Notificações de prazos', 'Documentos anexados', 'Chat com o advogado'],
    },
  },
]
