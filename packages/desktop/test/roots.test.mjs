/**
 * Tests for the multi-root (allowlist) foundation: resolving paths against a
 * list of authorized folders, refusing system/secret folders, and granting /
 * revoking folders at runtime via the `grant` op.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { resolveInsideRoots, isForbiddenRoot } from '../src/sandbox.mjs'
import { normalizeRootList } from '../src/config.mjs'
import { createHandler } from '../src/handler.mjs'

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lexio-roots-'))
}

// ── sandbox.resolveInsideRoots ────────────────────────────────────────────────

test('resolveInsideRoots picks the matching root for an absolute path', () => {
  const a = tmp()
  const b = tmp()
  const target = path.join(b, 'sub', 'f.txt')
  const res = resolveInsideRoots([a, b], target)
  assert.equal(res.path, path.resolve(target))
  assert.equal(res.root, path.resolve(b))
})

test('resolveInsideRoots resolves relative paths under the primary root', () => {
  const a = tmp()
  const b = tmp()
  const res = resolveInsideRoots([a, b], 'notes.txt')
  assert.equal(res.path, path.join(path.resolve(a), 'notes.txt'))
  assert.equal(res.root, path.resolve(a))
})

test('resolveInsideRoots refuses a path outside every root', () => {
  const a = tmp()
  const b = tmp()
  const outside = path.join(tmp(), 'x.txt')
  assert.throws(() => resolveInsideRoots([a, b], outside), e => e.code === 'PATH_OUTSIDE_ROOT')
})

test('resolveInsideRoots with no roots throws NO_ROOTS', () => {
  assert.throws(() => resolveInsideRoots([], 'x'), e => e.code === 'NO_ROOTS')
})

// ── sandbox.isForbiddenRoot ───────────────────────────────────────────────────

test('isForbiddenRoot blocks filesystem roots, system dirs and secret stores', () => {
  assert.equal(isForbiddenRoot(path.parse(process.cwd()).root), true) // "/" or "C:\"
  assert.equal(isForbiddenRoot('/etc'), true)
  assert.equal(isForbiddenRoot('/etc/ssl'), true)
  assert.equal(isForbiddenRoot(''), true)
  assert.equal(isForbiddenRoot(path.join(os.homedir(), '.ssh')), true)
  assert.equal(isForbiddenRoot(path.join(os.homedir(), '.lexio')), true)
  assert.equal(isForbiddenRoot(path.join(os.homedir(), 'Projetos', '.aws')), true)
  assert.equal(isForbiddenRoot(tmp()), false)
})

// ── config.normalizeRootList ──────────────────────────────────────────────────

test('normalizeRootList resolves, dedupes and drops forbidden roots', () => {
  const a = tmp()
  const list = normalizeRootList([a, a, '/etc', '', '   '])
  assert.deepEqual(list, [path.resolve(a)])
})

// ── handler: multi-root + grant ───────────────────────────────────────────────

test('handler reads/writes across multiple authorized roots', async () => {
  const a = tmp()
  const b = tmp()
  const h = createHandler({ roots: [a, b], permissions: ['read', 'write'], version: 't' })
  const bFile = path.join(b, 'hello.txt')
  let res = await h.handle({ id: '1', type: 'fs', op: 'write', payload: { path: bFile, content: 'oi' } })
  assert.equal(res.ok, true)
  res = await h.handle({ id: '2', type: 'fs', op: 'read', payload: { path: bFile } })
  assert.equal(res.ok, true)
  assert.match(res.result, /oi/)
})

test('handler still supports a single legacy root', async () => {
  const a = tmp()
  const h = createHandler({ root: a, permissions: ['read', 'write'], version: 't' })
  const res = await h.handle({ id: '1', type: 'fs', op: 'write', payload: { path: 'leg.txt', content: 'x' } })
  assert.equal(res.ok, true)
})

test('grant/add authorizes a new folder at runtime (session only)', async () => {
  const a = tmp()
  const c = tmp()
  let persisted = null
  const h = createHandler({
    roots: [a], permissions: ['read', 'write'], version: 't',
    persistRoots: (r) => { persisted = [...r]; return r },
  })
  // before grant → writing into c is refused
  let res = await h.handle({ id: '1', type: 'fs', op: 'write', payload: { path: path.join(c, 'x.txt'), content: 'no' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PATH_OUTSIDE_ROOT')
  // grant c without persist
  res = await h.handle({ id: '2', type: 'grant', op: 'add', payload: { path: c } })
  assert.equal(res.ok, true)
  assert.ok(res.result.roots.includes(path.resolve(c)))
  assert.equal(res.result.persisted, false)
  assert.equal(persisted, null) // session-only → not persisted
  // now writing into c works
  res = await h.handle({ id: '3', type: 'fs', op: 'write', payload: { path: path.join(c, 'x.txt'), content: 'ok' } })
  assert.equal(res.ok, true)
})

test('grant/add with persist calls persistRoots ("permitir sempre")', async () => {
  const a = tmp()
  const c = tmp()
  let persisted = null
  const h = createHandler({
    roots: [a], permissions: ['read', 'write'], version: 't',
    persistRoots: (r) => { persisted = [...r]; return r },
  })
  const res = await h.handle({ id: '1', type: 'grant', op: 'add', payload: { path: c, persist: true } })
  assert.equal(res.ok, true)
  assert.equal(res.result.persisted, true)
  assert.ok(persisted && persisted.includes(path.resolve(c)))
})

test('grant/add refuses a forbidden (system) folder', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write'], version: 't' })
  const res = await h.handle({ id: '1', type: 'grant', op: 'add', payload: { path: '/etc' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'FORBIDDEN_ROOT')
})

test('grant/remove revokes a folder', async () => {
  const a = tmp()
  const b = tmp()
  const h = createHandler({ roots: [a, b], permissions: ['read', 'write'], version: 't' })
  const res = await h.handle({ id: '1', type: 'grant', op: 'remove', payload: { path: b } })
  assert.equal(res.ok, true)
  assert.ok(!res.result.roots.includes(path.resolve(b)))
  // writing into b is now refused
  const w = await h.handle({ id: '2', type: 'fs', op: 'write', payload: { path: path.join(b, 'x.txt'), content: 'no' } })
  assert.equal(w.ok, false)
})

test('rename moves a file between two authorized roots', async () => {
  const a = tmp()
  const b = tmp()
  const h = createHandler({ roots: [a, b], permissions: ['read', 'write', 'rename'], version: 't' })
  const src = path.join(a, 'doc.txt')
  await fsp.writeFile(src, 'data')
  const dst = path.join(b, 'moved.txt')
  const res = await h.handle({ id: '1', type: 'fs', op: 'rename', payload: { from: src, to: dst } })
  assert.equal(res.ok, true)
  assert.equal(fs.existsSync(dst), true)
  assert.equal(fs.existsSync(src), false)
})

test('delete refuses to remove an authorized root itself', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write', 'delete'], version: 't' })
  const res = await h.handle({ id: '1', type: 'fs', op: 'delete', payload: { path: a } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'ROOT_PROTECTED')
})

test('ping returns the full roots list', async () => {
  const a = tmp()
  const b = tmp()
  const h = createHandler({ roots: [a, b], permissions: ['read'], version: '9.9' })
  const res = await h.handle({ id: '1', type: 'shell', op: 'ping', payload: {} })
  assert.equal(res.ok, true)
  assert.equal(res.result.roots.length, 2)
  assert.equal(res.result.root, path.resolve(a))
})
