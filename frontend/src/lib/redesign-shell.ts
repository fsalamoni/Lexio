import { matchPath } from 'react-router-dom'

export function shouldUseRedesignWorkspaceShell(pathname: string, redesignV2Enabled: boolean) {
  if (!redesignV2Enabled) return false
  if (pathname === '/notebook/classic' || pathname === '/profile/classic') return false

  return pathname === '/'
    || pathname === '/notebook'
    || pathname === '/profile'
    || pathname === '/theses'
    || pathname === '/upload'
    || Boolean(matchPath('/documents', pathname))
    || Boolean(matchPath('/documents/*', pathname))
    || Boolean(matchPath('/settings', pathname))
    || Boolean(matchPath('/settings/*', pathname))
    || Boolean(matchPath('/admin', pathname))
    || Boolean(matchPath('/admin/*', pathname))
    || Boolean(matchPath('/labs/*', pathname))
}