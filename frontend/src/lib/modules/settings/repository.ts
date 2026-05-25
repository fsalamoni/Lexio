import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore'

import type { AdminDocumentType, AdminLegalArea, UserSettingsData } from '../../firestore-types'

export type SettingsFirestoreRetryOptions = {
  recoverAuthAccessErrors?: boolean
}

export type SettingsRepositoryDependencies = {
  ensureFirestore: () => Firestore
  resolveEffectiveUid: (uid: string, contextLabel: string) => Promise<string>
  writeUserScoped: <T>(
    uid: string,
    contextLabel: string,
    operation: (db: Firestore, effectiveUid: string) => Promise<T>,
  ) => Promise<T>
  withFirestoreRetry: <T>(
    operation: () => Promise<T>,
    contextLabel: string,
    options?: SettingsFirestoreRetryOptions,
  ) => Promise<T>
  stripUndefined: <T extends Record<string, unknown>>(value: T) => T
}

const USER_SETTINGS_MIGRATION_FLAG = 'legacy_migrated_at'
const USER_SETTINGS_MODEL_KEYS = [
  'agent_models',
  'thesis_analyst_models',
  'context_detail_models',
  'acervo_classificador_models',
  'acervo_ementa_models',
  'research_notebook_models',
  'notebook_acervo_models',
  'video_pipeline_models',
  'audio_pipeline_models',
  'presentation_pipeline_models',
  'presentation_v2_pipeline_models',
  'document_v3_models',
  'document_v4_models',
  'chat_orchestrator_models',
] as const satisfies ReadonlyArray<keyof UserSettingsData>

export function createSettingsRepository(deps: SettingsRepositoryDependencies) {
  async function getSettings(options: SettingsFirestoreRetryOptions = {}): Promise<Record<string, unknown>> {
    const db = deps.ensureFirestore()
    const ref = doc(db, 'settings', 'platform')
    const snapshot = await deps.withFirestoreRetry(
      () => getDoc(ref),
      'getSettings',
      options,
    )
    if (!snapshot.exists()) return {}
    return snapshot.data() as Record<string, unknown>
  }

  async function saveSettings(data: Record<string, unknown>): Promise<void> {
    const db = deps.ensureFirestore()
    const ref = doc(db, 'settings', 'platform')
    await deps.withFirestoreRetry(
      () => setDoc(ref, { ...data, updated_at: serverTimestamp() }, { merge: true }),
      'saveSettings',
    )
  }

  async function getUserSettings(uid: string): Promise<UserSettingsData> {
    const db = deps.ensureFirestore()
    const effectiveUid = await deps.resolveEffectiveUid(uid, 'getUserSettings')
    const ref = doc(db, 'users', effectiveUid, 'settings', 'preferences')
    const snapshot = await deps.withFirestoreRetry(() => getDoc(ref), 'getUserSettings')
    if (!snapshot.exists()) return {}
    return snapshot.data() as UserSettingsData
  }

  async function saveUserSettings(uid: string, data: Partial<UserSettingsData>): Promise<void> {
    await deps.writeUserScoped(uid, 'saveUserSettings', async (db, effectiveUid) => {
      const ref = doc(db, 'users', effectiveUid, 'settings', 'preferences')
      const sanitized = deps.stripUndefined(data as Record<string, unknown>)
      await setDoc(ref, { ...sanitized, updated_at: serverTimestamp() }, { merge: true })
    })
  }

  async function getLegacySettingsDocData(documentId: string): Promise<Record<string, unknown>> {
    const db = deps.ensureFirestore()
    const snapshot = await deps.withFirestoreRetry(
      () => getDoc(doc(db, 'settings', documentId)),
      `getLegacySettingsDocData.${documentId}`,
      { recoverAuthAccessErrors: false },
    )
    return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {}
  }

  async function ensureUserSettingsMigrated(uid: string): Promise<UserSettingsData> {
    const current = await getUserSettings(uid)
    if (current[USER_SETTINGS_MIGRATION_FLAG]) return current

    const patch: Partial<UserSettingsData> = {
      [USER_SETTINGS_MIGRATION_FLAG]: new Date().toISOString(),
    }

    try {
      const globalSettings = await getSettings({ recoverAuthAccessErrors: false }).catch(() => ({} as Record<string, unknown>))
      const mergedApiKeys = { ...((globalSettings.api_keys ?? {}) as Record<string, string>) }

      for (const flatKey of ['openrouter_api_key', 'datajud_api_key'] as const) {
        const flatValue = globalSettings[flatKey]
        if (typeof flatValue === 'string' && flatValue.trim() && !mergedApiKeys[flatKey]) {
          mergedApiKeys[flatKey] = flatValue
        }
      }

      if ((!current.api_keys || Object.keys(current.api_keys).length === 0) && Object.keys(mergedApiKeys).length > 0) {
        patch.api_keys = mergedApiKeys
      }

      if ((!current.model_catalog || current.model_catalog.length === 0) && Array.isArray(globalSettings.model_catalog) && globalSettings.model_catalog.length > 0) {
        patch.model_catalog = globalSettings.model_catalog as UserSettingsData['model_catalog']
      }

      for (const key of USER_SETTINGS_MODEL_KEYS) {
        const existingValue = current[key]
        const legacyValue = globalSettings[key]
        if (
          (!existingValue || Object.keys(existingValue as Record<string, string>).length === 0) &&
          legacyValue && typeof legacyValue === 'object' && !Array.isArray(legacyValue)
        ) {
          patch[key] = legacyValue as UserSettingsData[typeof key]
        }
      }

      if (!current.document_types?.length) {
        const legacyDocTypes = await getLegacySettingsDocData('admin_document_types').catch(() => ({} as Record<string, unknown>))
        if (Array.isArray(legacyDocTypes.items) && legacyDocTypes.items.length > 0) {
          patch.document_types = legacyDocTypes.items as AdminDocumentType[]
        }
      }

      if (!current.legal_areas?.length) {
        const legacyAreas = await getLegacySettingsDocData('admin_legal_areas').catch(() => ({} as Record<string, unknown>))
        if (Array.isArray(legacyAreas.items) && legacyAreas.items.length > 0) {
          patch.legal_areas = legacyAreas.items as AdminLegalArea[]
        }
      }

      if (!current.classification_tipos || Object.keys(current.classification_tipos).length === 0) {
        const legacyTipos = await getLegacySettingsDocData('admin_classification_tipos').catch(() => ({} as Record<string, unknown>))
        if (legacyTipos.tipos && typeof legacyTipos.tipos === 'object' && !Array.isArray(legacyTipos.tipos)) {
          patch.classification_tipos = legacyTipos.tipos as Record<string, Record<string, string[]>>
        }
      }
    } catch {
      // If legacy docs are inaccessible, mark migration as done so user defaults still apply.
    }

    await saveUserSettings(uid, patch)
    return { ...current, ...patch }
  }

  return {
    getSettings,
    saveSettings,
    getUserSettings,
    saveUserSettings,
    ensureUserSettingsMigrated,
  }
}