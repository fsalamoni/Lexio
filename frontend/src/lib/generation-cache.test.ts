import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMENTA_CACHE_TTL_MS,
  getAcervoContextFromCache,
  getEmentaFromCache,
  getTemplateFromCache,
  invalidateAllCaches,
  invalidateAllGenerationCaches,
  setAcervoContextInCache,
  setEmentaInCache,
  setTemplateInCache,
} from './generation-cache'

describe('generation-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05T10:00:00.000Z'))
    invalidateAllCaches()
  })

  afterEach(() => {
    invalidateAllCaches()
    vi.useRealTimers()
  })

  it('keeps user-scoped caches isolated during bulk invalidation', () => {
    setEmentaInCache('user-a', 'doc-1', { ementa: 'Parecer A', keywords: ['parecer'] })
    setTemplateInCache('user-a', 'parecer', { structure: 'Estrutura A' })
    setAcervoContextInCache('user-a', 'Contexto A')

    setEmentaInCache('user-b', 'doc-2', { ementa: 'Parecer B', keywords: ['recurso'] })
    setTemplateInCache('user-b', 'recurso', { structure: 'Estrutura B' })
    setAcervoContextInCache('user-b', 'Contexto B')

    invalidateAllGenerationCaches('user-a')

    expect(getEmentaFromCache('user-a', 'doc-1')).toBeNull()
    expect(getTemplateFromCache('user-a', 'parecer')).toBeNull()
    expect(getAcervoContextFromCache('user-a')).toBeNull()

    expect(getEmentaFromCache('user-b', 'doc-2')?.ementa).toBe('Parecer B')
    expect(getTemplateFromCache('user-b', 'recurso')?.structure).toBe('Estrutura B')
    expect(getAcervoContextFromCache('user-b')).toBe('Contexto B')
  })

  it('expires ementa entries after the configured TTL', () => {
    setEmentaInCache('user-a', 'doc-1', { ementa: 'Parecer A', keywords: ['parecer'] })

    vi.advanceTimersByTime(EMENTA_CACHE_TTL_MS + 1)

    expect(getEmentaFromCache('user-a', 'doc-1')).toBeNull()
  })
})