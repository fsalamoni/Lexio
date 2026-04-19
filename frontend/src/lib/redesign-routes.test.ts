import { describe, expect, it } from 'vitest'
import { buildRedesignPreviewPath, getRedesignPreviewParams } from './redesign-routes'

describe('redesign-routes', () => {
  it('preserves only preview-enabling query params', () => {
    const params = getRedesignPreviewParams('?labs=1&open=abc&tab=chat&redesign_v2=true')

    expect(params.get('labs')).toBe('1')
    expect(params.get('redesign_v2')).toBe('true')
    expect(params.get('open')).toBeNull()
    expect(params.get('tab')).toBeNull()
  })

  it('builds a labs path while keeping preview params alive', () => {
    const path = buildRedesignPreviewPath('/labs/profile-v2', {
      preserveSearch: '?labs=1&open=abc',
      params: { section: 'overview' },
    })

    expect(path).toBe('/labs/profile-v2?labs=1&section=overview')
  })
})