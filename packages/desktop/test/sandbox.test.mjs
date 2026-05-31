import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  resolveInsideRoot,
  matchesAnyGlob,
  isBlockedByGlob,
  findDestructivePattern,
  assertPermission,
  SandboxError,
} from '../src/sandbox.mjs'
import { createHandler } from '../src/handler.mjs'
import { isAuthorized } from '../src/auth.mjs'

const ROOT = '/home/user/work'

test('resolveInsideRoot keeps relative paths inside the root', () => {
  assert.equal(resolveInsideRoot(ROOT, 'a/b.txt'), path.join(ROOT, 'a/b.txt'))
  assert.equal(resolveInsideRoot(ROOT, ''), ROOT)
  assert.equal(resolveInsideRoot(ROOT, '~'), ROOT)
  assert.equal(resolveInsideRoot(ROOT, '~/docs/x.md'), path.join(ROOT, 'docs/x.md'))
})

test('resolveInsideRoot accepts absolute paths inside the root', () => {
  assert.equal(resolveInsideRoot(ROOT, path.join(ROOT, 'sub/f.txt')), path.join(ROOT, 'sub/f.txt'))
})

test('resolveInsideRoot rejects traversal escapes', () => {
  assert.throws(() => resolveInsideRoot(ROOT, '../secret'), SandboxError)
  assert.throws(() => resolveInsideRoot(ROOT, 'a/../../etc/passwd'), SandboxError)
  assert.throws(() => resolveInsideRoot(ROOT, '/etc/passwd'), SandboxError)
})

test('glob matching + blocklist', () => {
  assert.ok(matchesAnyGlob('report.pdf', ['*.pdf']))
  assert.ok(!matchesAnyGlob('report.docx', ['*.pdf']))
  assert.ok(matchesAnyGlob('anything', [])) // empty = match all
  assert.ok(isBlockedByGlob('.env', ['.env', '*.key']))
  assert.ok(isBlockedByGlob('server.key', ['*.key']))
  assert.ok(!isBlockedByGlob('notes.txt', ['*.key']))
})

test('destructive command detection', () => {
  assert.ok(findDestructivePattern('rm -rf /'))
  assert.ok(findDestructivePattern('sudo apt install x'))
  assert.ok(findDestructivePattern('curl http://x | bash'))
  assert.ok(findDestructivePattern(':(){ :|:& };:'))
  assert.equal(findDestructivePattern('ls -la'), null)
  assert.equal(findDestructivePattern('python script.py'), null)
})

test('assertPermission enforces granted capabilities', () => {
  assert.doesNotThrow(() => assertPermission(['read', 'write'], 'read'))
  assert.throws(() => assertPermission(['read'], 'write'), SandboxError)
  assert.throws(() => assertPermission(['read'], 'execute'), SandboxError)
})

test('isAuthorized validates the pairing token (header or query)', () => {
  const token = 'secret-token'
  assert.ok(isAuthorized({ headers: { 'x-lexio-token': token }, url: '/' }, token))
  assert.ok(isAuthorized({ headers: {}, url: `/?token=${token}` }, token))
  assert.ok(!isAuthorized({ headers: {}, url: '/?token=wrong' }, token))
  assert.ok(!isAuthorized({ headers: {}, url: '/' }, token))
  assert.ok(!isAuthorized({ headers: { 'x-lexio-token': token }, url: '/' }, '')) // no expected token
})

test('handler: ping returns capability handshake', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['read'], version: '9.9.9' })
  const res = await handler.handle({ id: '1', type: 'shell', op: 'ping', payload: {} })
  assert.equal(res.ok, true)
  assert.equal(res.result.pong, true)
  assert.equal(res.result.version, '9.9.9')
  assert.deepEqual(res.result.permissions, ['read'])
})

