import { coerceSpec, type DesignSpec } from './design-spec'
import { isDesignArtifactKind, type DesignArtifactKind } from './templates'
import { DEFAULT_DESIGN_THEME_ID, isDesignThemeId, type DesignThemeId } from './themes'

const WORKSPACES_KEY = 'lexio.design-studio.workspaces.v1'
const ACTIVE_WORKSPACE_KEY = 'lexio.design-studio.active-workspace.v1'
const MAX_RECENT_WORKSPACES = 8

export type DesignWorkspaceTarget = 'github' | 'local'

export interface DesignWorkspaceRepository {
  target: DesignWorkspaceTarget
  owner: string
  repo: string
  baseBranch: string
  targetDir: string
  localPath: string
}

export interface DesignStudioChatMessage {
  id: string
  role: 'user' | 'orchestrator'
  content: string
  createdAt: string
}

export interface DesignWorkspace {
  id: string
  name: string
  updatedAt: string
  repository: DesignWorkspaceRepository
  brief: string
  kind: DesignArtifactKind
  theme: DesignThemeId
  templateName: string
  spec: DesignSpec | null
  messages: DesignStudioChatMessage[]
}

export const DEFAULT_DESIGN_WORKSPACE_REPOSITORY: DesignWorkspaceRepository = {
  target: 'github',
  owner: '',
  repo: '',
  baseBranch: 'main',
  targetDir: 'design',
  localPath: '',
}

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function createWorkspaceId(): string {
  return `work-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDesignStudioChatMessage(
  role: DesignStudioChatMessage['role'],
  content: string,
): DesignStudioChatMessage {
  return {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

export function createDesignWorkspace(
  patch: Partial<DesignWorkspace> = {},
): DesignWorkspace {
  const now = new Date().toISOString()
  return {
    id: patch.id || createWorkspaceId(),
    name: patch.name || 'Novo trabalho',
    updatedAt: patch.updatedAt || now,
    repository: { ...DEFAULT_DESIGN_WORKSPACE_REPOSITORY, ...patch.repository },
    brief: patch.brief || '',
    kind: patch.kind || 'site',
    theme: patch.theme || DEFAULT_DESIGN_THEME_ID,
    templateName: patch.templateName || '',
    spec: patch.spec ?? null,
    messages: patch.messages || [],
  }
}

function coerceRepository(value: unknown): DesignWorkspaceRepository {
  if (!value || typeof value !== 'object') return DEFAULT_DESIGN_WORKSPACE_REPOSITORY
  const record = value as Record<string, unknown>
  const target = record.target === 'local' ? 'local' : 'github'
  return {
    target,
    owner: typeof record.owner === 'string' ? record.owner : '',
    repo: typeof record.repo === 'string' ? record.repo : '',
    baseBranch: typeof record.baseBranch === 'string' && record.baseBranch.trim() ? record.baseBranch : 'main',
    targetDir: typeof record.targetDir === 'string' ? record.targetDir : 'design',
    localPath: typeof record.localPath === 'string' ? record.localPath : '',
  }
}

function coerceMessage(value: unknown): DesignStudioChatMessage | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const role = record.role === 'user' || record.role === 'orchestrator' ? record.role : null
  const content = typeof record.content === 'string' ? record.content.trim() : ''
  if (!role || !content) return null
  return {
    id: typeof record.id === 'string' ? record.id : createWorkspaceId(),
    role,
    content: content.slice(0, 4000),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
  }
}

function coerceWorkspace(value: unknown): DesignWorkspace | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const spec = record.spec ? coerceSpec(record.spec) : null
  const kind = isDesignArtifactKind(record.kind) ? record.kind : spec?.kind || 'site'
  const theme = isDesignThemeId(record.theme) ? record.theme : spec?.theme || DEFAULT_DESIGN_THEME_ID
  const messages = Array.isArray(record.messages)
    ? record.messages.map(coerceMessage).filter((entry): entry is DesignStudioChatMessage => !!entry).slice(-24)
    : []
  return createDesignWorkspace({
    id: typeof record.id === 'string' ? record.id : createWorkspaceId(),
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 120) : spec?.title || 'Novo trabalho',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    repository: coerceRepository(record.repository),
    brief: typeof record.brief === 'string' ? record.brief : spec?.brief || '',
    kind,
    theme,
    templateName: typeof record.templateName === 'string' ? record.templateName : '',
    spec,
    messages,
  })
}

function readWorkspaces(): DesignWorkspace[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(WORKSPACES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(coerceWorkspace)
      .filter((entry): entry is DesignWorkspace => !!entry)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_RECENT_WORKSPACES)
  } catch {
    return []
  }
}

function writeWorkspaces(workspaces: DesignWorkspace[]): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces.slice(0, MAX_RECENT_WORKSPACES)))
    return true
  } catch {
    return false
  }
}

export function listDesignWorkspaces(): DesignWorkspace[] {
  return readWorkspaces()
}

export function getActiveDesignWorkspaceId(): string | null {
  const storage = getStorage()
  if (!storage) return null
  return storage.getItem(ACTIVE_WORKSPACE_KEY)
}

export function setActiveDesignWorkspaceId(id: string): void {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(ACTIVE_WORKSPACE_KEY, id)
}

export function loadDesignWorkspace(id: string): DesignWorkspace | null {
  return readWorkspaces().find((entry) => entry.id === id) || null
}

export function saveDesignWorkspace(workspace: DesignWorkspace): DesignWorkspace | null {
  const saved = createDesignWorkspace({
    ...workspace,
    name: workspace.spec?.title || workspace.brief.trim().slice(0, 80) || workspace.name || 'Novo trabalho',
    updatedAt: new Date().toISOString(),
    messages: workspace.messages.slice(-24),
  })
  const next = [saved, ...readWorkspaces().filter((entry) => entry.id !== saved.id)]
  return writeWorkspaces(next) ? saved : null
}
