import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceAdminCostsPath,
  buildWorkspaceAdminPath,
  buildWorkspaceChatPath,
  buildWorkspaceDashboardPath,
  buildWorkspaceDocumentDetailPath,
  buildWorkspaceDocumentEditPath,
  buildWorkspaceDocumentsPath,
  buildWorkspaceNewDocumentPath,
  buildWorkspaceProfilePath,
  buildWorkspaceSettingsCostsPath,
  buildWorkspaceSettingsPath,
  buildWorkspaceShellPath,
  buildWorkspaceThesesPath,
  buildWorkspaceUploadPath,
} from './workspace-routes'

describe('workspace-routes', () => {
  it('builds document workspace links with preview params preserved', () => {
    expect(buildWorkspaceDocumentsPath({ preserveSearch: '?labs=1' })).toBe('/documents')
    expect(buildWorkspaceDocumentDetailPath('doc-1', { preserveSearch: '?redesign_v2=1' })).toBe('/documents/doc-1')
    expect(buildWorkspaceDocumentEditPath('doc-1', { preserveSearch: '?ui_v2=1' })).toBe('/documents/doc-1/edit')
  })

  it('builds new document links with optional prefill params', () => {
    expect(buildWorkspaceNewDocumentPath({ preserveSearch: '?labs=1' })).toBe('/documents/new')
    expect(buildWorkspaceNewDocumentPath({
      preserveSearch: '?labs=1',
      type: 'parecer',
      request: 'Foco prático',
    })).toBe('/documents/new?request=Foco+pr%C3%A1tico&type=parecer')
  })

  it('builds upload links with preview params preserved', () => {
    expect(buildWorkspaceUploadPath({ preserveSearch: '?redesign_v2=1' })).toBe('/upload')
  })

  it('builds governance and profile links with preview params preserved', () => {
    expect(buildWorkspaceDashboardPath({ preserveSearch: '?labs=1' })).toBe('/')
    expect(buildWorkspaceThesesPath({ preserveSearch: '?labs=1' })).toBe('/theses')
    expect(buildWorkspaceSettingsPath({ preserveSearch: '?ui_v2=1', hash: 'section_model_catalog' })).toBe('/settings#section_model_catalog')
    expect(buildWorkspaceSettingsCostsPath({ preserveSearch: '?redesign_v2=1' })).toBe('/settings/costs')
    expect(buildWorkspaceChatPath({ preserveSearch: '?labs=1' })).toBe('/chat')
    expect(buildWorkspaceAdminPath({ preserveSearch: '?labs=1' })).toBe('/admin')
    expect(buildWorkspaceAdminCostsPath({ preserveSearch: '?labs=1' })).toBe('/admin/costs')
    expect(buildWorkspaceProfilePath({ preserveSearch: '?labs=1' })).toBe('/profile')
  })

  it('resolves common shell links through one centralized builder', () => {
    expect(buildWorkspaceShellPath('/notebook', { preserveSearch: '?labs=1' })).toBe('/notebook')
    expect(buildWorkspaceShellPath('/chat', { preserveSearch: '?labs=1' })).toBe('/chat')
    expect(buildWorkspaceShellPath('/settings', { preserveSearch: '?labs=1' })).toBe('/settings')
    expect(buildWorkspaceShellPath('/labs/profile-v2', { preserveSearch: '?labs=1' })).toBe('/labs/profile-v2')
  })
})
