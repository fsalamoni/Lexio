/**
 * Artifact Components — specialized viewers for each artifact type.
 *
 * This barrel re-exports all artifact-related components and utilities.
 */

export { parseArtifactContent, isStructuredArtifactType } from './artifact-parsers'
export type {
  ParsedArtifact,
  ParsedPresentation,
  ParsedSlide,
  ParsedMindMap,
  MindMapNode,
  ParsedFlashcards,
  ParsedFlashcard,
  ParsedFlashcardCategory,
  ParsedQuiz,
  ParsedQuizQuestion,
  ParsedQuizOption,
  ParsedDataTable,
  ParsedTableColumn,
  ParsedInfographic,
  InfographicSection,
  InfographicStat,
  ParsedAudioScript,
  AudioSegment,
  ParsedVideoScript,
  VideoScene,
} from './artifact-parsers'
