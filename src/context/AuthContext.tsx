import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  ClientAccountStatus,
  emailToStaffId,
  FIELD_LIMITS,
  StaffRole,
  StaffUser,
  UserProfile,
} from '../types/logistics';
import { useLanguage } from './LanguageContext';

interface ProfileInput {
  fullName: string;
  company: string;
  phone: string;
  city: string;
}

interface RegisterEmailInput extends ProfileInput {
  email: string;
  password: string;
}

interface AuthActionResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  userProfile: UserProfile | null;
  clientAccountStatus: ClientAccountStatus;
  loadingProfile: boolean;
  loadingAdmin: boolean;
  isAdmin: boolean;
  isBootstrappedAdmin: boolean;
  canManageUsers: boolean;
  staffRole: StaffRole | null;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  registerWithEmail: (input: RegisterEmailInput) => Promise<AuthActionResult>;
  resetClientPassword: (email: string) => Promise<AuthActionResult>;
  signOutUser: () => Promise<void>;
  saveClientProfile: (input: ProfileInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(code: string | undefined, locale: 'fr' | 'en'): string {
  const isEn = locale === 'en';
  switch (code) {
    case 'auth/email-already-in-use':
      return isEn
        ? 'An account already exists with this email address. Please sign in instead.'
        : 'Un compte existe déjà avec cette adresse e-mail. Veuillez vous connecter.';
    case 'auth/invalid-email':
      return isEn ? 'Please enter a valid email address.' : 'Adresse e-mail invalide.';
    case 'auth/weak-password':
      return isEn
        ? 'Password is too weak (minimum 6 characters).'
        : 'Mot de passe trop faible (6 caractères minimum).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return isEn
        ? 'Incorrect email address or password.'
        : 'Adresse e-mail ou mot de passe incorrect.';
    case 'auth/user-disabled':
      return isEn
        ? 'This account has been disabled. Contact Alpha Logistix support.'
        : 'Ce compte a été désactivé. Contactez le support Alpha Logistix.';
    case 'auth/too-many-requests':
      return isEn
        ? 'Too many attempts. Please wait a few minutes before trying again.'
        : 'Trop de tentatives. Veuillez patienter quelques minutes avant de réessayer.';
    case 'auth/operation-not-allowed':
      return isEn
        ? 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method).'
        : 'La connexion par E-mail / Mot de passe doit être activée dans Firebase Console (Authentication > Sign-in method).';
    case 'auth/network-request-failed':
      return isEn
        ? 'Network error. Please check your internet connection.'
        : 'Erreur réseau. Veuillez vérifier votre connexion internet.';
    default:
      return isEn
        ? `Authentication error${code ? ` (${code})` : ''}. Please try again.`
        : `Erreur d’authentification${code ? ` (${code})` : ''}. Veuillez réessayer.`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBootstrappedAdmin, setIsBootstrappedAdmin] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setUserProfile(null);
        setIsAdmin(false);
        setIsBootstrappedAdmin(false);
        setCanManageUsers(false);
        setStaffRole(null);
        setLoadingProfile(false);
        setLoadingAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;

    let cancelled = false;
    setLoadingProfile(true);
    setLoadingAdmin(true);

    const emailLower = (user.email || '').toLowerCase();
    const bootstrapped = Boolean(user.emailVerified && emailLower === BOOTSTRAPPED_ADMIN_EMAIL);
    setIsBootstrappedAdmin(bootstrapped);

    const checkAdminRecord = async () => {
      if (bootstrapped) {
        if (!cancelled) {
          setIsAdmin(true);
          setCanManageUsers(true);
          setStaffRole('admin');
          setLoadingAdmin(false);
        }
        return;
      }

      let hasAccess = false;
      let canManage = false;
      let resolvedRole: StaffRole | null = null;

      try {
        if (user.emailVerified && emailLower.length >= 5 && emailLower.length <= FIELD_LIMITS.staffEmailMax) {
          const staffDocId = emailToStaffId(emailLower);
          const staffSnap = await getDoc(doc(db, 'staffUsers', staffDocId));
          if (staffSnap.exists()) {
            const staffData = staffSnap.data() as StaffUser;
            if (staffData.active) {
              hasAccess = true;
              resolvedRole = staffData.role;
              canManage = staffData.role === 'admin';
            }
          }
        }
      } catch {
        // Ignore non-staff read errors
      }

      if (!hasAccess && user.emailVerified) {
        try {
          const adminSnap = await getDoc(doc(db, 'admins', user.uid));
          if (adminSnap.exists()) {
            hasAccess = true;
            resolvedRole = 'operator';
          }
        } catch {
          // Ignore non-admin read errors
        }
      }

      if (!cancelled) {
        setIsAdmin(hasAccess);
        setCanManageUsers(canManage);
        setStaffRole(resolvedRole);
        setLoadingAdmin(false);
      }
    };

    void checkAdminRecord();

    const profilePath = `users/${user.uid}`;
    const unsubscribeProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (cancelled) return;
        if (snapshot.exists()) {
          setUserProfile(snapshot.data() as UserProfile);
        } else {
          setUserProfile(null);
        }
        setLoadingProfile(false);
      },
      (error) => {
        if (cancelled) return;
        setLoadingProfile(false);
        handleFirestoreError(error, OperationType.GET, profilePath);
      }
    );

    return () => {
      cancelled = true;
      unsubscribeProfile();
    };
  }, [authReady, user]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setAuthError(
          locale === 'en'
            ? 'The sign-in window was closed before completion.'
            : 'La fenêtre de connexion a été fermée avant la validation.'
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          locale === 'en'
            ? 'Your browser blocked the sign-in popup. Please allow popups for this site.'
            : 'Votre navigateur a bloqué la fenêtre de connexion. Veuillez autoriser les pop-ups pour ce site.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          locale === 'en'
            ? `This domain (${window.location.hostname}) is not authorized in Firebase Authentication yet.`
            : `Ce domaine (${window.location.hostname}) n’est pas encore autorisé dans Firebase Authentication.`
        );
      } else {
        setAuthError(
          locale === 'en'
            ? `Unable to complete Google sign-in${code ? ` (${code})` : ''}. Please try again.`
            : `Impossible de finaliser la connexion Google${code ? ` (${code})` : ''}. Veuillez réessayer.`
        );
      }
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<AuthActionResult> => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const msg = mapFirebaseAuthError(code, locale);
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const registerWithEmail = async (input: RegisterEmailInput): Promise<AuthActionResult> => {
    setAuthError(null);
    const cleanEmail = input.email.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanFullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanCompany = input.company.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanPhone = input.phone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanCity = input.city.trim().slice(0, FIELD_LIMITS.cityMax);

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
      try {
        await updateProfile(cred.user, { displayName: cleanFullName });
      } catch {
        // non-blocking profile display name sync
      }

      const profilePath = `users/${cred.user.uid}`;
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          company: cleanCompany,
          city: cleanCity,
          role: 'client',
          accountStatus: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (fsError) {
        // The auth account already exists: don't report a misleading auth error.
        // The profile is created later via saveClientProfile (userProfile === null path).
        try {
          handleFirestoreError(fsError, OperationType.CREATE, profilePath);
        } catch {
          // already logged by handleFirestoreError
        }
      }

      try {
        await sendEmailVerification(cred.user);
      } catch {
        // Optional email verification trigger
      }

      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const msg = mapFirebaseAuthError(code, locale);
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const resetClientPassword = async (email: string): Promise<AuthActionResult> => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { ok: true };
    } catch (error) {
      const code = (error as { code?: string })?.code;
      const msg = mapFirebaseAuthError(code, locale);
      return { ok: false, error: msg };
    }
  };

  const signOutUser = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const saveClientProfile = async (input: ProfileInput) => {
    if (!user || !user.email) {
      throw new Error('Utilisateur non authentifié.');
    }

    const cleanFullName = input.fullName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanCompany = input.company.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanPhone = input.phone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanCity = input.city.trim().slice(0, FIELD_LIMITS.cityMax);
    const cleanEmail = user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax);

    const path = `users/${user.uid}`;
    try {
      if (userProfile) {
        await updateDoc(doc(db, 'users', user.uid), {
          fullName: cleanFullName,
          company: cleanCompany,
          phone: cleanPhone,
          city: cleanCity,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          company: cleanCompany,
          city: cleanCity,
          role: 'client',
          accountStatus: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, userProfile ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const clientAccountStatus: ClientAccountStatus = userProfile
    ? userProfile.accountStatus ?? 'validated'
    : 'pending';

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        userProfile,
        clientAccountStatus,
        loadingProfile,
        loadingAdmin,
        isAdmin,
        isBootstrappedAdmin,
        canManageUsers,
        staffRole,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetClientPassword,
        signOutUser,
        saveClientProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé à l’intérieur de AuthProvider.');
  }
  return ctx;
}
