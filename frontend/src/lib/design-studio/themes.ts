/**
 * Design Studio — theme presets (design patterns).
 *
 * A theme is a small, self-contained palette that the deterministic renderers
 * in `templates.ts` thread through every generated artifact. Keeping themes as
 * plain data (no CSS strings, no HTML) means they are safe to serialize inside a
 * template, round-trip through import/export and preview offline with zero cost.
 */

export interface DesignPalette {
  /** Primary foreground / heading colour. */
  ink: string
  /** Secondary, muted foreground colour. */
  soft: string
  /** Accent / brand colour used for calls to action and highlights. */
  accent: string
  /** Tinted accent used for hero backgrounds and chips. */
  accentSoft: string
  /** Page background colour. */
  canvas: string
  /** Hairline / border colour. */
  line: string
}

export interface DesignThemeMeta {
  id: DesignThemeId
  label: string
  description: string
  palette: DesignPalette
}

export type DesignThemeId =
  | 'studio'
  | 'corporate'
  | 'vibrant'
  | 'midnight'
  | 'minimal'
  | 'sunset'

/** Ordered catalog of built-in themes. `studio` is the default. */
export const DESIGN_THEMES: DesignThemeMeta[] = [
  {
    id: 'studio',
    label: 'Studio',
    description: 'Teal sóbrio, alto contraste — o padrão do Design Studio.',
    palette: {
      ink: '#0f172a',
      soft: '#475569',
      accent: '#0f766e',
      accentSoft: '#ccfbf1',
      canvas: '#f8fafc',
      line: '#e2e8f0',
    },
  },
  {
    id: 'corporate',
    label: 'Corporate',
    description: 'Azul institucional, confiável e formal.',
    palette: {
      ink: '#111827',
      soft: '#4b5563',
      accent: '#1d4ed8',
      accentSoft: '#dbeafe',
      canvas: '#f9fafb',
      line: '#e5e7eb',
    },
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    description: 'Índigo e rosa vibrantes para produtos e lançamentos.',
    palette: {
      ink: '#1e1b4b',
      soft: '#6d28d9',
      accent: '#7c3aed',
      accentSoft: '#ede9fe',
      canvas: '#faf5ff',
      line: '#e9d5ff',
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Tema escuro elegante com acento ciano.',
    palette: {
      ink: '#e2e8f0',
      soft: '#94a3b8',
      accent: '#22d3ee',
      accentSoft: '#0e7490',
      canvas: '#0b1220',
      line: '#1e293b',
    },
  },
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'Monocromático, tipográfico e discreto.',
    palette: {
      ink: '#18181b',
      soft: '#52525b',
      accent: '#18181b',
      accentSoft: '#f4f4f5',
      canvas: '#ffffff',
      line: '#e4e4e7',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Laranja e âmbar acolhedores para marcas calorosas.',
    palette: {
      ink: '#431407',
      soft: '#9a3412',
      accent: '#ea580c',
      accentSoft: '#ffedd5',
      canvas: '#fff7ed',
      line: '#fed7aa',
    },
  },
]

export const DEFAULT_DESIGN_THEME_ID: DesignThemeId = 'studio'

export function isDesignThemeId(value: unknown): value is DesignThemeId {
  return typeof value === 'string' && DESIGN_THEMES.some((theme) => theme.id === value)
}

/** Resolves a theme id to its palette, falling back to the default theme. */
export function resolvePalette(themeId: DesignThemeId | undefined): DesignPalette {
  const match = DESIGN_THEMES.find((theme) => theme.id === themeId)
  return (match ?? DESIGN_THEMES[0]).palette
}

export function describeDesignTheme(themeId: DesignThemeId): string {
  return DESIGN_THEMES.find((theme) => theme.id === themeId)?.label ?? themeId
}
