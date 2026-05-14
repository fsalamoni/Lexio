/**
 * Constants and type definitions for the Research Notebook feature.
 * Extracted from ResearchNotebook.tsx for modularity.
 */

import type { StudioArtifactType } from '../../lib/firestore-service'
import type { UsageFunctionKey } from '../../lib/cost-analytics'
import type React from 'react'
export { ACERVO_TRAIL_STEPS, STUDIO_SPECIALIST_LABEL } from '../../lib/modules/notebook'

// ── Source & context limits ───────────────────────────────────────────────────

/** Max characters stored per source text content (500 K — covers most legal documents entirely) */
export const MAX_SOURCE_TEXT_LENGTH = 500_000
/** Max characters per source included in LLM context */
export const MAX_CONTEXT_TEXT_LENGTH = 15_000
/** Max messages from conversation to include as context */
export const MAX_CONVERSATION_CONTEXT_MESSAGES = 20
/** Max messages from conversation included in studio prompts */
export const MAX_STUDIO_CONTEXT_MESSAGES = 10
/** Max characters of conversation context included in studio prompts */
export const MAX_STUDIO_CONTEXT_CHARS = 5_000
/** Max visible length for suggestion button labels */
export const MAX_SUGGESTION_LABEL_LENGTH = 60
/** Max chars from web search snippets injected into chat context */
export const MAX_WEB_SEARCH_CHARS = 3_000
/** Max chars for deep external research source */
export const MAX_DEEP_EXTERNAL_TEXT_CHARS = 12_000
/** Max chars per fetched external page used in deep synthesis prompt */
export const MAX_DEEP_EXTERNAL_SOURCE_SNIPPET_CHARS = 6_000
/** Min chars in source text_content to be considered indexed */
export const MIN_SOURCE_CHARS = 20
export const ENABLE_LITERAL_MEDIA_AUTOGENERATION =
  (import.meta.env.VITE_ENABLE_LITERAL_MEDIA_AUTOGENERATION as string | undefined) !== 'false'

// ── Artifact definitions ──────────────────────────────────────────────────────

export type ArtifactDef = { type: StudioArtifactType; label: string; icon: React.ElementType; description: string }
export type ArtifactCategory = { label: string; emoji: string; color: string; items: ArtifactDef[] }

/** Artifact types that get a review/edit step before saving */
export const REVIEWABLE_ARTIFACT_TYPES: StudioArtifactType[] = ['video_script', 'audio_script', 'apresentacao', 'apresentacao_v2']

/** Map media artifact types to the correct cost function key */
export const ARTIFACT_COST_KEY: Partial<Record<StudioArtifactType, UsageFunctionKey>> = {
  video_script: 'video_pipeline',
  video_production: 'video_pipeline',
  audio_script: 'audio_pipeline',
  apresentacao: 'presentation_pipeline',
  apresentacao_v2: 'presentation_pipeline_v2',
}

// ── Trail step definitions ────────────────────────────────────────────────────

/** Human-readable agent labels for error messages */
export const AGENT_LABELS: Record<string, string> = {
  notebook_pesquisador: 'Pesquisador de Fontes',
  notebook_analista: 'Analista de Conhecimento',
  notebook_assistente: 'Assistente Conversacional',
  studio_pesquisador: 'Pesquisador do Estúdio',
  studio_escritor: 'Escritor',
  studio_roteirista: 'Roteirista',
  studio_visual: 'Designer Visual',
  studio_revisor: 'Revisor de Qualidade',
  presentation_v2_orchestrator: 'Apresentação v2: Orquestrador',
  presentation_v2_context_auditor: 'Apresentação v2: Auditor de Contexto',
  presentation_v2_clarifier: 'Apresentação v2: Clarificador',
  presentation_v2_narrative_planner: 'Apresentação v2: Planejador Narrativo',
  presentation_v2_researcher: 'Apresentação v2: Pesquisador',
  presentation_v2_content_architect: 'Apresentação v2: Arquiteto de Conteúdo',
  presentation_v2_slide_writer: 'Apresentação v2: Redator de Slides',
  presentation_v2_visual_director: 'Apresentação v2: Diretor Visual',
  presentation_v2_data_diagrammer: 'Apresentação v2: Dados e Diagramas',
  presentation_v2_asset_planner: 'Apresentação v2: Planejador de Assets',
  presentation_v2_image_generator: 'Apresentação v2: Gerador de Imagens',
  presentation_v2_audio_director: 'Apresentação v2: Diretor de Áudio',
  presentation_v2_tts: 'Apresentação v2: Narrador TTS',
  presentation_v2_video_director: 'Apresentação v2: Diretor de Vídeo',
  presentation_v2_video_generator: 'Apresentação v2: Gerador de Clipes',
  presentation_v2_reviewer: 'Apresentação v2: Revisor Multimodal',
  presentation_v2_packager: 'Apresentação v2: Empacotador',
  nb_acervo_triagem: 'Triagem de Acervo',
  nb_acervo_buscador: 'Buscador de Acervo',
  nb_acervo_analista: 'Analista de Acervo',
  nb_acervo_curador: 'Curador de Fontes',
}

// ── Source type labels ────────────────────────────────────────────────────────

export type SourceTypeLabelDef = { label: string; icon: React.ElementType }
