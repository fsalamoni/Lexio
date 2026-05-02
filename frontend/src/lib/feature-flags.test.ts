import { describe, expect, it } from 'vitest'
import {
  isTruthyFlag,
} from './feature-flags'

describe('feature-flags', () => {
  it('treats common truthy values as enabled', () => {
    expect(isTruthyFlag('true')).toBe(true)
    expect(isTruthyFlag(' Enabled ')).toBe(true)
    expect(isTruthyFlag('0')).toBe(false)
    expect(isTruthyFlag(undefined)).toBe(false)
  })
})