import { buildRedesignPreviewPath } from './redesign-routes'
import type { StudioArtifactType } from './firestore-service'

export const RESEARCH_NOTEBOOK_LEGACY_TABS = ['overview', 'chat', 'sources', 'studio', 'artifacts'] as const
export type ResearchNotebookLegacyTab = (typeof RESEARCH_NOTEBOOK_LEGACY_TABS)[number]

export const RESEARCH_NOTEBOOK_V2_SECTIONS = ['overview', 'chat', 'sources', 'studio', 'artifacts'] as const
export type ResearchNotebookV2Section = (typeof RESEARCH_NOTEBOOK_V2_SECTIONS)[number]

function normalizeValue(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ''
}

export function parseResearchNotebookLegacyTab(value: string | null | undefined): ResearchNotebookLegacyTab {
  const normalized = normalizeValue(value)
  if (RESEARCH_NOTEBOOK_LEGACY_TABS.includes(normalized as ResearchNotebookLegacyTab)) {
    return normalized as ResearchNotebookLegacyTab
  }
  return 'overview'
}

export function parseResearchNotebookV2Section(value: string | null | undefined): ResearchNotebookV2Section {
  const normalized = normalizeValue(value)
  if (RESEARCH_NOTEBOOK_V2_SECTIONS.includes(normalized as ResearchNotebookV2Section)) {
    return normalized as ResearchNotebookV2Section
  }
  return 'overview'
}

export function buildResearchNotebookWorkbenchPath(options?: {
  notebookId?: string | null
  section?: ResearchNotebookV2Section | null
  preserveSearch?: string
}) {
  const notebookId = options?.notebookId?.trim()

  return buildRedesignPreviewPath('/notebook', {
    preserveSearch: options?.preserveSearch,
    params: notebookId
      ? {
          open: notebookId,
          section: options?.section && options.section !== 'overview' ? options.section : null,
        }
      : {
          open: null,
          section: null,
        },
  })
}

export function buildResearchNotebookV2Path(options?: {
  notebookId?: string | null
  section?: ResearchNotebookV2Section | null
  preserveSearch?: string
}) {
  const notebookId = options?.notebookId?.trim()

  return buildRedesignPreviewPath('/notebook', {
    preserveSearch: options?.preserveSearch,
    params: notebookId
      ? {
          open: notebookId,
          section: options?.section && options.section !== 'overview' ? options.section : null,
        }
      : {
          open: null,
          section: null,
        },
  })
}