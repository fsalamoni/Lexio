import { describe, expect, it } from 'vitest'
import { calculateProfileCompletion, countFilledFields, countSectionFields, isFilledValue, PROFILE_CORE_FIELDS } from './profile-progress'
import { PROFILE_SECTIONS, type ProfileData } from './profile-preferences'

const baseProfile: ProfileData = {
  institution: 'MPE',
  position: 'Promotor',
  jurisdiction: 'Porto Alegre',
  experience_years: 8,
  primary_areas: ['criminal'],
  formality_level: 'formal',
  detail_level: 'detalhado',
  signature_block: 'Nome\nCargo',
}

describe('profile-progress', () => {
  it('recognizes filled values across supported field types', () => {
    expect(isFilledValue('texto')).toBe(true)
    expect(isFilledValue(['a'])).toBe(true)
    expect(isFilledValue(0)).toBe(true)
    expect(isFilledValue(false)).toBe(false)
    expect(isFilledValue('   ')).toBe(false)
  })

  it('counts filled core profile fields correctly', () => {
    expect(countFilledFields(baseProfile, PROFILE_CORE_FIELDS)).toBe(PROFILE_CORE_FIELDS.length)
  })

  it('calculates profile completion percentage from core fields', () => {
    expect(calculateProfileCompletion(baseProfile)).toBe(100)
    expect(calculateProfileCompletion({ institution: 'MPE' })).toBe(13)
  })

  it('counts filled fields inside a section definition', () => {
    const section = PROFILE_SECTIONS.find((entry) => entry.id === 'professional')
    expect(section).toBeTruthy()
    expect(countSectionFields(baseProfile, section!.fields)).toBe(4)
  })
})