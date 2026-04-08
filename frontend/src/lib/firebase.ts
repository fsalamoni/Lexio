/**
 * Firebase initialization.
 * IS_FIREBASE = false → demo mode (no Firebase credentials set).
 * IS_FIREBASE = true  → real Firebase Auth + Firestore.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { resolveFirebaseAuthDomain } from './firebase-config'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        resolveFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

export const IS_FIREBASE = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

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
