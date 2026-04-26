import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./firestore-service.ts', import.meta.url), 'utf-8')

describe('firestore-service auth guardrails', () => {
  it('avoids raw user-scoped read calls with unresolved uid', () => {
    const forbiddenReadPatterns = [
      /getDocs\(\s*query\(\s*collection\(db,\s*['\"]users['\"],\s*uid,/,
      /getDocs\(\s*collection\(db,\s*['\"]users['\"],\s*uid,/,
      /getDoc\(\s*doc\(db,\s*['\"]users['\"],\s*uid,/,
    ]

    for (const pattern of forbiddenReadPatterns) {
      expect(source).not.toMatch(pattern)
    }
  })

  it('keeps auth-hardened read entrypoints wired to effective uid resolution', () => {
    const requiredGuards = [
      /resolveEffectiveUid\(uid,\s*'getDocument'\)/,
      /resolveEffectiveUid\(uid,\s*'listTheses'\)/,
      /resolveEffectiveUid\(uid,\s*'getThesisStats'\)/,
      /resolveEffectiveUid\(uid,\s*'getAcervoAnalysisStatus'\)/,
      /resolveEffectiveUid\(uid,\s*'getResearchNotebook'\)/,
    ]

    for (const pattern of requiredGuards) {
      expect(source).toMatch(pattern)
    }
  })
})
