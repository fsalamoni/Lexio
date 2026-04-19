/**
 * Platform skin/theme definitions.
 *
 * Each skin overrides the --v2-* CSS custom properties that control the
 * visual appearance of the V2 workspace shell and all promoted surfaces.
 */

export interface PlatformSkin {
  id: string
  label: string
  description: string
  /** CSS custom property overrides applied to :root */
  tokens: Record<string, string>
  /** Preview swatch colours shown in the selector (3-4 hex colours) */
  swatches: string[]
}

export const PLATFORM_SKINS: PlatformSkin[] = [
  {
    id: 'parchment',
    label: 'Pergaminho',
    description: 'Tom quente e classico com acentos em verde-azulado.',
    tokens: {
      '--v2-canvas': '#f5f1e8',
      '--v2-panel': 'rgba(255, 252, 247, 0.78)',
      '--v2-panel-strong': 'rgba(255, 255, 255, 0.92)',
      '--v2-line-soft': 'rgba(15, 23, 42, 0.08)',
      '--v2-line-strong': 'rgba(15, 23, 42, 0.12)',
      '--v2-ink-strong': '#172033',
      '--v2-ink-soft': '#5f6878',
      '--v2-ink-faint': '#7d8797',
      '--v2-accent-strong': '#0f766e',
      '--v2-accent-warm': '#d97706',
    },
    swatches: ['#f5f1e8', '#0f766e', '#172033', '#d97706'],
  },
  {
    id: 'slate',
    label: 'Ardosia',
    description: 'Tons frios e neutros com acento em indigo.',
    tokens: {
      '--v2-canvas': '#f1f5f9',
      '--v2-panel': 'rgba(248, 250, 252, 0.82)',
      '--v2-panel-strong': 'rgba(255, 255, 255, 0.94)',
      '--v2-line-soft': 'rgba(15, 23, 42, 0.06)',
      '--v2-line-strong': 'rgba(15, 23, 42, 0.10)',
      '--v2-ink-strong': '#0f172a',
      '--v2-ink-soft': '#475569',
      '--v2-ink-faint': '#94a3b8',
      '--v2-accent-strong': '#4f46e5',
      '--v2-accent-warm': '#f59e0b',
    },
    swatches: ['#f1f5f9', '#4f46e5', '#0f172a', '#f59e0b'],
  },
  {
    id: 'ocean',
    label: 'Oceano',
    description: 'Azul profundo com acento em ciano.',
    tokens: {
      '--v2-canvas': '#eff6ff',
      '--v2-panel': 'rgba(239, 246, 255, 0.80)',
      '--v2-panel-strong': 'rgba(255, 255, 255, 0.92)',
      '--v2-line-soft': 'rgba(30, 58, 138, 0.06)',
      '--v2-line-strong': 'rgba(30, 58, 138, 0.12)',
      '--v2-ink-strong': '#1e3a5f',
      '--v2-ink-soft': '#3b6b9a',
      '--v2-ink-faint': '#7ba5c9',
      '--v2-accent-strong': '#0284c7',
      '--v2-accent-warm': '#f97316',
    },
    swatches: ['#eff6ff', '#0284c7', '#1e3a5f', '#f97316'],
  },
  {
    id: 'forest',
    label: 'Floresta',
    description: 'Verde natural com tons terrosos.',
    tokens: {
      '--v2-canvas': '#f0fdf4',
      '--v2-panel': 'rgba(240, 253, 244, 0.80)',
      '--v2-panel-strong': 'rgba(255, 255, 255, 0.92)',
      '--v2-line-soft': 'rgba(20, 83, 45, 0.06)',
      '--v2-line-strong': 'rgba(20, 83, 45, 0.12)',
      '--v2-ink-strong': '#14532d',
      '--v2-ink-soft': '#3f6b52',
      '--v2-ink-faint': '#6b9b7e',
      '--v2-accent-strong': '#16a34a',
      '--v2-accent-warm': '#ca8a04',
    },
    swatches: ['#f0fdf4', '#16a34a', '#14532d', '#ca8a04'],
  },
  {
    id: 'rose',
    label: 'Rose',
    description: 'Rosa suave com acento em magenta.',
    tokens: {
      '--v2-canvas': '#fff1f2',
      '--v2-panel': 'rgba(255, 241, 242, 0.80)',
      '--v2-panel-strong': 'rgba(255, 255, 255, 0.92)',
      '--v2-line-soft': 'rgba(136, 19, 55, 0.06)',
      '--v2-line-strong': 'rgba(136, 19, 55, 0.12)',
      '--v2-ink-strong': '#4c0519',
      '--v2-ink-soft': '#881337',
      '--v2-ink-faint': '#be123c',
      '--v2-accent-strong': '#e11d48',
      '--v2-accent-warm': '#f59e0b',
    },
    swatches: ['#fff1f2', '#e11d48', '#4c0519', '#f59e0b'],
  },
  {
    id: 'midnight',
    label: 'Meia-noite',
    description: 'Tema escuro com acentos em violeta.',
    tokens: {
      '--v2-canvas': '#0f172a',
      '--v2-panel': 'rgba(30, 41, 59, 0.82)',
      '--v2-panel-strong': 'rgba(51, 65, 85, 0.90)',
      '--v2-line-soft': 'rgba(148, 163, 184, 0.12)',
      '--v2-line-strong': 'rgba(148, 163, 184, 0.20)',
      '--v2-ink-strong': '#f1f5f9',
      '--v2-ink-soft': '#94a3b8',
      '--v2-ink-faint': '#64748b',
      '--v2-accent-strong': '#a78bfa',
      '--v2-accent-warm': '#fbbf24',
    },
    swatches: ['#0f172a', '#a78bfa', '#f1f5f9', '#fbbf24'],
  },
]

export const DEFAULT_SKIN_ID = 'parchment'

export function findSkin(id: string | undefined): PlatformSkin {
  return PLATFORM_SKINS.find((s) => s.id === id) ?? PLATFORM_SKINS[0]
}

/** Apply skin tokens to the document root. */
export function applySkinToDocument(skin: PlatformSkin): void {
  const root = document.documentElement
  for (const [property, value] of Object.entries(skin.tokens)) {
    root.style.setProperty(property, value)
  }
}

/** Remove all skin overrides, reverting to the CSS defaults. */
export function clearSkinFromDocument(): void {
  const root = document.documentElement
  const tokenKeys = Object.keys(PLATFORM_SKINS[0].tokens)
  for (const property of tokenKeys) {
    root.style.removeProperty(property)
  }
}
