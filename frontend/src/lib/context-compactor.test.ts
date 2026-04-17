import { describe, it, expect } from 'vitest'
import { deduplicateSegments, truncateWithStructure, compactContext } from './context-compactor'

describe('context-compactor', () => {
  describe('deduplicateSegments', () => {
    it('removes exact duplicates', () => {
      const { unique, dropped } = deduplicateSegments([
        'Hello world',
        'Hello world',
        'Different text',
      ])
      expect(unique).toEqual(['Hello world', 'Different text'])
      expect(dropped).toBe(1)
    })

    it('normalizes whitespace for comparison', () => {
      const { unique, dropped } = deduplicateSegments([
        'Hello  world',
        'Hello world',
        'Another line',
      ])
      expect(unique).toHaveLength(2)
      expect(dropped).toBe(1)
    })

    it('drops empty segments', () => {
      const { unique, dropped } = deduplicateSegments(['', '  ', 'Valid'])
      expect(unique).toEqual(['Valid'])
      expect(dropped).toBe(2)
    })

    it('is case-insensitive', () => {
      const { unique, dropped } = deduplicateSegments(['Hello', 'hello', 'HELLO'])
      expect(unique).toHaveLength(1)
      expect(dropped).toBe(2)
    })

    it('handles empty input', () => {
      const { unique, dropped } = deduplicateSegments([])
      expect(unique).toEqual([])
      expect(dropped).toBe(0)
    })
  })

  describe('truncateWithStructure', () => {
    it('returns text unchanged if within budget', () => {
      const text = 'Short text'
      expect(truncateWithStructure(text, 100)).toBe(text)
    })

    it('truncates long text', () => {
      const text = Array.from({ length: 20 }, (_, i) => `Line ${i + 1} with some content here`).join('\n')
      const result = truncateWithStructure(text, 200)
      expect(result.length).toBeLessThanOrEqual(250) // some overhead from indicators
      expect(result).toContain('Line 1')
    })

    it('preserves headers', () => {
      const lines = [
        '# Introduction',
        'Some intro text.',
        'More text here.',
        '## Section Two',
        'Content of section two.',
        'More content.',
        'Even more content.',
        '## Section Three',
        'Final content.',
        'Last line.',
      ]
      const text = lines.join('\n')
      const result = truncateWithStructure(text, 150)
      expect(result).toContain('# Introduction')
      expect(result).toContain('## Section Two')
    })

    it('handles very short texts (<=4 lines)', () => {
      const text = 'A\nB\nC\nD'
      const result = truncateWithStructure(text, 5)
      expect(result).toContain('[...truncado]')
    })
  })

  describe('compactContext', () => {
    it('returns all content if within budget', () => {
      const result = compactContext(
        [
          { label: 'Source A', text: 'Hello', priority: 0 },
          { label: 'Source B', text: 'World', priority: 1 },
        ],
        1000,
      )
      expect(result.reductionRatio).toBe(0)
      expect(result.segmentsDropped).toBe(0)
      expect(result.text).toContain('[Source A]')
      expect(result.text).toContain('[Source B]')
      expect(result.text).toContain('Hello')
      expect(result.text).toContain('World')
    })

    it('compacts when over budget', () => {
      const longText = 'x'.repeat(5000)
      const result = compactContext(
        [
          { label: 'Big', text: longText, priority: 0 },
          { label: 'Small', text: 'tiny', priority: 1 },
        ],
        1000,
      )
      expect(result.compactedChars).toBeLessThan(result.originalChars)
      expect(result.reductionRatio).toBeGreaterThan(0)
      expect(result.segmentsDropped).toBeGreaterThan(0)
    })

    it('respects priority ordering', () => {
      const textA = 'A'.repeat(800)
      const textB = 'B'.repeat(800)
      const result = compactContext(
        [
          { label: 'Low Priority', text: textA, priority: 5 },
          { label: 'High Priority', text: textB, priority: 0 },
        ],
        1000,
      )
      // High priority should appear first
      const posB = result.text.indexOf('[High Priority]')
      const posA = result.text.indexOf('[Low Priority]')
      expect(posB).toBeLessThan(posA)
    })

    it('returns correct metadata', () => {
      const result = compactContext(
        [{ label: 'Test', text: 'Hello world', priority: 0 }],
        100,
      )
      expect(result.originalChars).toBe(11)
      expect(result.compactedChars).toBeGreaterThan(0)
    })
  })
})
