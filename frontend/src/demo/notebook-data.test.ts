import { describe, expect, it } from 'vitest'
import { parseArtifactContent } from '../lib/artifact-parsers'
import { getDemoResearchNotebooks } from './notebook-data'

describe('demo notebook data', () => {
  it('ships a parseable legacy presentation artifact for v1 regression', () => {
    const [notebook] = getDemoResearchNotebooks()
    const artifact = notebook.artifacts.find((item) => item.type === 'apresentacao')

    expect(artifact).toBeTruthy()

    const parsed = parseArtifactContent('apresentacao', artifact!.content)
    expect(parsed.kind).toBe('presentation')
    if (parsed.kind !== 'presentation') return

    expect(parsed.data.slides).toHaveLength(2)
    expect(parsed.data.slides.every((slide) => slide.renderedImageUrl?.startsWith('data:image/svg+xml'))).toBe(true)
  })

  it('ships a parseable Presentation v2 artifact for local smoke tests', () => {
    const [notebook] = getDemoResearchNotebooks()
    const artifact = notebook.artifacts.find((item) => item.type === 'apresentacao_v2')

    expect(artifact).toBeTruthy()

    const parsed = parseArtifactContent('apresentacao_v2', artifact!.content)
    expect(parsed.kind).toBe('presentation_v2')
    if (parsed.kind !== 'presentation_v2') return

    expect(parsed.data.deck.schemaVersion).toBe('presentation_v2.1')
    expect(parsed.data.deck.slides.length).toBeGreaterThanOrEqual(4)
    expect(parsed.data.deck.assets.some((asset) => asset.type === 'chart' && asset.status === 'stored')).toBe(true)
    expect(parsed.data.deck.assets.some((asset) => asset.type === 'diagram' && asset.status === 'stored')).toBe(true)
    expect(parsed.data.deck.theme.designSystem?.layoutFamilies?.length).toBeGreaterThan(0)
    expect(parsed.data.deck.assets.some((asset) => asset.type === 'render' && typeof asset.qualityScore === 'number')).toBe(true)
    expect(parsed.data.deck.quality?.repairSummary?.length).toBeGreaterThan(0)
    expect(parsed.data.deck.quality?.multimodalAudit?.score).toBeGreaterThan(0)
    expect(parsed.data.deck.quality?.exportReadiness?.altTextCoverage).toBe(100)
    expect(parsed.data.deck.generationSpec.sourcePriority?.length).toBeGreaterThan(0)
    expect(notebook.llm_executions?.some((execution) => execution.source_type === 'presentation_pipeline_v2')).toBe(true)
    expect(notebook.llm_executions?.some((execution) => execution.phase === 'presentation_v2_packager')).toBe(true)
  })
})