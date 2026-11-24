/** Shared types and constants for AINCRAD OS. */
import type { CustomWallpaper, ThemeDef } from './themes';

export const OS_NAME = 'AINCRAD OS';
export const OS_VERSION = '1.0.0';
export const OS_CODENAME = 'Cardinal';
export const OS_BUILD = '2026.11.21';

export const TASKBAR_H = 52;
export const MAX_FILE_CHARS = 1_500_000;

/** A built-in theme id (see os/themes.ts) or a custom theme id. */
export type ThemeId = string;
export type IconSize = 'small' | 'medium' | 'large';
export type InventoryView = 'grid' | 'list';
/** Which shell to show: Windows-style desktop, Android-style mobile, or pick by device. */
export type ShellMode = 'auto' | 'desktop' | 'mobile';

export interface Settings {
  theme: ThemeId;
  wallpaper: string;
  brightness: number;
  animations: boolean;
  showGrid: boolean;
  soundEnabled: boolean;
  volume: number;
  iconSize: IconSize;
  showSeconds: boolean;
  /** Show the boot sequence each time the page opens or reloads. */
  bootScreen: boolean;
  shellMode: ShellMode;
  username: string;
  hintDismissed: boolean;
  iconPositions: Record<string, { x: number; y: number }>;
  inventoryView: InventoryView;
  customThemes: ThemeDef[];
  customWallpapers: CustomWallpaper[];
}

export interface FSNode {
  id: string;
  name: string;
  parentId: string | null;
  type: 'folder' | 'file';
  content: string;
  createdAt: number;
  modifiedAt: number;
  /** Set on items at the top of /Trash: the folder and name they came from, and when. */
  trashedFrom?: string;
  trashedName?: string;
  trashedAt?: number;
}

export interface AppPayload {
  path?: string;
  fileId?: string;
  cwd?: string;
}

export interface AppWindow {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  restore?: { x: number; y: number; w: number; h: number };
  payload?: AppPayload;
}

export interface Notice {
  id: string;
  title: string;
  body?: string;
  time: number;
  kind: 'info' | 'ok' | 'warn' | 'error';
  toast: boolean;
}

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  /** Tooltip text, e.g. what a note method is for. */
  hint?: string;
  /** Items shown in a flyout submenu when this item is hovered or clicked. */
  children?: MenuItem[];
  onSelect?: () => void;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface DialogRequest {
  id: string;
  kind: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (value: string | boolean | null) => void;
}

export interface Clip {
  mode: 'copy' | 'cut';
  ids: string[];
}


export const WALLPAPERS: { id: string; name: string; src: string | null; color?: string }[] = [
  { id: 'dusk', name: 'Ring Fortress', src: '/wallpapers/dusk.jpg' },
  { id: 'cardinal', name: 'Observatory', src: '/wallpapers/cardinal.jpg' },
  { id: 'starwell', name: 'Starwell', src: '/wallpapers/starwell.jpg' },
  { id: 'crystal', name: 'Crystal Hall', src: '/wallpapers/crystal.jpg' },
  { id: 'aurora', name: 'Ridge Watch', src: '/wallpapers/aurora.jpg' },
  { id: 'void', name: 'Void', src: null, color: '#05070c' },
  { id: 'ink', name: 'Ink', src: null, color: '#101820' },
];