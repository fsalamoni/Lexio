import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIGN_THEME_ID,
  DESIGN_THEMES,
  describeDesignTheme,
  isDesignThemeId,
  resolvePalette,
} from './themes'
import { buildDesignPreview } from './templates'

describe('design-studio themes', () => {
  it('exposes a non-empty catalog with the default first', () => {
    expect(DESIGN_THEMES.length).toBeGreaterThan(0)
    expect(DESIGN_THEMES[0].id).toBe(DEFAULT_DESIGN_THEME_ID)
  })

  it('validates theme ids and resolves palettes with a safe fallback', () => {
    expect(isDesignThemeId('corporate')).toBe(true)
    expect(isDesignThemeId('nope')).toBe(false)
    expect(isDesignThemeId(7)).toBe(false)
    expect(describeDesignTheme('corporate')).toBe('Corporate')
    // Unknown themes fall back to the default palette.
    expect(resolvePalette(undefined)).toEqual(DESIGN_THEMES[0].palette)
    expect(resolvePalette('vibrant' as never)).toEqual(
      DESIGN_THEMES.find((theme) => theme.id === 'vibrant')?.palette,
    )
  })

  it('threads the selected theme colour into generated HTML', () => {
    const corporate = DESIGN_THEMES.find((theme) => theme.id === 'corporate')!
    const html = buildDesignPreview('Landing institucional', 'site', 'corporate')
    expect(html).toContain(corporate.palette.accent)
  })
})
