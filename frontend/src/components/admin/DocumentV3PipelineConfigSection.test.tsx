// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DocumentV3PipelineConfigSection from './DocumentV3PipelineConfigSection'

const documentV3SectionMocks = vi.hoisted(() => ({
  loadDocumentV3Models: vi.fn(),
  saveDocumentV3Models: vi.fn(),
  resetDocumentV3Models: vi.fn(),
  getDefaultDocumentV3ModelMap: vi.fn(),
}))

vi.mock('../../lib/model-config', () => ({
  DOCUMENT_V3_PIPELINE_AGENT_DEFS: [{ key: 'triagem' }, { key: 'redator' }],
  getDefaultDocumentV3ModelMap: documentV3SectionMocks.getDefaultDocumentV3ModelMap,
  loadDocumentV3Models: documentV3SectionMocks.loadDocumentV3Models,
  resetDocumentV3Models: documentV3SectionMocks.resetDocumentV3Models,
  saveDocumentV3Models: documentV3SectionMocks.saveDocumentV3Models,
}))

vi.mock('../AgentModelConfigCard', () => ({
  V2_AGENT_CONFIG_INFO_BOX_BASE: 'info-box',
  V2_AGENT_CONFIG_TONES: { teal: { infoBox: 'tone-teal' } },
  default: (props: {
    loadingMessage: string
    sections: Array<{ title: string; subtitle: string; afterContent: React.ReactNode }>
  }) => (
    <div>
      <p>{props.loadingMessage}</p>
      <p>{props.sections[0].title}</p>
      <p>{props.sections[0].subtitle}</p>
      <div>{props.sections[0].afterContent}</div>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
})

describe('DocumentV3PipelineConfigSection', () => {
  it('wires the v3 pipeline section metadata into AgentModelConfigCard', () => {
    render(<DocumentV3PipelineConfigSection />)

    expect(screen.getByText('Carregando configuração do Pipeline v3...')).toBeTruthy()
    expect(screen.getByText('Pipeline de Documentos v3 (4 fases)')).toBeTruthy()
    expect(screen.getByText('2 agentes configuráveis · supervisor coordena fases paralelas')).toBeTruthy()
    expect(screen.getByText(/Pipeline v3:/)).toBeTruthy()
    expect(screen.getByText(/mesma coleção/)).toBeTruthy()
  })
})