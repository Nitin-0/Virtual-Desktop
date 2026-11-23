import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  changePassword as changeStoredPassword,
  checkLogin,
  createAccount,
  getAccount,
  getSessionId,
  listAccounts,
  setAvatar,
  setLastUser,
  setSessionId,
  type Account,
} from '../os/accounts';
import { AuthContext, type AuthPhase, type AuthValue } from './authContext';
import { useOS } from './OSContext';

function initialState(): { phase: AuthPhase; account: Account | null } {
  const sessionId = getSessionId();
  const account = sessionId ? getAccount(sessionId) ?? null : null;
  if (account) return { phase: 'active', account };
  return { phase: listAccounts().length ? 'login' : 'signup', account: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { getWindows, closeWindow, updateSettings, setStartOpen, hideMenu, notify } = useOS();
  const [state, setState] = useState(initialState);

  const begin = useCallback((account: Account) => {
    setSessionId(account.id);
    setLastUser(account.username);
    updateSettings({ username: account.username });
    setState({ phase: 'active', account });
  }, [updateSettings]);

  const signUp = useCallback((username: string, password: string, confirm: string) => {
    const account = createAccount(username, password, confirm);
    begin(account);
    notify({ title: `Welcome, ${account.username}`, body: 'Add a profile picture in Settings → Account.', kind: 'ok' });
  }, [begin, notify]);

  const logIn = useCallback((username: string, password: string) => {
    const account = checkLogin(username, password);
    if (!account) return false;
    begin(account);
    return true;
  }, [begin]);

  const unlock = useCallback((password: string) => {
    const current = state.account ? getAccount(state.account.id) : undefined;
    if (!current || current.password !== password) return false;
    setState({ phase: 'active', account: current });
    return true;
  }, [state.account]);

  const leaveDesktop = useCallback((phase: AuthPhase) => {
    setStartOpen(false);
    hideMenu();
    setState((prev) => ({ ...prev, phase }));
  }, [hideMenu, setStartOpen]);

  const sleep = useCallback(() => leaveDesktop('asleep'), [leaveDesktop]);
  const lock = useCallback(() => leaveDesktop('locked'), [leaveDesktop]);
  const wake = useCallback(() => setState((prev) => (prev.phase === 'asleep' ? { ...prev, phase: 'active' } : prev)), []);

  /** Save and close every window, then return to the sign-in screen. */
  const logOut = useCallback(async () => {
    setStartOpen(false);
    hideMenu();
    for (const win of getWindows().slice().reverse()) await closeWindow(win.id);
    if (getWindows().length) return; // a window refused to close (unsaved work); stay signed in
    setSessionId(null);
    setState({ phase: 'login', account: null });
  }, [closeWindow, getWindows, hideMenu, setStartOpen]);

  const showSignup = useCallback(() => setState((prev) => ({ ...prev, phase: 'signup' })), []);
  const showLogin = useCallback(() => setState((prev) => ({ ...prev, phase: listAccounts().length ? 'login' : 'signup' })), []);

  const updateAvatar = useCallback((avatar: string | null) => {
    if (!state.account) return;
    const next = setAvatar(state.account.id, avatar);
    setState((prev) => ({ ...prev, account: next }));
  }, [state.account]);

  const changePassword = useCallback((current: string, next: string, confirm: string) => {
    if (!state.account) throw new Error('Not signed in.');
    changeStoredPassword(state.account.id, current, next, confirm);
  }, [state.account]);

  const value = useMemo<AuthValue>(() => ({
    phase: state.phase,
    account: state.account,
    hasAccounts: listAccounts().length > 0,
    signUp,
    logIn,
    unlock,
    sleep,
    wake,
    lock,
    logOut,
    showSignup,
    showLogin,
    updateAvatar,
    changePassword,
  }), [state, signUp, logIn, unlock, sleep, wake, lock, logOut, showSignup, showLogin, updateAvatar, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
