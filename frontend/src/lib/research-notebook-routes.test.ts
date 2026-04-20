import { describe, expect, it } from 'vitest'
import {
  buildResearchNotebookWorkbenchPath,
  buildResearchNotebookV2Path,
  parseResearchNotebookLegacyTab,
  parseResearchNotebookV2Section,
} from './research-notebook-routes'

describe('research-notebook-routes', () => {
  it('parses only supported legacy tabs', () => {
    expect(parseResearchNotebookLegacyTab('chat')).toBe('chat')
    expect(parseResearchNotebookLegacyTab('CHAT')).toBe('chat')
    expect(parseResearchNotebookLegacyTab('invalid')).toBe('overview')
  })

  it('parses only supported V2 sections', () => {
    expect(parseResearchNotebookV2Section('chat')).toBe('chat')
    expect(parseResearchNotebookV2Section('sources')).toBe('sources')
    expect(parseResearchNotebookV2Section('studio')).toBe('studio')
    expect(parseResearchNotebookV2Section('BRIDGE')).toBe('overview')
    expect(parseResearchNotebookV2Section(null)).toBe('overview')
  })

  it('builds primary notebook workbench links with preview params preserved', () => {
    const path = buildResearchNotebookWorkbenchPath({
      notebookId: 'nb-2',
      section: 'studio',
      preserveSearch: '?labs=1',
    })

    expect(path).toBe('/notebook?open=nb-2&section=studio')
  })

  it('builds notebook V2 deep links with preview params preserved', () => {
    const path = buildResearchNotebookV2Path({
      notebookId: 'nb-3',
      section: 'sources',
      preserveSearch: '?redesign_v2=1',
    })

    expect(path).toBe('/notebook?open=nb-3&section=sources')
  })
})