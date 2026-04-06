import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchDataJud, _resetEndpointCache, type TribunalInfo } from './datajud-service'

describe('datajud-service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    _resetEndpointCache()
  })

  it('classifies 403 responses as auth errors in errorDetails', async () => {
    const tribunals: TribunalInfo[] = [
      { alias: 'stf', name: 'Supremo Tribunal Federal', category: 'superiores' },
    ]

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('forbidden', { status: 403 }),
    )

    const result = await searchDataJud('socioafetividade', {
      tribunals,
      maxPerTribunal: 1,
      maxTotal: 1,
    })

    expect(result.results).toHaveLength(0)
    expect(result.errorDetails).toHaveLength(1)
    expect(result.errorDetails[0].type).toBe('auth')
    expect(result.errors[0]).toContain('HTTP 403')
  })
})
