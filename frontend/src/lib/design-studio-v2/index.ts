/**
 * Design Studio v2 — public engine surface.
 *
 * The conversational builder behind `FF_DESIGN_STUDIO_V2`. Import from here (not
 * from individual files) so the page depends on one stable module boundary.
 */

export * from './types'
export {
  createEmptyProject,
  projectFromFiles,
  projectToFiles,
  listProjectPaths,
  guessPreviewEntry,
  normalizeProjectPath,
  applyFileOps,
  totalProjectBytes,
  summarizeProjectForPrompt,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_PROJECT_BYTES,
} from './project'
export { buildPreviewHtml, type PreviewResult } from './preview'
export { parseOrchestratorResponse, extractFileOps } from './parser'
export { runStudioTurn } from './orchestrator'
export { buildStudioRuntime, buildAssetGenerator, type BuildRuntimeOptions } from './runtime'
export {
  createLocalConnector,
  createGithubConnector,
  createGithubConnectorFromConfig,
  type RepoConnector,
  type RepoApplyOptions,
  type RepoApplyResult,
  type RepoImportResult,
} from './repo-connector'
