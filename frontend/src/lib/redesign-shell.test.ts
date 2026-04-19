import { describe, expect, it } from 'vitest'
import { shouldUseRedesignWorkspaceShell } from './redesign-shell'

describe('redesign-shell', () => {
  it('keeps the classic shell when the redesign gate is off', () => {
    expect(shouldUseRedesignWorkspaceShell('/notebook', false)).toBe(false)
    expect(shouldUseRedesignWorkspaceShell('/labs/dashboard-v2', false)).toBe(false)
    expect(shouldUseRedesignWorkspaceShell('/documents', false)).toBe(false)
    expect(shouldUseRedesignWorkspaceShell('/settings', false)).toBe(false)
  })

  it('uses the redesign shell for labs, notebook, documents, governance, and upload routes', () => {
    expect(shouldUseRedesignWorkspaceShell('/labs/dashboard-v2', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/labs/notebook-v2', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/notebook', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/profile', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/documents', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/documents/new', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/documents/doc-1', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/documents/doc-1/edit', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/theses', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/settings', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/settings/costs', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/admin', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/admin/costs', true)).toBe(true)
    expect(shouldUseRedesignWorkspaceShell('/upload', true)).toBe(true)
  })

  it('keeps explicit classic fallback routes on the legacy shell', () => {
    expect(shouldUseRedesignWorkspaceShell('/notebook/classic', true)).toBe(false)
    expect(shouldUseRedesignWorkspaceShell('/profile/classic', true)).toBe(false)
  })
})