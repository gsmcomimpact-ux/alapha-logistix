import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { api } from './php/http';

let secondaryAuth: ReturnType<typeof getAuth> | null = null;

/**
 * Create (or, with the PHP backend, reset) the login of a staff member so they can sign in with
 * their professional e-mail + the password chosen by the administrator.
 *
 * PHP backend: dedicated administrator-only endpoint (the e-mail is marked verified).
 * Firebase: the account is created on a secondary app instance so the administrator stays signed in;
 * a verification e-mail is sent (Firebase cannot reset another user's password from the browser).
 */
export async function createStaffLogin(email: string, password: string, displayName = ''): Promise<void> {
  if (__PHP_BACKEND__) {
    await api('/auth/staff-account', { body: { email, password, displayName } });
    return;
  }
  if (!secondaryAuth) {
    secondaryAuth = getAuth(initializeApp(firebaseConfig, 'staff-creator'));
  }
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  try {
    await sendEmailVerification(cred.user);
  } finally {
    await signOut(secondaryAuth);
  }
}

/** Random 12-character password without look-alike characters. */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(length);
  window.crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}
