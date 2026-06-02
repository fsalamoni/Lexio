/**
 * Tests for the organize/undo batch ops: moving files within/across authorized
 * roots with a backup of overwritten destinations and a reversible journal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createHandler } from '../src/handler.mjs'

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lexio-organize-'))
}

test('organize moves files across authorized roots and returns a journal', async () => {
  const a = tmp()
  const b = tmp()
  const h = createHandler({ roots: [a, b], permissions: ['read', 'write', 'rename'], version: 't' })
  await fsp.writeFile(path.join(a, 'f1.txt'), 'one')
  await fsp.writeFile(path.join(a, 'f2.txt'), 'two')
  const res = await h.handle({
    id: '1', type: 'fs', op: 'organize', payload: { moves: [
      { from: path.join(a, 'f1.txt'), to: path.join(b, 'sub', 'f1.txt') },
      { from: path.join(a, 'f2.txt'), to: path.join(b, 'f2.txt') },
    ] },
  })
  assert.equal(res.ok, true)
  assert.equal(res.result.moved, 2)
  assert.equal(res.result.journal.length, 2)
  assert.equal(fs.existsSync(path.join(b, 'sub', 'f1.txt')), true)
  assert.equal(fs.existsSync(path.join(a, 'f1.txt')), false)
})

test('organize backs up an overwritten destination (conflict=backup)', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write', 'rename'], version: 't' })
  await fsp.writeFile(path.join(a, 'src.txt'), 'new')
  await fsp.writeFile(path.join(a, 'dst.txt'), 'OLD')
  const res = await h.handle({
    id: '1', type: 'fs', op: 'organize',
    payload: { moves: [{ from: path.join(a, 'src.txt'), to: path.join(a, 'dst.txt') }] },
  })
  assert.equal(res.result.moved, 1)
  assert.ok(res.result.journal[0].backup)
  assert.equal(fs.readFileSync(path.join(a, 'dst.txt'), 'utf8'), 'new')
  assert.equal(fs.readFileSync(res.result.journal[0].backup, 'utf8'), 'OLD')
})

test('undo reverses an organize run and restores the backup', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write', 'rename'], version: 't' })
  await fsp.writeFile(path.join(a, 'src.txt'), 'new')
  await fsp.writeFile(path.join(a, 'dst.txt'), 'OLD')
  const org = await h.handle({
    id: '1', type: 'fs', op: 'organize',
    payload: { moves: [{ from: path.join(a, 'src.txt'), to: path.join(a, 'dst.txt') }] },
  })
  const undo = await h.handle({ id: '2', type: 'fs', op: 'undo', payload: { journal: org.result.journal } })
  assert.equal(undo.ok, true)
  assert.equal(undo.result.restored, 1)
  assert.equal(fs.readFileSync(path.join(a, 'src.txt'), 'utf8'), 'new')
  assert.equal(fs.readFileSync(path.join(a, 'dst.txt'), 'utf8'), 'OLD')
})

test('undo without a journal reverses the last persisted run', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write', 'rename'], version: 't' })
  await fsp.writeFile(path.join(a, 'x.txt'), 'X')
  await h.handle({
    id: '1', type: 'fs', op: 'organize',
    payload: { moves: [{ from: path.join(a, 'x.txt'), to: path.join(a, 'moved', 'x.txt') }] },
  })
  assert.equal(fs.existsSync(path.join(a, 'moved', 'x.txt')), true)
  const undo = await h.handle({ id: '2', type: 'fs', op: 'undo', payload: {} })
  assert.equal(undo.result.restored, 1)
  assert.equal(fs.existsSync(path.join(a, 'x.txt')), true)
})

test('organize records an error for an out-of-root destination without aborting the batch', async () => {
  const a = tmp()
  const outside = path.join(tmp(), 'evil.txt')
  const h = createHandler({ roots: [a], permissions: ['read', 'write', 'rename'], version: 't' })
  await fsp.writeFile(path.join(a, 'ok.txt'), 'ok')
  await fsp.writeFile(path.join(a, 'bad.txt'), 'bad')
  const res = await h.handle({
    id: '1', type: 'fs', op: 'organize', payload: { moves: [
      { from: path.join(a, 'ok.txt'), to: path.join(a, 'done', 'ok.txt') },
      { from: path.join(a, 'bad.txt'), to: outside },
    ] },
  })
  assert.equal(res.result.moved, 1)
  assert.equal(res.result.errors.length, 1)
  assert.equal(res.result.errors[0].code, 'PATH_OUTSIDE_ROOT')
  assert.equal(fs.existsSync(path.join(a, 'done', 'ok.txt')), true)
  assert.equal(fs.existsSync(path.join(a, 'bad.txt')), true)
})

test('organize requires the rename permission', async () => {
  const a = tmp()
  const h = createHandler({ roots: [a], permissions: ['read', 'write'], version: 't' })
  await fsp.writeFile(path.join(a, 'f.txt'), 'x')
  const res = await h.handle({
    id: '1', type: 'fs', op: 'organize',
    payload: { moves: [{ from: path.join(a, 'f.txt'), to: path.join(a, 'g.txt') }] },
  })
  assert.equal(res.ok, false)
})
