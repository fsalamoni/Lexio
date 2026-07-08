/**
 * Design Studio v2 — the virtual project (a normalised map of files) and the
 * pure operations over it: apply file ops, list, summarise for the prompt and
 * pick a preview entry point. All functions are pure and side-effect free so
 * they are trivially testable and safe to run in the browser.
 */

import type { DesignStudioFile } from '../firestore-types'
import type { DesignStudioFileOp, DesignStudioProject } from './types'

/** Hard caps so a runaway model can never blow past Firestore's 1MB doc limit. */
export const MAX_FILES = 200
export const MAX_FILE_BYTES = 200_000
export const MAX_PROJECT_BYTES = 900_000

const PREVIEW_ENTRY_CANDIDATES = [
  'index.html',
  'public/index.html',
  'src/index.html',
  'dist/index.html',
  'app/index.html',
]

/** Normalise a repo-relative path: strip leading `./` and `/`, collapse `//`. */
export function normalizeProjectPath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
}

export function createEmptyProject(): DesignStudioProject {
  return { files: {}, previewEntry: undefined }
}

/** Build a project from a persisted file list. */
export function projectFromFiles(files: DesignStudioFile[] | undefined, previewEntry?: string): DesignStudioProject {
  const project = createEmptyProject()
  for (const file of files ?? []) {
    const path = normalizeProjectPath(file.path)
    if (!path) continue
    project.files[path] = { path, content: String(file.content ?? ''), binary: Boolean(file.binary) }
  }
  project.previewEntry = previewEntry ? normalizeProjectPath(previewEntry) : guessPreviewEntry(project)
  return project
}

/** Serialise a project to a persisted file list (sorted for stable diffs). */
export function projectToFiles(project: DesignStudioProject): DesignStudioFile[] {
  return Object.values(project.files)
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, content: file.content, ...(file.binary ? { binary: true } : {}) }))
}

export function listProjectPaths(project: DesignStudioProject): string[] {
  return Object.keys(project.files).sort((a, b) => a.localeCompare(b))
}

export function totalProjectBytes(project: DesignStudioProject): number {
  let total = 0
  for (const file of Object.values(project.files)) total += file.content.length
  return total
}

/** Pick a reasonable HTML entry point for the live preview, if one exists. */
export function guessPreviewEntry(project: DesignStudioProject): string | undefined {
  for (const candidate of PREVIEW_ENTRY_CANDIDATES) {
    if (project.files[candidate]) return candidate
  }
  // Any top-level .html file, preferring the shallowest path.
  const htmlFiles = Object.keys(project.files)
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
  return htmlFiles[0]
}

export interface ApplyFileOpsResult {
  project: DesignStudioProject
  changes: Array<{ path: string; op: 'create' | 'update' | 'delete'; summary?: string }>
  /** Non-fatal issues (skipped ops) surfaced to the user. */
  warnings: string[]
}

/**
 * Apply a list of file operations to a project, returning a NEW project (the
 * input is never mutated) plus a change log and any warnings. Enforces the
 * size/file-count caps so persistence stays within Firestore limits.
 */
export function applyFileOps(project: DesignStudioProject, ops: DesignStudioFileOp[] | undefined): ApplyFileOpsResult {
  const nextFiles: Record<string, DesignStudioFile> = { ...project.files }
  const changes: ApplyFileOpsResult['changes'] = []
  const warnings: string[] = []

  for (const op of ops ?? []) {
    const path = normalizeProjectPath(op.path)
    if (!path) {
      warnings.push('Uma operação de arquivo foi ignorada por não ter caminho válido.')
      continue
    }

    if (op.op === 'delete') {
      if (nextFiles[path]) {
        delete nextFiles[path]
        changes.push({ path, op: 'delete', summary: op.summary })
      }
      continue
    }

    // write (create or update)
    const content = typeof op.content === 'string' ? op.content : ''
    if (content.length > MAX_FILE_BYTES) {
      warnings.push(`"${path}" excedeu o limite de ${Math.round(MAX_FILE_BYTES / 1000)} KB e foi truncado.`)
    }
    const existed = Boolean(nextFiles[path])
    if (!existed && Object.keys(nextFiles).length >= MAX_FILES) {
      warnings.push(`Limite de ${MAX_FILES} arquivos atingido; "${path}" não foi criado.`)
      continue
    }
    nextFiles[path] = {
      path,
      content: content.slice(0, MAX_FILE_BYTES),
      ...(op.binary ? { binary: true } : {}),
    }
    changes.push({ path, op: existed ? 'update' : 'create', summary: op.summary })
  }

  // Enforce the total-size cap by dropping the largest most-recently-unused
  // files last — but keep it simple and predictable: warn if over budget.
  const nextProject: DesignStudioProject = { files: nextFiles, previewEntry: project.previewEntry }
  if (totalProjectBytes(nextProject) > MAX_PROJECT_BYTES) {
    warnings.push('O projeto ficou grande demais para ser salvo por completo; conteúdos foram preservados em memória, mas a persistência pode ser parcial.')
  }

  // Re-resolve the preview entry if it disappeared or was never set.
  if (!nextProject.previewEntry || !nextProject.files[nextProject.previewEntry]) {
    nextProject.previewEntry = guessPreviewEntry(nextProject)
  }

  return { project: nextProject, changes, warnings }
}

/**
 * Build a compact, LLM-friendly summary of the current project: the file tree
 * plus the (truncated) contents of the most relevant files. Keeps the prompt
 * bounded regardless of project size.
 */
export function summarizeProjectForPrompt(project: DesignStudioProject, options?: { maxFileBytes?: number; maxTotalBytes?: number }): string {
  const paths = listProjectPaths(project)
  if (paths.length === 0) return '(projeto vazio — nenhum arquivo ainda)'

  const maxFileBytes = options?.maxFileBytes ?? 6_000
  const maxTotalBytes = options?.maxTotalBytes ?? 45_000

  const tree = paths.map((path) => `- ${path} (${project.files[path].content.length} bytes${project.files[path].binary ? ', binário' : ''})`).join('\n')

  // Prioritise the preview entry, then non-binary source files by ascending size.
  const ordered = paths
    .filter((path) => !project.files[path].binary)
    .sort((a, b) => {
      if (a === project.previewEntry) return -1
      if (b === project.previewEntry) return 1
      return project.files[a].content.length - project.files[b].content.length
    })

  const sections: string[] = []
  let total = 0
  for (const path of ordered) {
    if (total >= maxTotalBytes) {
      sections.push(`\n// … demais arquivos omitidos do contexto para economizar tokens (${ordered.length - sections.length} restantes)`)
      break
    }
    const raw = project.files[path].content
    const clipped = raw.length > maxFileBytes ? `${raw.slice(0, maxFileBytes)}\n// … [truncado, ${raw.length} bytes no total]` : raw
    sections.push(`----- ${path} -----\n${clipped}`)
    total += clipped.length
  }

  return `ÁRVORE DE ARQUIVOS (${paths.length}):\n${tree}\n\nCONTEÚDO DOS ARQUIVOS:\n${sections.join('\n\n')}`
}
