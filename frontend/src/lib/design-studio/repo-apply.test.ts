import { describe, expect, it } from 'vitest'
import type { DesignSpec } from './design-spec'
import {
  buildDesignBranchName,
  buildDesignCommitFiles,
  defaultDesignCommitMessage,
  describeDesignApplyPlan,
  designRepoFileName,
  isProtectedDesignBranch,
  sanitizeRepoDir,
  slugifyDesign,
} from './repo-apply'

const spec: DesignSpec = {
  brief: 'Landing page para escritório trabalhista',
  kind: 'site',
  theme: 'studio',
  title: 'Escritório Trabalhista',
  points: ['Hero', 'Diferenciais', 'Contato'],
}

describe('repo-apply pure helpers', () => {
  it('slugifies titles to ascii and protects branch names', () => {
    expect(slugifyDesign('Ação Rápida!')).toBe('acao-rapida')
    expect(slugifyDesign('')).toBe('design')
    expect(isProtectedDesignBranch('main')).toBe(true)
    expect(isProtectedDesignBranch('MASTER')).toBe(true)
    expect(isProtectedDesignBranch('design/x')).toBe(false)
  })

  it('builds a non-protected, timestamped feature branch', () => {
    const branch = buildDesignBranchName('Escritório Trabalhista', new Date('2026-07-03T18:55:03Z'))
    expect(branch).toBe('design/escritorio-trabalhista-20260703-185503')
    expect(isProtectedDesignBranch(branch)).toBe(false)
  })

  it('sanitizes target directories and blocks path traversal', () => {
    expect(sanitizeRepoDir('/src//design/')).toBe('src/design')
    expect(sanitizeRepoDir('../../etc')).toBe('etc')
    expect(sanitizeRepoDir('')).toBe('')
  })

  it('maps formats to stable file names', () => {
    expect(designRepoFileName(spec, 'html')).toBe('escritorio-trabalhista-site.html')
    expect(designRepoFileName(spec, 'json')).toBe('escritorio-trabalhista-site.lexio-design.json')
    expect(designRepoFileName(spec, 'markdown')).toBe('escritorio-trabalhista-site.md')
  })

  it('builds commit files in stable order under a sanitized directory', () => {
    const files = buildDesignCommitFiles(spec, { dir: 'designs/', formats: ['markdown', 'html'] })
    expect(files.map((file) => file.path)).toEqual([
      'designs/escritorio-trabalhista-site.html',
      'designs/escritorio-trabalhista-site.md',
    ])
    expect(files[0].content).toContain('<!doctype html>')
    expect(files[1].content).toContain('# Escritório Trabalhista')
  })

  it('returns no files when no format is selected', () => {
    expect(buildDesignCommitFiles(spec, { formats: [] })).toEqual([])
  })

  it('derives a descriptive default commit message', () => {
    expect(defaultDesignCommitMessage(spec)).toBe('Design Studio: Escritório Trabalhista (site)')
  })

  it('produces an offline apply plan preview', () => {
    const plan = describeDesignApplyPlan(spec, {
      owner: 'octo',
      repo: 'site',
      baseBranch: 'main',
      dir: 'design',
      formats: ['html', 'json'],
      now: new Date('2026-07-03T18:55:03Z'),
    })
    expect(plan.owner).toBe('octo')
    expect(plan.branch).toBe('design/escritorio-trabalhista-20260703-185503')
    expect(plan.openPr).toBe(true)
    expect(plan.prTitle).toBe('Design Studio: Escritório Trabalhista (site)')
    expect(plan.files).toEqual([
      'design/escritorio-trabalhista-site.html',
      'design/escritorio-trabalhista-site.lexio-design.json',
    ])
  })
})
