import { describe, expect, it } from 'vitest'
import {
  hasPreviewQueryFlagFromSearch,
  isRedesignV2DefaultHomeEnabledFromInputs,
  isRedesignV2EnabledFromInputs,
  isRedesignV2Hostname,
  isTruthyFlag,
} from './feature-flags'

describe('feature-flags', () => {
  it('treats common truthy values as enabled', () => {
    expect(isTruthyFlag('true')).toBe(true)
    expect(isTruthyFlag(' Enabled ')).toBe(true)
    expect(isTruthyFlag('0')).toBe(false)
    expect(isTruthyFlag(undefined)).toBe(false)
  })

  it('detects preview query flags from search params', () => {
    expect(hasPreviewQueryFlagFromSearch('?ui_v2=1')).toBe(true)
    expect(hasPreviewQueryFlagFromSearch('?labs=yes')).toBe(true)
    expect(hasPreviewQueryFlagFromSearch('?other=true')).toBe(false)
  })

  it('enables redesign when any dev, env or query input is truthy', () => {
    expect(isRedesignV2EnabledFromInputs({ isDev: true, envValue: '', search: '' })).toBe(true)
    expect(isRedesignV2EnabledFromInputs({ isDev: false, envValue: 'true', search: '' })).toBe(true)
    expect(isRedesignV2EnabledFromInputs({ isDev: false, envValue: '', search: '?redesign_v2=on' })).toBe(true)
    expect(isRedesignV2EnabledFromInputs({ isDev: false, envValue: '', search: '', hostname: 'lexio-redesign-v2-44760.web.app' })).toBe(true)
    expect(isRedesignV2EnabledFromInputs({ isDev: false, envValue: '', search: '' })).toBe(false)
  })

  it('recognizes the dedicated V2 hostname and home redirect flags', () => {
    expect(isRedesignV2Hostname('lexio-redesign-v2-44760.web.app')).toBe(true)
    expect(isRedesignV2Hostname('lexio.web.app')).toBe(false)
    expect(isRedesignV2DefaultHomeEnabledFromInputs({ hostname: 'lexio-redesign-v2-44760.web.app' })).toBe(true)
    expect(isRedesignV2DefaultHomeEnabledFromInputs({ homeValue: 'on' })).toBe(true)
    expect(isRedesignV2DefaultHomeEnabledFromInputs({ hostname: 'lexio.web.app', homeValue: '' })).toBe(false)
  })
})