import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Calculator,
  FolderOpen,
  Monitor,
  Settings,
  SquareTerminal,
  FileText,
  ListChecks,
  Puzzle,
} from 'lucide-react';

export interface AppDef {
  id: string;
  name: string;
  category: 'System' | 'Productivity' | 'Reference' | 'Games';
  description: string;
  keywords: string[];
  icon: LucideIcon;
  multi: boolean;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export const APPS: AppDef[] = [
  {
    id: 'inventory',
    name: 'Inventory',
    category: 'System',
    description: 'Browse the virtual archive',
    keywords: ['files', 'folders', 'archive', 'explorer', 'inventory'],
    icon: FolderOpen,
    multi: true,
    defaultW: 880,
    defaultH: 560,
    minW: 420,
    minH: 300,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    category: 'System',
    description: 'Command line for the same archive',
    keywords: ['terminal', 'term', 'shell', 'console', 'cli'],
    icon: SquareTerminal,
    multi: true,
    defaultW: 740,
    defaultH: 460,
    minW: 420,
    minH: 280,
  },
  {
    id: 'editor',
    name: 'Codex',
    category: 'Productivity',
    description: 'Edit text files with autosave',
    keywords: ['editor', 'codex', 'notes', 'text', 'write'],
    icon: FileText,
    multi: true,
    defaultW: 760,
    defaultH: 520,
    minW: 380,
    minH: 280,
  },
  {
    id: 'checklist',
    name: 'Checklist',
    category: 'Productivity',
    description: 'Tick off action items',
    keywords: ['checklist', 'todo', 'tasks', 'list', 'check'],
    icon: ListChecks,
    multi: true,
    defaultW: 520,
    defaultH: 540,
    minW: 340,
    minH: 300,
  },
  {
    id: 'settings',
    name: 'Settings',
    category: 'System',
    description: 'Theme, wallpaper, sound, archive',
    keywords: ['settings', 'setting', 'preferences', 'theme', 'wallpaper'],
    icon: Settings,
    multi: false,
    defaultW: 720,
    defaultH: 540,
    minW: 460,
    minH: 360,
  },
  {
    id: 'system',
    name: 'System',
    category: 'System',
    description: 'Version, browser, and storage facts',
    keywords: ['system', 'sysinfo', 'info', 'about', 'status'],
    icon: Monitor,
    multi: false,
    defaultW: 680,
    defaultH: 540,
    minW: 420,
    minH: 320,
  },
  {
    id: 'calculator',
    name: 'Calculator',
    category: 'Productivity',
    description: 'Arithmetic without leaving the desktop',
    keywords: ['calculator', 'calc', 'math'],
    icon: Calculator,
    multi: false,
    defaultW: 320,
    defaultH: 460,
    minW: 280,
    minH: 400,
  },
  {
    id: 'guide',
    name: 'Guide',
    category: 'Reference',
    description: 'How this virtual desktop works',
    keywords: ['guide', 'help', 'manual', 'docs'],
    icon: BookOpen,
    multi: false,
    defaultW: 640,
    defaultH: 520,
    minW: 380,
    minH: 300,
  },
  {
    id: 'hanoi',
    name: 'Tower of Hanoi',
    category: 'Games',
    description: 'Classic puzzle with adjustable difficulty',
    keywords: ['hanoi', 'puzzle', 'tower', 'game'],
    icon: Puzzle,
    multi: true,
    defaultW: 500,
    defaultH: 400,
    minW: 400,
    minH: 300,
  },
];

export function getApp(id: string): AppDef | undefined {
  return APPS.find((app) => app.id === id);
}

export function resolveApp(token: string): AppDef | undefined {
  const query = token.trim().toLowerCase();
  return APPS.find(
    (app) => app.id === query || app.name.toLowerCase() === query || app.keywords.includes(query),
  );
}