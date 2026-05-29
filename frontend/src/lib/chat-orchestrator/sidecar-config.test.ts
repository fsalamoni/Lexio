import { describe, expect, it } from 'vitest'
import {
  buildSidecarWsUrl,
  getDefaultSidecarConnectionConfig,
  DEFAULT_SIDECAR_HOST,
  DEFAULT_SIDECAR_PORT,
} from './sidecar-config'

describe('sidecar-config', () => {
  it('defaults are disabled with no token', () => {
    const cfg = getDefaultSidecarConnectionConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.token).toBe('')
    expect(cfg.host).toBe(DEFAULT_SIDECAR_HOST)
    expect(cfg.port).toBe(DEFAULT_SIDECAR_PORT)
  })

  it('builds a ws URL without token', () => {
    const url = buildSidecarWsUrl({ token: '', host: '127.0.0.1', port: 9420, enabled: false })
    expect(url).toBe('ws://127.0.0.1:9420')
  })

  it('builds a ws URL with token as query param (encoded)', () => {
    const url = buildSidecarWsUrl({ token: 'a b/c+d', host: '127.0.0.1', port: 9420, enabled: true })
    expect(url).toBe('ws://127.0.0.1:9420/?token=a%20b%2Fc%2Bd')
  })

  it('falls back to defaults for empty host/port', () => {
    const url = buildSidecarWsUrl({ token: 'tok', host: '', port: 0, enabled: true })
    expect(url).toBe(`ws://${DEFAULT_SIDECAR_HOST}:${DEFAULT_SIDECAR_PORT}/?token=tok`)
  })
})
