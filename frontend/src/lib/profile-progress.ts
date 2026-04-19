import { type ProfileData, type ProfileField } from './profile-preferences'

export const PROFILE_CORE_FIELDS: Array<keyof ProfileData> = [
  'institution',
  'position',
  'jurisdiction',
  'experience_years',
  'primary_areas',
  'formality_level',
  'detail_level',
  'signature_block',
]

export function isFilledValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return value
  return typeof value === 'string' ? value.trim().length > 0 : false
}

export function countFilledFields(profile: ProfileData, fields: ReadonlyArray<keyof ProfileData>) {
  return fields.filter((field) => isFilledValue(profile[field])).length
}

export function countSectionFields(profile: ProfileData, fields: ProfileField[]) {
  return fields.filter((field) => isFilledValue(profile[field.key])).length
}

export function calculateProfileCompletion(profile: ProfileData, fields = PROFILE_CORE_FIELDS) {
  if (fields.length === 0) return 0
  return Math.round((countFilledFields(profile, fields) / fields.length) * 100)
}