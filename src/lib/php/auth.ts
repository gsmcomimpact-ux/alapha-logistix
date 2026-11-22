// Firebase-Auth-compatible client backed by the PHP/MySQL API (e-mail + password only).
import { api, ApiError, getToken, setToken } from './http';
import type { FirebaseApp } from './app';

export interface UserInfo {
  providerId: string;
  email: string | null;
}

export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: UserInfo[];
  reload(): Promise<void>;
}

export interface Auth {
  currentUser: User | null;
}

type Listener = (user: User | null) => void;

const listeners = new Set<Listener>();
const auth: Auth = { currentUser: null };
let initialized = false;
let lastReauthPassword: string | null = null;

interface ApiUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

function makeUser(u: ApiUser): User {
  const user: User = {
    uid: u.uid,
    email: u.email,
    emailVerified: u.emailVerified,
    displayName: u.displayName,
    isAnonymous: false,
    tenantId: null,
    providerData: [{ providerId: 'password', email: u.email }],
    async reload() {
      const res = await api<{ user: ApiUser | null }>('/auth/me');
      if (res.user) {
        user.emailVerified = res.user.emailVerified;
        user.displayName = res.user.displayName;
      }
    },
  };
  return user;
}

function emit(user: User | null): void {
  auth.currentUser = user;
  listeners.forEach((l) => l(user));
}

async function bootstrap(): Promise<void> {
  if (initialized) return;
  initialized = true;
  if (!getToken()) {
    emit(null);
    return;
  }
  try {
    const res = await api<{ user: ApiUser | null }>('/auth/me');
    if (!res.user) setToken(null);
    emit(res.user ? makeUser(res.user) : null);
  } catch {
    // Network problem: keep the token, treat as signed out for now.
    emit(null);
  }
}

export function getAuth(_app?: FirebaseApp): Auth {
  return auth;
}

export function onAuthStateChanged(_auth: Auth, cb: Listener): () => void {
  listeners.add(cb);
  if (!initialized) void bootstrap();
  else queueMicrotask(() => cb(auth.currentUser));
  return () => listeners.delete(cb);
}

async function authenticate(path: string, email: string, password: string, extra?: object) {
  const res = await api<{ token: string; user: ApiUser }>(path, { body: { email, password, ...extra } });
  setToken(res.token);
  const user = makeUser(res.user);
  emit(user);
  return { user };
}

export function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  return authenticate('/auth/login', email, password);
}

export function createUserWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  return authenticate('/auth/register', email, password);
}

export async function signOut(_auth: Auth): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST', body: {} });
  } catch {
    // ignore: token is dropped locally anyway
  }
  setToken(null);
  lastReauthPassword = null;
  emit(null);
}

export async function sendEmailVerification(_user: User): Promise<void> {
  await api('/auth/resend-verification', { body: {} });
}

export async function sendPasswordResetEmail(_auth: Auth, email: string): Promise<void> {
  await api('/auth/forgot', { body: { email } });
}

export async function updateProfile(user: User, profile: { displayName?: string | null }): Promise<void> {
  await api('/auth/profile', { body: { displayName: profile.displayName ?? '' } });
  user.displayName = profile.displayName ?? null;
}

export class EmailAuthProvider {
  static credential(email: string, password: string) {
    return { email, password };
  }
}

export async function reauthenticateWithCredential(
  _user: User,
  credential: { email: string; password: string }
): Promise<void> {
  await api('/auth/reauth', { body: { password: credential.password } });
  lastReauthPassword = credential.password;
}

export async function updatePassword(_user: User, newPassword: string): Promise<void> {
  if (!lastReauthPassword) throw new ApiError('auth/requires-recent-login', 'Recent login required', 401);
  await api('/auth/change-password', { body: { currentPassword: lastReauthPassword, newPassword } });
  lastReauthPassword = null;
}

// Google sign-in is not available with the PHP backend.
export class GoogleAuthProvider {
  setCustomParameters(_params: Record<string, string>): this {
    return this;
  }
}

function unsupported(): never {
  throw new ApiError('auth/operation-not-allowed', 'Google sign-in is not available', 400);
}
export async function signInWithPopup(..._args: unknown[]): Promise<never> {
  return unsupported();
}
export async function reauthenticateWithPopup(..._args: unknown[]): Promise<never> {
  return unsupported();
}
export async function linkWithCredential(..._args: unknown[]): Promise<never> {
  return unsupported();
}
