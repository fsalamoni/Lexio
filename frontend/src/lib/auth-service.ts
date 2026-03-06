/**
 * Firebase Auth service — wraps Firebase email/password auth.
 * Used only when IS_FIREBASE = true; otherwise AuthContext falls back to demo mode.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, getDocs, collection, serverTimestamp,
} from 'firebase/firestore'
import { firebaseAuth, firestore, IS_FIREBASE } from './firebase'

export interface AuthResult {
  uid: string
  email: string
  role: 'admin' | 'user'
  full_name: string
  token: string
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function firebaseLogin(email: string, password: string): Promise<AuthResult> {
  if (!IS_FIREBASE || !firebaseAuth || !firestore) {
    throw new Error('Firebase não configurado')
  }

  const cred  = await signInWithEmailAndPassword(firebaseAuth, email, password)
  const token = await cred.user.getIdToken()

  const snap = await getDoc(doc(firestore, 'users', cred.user.uid))
  if (!snap.exists()) throw new Error('Perfil não encontrado. Contate o administrador.')

  const data = snap.data()
  return {
    uid: cred.user.uid,
    email: cred.user.email!,
    role: data.role ?? 'user',
    full_name: data.full_name ?? '',
    token,
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function firebaseRegister(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthResult> {
  if (!IS_FIREBASE || !firebaseAuth || !firestore) {
    throw new Error('Firebase não configurado')
  }

  const cred  = await createUserWithEmailAndPassword(firebaseAuth, email, password)
  const token = await cred.user.getIdToken()

  // First registered user → admin; all others → user
  const usersSnap = await getDocs(collection(firestore, 'users'))
  const role: 'admin' | 'user' = usersSnap.empty ? 'admin' : 'user'

  await setDoc(doc(firestore, 'users', cred.user.uid), {
    email,
    full_name: fullName,
    role,
    created_at: serverTimestamp(),
  })

  return { uid: cred.user.uid, email, role, full_name: fullName, token }
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function firebaseLogout(): Promise<void> {
  if (firebaseAuth) await signOut(firebaseAuth)
}

// ── Error translation ─────────────────────────────────────────────────────────

export function translateFirebaseError(code: string): string {
  const map: Record<string, string> = {
    'auth/wrong-password':         'Senha incorreta.',
    'auth/invalid-credential':     'E-mail ou senha incorretos.',
    'auth/user-not-found':         'Nenhum usuário encontrado com este e-mail.',
    'auth/email-already-in-use':   'Este e-mail já está cadastrado.',
    'auth/invalid-email':          'Endereço de e-mail inválido.',
    'auth/weak-password':          'Senha fraca — use pelo menos 6 caracteres.',
    'auth/too-many-requests':      'Muitas tentativas de login. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Erro de rede. Verifique sua conexão e tente novamente.',
    'auth/operation-not-allowed':  'Login por e-mail/senha não está habilitado no Firebase.',
  }
  return map[code] ?? 'Erro de autenticação. Tente novamente.'
}
