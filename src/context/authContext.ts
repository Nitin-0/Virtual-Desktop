import { createContext, useContext } from 'react';
import type { Account } from '../os/accounts';

/**
 * signup  – no account yet, or "Create account" was chosen
 * login   – signed out; ask for username and password
 * locked  – signed in, windows kept; ask for the password to return
 * asleep  – signed in, screen dark; any key or click returns
 * active  – the desktop
 */
export type AuthPhase = 'signup' | 'login' | 'locked' | 'asleep' | 'active';

export interface AuthValue {
  phase: AuthPhase;
  account: Account | null;
  hasAccounts: boolean;
  signUp: (username: string, password: string, confirm: string) => void;
  logIn: (username: string, password: string) => boolean;
  unlock: (password: string) => boolean;
  sleep: () => void;
  wake: () => void;
  lock: () => void;
  logOut: () => Promise<void>;
  showSignup: () => void;
  showLogin: () => void;
  updateAvatar: (avatar: string | null) => void;
  changePassword: (current: string, next: string, confirm: string) => void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
