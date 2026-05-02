import { buildResearchNotebookWorkbenchPath } from './research-notebook-routes'
import { buildRedesignPreviewPath } from './redesign-routes'

type WorkspaceRouteOptions = {
  preserveSearch?: string
  hash?: string | null
}

function appendHash(path: string, hash?: string | null) {
  if (!hash) return path
  return `${path}${hash.startsWith('#') ? hash : `#${hash}`}`
}

export function buildWorkspaceDashboardPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceDocumentsPath(options?: { preserveSearch?: string }) {
  return buildRedesignPreviewPath('/documents', {
    preserveSearch: options?.preserveSearch,
  })
}

export function buildWorkspaceNewDocumentPath(options?: {
  preserveSearch?: string
  request?: string | null
  type?: string | null
}) {
  return buildRedesignPreviewPath('/documents/new', {
    preserveSearch: options?.preserveSearch,
    params: {
      request: options?.request || undefined,
      type: options?.type || undefined,
    },
  })
}

export function buildWorkspaceDocumentDetailPath(documentId: string, options?: { preserveSearch?: string }) {
  return buildRedesignPreviewPath(`/documents/${documentId}`, {
    preserveSearch: options?.preserveSearch,
  })
}

export function buildWorkspaceDocumentEditPath(documentId: string, options?: { preserveSearch?: string }) {
  return buildRedesignPreviewPath(`/documents/${documentId}/edit`, {
    preserveSearch: options?.preserveSearch,
  })
}

export function buildWorkspaceUploadPath(options?: { preserveSearch?: string }) {
  return buildRedesignPreviewPath('/upload', {
    preserveSearch: options?.preserveSearch,
  })
}

export function buildWorkspaceChatPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/chat', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceThesesPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/theses', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceSettingsPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/settings', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceSettingsCostsPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/settings/costs', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceAdminPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/admin', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceAdminCostsPath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/admin/costs', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceProfilePath(options?: WorkspaceRouteOptions) {
  return appendHash(buildRedesignPreviewPath('/profile', {
    preserveSearch: options?.preserveSearch,
  }), options?.hash)
}

export function buildWorkspaceShellPath(pathname: string, options?: WorkspaceRouteOptions) {
  switch (pathname) {
    case '/':
      return buildWorkspaceDashboardPath(options)
    case '/documents':
      return buildWorkspaceDocumentsPath(options)
    case '/documents/new':
      return buildWorkspaceNewDocumentPath(options)
    case '/upload':
      return buildWorkspaceUploadPath(options)
    case '/chat':
      return buildWorkspaceChatPath(options)
    case '/theses':
      return buildWorkspaceThesesPath(options)
    case '/settings':
      return buildWorkspaceSettingsPath(options)
    case '/settings/costs':
      return buildWorkspaceSettingsCostsPath(options)
    case '/admin':
      return buildWorkspaceAdminPath(options)
    case '/admin/costs':
      return buildWorkspaceAdminCostsPath(options)
    case '/profile':
      return buildWorkspaceProfilePath(options)
    case '/notebook':
      return buildResearchNotebookWorkbenchPath({ preserveSearch: options?.preserveSearch })
    default:
      return appendHash(buildRedesignPreviewPath(pathname, {
        preserveSearch: options?.preserveSearch,
      }), options?.hash)
  }
}
