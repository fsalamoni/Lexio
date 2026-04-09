/**
 * Firebase Auth service — wraps Firebase email/password auth.
 * Used only when IS_FIREBASE = true; otherwise AuthContext falls back to demo mode.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  type UserCredential,
} from 'firebase/auth'
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore'
import { firebaseAuth, firestore, IS_FIREBASE } from './firebase'

const googleProvider = new GoogleAuthProvider()

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

  // Role is determined by VITE_ADMIN_EMAIL; default is 'user'.
  // (A collection-level query on /users would fail with permission-denied
  //  because Firestore rules only allow reading your own document.)
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const role: 'admin' | 'user' = (adminEmail && email === adminEmail) ? 'admin' : 'user'

  await setDoc(doc(firestore, 'users', cred.user.uid), {
    email,
    full_name: fullName,
    role,
    created_at: serverTimestamp(),
  })

  return { uid: cred.user.uid, email, role, full_name: fullName, token }
}

// ── Google Sign-In ────────────────────────────────────────────────────────────

/**
 * Process a Google UserCredential: load existing profile or create a new one.
 * Role for new users is determined by VITE_ADMIN_EMAIL; default is 'user'.
 */
async function processGoogleCredential(cred: UserCredential): Promise<AuthResult> {
  const token = await cred.user.getIdToken()
  const uid   = cred.user.uid
  const email = cred.user.email!
  const displayName = cred.user.displayName ?? email.split('@')[0]

  const userRef = doc(firestore!, 'users', uid)
  const snap = await getDoc(userRef)
  if (snap.exists()) {
    const data = snap.data()
    return { uid, email, role: data.role ?? 'user', full_name: data.full_name ?? displayName, token }
  }

  // New user — determine role via VITE_ADMIN_EMAIL only.
  // (A collection-level getDocs on /users would fail with permission-denied
  //  because Firestore rules only allow reading your own document.)
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
  const role: 'admin' | 'user' = (adminEmail && email === adminEmail) ? 'admin' : 'user'

  await setDoc(userRef, {
    email,
    full_name: displayName,
    role,
    created_at: serverTimestamp(),
  })

  return { uid, email, role, full_name: displayName, token }
}

export async function firebaseGoogleLogin(): Promise<AuthResult> {
  if (!IS_FIREBASE || !firebaseAuth || !firestore) {
    throw new Error('Firebase não configurado')
  }

  let cred: UserCredential
  try {
    cred = await signInWithPopup(firebaseAuth, googleProvider)
  } catch (err: any) {
    console.error('[Google Auth] signInWithPopup error:', err.code, err.message)
    // If popup was blocked by the browser, fall back to redirect-based flow.
    // signInWithRedirect navigates the page to Google; the result is handled
    // on reload via handleGoogleRedirectResult().
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(firebaseAuth, googleProvider)
      // The browser will redirect to Google; this code may briefly execute
      // before navigation. Return a never-resolving promise so the caller's
      // loading state stays active until the page navigates away.
      return new Promise<AuthResult>(() => {})
    }
    throw err
  }

  return processGoogleCredential(cred)
}

/**
 * Handle the result of a signInWithRedirect (called on page load).
 * Returns AuthResult if the user just completed a redirect login, null otherwise.
 */
export async function handleGoogleRedirectResult(): Promise<AuthResult | null> {
  if (!IS_FIREBASE || !firebaseAuth || !firestore) return null
  try {
    const cred = await getRedirectResult(firebaseAuth)
    if (!cred) return null
    return processGoogleCredential(cred)
  } catch {
    return null
  }
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
    'auth/popup-closed-by-user':   'Login cancelado. Tente novamente.',
    'auth/popup-blocked':          'Popup bloqueado pelo navegador. Permita popups e tente novamente.',
    'auth/account-exists-with-different-credential': 'Este e-mail já está cadastrado com outro método de login.',
    'auth/unauthorized-domain':    'Este domínio ainda não está autorizado no Firebase Auth. Contate o suporte para liberar o acesso.',
    'permission-denied':           'Erro de permissão no banco de dados. Tente novamente ou contate o administrador.',
    'unavailable':                 'Serviço temporariamente indisponível. Tente novamente.',
  }
  return map[code] ?? 'Erro de autenticação. Tente novamente.'
}
