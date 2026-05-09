// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoGenerationCostModal from './VideoGenerationCostModal'

vi.mock('./DraggablePanel', () => ({
  default: ({ title, children }: any) => <section><h2>{title}</h2>{children}</section>,
}))

vi.mock('../lib/video-generation-pipeline', () => ({
  estimateVideoGenerationCost: vi.fn(() => ({
    estimatedTokens: 12000,
    estimatedCostUsd: 4.5,
    mediaCostUsd: 2.1,
    breakdown: [
      {
        agent: 'video_planejador',
        label: 'Planejador',
        estimatedTokens: 5000,
        estimatedCostUsd: 1.2,
      },
    ],
    mediaBreakdown: [
      { type: 'image', label: 'Imagens', count: 4, estimatedCostUsd: 1.1 },
      { type: 'audio', label: 'Narração', count: 2, estimatedCostUsd: 1.0 },
    ],
  })),
}))

vi.mock('../lib/video-pipeline-progress', () => ({
  VIDEO_PIPELINE_STAGES: [
    { key: 'video_planejador', label: 'Planejador', category: 'text' },
    { key: 'video_clip_generation', label: 'Clips', category: 'media' },
    { key: 'video_tts', label: 'TTS', category: 'media' },
  ],
}))

afterEach(() => {
  cleanup()
})

describe('VideoGenerationCostModal', () => {
  it('shows estimated costs, reveals recommendation details, allows editing the script, and triggers generation', () => {
    const onGenerate = vi.fn()

    render(
      <VideoGenerationCostModal
        scriptContent="roteiro original"
        topic="Tema do vídeo"
        onGenerate={onGenerate}
        onSkip={() => {}}
        isGenerating={false}
      />,
    )

    expect(screen.getByText(/Plano de Produção/)).toBeTruthy()
    expect(screen.getByText('Geração completa de vídeo com mídia real')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Modelos recomendados/i }))
    expect(screen.getByText(/Claude Sonnet/)).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: /Roteiro/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }))
    fireEvent.change(screen.getByPlaceholderText('Edite o roteiro do vídeo aqui...'), { target: { value: 'roteiro editado' } })

    expect(screen.getByText('Editado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Executar Fase 1/i }))

    expect(onGenerate).toHaveBeenCalledWith('roteiro editado', { resumeFromCheckpoint: false })
  })

  it('shows the pipeline progress state while generation is running', () => {
    render(
      <VideoGenerationCostModal
        scriptContent="roteiro original"
        topic="Tema do vídeo"
        onGenerate={() => {}}
        onSkip={() => {}}
        isGenerating
        generationProgress={{
          step: 2,
          total: 3,
          percent: 50,
          agent: 'video_clip_generation',
          stageLabel: 'Clips',
          stageDescription: 'Gerando clips',
          stageMeta: 'Cena 2',
        } as any}
      />,
    )

    expect(screen.getByText(/Fase 1 em execução/)).toBeTruthy()
    expect(screen.getByText('Etapa 2 de 3')).toBeTruthy()
    expect(screen.getByText('50% concluído')).toBeTruthy()
    expect(screen.getByText(/Gerando clips/)).toBeTruthy()
    expect(screen.getAllByText(/Cena 2/).length).toBe(2)
  })
})