import { isTruthyFlag } from './feature-flags'

const REDESIGN_PREVIEW_QUERY_KEYS = ['ui_v2', 'redesign_v2', 'labs'] as const

export function getRedesignPreviewParams(search?: string) {
  const current = new URLSearchParams(search || '')
  const next = new URLSearchParams()

  for (const key of REDESIGN_PREVIEW_QUERY_KEYS) {
    const value = current.get(key)
    if (isTruthyFlag(value)) {
      next.set(key, value || '1')
    }
  }

  return next
}

export function buildRedesignPreviewPath(
  pathname: string,
  options?: {
    preserveSearch?: string
    params?: Record<string, string | null | undefined>
  },
) {
  const next = new URLSearchParams()

  for (const [key, value] of Object.entries(options?.params || {})) {
    if (value) {
      next.set(key, value)
    }
  }

  const query = next.toString()
  return query ? `${pathname}?${query}` : pathname
}