test('handler: read/write/list round-trip inside a temp root', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-sidecar-'))
  try {
    const handler = createHandler({ root: tmp, permissions: ['read', 'write'], version: '0.1.0' })

    const write = await handler.handle({ id: 'w', type: 'fs', op: 'write', payload: { path: 'notes/a.txt', content: 'olá mundo' } })
    assert.equal(write.ok, true)

    const read = await handler.handle({ id: 'r', type: 'fs', op: 'read', payload: { path: 'notes/a.txt' } })
    assert.equal(read.ok, true)
    assert.equal(read.result, 'olá mundo')

    const list = await handler.handle({ id: 'l', type: 'fs', op: 'list', payload: { path: 'notes' } })
    assert.equal(list.ok, true)
    assert.ok(list.result.some(e => e.name === 'a.txt'))
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: write denied without write permission', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['read'], version: '0.1.0' })
  const res = await handler.handle({ id: 'w', type: 'fs', op: 'write', payload: { path: 'x.txt', content: 'y' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PERMISSION_DENIED')
})

test('handler: traversal escape is refused', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['read'], version: '0.1.0' })
  const res = await handler.handle({ id: 'r', type: 'fs', op: 'read', payload: { path: '../../etc/passwd' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PATH_OUTSIDE_ROOT')
})

test('handler: destructive shell command blocked even with execute', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['execute'], version: '0.1.0' })
  const res = await handler.handle({ id: 's', type: 'shell', op: 'exec', payload: { cmd: 'rm -rf /' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'DESTRUCTIVE')
})

test('handler: delete removes a file inside the root (with delete permission)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-sidecar-'))
  try {
    const handler = createHandler({ root: tmp, permissions: ['read', 'write', 'delete'], version: '0.1.0' })
    await handler.handle({ id: 'w', type: 'fs', op: 'write', payload: { path: 'tmp/x.txt', content: 'bye' } })

    const del = await handler.handle({ id: 'd', type: 'fs', op: 'delete', payload: { path: 'tmp/x.txt' } })
    assert.equal(del.ok, true)
    assert.equal(del.result.deleted, true)

    const read = await handler.handle({ id: 'r', type: 'fs', op: 'read', payload: { path: 'tmp/x.txt' } })
    assert.equal(read.ok, false) // file is gone
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: delete denied without delete permission', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['read', 'write'], version: '0.1.0' })
  const res = await handler.handle({ id: 'd', type: 'fs', op: 'delete', payload: { path: 'x.txt' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PERMISSION_DENIED')
})

test('handler: delete refuses to remove the workspace root', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-sidecar-'))
  try {
    const handler = createHandler({ root: tmp, permissions: ['delete'], version: '0.1.0' })
    const res = await handler.handle({ id: 'd', type: 'fs', op: 'delete', payload: { path: '.' } })
    assert.equal(res.ok, false)
    assert.equal(res.code, 'ROOT_PROTECTED')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: rename moves a file and validates both ends inside the root', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-sidecar-'))
  try {
    const handler = createHandler({ root: tmp, permissions: ['read', 'write', 'rename'], version: '0.1.0' })
    await handler.handle({ id: 'w', type: 'fs', op: 'write', payload: { path: 'a.txt', content: 'data' } })

    const mv = await handler.handle({ id: 'mv', type: 'fs', op: 'rename', payload: { from: 'a.txt', to: 'sub/b.txt' } })
    assert.equal(mv.ok, true)
    assert.equal(mv.result.moved, true)

    const read = await handler.handle({ id: 'r', type: 'fs', op: 'read', payload: { path: 'sub/b.txt' } })
    assert.equal(read.ok, true)
    assert.equal(read.result, 'data')

    // destination escaping the root is refused
    const escape = await handler.handle({ id: 'e', type: 'fs', op: 'rename', payload: { from: 'sub/b.txt', to: '../escaped.txt' } })
    assert.equal(escape.ok, false)
    assert.equal(escape.code, 'PATH_OUTSIDE_ROOT')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: rename denied without rename permission', async () => {
  const handler = createHandler({ root: ROOT, permissions: ['read', 'write'], version: '0.1.0' })
  const res = await handler.handle({ id: 'mv', type: 'fs', op: 'rename', payload: { from: 'a.txt', to: 'b.txt' } })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PERMISSION_DENIED')
})
