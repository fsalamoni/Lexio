import { describe, expect, it } from 'vitest'
import {
  applyFileOps,
  createEmptyProject,
  guessPreviewEntry,
  MAX_FILES,
  normalizeProjectPath,
  projectFromFiles,
  projectToFiles,
  summarizeProjectForPrompt,
} from './project'

describe('normalizeProjectPath', () => {
  it('strips leading ./ and /, collapses slashes and backslashes', () => {
    expect(normalizeProjectPath('./src//app.tsx')).toBe('src/app.tsx')
    expect(normalizeProjectPath('/public/index.html')).toBe('public/index.html')
    expect(normalizeProjectPath('src\\lib\\x.ts')).toBe('src/lib/x.ts')
    expect(normalizeProjectPath('  index.html  ')).toBe('index.html')
  })
})

describe('applyFileOps', () => {
  it('creates, updates and deletes files without mutating the input', () => {
    const project = projectFromFiles([{ path: 'index.html', content: '<h1>old</h1>' }])
    const result = applyFileOps(project, [
      { path: 'index.html', op: 'write', content: '<h1>new</h1>' },
      { path: 'style.css', op: 'write', content: 'body{}' },
    ])
    expect(project.files['index.html'].content).toBe('<h1>old</h1>') // input untouched
    expect(result.project.files['index.html'].content).toBe('<h1>new</h1>')
    expect(result.project.files['style.css'].content).toBe('body{}')
    expect(result.changes).toEqual([
      { path: 'index.html', op: 'update', summary: undefined },
      { path: 'style.css', op: 'create', summary: undefined },
    ])

    const deleted = applyFileOps(result.project, [{ path: 'style.css', op: 'delete' }])
    expect(deleted.project.files['style.css']).toBeUndefined()
    expect(deleted.changes[0].op).toBe('delete')
  })

  it('skips ops without a valid path and warns', () => {
    const result = applyFileOps(createEmptyProject(), [{ path: '   ', op: 'write', content: 'x' }])
    expect(Object.keys(result.project.files)).toHaveLength(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('enforces the max file-count cap', () => {
    let project = createEmptyProject()
    for (let i = 0; i < MAX_FILES; i++) {
      project = applyFileOps(project, [{ path: `f${i}.txt`, op: 'write', content: 'x' }]).project
    }
    const overflow = applyFileOps(project, [{ path: 'one-too-many.txt', op: 'write', content: 'x' }])
    expect(overflow.project.files['one-too-many.txt']).toBeUndefined()
    expect(overflow.warnings.some((w) => w.includes('Limite'))).toBe(true)
  })

  it('re-resolves the preview entry when index.html is added', () => {
    const result = applyFileOps(createEmptyProject(), [{ path: 'index.html', op: 'write', content: '<html></html>' }])
    expect(result.project.previewEntry).toBe('index.html')
  })
})

describe('guessPreviewEntry', () => {
  it('prefers index.html, then public/index.html, then shallowest html', () => {
    expect(guessPreviewEntry(projectFromFiles([{ path: 'index.html', content: '' }, { path: 'a/b.html', content: '' }]))).toBe('index.html')
    expect(guessPreviewEntry(projectFromFiles([{ path: 'public/index.html', content: '' }]))).toBe('public/index.html')
    expect(guessPreviewEntry(projectFromFiles([{ path: 'pages/home.html', content: '' }]))).toBe('pages/home.html')
    expect(guessPreviewEntry(projectFromFiles([{ path: 'api/server.js', content: '' }]))).toBeUndefined()
  })
})

describe('summarizeProjectForPrompt', () => {
  it('lists files and includes content, truncating large files', () => {
    const big = 'x'.repeat(20_000)
    const project = projectFromFiles([
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'big.js', content: big },
    ])
    const summary = summarizeProjectForPrompt(project, { maxFileBytes: 5_000 })
    expect(summary).toContain('index.html')
    expect(summary).toContain('<h1>hi</h1>')
    expect(summary).toContain('truncado')
  })

  it('reports an empty project', () => {
    expect(summarizeProjectForPrompt(createEmptyProject())).toContain('projeto vazio')
  })
})

describe('projectToFiles', () => {
  it('serialises sorted and round-trips through projectFromFiles', () => {
    const project = projectFromFiles([{ path: 'b.txt', content: '2' }, { path: 'a.txt', content: '1' }])
    const files = projectToFiles(project)
    expect(files.map((f) => f.path)).toEqual(['a.txt', 'b.txt'])
  })
})
