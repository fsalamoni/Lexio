/**
 * Artifact Components — specialized viewers for each artifact type.
 *
 * This barrel re-exports all artifact-related components and utilities.
 */

// Parsers & types
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
  ParsedGeneratedVideo,
  GeneratedVideoScene,
} from './artifact-parsers'

// Viewers
export { default as ArtifactViewerModal } from './ArtifactViewerModal'
export { default as FlashcardViewer } from './FlashcardViewer'
export { default as QuizPlayer } from './QuizPlayer'
export { default as PresentationViewer } from './PresentationViewer'
export { default as MindMapViewer } from './MindMapViewer'
export { default as DataTableViewer } from './DataTableViewer'
export { default as InfographicRenderer } from './InfographicRenderer'
export { default as AudioScriptViewer } from './AudioScriptViewer'
export { default as VideoScriptViewer } from './VideoScriptViewer'
export { default as GeneratedVideoViewer } from './GeneratedVideoViewer'
export { default as ReportViewer } from './ReportViewer'
