import type { Settings } from './types';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  MAX_CUSTOM_THEMES,
  MAX_CUSTOM_WALLPAPERS,
  isHex,
  normalizeImageUrl,
  type CustomWallpaper,
  type Palette,
  type ThemeDef,
} from './themes';

const KEY = 'aincrad-os-settings';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): Settings {
  return {
    theme: DEFAULT_THEME,
    wallpaper: 'dusk',
    brightness: 100,
    animations: !prefersReducedMotion(),
    showGrid: true,
    soundEnabled: false,
    volume: 0.4,
    iconSize: 'medium',
    showSeconds: false,
    bootScreen: true,
    shellMode: 'auto',
    username: 'Linker',
    hintDismissed: false,
    iconPositions: {},
    inventoryView: 'grid',
    customThemes: [],
    customWallpapers: [],
  };
}

export function storageAvailable(): boolean {
  try {
    const probe = '__aincrad_probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitizeThemes(value: unknown): ThemeDef[] {
  if (!Array.isArray(value)) return [];
  const out: ThemeDef[] = [];
  for (const raw of value.slice(0, MAX_CUSTOM_THEMES)) {
    const item = raw as Partial<ThemeDef> | null;
    if (!item || typeof item.id !== 'string' || !/^my-[a-z0-9-]{1,40}$/.test(item.id)) continue;
    if (!Array.isArray(item.colors) || item.colors.length !== 5 || !item.colors.every(isHex)) continue;
    if (out.some((theme) => theme.id === item.id)) continue;
    out.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : 'My theme',
      blurb: typeof item.blurb === 'string' ? item.blurb.slice(0, 60) : '',
      colors: item.colors.slice() as Palette,
      group: 'Yours',
    });
  }
  return out;
}

function sanitizeWallpapers(value: unknown): CustomWallpaper[] {
  if (!Array.isArray(value)) return [];
  const out: CustomWallpaper[] = [];
  for (const raw of value.slice(0, MAX_CUSTOM_WALLPAPERS)) {
    const item = raw as Partial<CustomWallpaper> | null;
    if (!item || typeof item.id !== 'string' || out.some((wall) => wall.id === item.id)) continue;
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : 'Custom wallpaper';
    if (/^file-[a-z0-9-]{1,40}$/i.test(item.id)) {
      out.push({ id: item.id, name, kind: 'file' });
      continue;
    }
    if (!item.id.startsWith('url-')) continue;
    const url = typeof item.url === 'string' ? normalizeImageUrl(item.url) : null;
    if (url) out.push({ id: item.id, name, kind: 'link', url });
  }
  return out;
}

function sanitizeUsername(value: unknown): string {
  if (typeof value !== 'string') return 'Linker';
  const cleaned = value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 24);
  return cleaned || 'Linker';
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  if (!storageAvailable()) return base;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const customThemes = sanitizeThemes(parsed.customThemes);
    const customWallpapers = sanitizeWallpapers(parsed.customWallpapers);
    const knownTheme = (id: unknown) => typeof id === 'string' && [...BUILTIN_THEMES, ...customThemes].some((theme) => theme.id === id);
    const theme = knownTheme(parsed.theme) ? (parsed.theme as string) : base.theme;
    const iconSize = parsed.iconSize === 'small' || parsed.iconSize === 'large' || parsed.iconSize === 'medium'
      ? parsed.iconSize
      : base.iconSize;
    const inventoryView = parsed.inventoryView === 'list' ? 'list' : 'grid';
    const positions: Settings['iconPositions'] = {};
    if (parsed.iconPositions && typeof parsed.iconPositions === 'object') {
      for (const [id, pos] of Object.entries(parsed.iconPositions)) {
        if (!pos || typeof pos !== 'object') continue;
        const x = Number((pos as { x?: unknown }).x);
        const y = Number((pos as { y?: unknown }).y);
        if (Number.isFinite(x) && Number.isFinite(y)) positions[id] = { x, y };
      }
    }
    return {
      theme,
      wallpaper: typeof parsed.wallpaper === 'string' ? parsed.wallpaper : base.wallpaper,
      brightness: typeof parsed.brightness === 'number' ? clamp(parsed.brightness, 50, 100) : base.brightness,
      animations: typeof parsed.animations === 'boolean' ? parsed.animations : base.animations,
      showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : base.showGrid,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : base.soundEnabled,
      volume: typeof parsed.volume === 'number' ? clamp(parsed.volume, 0, 1) : base.volume,
      iconSize,
      showSeconds: typeof parsed.showSeconds === 'boolean' ? parsed.showSeconds : base.showSeconds,
      bootScreen: typeof parsed.bootScreen === 'boolean' ? parsed.bootScreen : base.bootScreen,
      shellMode: parsed.shellMode === 'desktop' || parsed.shellMode === 'mobile' ? parsed.shellMode : 'auto',
      username: sanitizeUsername(parsed.username),
      hintDismissed: Boolean(parsed.hintDismissed),
      iconPositions: positions,
      inventoryView,
      customThemes,
      customWallpapers,
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: Settings): { ok: boolean; error?: string } {
  if (!storageAvailable()) {
    return { ok: false, error: 'localStorage is unavailable. Preferences will last only for this tab session.' };
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save preferences.' };
  }
}

export function localStorageReport(): { available: boolean; totalChars: number; aincradChars: number; keys: number } {
  if (!storageAvailable()) return { available: false, totalChars: 0, aincradChars: 0, keys: 0 };
  let totalChars = 0;
  let aincradChars = 0;
  let keys = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) ?? '';
    const size = key.length + value.length;
    totalChars += size;
    keys += 1;
    if (key.startsWith('aincrad-os')) aincradChars += size;
  }
  return { available: true, totalChars, aincradChars, keys };
}