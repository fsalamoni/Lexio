import { describe, expect, it } from 'vitest'
import {
  LEGACY_DEVICE_ID,
  addDevice,
  deviceToConnectionConfig,
  getActiveDevice,
  getDefaultSidecarDevicesState,
  normalizeDevice,
  normalizeDevicesState,
  removeDevice,
  renameDevice,
  setActiveDevice,
} from './sidecar-devices'

describe('sidecar-devices — normalizeDevice', () => {
  it('drops entries without a token', () => {
    expect(normalizeDevice({ label: 'X' })).toBeNull()
    expect(normalizeDevice({ token: '   ' })).toBeNull()
    expect(normalizeDevice(null)).toBeNull()
  })

  it('fills defaults and keeps provided fields', () => {
    const d = normalizeDevice({ token: 'tok', label: 'Casa' })!
    expect(d.token).toBe('tok')
    expect(d.label).toBe('Casa')
    expect(d.host).toBe('127.0.0.1')
    expect(d.port).toBe(9420)
    expect(typeof d.id).toBe('string')
    expect(typeof d.created_at).toBe('string')
  })
})

describe('sidecar-devices — normalizeDevicesState', () => {
  it('migrates the legacy single connection when the list is empty', () => {
    const state = normalizeDevicesState(undefined, undefined, { token: 'legacy-tok', host: '127.0.0.1', port: 9420 })
    expect(state.devices).toHaveLength(1)
    expect(state.devices[0].id).toBe(LEGACY_DEVICE_ID)
    expect(state.devices[0].token).toBe('legacy-tok')
    expect(state.activeId).toBe(LEGACY_DEVICE_ID)
  })

  it('returns empty state with no devices and no legacy token', () => {
    const state = normalizeDevicesState([], undefined, { token: '' })
    expect(state).toEqual(getDefaultSidecarDevicesState())
  })

  it('ignores the legacy connection when devices already exist', () => {
    const state = normalizeDevicesState(
      [{ id: 'a', label: 'A', token: 'ta' }],
      'a',
      { token: 'legacy-tok' },
    )
    expect(state.devices).toHaveLength(1)
    expect(state.devices[0].id).toBe('a')
  })

  it('de-duplicates by id', () => {
    const state = normalizeDevicesState(
      [{ id: 'a', token: 't1' }, { id: 'a', token: 't2' }],
      'a',
      undefined,
    )
    expect(state.devices).toHaveLength(1)
    expect(state.devices[0].token).toBe('t1')
  })

  it('defaults activeId to the first device when stored id is invalid', () => {
    const state = normalizeDevicesState(
      [{ id: 'a', token: 't' }, { id: 'b', token: 't' }],
      'missing',
      undefined,
    )
    expect(state.activeId).toBe('a')
  })
})

describe('sidecar-devices — array ops', () => {
  it('adds a device and makes the first one active', () => {
    let state = getDefaultSidecarDevicesState()
    state = addDevice(state, { label: 'PC1', token: 't1' })
    expect(state.devices).toHaveLength(1)
    expect(state.activeId).toBe(state.devices[0].id)
    const firstId = state.activeId
    state = addDevice(state, { label: 'PC2', token: 't2' })
    expect(state.devices).toHaveLength(2)
    expect(state.activeId).toBe(firstId) // active stays put
  })

  it('addDevice is a no-op without a token', () => {
    const state = getDefaultSidecarDevicesState()
    expect(addDevice(state, { token: '' })).toBe(state)
  })

  it('renames a device and ignores empty labels', () => {
    let state = addDevice(getDefaultSidecarDevicesState(), { label: 'Old', token: 't' })
    const id = state.devices[0].id
    state = renameDevice(state, id, 'New')
    expect(state.devices[0].label).toBe('New')
    state = renameDevice(state, id, '   ')
    expect(state.devices[0].label).toBe('New')
  })

  it('removes a device and reassigns the active one', () => {
    let state = addDevice(getDefaultSidecarDevicesState(), { label: 'A', token: 't1' })
    state = addDevice(state, { label: 'B', token: 't2' })
    const [a, b] = state.devices
    state = setActiveDevice(state, a.id)
    state = removeDevice(state, a.id)
    expect(state.devices).toHaveLength(1)
    expect(state.activeId).toBe(b.id)
    state = removeDevice(state, b.id)
    expect(state.activeId).toBeNull()
  })

  it('setActiveDevice only accepts existing ids', () => {
    const state = addDevice(getDefaultSidecarDevicesState(), { label: 'A', token: 't' })
    expect(setActiveDevice(state, 'nope')).toBe(state)
    expect(getActiveDevice(setActiveDevice(state, state.devices[0].id))?.id).toBe(state.devices[0].id)
  })
})

describe('sidecar-devices — deviceToConnectionConfig', () => {
  it('overrides token/host/port but keeps enabled and approval_policy', () => {
    const base = { token: 'old', host: '0.0.0.0', port: 1, enabled: true, approval_policy: 'always' as const }
    const device = normalizeDevice({ token: 'new', host: '127.0.0.1', port: 9420 })!
    const cfg = deviceToConnectionConfig(device, base)
    expect(cfg.token).toBe('new')
    expect(cfg.host).toBe('127.0.0.1')
    expect(cfg.port).toBe(9420)
    expect(cfg.enabled).toBe(true)
    expect(cfg.approval_policy).toBe('always')
  })
})
