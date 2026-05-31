import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildGitAuthEnv, parsePorcelainStatus, runGit } from '../src/git.mjs'
import { createHandler } from '../src/handler.mjs'

test('buildGitAuthEnv injects an ephemeral Basic auth header via env (not argv)', () => {
  const env = buildGitAuthEnv('ghp_abc123')
  assert.equal(env.GIT_CONFIG_COUNT, '1')
  assert.equal(env.GIT_CONFIG_KEY_0, 'http.extraHeader')
  assert.equal(env.GIT_CONFIG_VALUE_0, `Authorization: Basic ${Buffer.from('x-access-token:ghp_abc123').toString('base64')}`)
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
})

test('buildGitAuthEnv returns undefined without a token', () => {
  assert.equal(buildGitAuthEnv(''), undefined)
  assert.equal(buildGitAuthEnv(undefined), undefined)
})

test('parsePorcelainStatus extracts branch, ahead/behind and files', () => {
  const parsed = parsePorcelainStatus('## main...origin/main [ahead 1, behind 2]\n M a.txt\n?? b.txt')
  assert.equal(parsed.branch, 'main')
  assert.equal(parsed.ahead, 1)
  assert.equal(parsed.behind, 2)
  assert.equal(parsed.files.length, 2)
  assert.equal(parsed.clean, false)
})

test('parsePorcelainStatus reports a clean tree', () => {
  const parsed = parsePorcelainStatus('## main')
  assert.equal(parsed.branch, 'main')
  assert.equal(parsed.clean, true)
  assert.equal(parsed.files.length, 0)
})

async function initRepo(dir) {
  await runGit(['init', '-q'], dir)
  await runGit(['config', 'user.email', 'test@lexio.local'], dir)
  await runGit(['config', 'user.name', 'Lexio Test'], dir)
  await runGit(['config', 'commit.gpgsign', 'false'], dir)
}

test('handler: git status + commit round-trip on a temp repo', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-git-'))
  try {
    await initRepo(tmp)
    const handler = createHandler({ root: tmp, permissions: ['read', 'write', 'execute'], version: '0.1.0' })

    await fs.writeFile(path.join(tmp, 'a.txt'), 'hello', 'utf8')
    const dirty = await handler.handle({ id: 's1', type: 'git', op: 'status', payload: {} })
    assert.equal(dirty.ok, true)
    assert.equal(dirty.result.clean, false)

    const commit = await handler.handle({ id: 'c1', type: 'git', op: 'commit', payload: { message: 'add a', add_all: true } })
    assert.equal(commit.ok, true)
    assert.equal(commit.result.committed, true)

    const clean = await handler.handle({ id: 's2', type: 'git', op: 'status', payload: {} })
    assert.equal(clean.ok, true)
    assert.equal(clean.result.clean, true)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: git diff returns text for an unstaged change', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-git-'))
  try {
    await initRepo(tmp)
    await fs.writeFile(path.join(tmp, 'a.txt'), 'one\n', 'utf8')
    await runGit(['add', '-A'], tmp)
    await runGit(['commit', '-q', '-m', 'init'], tmp)
    await fs.writeFile(path.join(tmp, 'a.txt'), 'two\n', 'utf8')

    const handler = createHandler({ root: tmp, permissions: ['read', 'execute'], version: '0.1.0' })
    const diff = await handler.handle({ id: 'd1', type: 'git', op: 'diff', payload: {} })
    assert.equal(diff.ok, true)
    assert.match(diff.result.diff, /-one/)
    assert.match(diff.result.diff, /\+two/)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('handler: git push round-trip to a bare remote', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-git-'))
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), 'lexio-bare-'))
  try {
    await runGit(['init', '-q', '--bare'], bare)
    await initRepo(tmp)
    await runGit(['branch', '-M', 'main'], tmp)
    await fs.writeFile(path.join(tmp, 'a.txt'), 'x', 'utf8')
    await runGit(['add', '-A'], tmp)
    await runGit(['commit', '-q', '-m', 'init'], tmp)
    await runGit(['remote', 'add', 'origin', bare], tmp)

    const handler = createHandler({ root: tmp, permissions: ['execute'], version: '0.1.0' })
    const push = await handler.handle({ id: 'p1', type: 'git', op: 'push', payload: { remote: 'origin', branch: 'main' } })
    assert.equal(push.ok, true)
    assert.equal(push.result.ok, true)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
    await fs.rm(bare, { recursive: true, force: true })
  }
})

test('handler: git denied without execute permission', async () => {
  const handler = createHandler({ root: os.tmpdir(), permissions: ['read'], version: '0.1.0' })
  const res = await handler.handle({ id: 'g', type: 'git', op: 'status', payload: {} })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'PERMISSION_DENIED')
})
