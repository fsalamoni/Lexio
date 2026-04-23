import { buildStepProgressPercent } from './pipeline-execution-contract'

export interface VideoPipelineStage {
  key: string
  label: string
  description: string
  category: 'llm' | 'media'
}

export interface VideoPipelineProgressMeta {
  stageMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
}

export interface VideoPipelineProgressState {
  step: number
  total: number
  phase: string
  agent: string
  percent: number
  stageLabel: string
  stageDescription?: string
  stageMeta?: string
  costUsd?: number
  durationMs?: number
  retryCount?: number
  usedFallback?: boolean
  fallbackFrom?: string
  category: 'llm' | 'media'
}

export const VIDEO_PIPELINE_STAGES: VideoPipelineStage[] = [
  { key: 'video_planejador', label: 'Planejador de Produção', description: 'Define a linha estratégica e o plano macro do vídeo.', category: 'llm' },
  { key: 'video_roteirista', label: 'Roteirista', description: 'Estrutura o roteiro principal e a narrativa do material.', category: 'llm' },
  { key: 'video_diretor_cena', label: 'Diretor de Cenas', description: 'Distribui a narrativa em cenas com intenção e continuidade.', category: 'llm' },
  { key: 'video_storyboarder', label: 'Storyboarder', description: 'Converte as cenas em orientação visual e enquadramentos.', category: 'llm' },
  { key: 'video_designer', label: 'Designer Visual', description: 'Refina direção de arte, visual prompts e consistência estética.', category: 'llm' },
  { key: 'video_compositor', label: 'Compositor de Vídeo', description: 'Monta a timeline, ritmo e composição final do pacote.', category: 'llm' },
  { key: 'video_narrador', label: 'Narrador', description: 'Prepara narração, timing e texto de voz.', category: 'llm' },
  { key: 'video_revisor', label: 'Revisor Final', description: 'Revisa coesão, clareza e problemas finais do pipeline.', category: 'llm' },
  { key: 'video_clip_planner', label: 'Planejador de Clips', description: 'Subdivide cenas em clips menores para mídia literal.', category: 'media' },
  { key: 'video_image_generator', label: 'Gerador de Imagens', description: 'Produz imagens dos clips com continuidade visual.', category: 'media' },
  { key: 'video_tts', label: 'Narrador TTS', description: 'Gera a narração em áudio para cada segmento.', category: 'media' },
]

const VIDEO_PIPELINE_STAGE_ALIASES: Record<string, VideoPipelineStage> = {
  clip_subdivision: {
    key: 'video_clip_planner',
    label: 'Planejador de Clips',
    description: 'Subdivide cenas em clips menores para mídia literal.',
    category: 'media',
  },
  media_image_generation: {
    key: 'video_image_generator',
    label: 'Gerador de Imagens',
    description: 'Produz imagens dos clips com continuidade visual.',
    category: 'media',
  },
  media_tts_generation: {
    key: 'video_tts',
    label: 'Narrador TTS',
    description: 'Gera a narração em áudio para cada segmento.',
    category: 'media',
  },
  media_video_clip_generation: {
    key: 'video_clip_planner',
    label: 'Gerador de Clipes',
    description: 'Gera clipes literais por parte de cada cena.',
    category: 'media',
  },
  media_soundtrack_generation: {
    key: 'media_soundtrack_generation',
    label: 'Trilha Sonora',
    description: 'Produz a base sonora procedural da produção.',
    category: 'media',
  },
  media_video_render: {
    key: 'media_video_render',
    label: 'Renderizador de Vídeo',
    description: 'Compõe o vídeo final com frames, áudio e exportação local.',
    category: 'media',
  },
}

export function getVideoPipelineStage(phase: string): VideoPipelineStage | undefined {
  return VIDEO_PIPELINE_STAGES.find(stage => stage.key === phase) || VIDEO_PIPELINE_STAGE_ALIASES[phase]
}

export function buildVideoPipelineProgress(
  step: number,
  total: number,
  phase: string,
  agent: string,
  meta?: VideoPipelineProgressMeta,
): VideoPipelineProgressState {
  const stage = getVideoPipelineStage(phase)
  const effectiveTotal = total > 0 ? total : VIDEO_PIPELINE_STAGES.length
  const safeStep = Math.max(0, Math.min(step, effectiveTotal))

  return {
    step: safeStep,
    total: effectiveTotal,
    phase,
    agent,
    percent: buildStepProgressPercent(safeStep, effectiveTotal),
    stageLabel: stage?.label ?? agent,
    stageDescription: stage?.description,
    stageMeta: meta?.stageMeta,
    costUsd: meta?.costUsd,
    durationMs: meta?.durationMs,
    retryCount: meta?.retryCount,
    usedFallback: meta?.usedFallback,
    fallbackFrom: meta?.fallbackFrom,
    category: stage?.category ?? 'llm',
  }
}