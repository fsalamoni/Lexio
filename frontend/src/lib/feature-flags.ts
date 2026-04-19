const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const REDESIGN_V2_HOSTNAMES = new Set(['lexio-redesign-v2-44760.web.app'])

export function isTruthyFlag(value: string | null | undefined) {
  if (!value) return false
  return TRUTHY_VALUES.has(value.trim().toLowerCase())
}

export function isRedesignV2Hostname(hostname: string | null | undefined) {
  if (!hostname) return false
  return REDESIGN_V2_HOSTNAMES.has(hostname.trim().toLowerCase())
}

export function hasPreviewQueryFlagFromSearch(search: string) {
  const params = new URLSearchParams(search)
  return ['ui_v2', 'redesign_v2', 'labs'].some((key) => isTruthyFlag(params.get(key)))
}

export function isRedesignV2EnabledFromInputs(options: {
  isDev?: boolean
  envValue?: string | undefined
  search?: string
  hostname?: string | undefined
}) {
  return Boolean(options.isDev)
    || isTruthyFlag(options.envValue)
    || isRedesignV2Hostname(options.hostname)
    || hasPreviewQueryFlagFromSearch(options.search || '')
}

export function isRedesignV2DefaultHomeEnabledFromInputs(options: {
  homeValue?: string | undefined
  hostname?: string | undefined
}) {
  return isTruthyFlag(options.homeValue) || isRedesignV2Hostname(options.hostname)
}

export function isRedesignV2Enabled() {
  const search = typeof window === 'undefined' ? '' : window.location.search
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  return isRedesignV2EnabledFromInputs({
    isDev: import.meta.env.DEV,
    envValue: import.meta.env.VITE_REDESIGN_V2,
    search,
    hostname,
  })
}

export function isRedesignV2DefaultHomeEnabled() {
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname
  return isRedesignV2DefaultHomeEnabledFromInputs({
    homeValue: import.meta.env.VITE_REDESIGN_V2_HOME,
    hostname,
  })
}