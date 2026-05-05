/**
 * Firebase initialization.
 * IS_FIREBASE = false -> demo mode (no Firebase credentials set or smoke override enabled).
 * IS_FIREBASE = true  -> real Firebase Auth + Firestore.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { resolveFirebaseAuthDomain, validateFirebaseWebConfig } from './firebase-config'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        resolveFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || 'hocapp-44760.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const firebaseConfigIssues = validateFirebaseWebConfig({
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket,
  appId: firebaseConfig.appId,
})

if (firebaseConfigIssues.length > 0) {
  console.error('[Firebase Config] Invalid production configuration:', firebaseConfigIssues.join(' | '))
}

const forceDemoMode = import.meta.env.VITE_FORCE_DEMO_MODE === 'true'

if (forceDemoMode) {
  console.warn('[Firebase Config] VITE_FORCE_DEMO_MODE=true -> skipping Firebase initialization for local smoke/demo mode.')
}

export const IS_FIREBASE = !forceDemoMode && Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfigIssues.length === 0)

let _app: FirebaseApp | null = null
let _auth: Auth | null = null
let _db: Firestore | null = null
let _storage: FirebaseStorage | null = null

if (IS_FIREBASE) {
  _app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  _auth = getAuth(_app)
  _db   = getFirestore(_app)
  _storage = getStorage(_app)
}

export const firebaseAuth = _auth
export const firestore    = _db
export const storage      = _storage
