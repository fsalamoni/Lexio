// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import {
  PLATFORM_SKINS,
  DEFAULT_SKIN_ID,
  findSkin,
  applySkinToDocument,
  clearSkinFromDocument,
} from './platform-skins'

describe('platform-skins', () => {
  afterEach(() => {
    clearSkinFromDocument()
  })

  it('exports at least 6 skins', () => {
    expect(PLATFORM_SKINS.length).toBeGreaterThanOrEqual(6)
  })

  it('each skin has required fields', () => {
    for (const skin of PLATFORM_SKINS) {
      expect(skin.id).toBeTruthy()
      expect(skin.label).toBeTruthy()
      expect(skin.description).toBeTruthy()
      expect(Object.keys(skin.tokens).length).toBeGreaterThan(0)
      expect(skin.swatches.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('has unique skin ids', () => {
    const ids = PLATFORM_SKINS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('DEFAULT_SKIN_ID matches a real skin', () => {
    expect(PLATFORM_SKINS.some((s) => s.id === DEFAULT_SKIN_ID)).toBe(true)
  })

  it('findSkin returns matching skin', () => {
    const skin = findSkin('midnight')
    expect(skin.id).toBe('midnight')
  })

  it('findSkin falls back to first skin for unknown id', () => {
    const skin = findSkin('nonexistent')
    expect(skin.id).toBe(PLATFORM_SKINS[0].id)
  })

  it('findSkin handles undefined', () => {
    const skin = findSkin(undefined)
    expect(skin.id).toBe(PLATFORM_SKINS[0].id)
  })

  it('applySkinToDocument sets CSS custom properties', () => {
    const skin = findSkin('ocean')
    applySkinToDocument(skin)

    const root = document.documentElement
    expect(root.style.getPropertyValue('--v2-canvas')).toBe(skin.tokens['--v2-canvas'])
    expect(root.style.getPropertyValue('--v2-accent-strong')).toBe(skin.tokens['--v2-accent-strong'])
  })

  it('clearSkinFromDocument removes CSS custom properties', () => {
    const skin = findSkin('forest')
    applySkinToDocument(skin)
    clearSkinFromDocument()

    const root = document.documentElement
    expect(root.style.getPropertyValue('--v2-canvas')).toBe('')
    expect(root.style.getPropertyValue('--v2-accent-strong')).toBe('')
  })
})
