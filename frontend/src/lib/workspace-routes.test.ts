import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceAdminCostsPath,
  buildWorkspaceAdminPath,
  buildWorkspaceDashboardPath,
  buildWorkspaceDocumentDetailPath,
  buildWorkspaceDocumentEditPath,
  buildWorkspaceDocumentsPath,
  buildWorkspaceNewDocumentPath,
  buildWorkspaceProfileClassicPath,
  buildWorkspaceProfilePath,
  buildWorkspaceSettingsCostsPath,
  buildWorkspaceSettingsPath,
  buildWorkspaceShellPath,
  buildWorkspaceThesesPath,
  buildWorkspaceUploadPath,
} from './workspace-routes'

describe('workspace-routes', () => {
  it('builds document workspace links with preview params preserved', () => {
    expect(buildWorkspaceDocumentsPath({ preserveSearch: '?labs=1' })).toBe('/documents?labs=1')
    expect(buildWorkspaceDocumentDetailPath('doc-1', { preserveSearch: '?redesign_v2=1' })).toBe('/documents/doc-1?redesign_v2=1')
    expect(buildWorkspaceDocumentEditPath('doc-1', { preserveSearch: '?ui_v2=1' })).toBe('/documents/doc-1/edit?ui_v2=1')
  })

  it('builds new document links with optional prefill params', () => {
    expect(buildWorkspaceNewDocumentPath({ preserveSearch: '?labs=1' })).toBe('/documents/new?labs=1')
    expect(buildWorkspaceNewDocumentPath({
      preserveSearch: '?labs=1',
      type: 'parecer',
      request: 'Foco prático',
    })).toBe('/documents/new?labs=1&request=Foco+pr%C3%A1tico&type=parecer')
  })

  it('builds upload links with preview params preserved', () => {
    expect(buildWorkspaceUploadPath({ preserveSearch: '?redesign_v2=1' })).toBe('/upload?redesign_v2=1')
  })

  it('builds governance and profile links with preview params preserved', () => {
    expect(buildWorkspaceDashboardPath({ preserveSearch: '?labs=1' })).toBe('/?labs=1')
    expect(buildWorkspaceThesesPath({ preserveSearch: '?labs=1' })).toBe('/theses?labs=1')
    expect(buildWorkspaceSettingsPath({ preserveSearch: '?ui_v2=1', hash: 'section_model_catalog' })).toBe('/settings?ui_v2=1#section_model_catalog')
    expect(buildWorkspaceSettingsCostsPath({ preserveSearch: '?redesign_v2=1' })).toBe('/settings/costs?redesign_v2=1')
    expect(buildWorkspaceAdminPath({ preserveSearch: '?labs=1' })).toBe('/admin?labs=1')
    expect(buildWorkspaceAdminCostsPath({ preserveSearch: '?labs=1' })).toBe('/admin/costs?labs=1')
    expect(buildWorkspaceProfilePath({ preserveSearch: '?labs=1' })).toBe('/profile?labs=1')
    expect(buildWorkspaceProfileClassicPath({ preserveSearch: '?labs=1' })).toBe('/profile/classic?labs=1')
  })

  it('resolves common shell links through one centralized builder', () => {
    expect(buildWorkspaceShellPath('/notebook', { preserveSearch: '?labs=1' })).toBe('/notebook?labs=1')
    expect(buildWorkspaceShellPath('/settings', { preserveSearch: '?labs=1' })).toBe('/settings?labs=1')
    expect(buildWorkspaceShellPath('/labs/profile-v2', { preserveSearch: '?labs=1' })).toBe('/labs/profile-v2?labs=1')
  })
})