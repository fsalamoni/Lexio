import { describe, expect, it } from 'vitest'
import {
  addRule,
  matchAllowlist,
  normalizeRule,
  normalizeRules,
  pathIsWithin,
  removeRule,
} from './sidecar-allowlist'
import type { SidecarAllowlistRule } from '../firestore-types'

describe('sidecar-allowlist — pathIsWithin', () => {
  it('matches a path inside the root subtree and the root itself', () => {
    expect(pathIsWithin('/a/b', '/a/b')).toBe(true)
    expect(pathIsWithin('/a/b', '/a/b/c/d.txt')).toBe(true)
  })
  it('does not match siblings or prefix traps', () => {
    expect(pathIsWithin('/a/b', '/a/bc')).toBe(false)
    expect(pathIsWithin('/a/b', '/a')).toBe(false)
    expect(pathIsWithin('', '/a')).toBe(false)
  })
  it('is case-insensitive and separator-insensitive for Windows paths', () => {
    expect(pathIsWithin('C:\\Casos', 'c:/casos/sub/x.docx')).toBe(true)
    expect(pathIsWithin('C:\\Casos', 'C:\\Outra\\y.docx')).toBe(false)
  })
})

describe('sidecar-allowlist — matchAllowlist', () => {
  const rules: SidecarAllowlistRule[] = [
    { id: '1', device_id: 'pc1', root: '/home/casos', ops: ['write', 'rename'], created_at: 't' },
    { id: '2', device_id: 'pc1', root: '/home/all', ops: 'all', created_at: 't' },
    { id: '3', device_id: 'pc2', root: '/home/casos', ops: ['write'], created_at: 't' },
  ]
  it('matches by device + op coverage + subtree', () => {
    expect(matchAllowlist(rules, 'pc1', 'write', '/home/casos/a.docx')?.id).toBe('1')
    expect(matchAllowlist(rules, 'pc1', 'rename', '/home/casos/a.docx')?.id).toBe('1')
  })
  it('respects ops="all"', () => {
    expect(matchAllowlist(rules, 'pc1', 'delete', '/home/all/x')?.id).toBe('2')
  })
  it('rejects uncovered ops, other devices and outside paths', () => {
    expect(matchAllowlist(rules, 'pc1', 'delete', '/home/casos/a.docx')).toBeNull()
    expect(matchAllowlist(rules, 'pc2', 'rename', '/home/casos/a.docx')).toBeNull()
    expect(matchAllowlist(rules, 'pc1', 'write', '/home/outside/a.docx')).toBeNull()
  })
})

describe('sidecar-allowlist — addRule / removeRule', () => {
  it('appends a new rule', () => {
    const next = addRule([], { device_id: 'pc1', root: '/a', ops: ['write'] })
    expect(next).toHaveLength(1)
    expect(next[0].root).toBe('/a')
  })
  it('merges ops for the same device + root (case-insensitive)', () => {
    let rules = addRule([], { device_id: 'pc1', root: 'C:\\Casos', ops: ['write'] })
    rules = addRule(rules, { device_id: 'pc1', root: 'c:/casos', ops: ['delete'] })
    expect(rules).toHaveLength(1)
    expect(rules[0].ops).toEqual(expect.arrayContaining(['write', 'delete']))
  })
  it('widens to "all" when merging an all-rule', () => {
    let rules = addRule([], { device_id: 'pc1', root: '/a', ops: ['write'] })
    rules = addRule(rules, { device_id: 'pc1', root: '/a', ops: 'all' })
    expect(rules[0].ops).toBe('all')
  })
  it('removes by id', () => {
    const rules = addRule([], { device_id: 'pc1', root: '/a', ops: ['write'] })
    expect(removeRule(rules, rules[0].id)).toHaveLength(0)
  })
})

describe('sidecar-allowlist — normalize', () => {
  it('drops invalid rules and de-duplicates by id', () => {
    const cleaned = normalizeRules([
      { id: 'x', device_id: 'pc1', root: '/a', ops: ['write'], created_at: 't' },
      { id: 'x', device_id: 'pc1', root: '/b', ops: ['write'], created_at: 't' }, // dup id
      { device_id: 'pc1', root: '', ops: ['write'] },     // no root
      { device_id: '', root: '/c', ops: ['write'] },      // no device
      { device_id: 'pc1', root: '/d', ops: [] },          // empty ops
      null,
    ])
    expect(cleaned).toHaveLength(1)
    expect(cleaned[0].id).toBe('x')
  })
  it('normalizeRule fills id and created_at', () => {
    const r = normalizeRule({ device_id: 'pc1', root: '/a', ops: ['write'] })!
    expect(typeof r.id).toBe('string')
    expect(typeof r.created_at).toBe('string')
  })
})
