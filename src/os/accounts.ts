/**
 * Simple local accounts for the sign-in screen.
 *
 * Accounts live in localStorage on this browser. Passwords are stored as plain
 * text: this is a convenience lock for a virtual desktop, not real security.
 * Every account on this browser shares the same archive and preferences.
 */
import { uid } from './util';

export interface Account {
  id: string;
  username: string;
  password: string;
  createdAt: number;
  /** Profile picture as a small JPEG data URL. */
  avatar?: string;
}

const ACCOUNTS_KEY = 'aincrad-os-accounts';
const SESSION_KEY = 'aincrad-os-session';
const LAST_USER_KEY = 'aincrad-os-last-user';

export function listAccounts(): Account[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Account => (
      !!item && typeof item.id === 'string' && typeof item.username === 'string' && typeof item.password === 'string'
    ));
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error('Could not save the account. Browser storage may be full or blocked.');
  }
}

export function findAccount(username: string): Account | undefined {
  const key = username.trim().toLowerCase();
  return listAccounts().find((account) => account.username.toLowerCase() === key);
}

export function getAccount(id: string): Account | undefined {
  return listAccounts().find((account) => account.id === id);
}

export function validateUsername(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 3) return 'Username must be at least 3 characters.';
  if (name.length > 24) return 'Username must be 24 characters or fewer.';
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return 'Use letters, numbers, dots, dashes, or underscores.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) return 'Password must be at least 4 characters.';
  return null;
}

export function createAccount(username: string, password: string, confirm: string): Account {
  const nameError = validateUsername(username);
  if (nameError) throw new Error(nameError);
  if (findAccount(username)) throw new Error('That username is taken on this browser.');
  const passError = validatePassword(password);
  if (passError) throw new Error(passError);
  if (password !== confirm) throw new Error('Passwords do not match.');
  const account: Account = { id: uid(), username: username.trim(), password, createdAt: Date.now() };
  saveAccounts([...listAccounts(), account]);
  return account;
}

/** The account if the username and password match, otherwise null. */
export function checkLogin(username: string, password: string): Account | null {
  const account = findAccount(username);
  return account && account.password === password ? account : null;
}

export function changePassword(id: string, current: string, next: string, confirm: string): void {
  const accounts = listAccounts();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new Error('Account not found.');
  if (account.password !== current) throw new Error('Current password is wrong.');
  const passError = validatePassword(next);
  if (passError) throw new Error(passError);
  if (next !== confirm) throw new Error('New passwords do not match.');
  saveAccounts(accounts.map((item) => (item.id === id ? { ...item, password: next } : item)));
}

export function setAvatar(id: string, avatar: string | null): Account {
  const accounts = listAccounts();
  const account = accounts.find((item) => item.id === id);
  if (!account) throw new Error('Account not found.');
  const next: Account = { ...account };
  if (avatar) next.avatar = avatar;
  else delete next.avatar;
  saveAccounts(accounts.map((item) => (item.id === id ? next : item)));
  return next;
}

/** Shrink and center-crop an image file to a 256×256 JPEG data URL. */
export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is larger than 15 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Signed-in account for this tab. Survives a reload; a new tab or browser restart asks again. */
export function getSessionId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionId(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* Session just won't survive a reload. */
  }
}

export function getLastUser(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setLastUser(username: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, username);
  } catch {
    /* Only used to prefill the sign-in form. */
  }
}
