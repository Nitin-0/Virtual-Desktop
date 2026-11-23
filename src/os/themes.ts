/**
 * Interface themes. A theme is five colors, darkest to lightest:
 *   [deep, dark, accent, light, tint]
 * The interface reads them through CSS variables set on the `.os` root, so a
 * theme recolors highlights, buttons, selections, and the faint panel wash.
 */

export type Palette = [string, string, string, string, string];

export interface ThemeDef {
  id: string;
  name: string;
  /** Short description, or the character the palette is drawn from. */
  blurb: string;
  colors: Palette;
  group: 'Classic' | 'Characters' | 'Yours';
  /** Text color on the accent. Computed for readability unless a theme pins it. */
  onAccent?: string;
}

export const DEFAULT_THEME = 'aincrad';
export const MAX_CUSTOM_THEMES = 40;

export const BUILTIN_THEMES: ThemeDef[] = [
  { id: 'aincrad', name: 'Aincrad', blurb: 'Amber on white, the original', group: 'Classic', colors: ['#04070d', '#c47d08', '#f0a31a', '#f6c14a', '#fdf1d6'], onAccent: '#ffffff' },
  { id: 'cardinal', name: 'Cardinal', blurb: 'Steel blue and silver', group: 'Classic', colors: ['#10161f', '#34495f', '#56779a', '#a9bdd0', '#e6edf3'] },
  { id: 'twilight', name: 'Twilight', blurb: 'Indigo glass', group: 'Classic', colors: ['#14122b', '#38337a', '#5b55c2', '#a9a5ee', '#e7e5fb'] },
  { id: 'aurora', name: 'Aurora', blurb: 'Teal frost', group: 'Classic', colors: ['#0b1d1f', '#1d6a67', '#2b9a97', '#8fd8d3', '#e0f5f3'] },
  { id: 'rin', name: 'Crimson Elegance', blurb: 'Rin Tohsaka', group: 'Characters', colors: ['#171923', '#8D263D', '#C44C62', '#E6B8B8', '#D5A85B'] },
  { id: 'cc', name: 'Immortal Emerald', blurb: 'C.C. (C2)', group: 'Characters', colors: ['#101B19', '#244D3C', '#70A77C', '#B9CDA8', '#D8D2B9'] },
  { id: 'kurumi', name: 'Crimson Nightmare', blurb: 'Kurumi Tokisaki', group: 'Characters', colors: ['#100D16', '#431321', '#8D1E37', '#C33E4F', '#D9A0A5'] },
  { id: 'sinon', name: 'Cyber Azure', blurb: 'Shino Asada (Sinon)', group: 'Characters', colors: ['#101C2D', '#234A70', '#408FC1', '#82C4E8', '#D1E6F2'] },
  { id: 'koharu', name: 'Soft Adventurer', blurb: 'Koharu (SAO: Integral Factor)', group: 'Characters', colors: ['#29232A', '#77505B', '#B77D83', '#E5BFA5', '#F1E6D4'] },
  { id: 'zerotwo', name: 'Sakura Devil', blurb: 'Zero Two', group: 'Characters', colors: ['#201321', '#762D51', '#D64F83', '#F18FB5', '#F4D7E5'] },
  { id: 'citlali', name: 'Mystic Frost', blurb: 'Citlali (Genshin Impact)', group: 'Characters', colors: ['#17152A', '#49416C', '#8D80B9', '#C6B8E7', '#E9DDF3'] },
];

const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/** Pull up to five #rrggbb colors out of pasted text such as "`#171923` `#8D263D` …". */
export function parsePalette(text: string): string[] {
  return (text.match(/#?\b[0-9a-f]{6}\b/gi) ?? []).slice(0, 5).map((hex) => `#${hex.replace('#', '').toUpperCase()}`);
}

export function allThemes(custom: ThemeDef[]): ThemeDef[] {
  return [...BUILTIN_THEMES, ...custom];
}

export function findTheme(id: string, custom: ThemeDef[]): ThemeDef | undefined {
  const key = id.trim().toLowerCase();
  return allThemes(custom).find((theme) => theme.id === key || theme.name.toLowerCase() === key);
}

export function resolveTheme(id: string, custom: ThemeDef[]): ThemeDef {
  return findTheme(id, custom) ?? BUILTIN_THEMES[0]!;
}

/** A readable, unique id for a custom theme, usable as `theme <id>` in Terminal. */
export function customThemeId(name: string, taken: string[]): string {
  const base = `my-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'theme'}`;
  let id = base;
  for (let n = 2; taken.includes(id) || BUILTIN_THEMES.some((theme) => theme.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** CSS variables for the `.os` root. Text on the accent is white or the palette's darkest color, whichever reads better. */
export function themeVars(theme: ThemeDef): Record<string, string> {
  const [deep, dark, accent, light, tint] = theme.colors;
  const onAccent = theme.onAccent ?? (contrast('#ffffff', accent) >= contrast(deep, accent) ? '#ffffff' : deep);
  return {
    '--deep': deep,
    '--accent-2': dark,
    '--accent': accent,
    '--accent-light': light,
    '--tint': tint,
    '--accent-rgb': rgb(accent).join(' '),
    '--on-accent': onAccent,
  };
}

/** A wallpaper from a web link (`url-…`, has `url`) or uploaded from the computer (`file-…`, image kept in IndexedDB). */
export interface CustomWallpaper {
  id: string;
  name: string;
  kind: 'link' | 'file';
  url?: string;
}

export const MAX_CUSTOM_WALLPAPERS = 40;

/** Accept only http(s) links to keep the wallpaper an ordinary web image. */
export function normalizeImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.href.length > 2048) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Resolve when the browser can load `url` as an image; reject otherwise or after `timeoutMs`. */
export function probeImage(url: string, timeoutMs = 15000): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const timer = window.setTimeout(() => {
      img.src = '';
      reject(new Error('The image took too long to load.'));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('No image loaded from that link. Use a direct image link (it usually ends in .jpg, .png, or .webp), and check the site allows embedding.'));
    };
    img.src = url;
  });
}

export function wallpaperNameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    const stem = last.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ').trim();
    return (stem || new URL(url).hostname).slice(0, 40);
  } catch {
    return 'Custom wallpaper';
  }
}
