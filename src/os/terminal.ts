/**
 * Command interpreter for AINCRAD Terminal.
 * Every filesystem command calls the shared virtual archive — there are no
 * canned directory listings.
 */
import { APPS, resolveApp } from './apps';
import { NOTE_TYPES, appForFile, getNoteType, nameForType, titleFromName } from './noteTypes';
import { OS_CODENAME, OS_NAME, OS_VERSION } from './types';
import type { ThemeDef } from './themes';
import type { AppPayload, FSNode } from './types';
import {
  archiveStats,
  copyPath,
  createFile,
  discardPath,
  emptyTrash,
  list,
  pathOf,
  restoreNode,
  TRASH_ID,
  findUnder,
  getByPath,
  listPath,
  mkdirPath,
  movePath,
  readPath,
  renamePath,
  resolveInput,
  touchPath,
  writePath,
} from './vfs';
import { baseName, formatBytes, formatWhen, parentPath, tokenize, unescapeText } from './util';

export interface ShellHooks {
  getCwd: () => string;
  setCwd: (path: string) => void;
  getUsername: () => string;
  getTheme: () => string;
  /** Built-in and custom themes. */
  getThemes: () => ThemeDef[];
  getWallpaper: () => string;
  setTheme: (theme: string) => void;
  launch: (appId: string, payload?: AppPayload) => void;
}

export interface CommandResult {
  output: string;
  error?: boolean;
  clear?: boolean;
}

const COMMANDS = [
  'help', 'clear', 'pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'write', 'rename',
  'rm', 'rmdir', 'cp', 'mv', 'find', 'date', 'time', 'about', 'status', 'apps',
  'open', 'theme', 'whoami', 'new', 'trash',
];

function fail(message: string): CommandResult {
  return { output: message, error: true };
}

function splitFlags(args: string[]): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>();
  const rest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('-') && arg.length > 1 && !arg.startsWith('--')) {
      for (const ch of arg.slice(1)) flags.add(ch);
    } else rest.push(arg);
  }
  return { flags, rest };
}

async function formatLong(nodes: FSNode[], folderPath: string): Promise<string> {
  if (!nodes.length) return '(empty)';
  const rows: string[] = [];
  for (const node of nodes) {
    const path = folderPath === '/' ? `/${node.name}` : `${folderPath}/${node.name}`;
    if (node.type === 'folder') {
      const kids = await listPath(path);
      rows.push(`folder  ${String(kids.length).padStart(4, ' ')} items   ${formatWhen(node.modifiedAt)}   ${node.name}/`);
    } else {
      rows.push(`file    ${formatBytes(new TextEncoder().encode(node.content).length).padStart(10, ' ')}   ${formatWhen(node.modifiedAt)}   ${node.name}`);
    }
  }
  return rows.join('\n');
}

function formatShort(nodes: FSNode[]): string {
  if (!nodes.length) return '(empty)';
  return nodes.map((node) => (node.type === 'folder' ? `${node.name}/` : node.name)).join('\n');
}

export async function runCommand(line: string, hooks: ShellHooks): Promise<CommandResult> {
  const parsed = tokenize(line);
  if (parsed.error) return fail(parsed.error);
  const [rawCmd, ...args] = parsed.tokens;
  if (!rawCmd) return { output: '' };
  const cmd = rawCmd.toLowerCase();
  const cwd = hooks.getCwd();

  try {
    switch (cmd) {
      case 'help':
        return { output: helpText() };
      case 'clear':
        return { output: '', clear: true };
      case 'pwd':
        return { output: cwd };
      case 'ls':
        return await cmdLs(args, cwd);
      case 'cd':
        return await cmdCd(args, cwd, hooks);
      case 'mkdir':
        return await cmdMkdir(args, cwd);
      case 'touch':
        return await cmdTouch(args, cwd);
      case 'cat':
        return await cmdCat(args, cwd);
      case 'write':
        return await cmdWrite(args, cwd);
      case 'rename':
        return await cmdRename(args, cwd);
      case 'rm':
        return await cmdRm(args, cwd);
      case 'rmdir':
        return await cmdRmdir(args, cwd);
      case 'cp':
        return await cmdTransfer('cp', args, cwd);
      case 'mv':
        return await cmdTransfer('mv', args, cwd);
      case 'find':
        return await cmdFind(args, cwd);
      case 'date':
        return { output: new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) };
      case 'time':
        return {
          output: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }),
        };
      case 'about':
        return { output: aboutText() };
      case 'status':
        return await cmdStatus(hooks);
      case 'apps':
        return { output: APPS.map((app) => `${app.id.padEnd(12, ' ')} ${app.name} — ${app.description}`).join('\n') };
      case 'open':
        return await cmdOpen(args, cwd, hooks);
      case 'theme':
        return cmdTheme(args, hooks);
      case 'trash':
        return await cmdTrash(args);
      case 'new':
        return await cmdNew(args, cwd);
      case 'whoami':
        return { output: hooks.getUsername() };
      default:
        return fail(`Unknown command: ${rawCmd}\nType help for the command list.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Command failed.';
    return fail(`${cmd}: ${message}`);
  }
}

function helpText(): string {
  return [
    'AINCRAD TERMINAL',
    'Commands operate on the virtual archive (IndexedDB) — the same archive Inventory uses.',
    'This is not a shell on your computer, and it does not see your Windows files.',
    '',
    'help                 show this list',
    'clear                clear the screen',
    'pwd                  print the working directory',
    'ls [path]            list names (folders end with /)',
    'ls -l [path]         list type, size, and modified time',
    'cd [path]            change directory (alone, or ~, goes to /Home)',
    'mkdir <path>         create a folder',
    'touch <path>         create an empty file, or update its modified time',
    'cat <file>           print a text file',
    'write <file> <text>  overwrite a file (\\n becomes a newline)',
    'write -a <file> <text>  append text',
    'new                  list note methods (Cornell, checklist, …)',
    'new <method> [file]  create a note from a method template',
    'rename <path> <name> rename inside the same folder',
    'rm <file>            move a file to /Trash',
    'rm -r <path>         move a file or folder to /Trash',
    '                     (inside /Trash, rm deletes for good)',
    'rmdir <folder>       move an empty folder to /Trash',
    'trash                list what is in /Trash',
    'trash restore <name> put an item back where it came from',
    'trash empty          delete everything in /Trash for good',
    'cp <src> <dest>      copy a file or folder',
    'mv <src> <dest>      move or rename',
    'find <text>          search names under the current directory',
    'date                 current date',
    'time                 current time',
    'about                about this system',
    'status               session and archive status',
    'apps                 list applications',
    'open <app|path>      open an app, folder, or text file',
    'theme [id|name]      list or set the interface theme',
    'whoami               print the session name',
    '',
    'Up/Down  history    Tab  complete    Ctrl+L  clear',
    'Paths may be absolute (/Home/Documents), relative, or start with ~.',
  ].join('\n');
}

function aboutText(): string {
  return [
    `${OS_NAME} ${OS_VERSION} (${OS_CODENAME})`,
    'A browser-based virtual desktop. Files live in IndexedDB on this origin.',
    'Preferences live in localStorage. There is no server-side database.',
    'Nothing here is a native Windows feature. Nothing is written to your device',
    'disk unless you export an archive from Settings and your browser downloads it.',
  ].join('\n');
}

async function cmdLs(args: string[], cwd: string): Promise<CommandResult> {
  const { flags, rest } = splitFlags(args);
  if (rest.length > 1) return fail('ls: too many arguments');
  const target = resolveInput(cwd, rest[0] ?? '.');
  const node = await getByPath(target);
  if (!node) return fail(`ls: no such path: ${target}`);
  if (node.type === 'file') {
    const output = flags.has('l') ? await formatLong([node], parentDir(target)) : node.name;
    return { output };
  }
  const nodes = await listPath(target);
  const output = flags.has('l') ? await formatLong(nodes, target) : formatShort(nodes);
  return { output };
}

function parentDir(path: string): string {
  if (path === '/') return '/';
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

async function cmdCd(args: string[], cwd: string, hooks: ShellHooks): Promise<CommandResult> {
  if (args.length > 1) return fail('cd: too many arguments');
  const target = args.length === 0 || args[0] === '~' ? '/Home' : resolveInput(cwd, args[0]!);
  const node = await getByPath(target);
  if (!node) return fail(`cd: no such path: ${target}`);
  if (node.type !== 'folder') return fail(`cd: not a directory: ${target}`);
  hooks.setCwd(target);
  return { output: '' };
}

async function cmdMkdir(args: string[], cwd: string): Promise<CommandResult> {
  if (!args.length) return fail('mkdir: missing operand');
  const made: string[] = [];
  for (const arg of args) {
    made.push(await mkdirPath(resolveInput(cwd, arg)));
  }
  return { output: made.map((path) => `created ${path}`).join('\n') };
}

async function cmdTouch(args: string[], cwd: string): Promise<CommandResult> {
  if (!args.length) return fail('touch: missing operand');
  const made: string[] = [];
  for (const arg of args) made.push(await touchPath(resolveInput(cwd, arg)));
  return { output: made.map((path) => `touched ${path}`).join('\n') };
}

async function cmdCat(args: string[], cwd: string): Promise<CommandResult> {
  if (args.length !== 1) return fail('cat: usage: cat <file>');
  const content = await readPath(resolveInput(cwd, args[0]!));
  return { output: content.length ? content : '(empty)' };
}

async function cmdWrite(args: string[], cwd: string): Promise<CommandResult> {
  let append = false;
  let rest = args;
  if (rest[0] === '-a') {
    append = true;
    rest = rest.slice(1);
  }
  if (rest.length < 2) return fail('write: usage: write <file> <text>   or   write -a <file> <text>');
  const [file, ...textParts] = rest;
  const text = unescapeText(textParts.join(' '));
  const path = await writePath(resolveInput(cwd, file!), text, append);
  return { output: `${append ? 'appended' : 'wrote'} ${path}` };
}

async function cmdRename(args: string[], cwd: string): Promise<CommandResult> {
  if (args.length !== 2) return fail('rename: usage: rename <path> <new-name>');
  if (args[1]!.includes('/') || args[1]!.includes('\\')) {
    return fail('rename: new name cannot include a slash. Use mv to move.');
  }
  const path = await renamePath(resolveInput(cwd, args[0]!), args[1]!);
  return { output: `renamed to ${path}` };
}

async function cmdRm(args: string[], cwd: string): Promise<CommandResult> {
  const { flags, rest } = splitFlags(args);
  if (!rest.length) return fail('rm: missing operand');
  const lines: string[] = [];
  for (const arg of rest) {
    const target = resolveInput(cwd, arg);
    const outcome = await discardPath(target, { recursive: flags.has('r') });
    lines.push(outcome === 'trashed' ? `moved ${target} to /Trash` : `deleted ${target} permanently`);
  }
  return { output: lines.join('\n') };
}

async function cmdRmdir(args: string[], cwd: string): Promise<CommandResult> {
  if (args.length !== 1) return fail('rmdir: usage: rmdir <folder>');
  const target = resolveInput(cwd, args[0]!);
  const outcome = await discardPath(target, { recursive: false, emptyOnly: true });
  return { output: outcome === 'trashed' ? `moved ${target} to /Trash` : `deleted ${target} permanently` };
}

async function cmdTransfer(kind: 'cp' | 'mv', args: string[], cwd: string): Promise<CommandResult> {
  if (args.length !== 2) return fail(`${kind}: usage: ${kind} <src> <dest>`);
  const src = resolveInput(cwd, args[0]!);
  const dest = resolveInput(cwd, args[1]!);
  const path = kind === 'cp' ? await copyPath(src, dest) : await movePath(src, dest);
  return { output: `${kind === 'cp' ? 'copied to' : 'moved to'} ${path}` };
}

async function cmdFind(args: string[], cwd: string): Promise<CommandResult> {
  if (args.length !== 1) return fail('find: usage: find <text>');
  const hits = await findUnder(cwd, args[0]!);
  if (!hits.length) return { output: `no names matching “${args[0]}” under ${cwd}` };
  return { output: hits.map((hit) => hit.path).join('\n') };
}

async function cmdStatus(hooks: ShellHooks): Promise<CommandResult> {
  const stats = await archiveStats();
  const lines = [
    `${OS_NAME} ${OS_VERSION}`,
    `user: ${hooks.getUsername()}`,
    `cwd: ${hooks.getCwd()}`,
    `theme: ${hooks.getTheme()}`,
    `wallpaper: ${hooks.getWallpaper()}`,
    `archive nodes: ${stats.count} (${stats.folders} folders, ${stats.files} files)`,
    `archive text: ${formatBytes(stats.bytes)}`,
    `indexedDB: ${typeof indexedDB !== 'undefined' ? 'available' : 'missing'}`,
    `online: ${navigator.onLine ? 'yes' : 'no'}`,
    `language: ${navigator.language || 'unknown'}`,
    `time: ${new Date().toLocaleString()}`,
  ];
  return { output: lines.join('\n') };
}

async function cmdOpen(args: string[], cwd: string, hooks: ShellHooks): Promise<CommandResult> {
  if (args.length !== 1) return fail('open: usage: open <app|path>');
  const token = args[0]!;
  const asPath = resolveInput(cwd, token);
  const looksLikePath = token.startsWith('/') || token.startsWith('~') || token.includes('/') || token.includes('.');
  const resolved = await getByPath(asPath);
  const app = resolveApp(token);
  if (resolved && (looksLikePath || !app)) {
    if (resolved.type === 'folder') {
      hooks.launch('inventory', { path: asPath });
      return { output: `opened Inventory at ${asPath}` };
    }
    const appId = appForFile(resolved.name);
    hooks.launch(appId, { fileId: resolved.id });
    return { output: `opened ${resolved.name} in ${appId === 'checklist' ? 'Checklist' : 'Codex'}` };
  }
  if (app && !looksLikePath) {
    hooks.launch(app.id, app.id === 'terminal' ? { cwd } : app.id === 'inventory' ? { path: cwd } : undefined);
    return { output: `opened ${app.name}` };
  }
  return fail(`open: nothing named “${token}” in ${cwd} or in the application list`);
}

async function cmdTrash(args: string[]): Promise<CommandResult> {
  const [sub, ...rest] = args;
  if (!sub || sub === 'list') {
    const items = await list(TRASH_ID);
    if (!items.length) return { output: 'Trash is empty.' };
    const rows: string[] = [];
    for (const item of items) {
      let from = 'unknown folder';
      if (item.trashedFrom) {
        try { from = await pathOf(item.trashedFrom); } catch { from = 'a folder that no longer exists'; }
      }
      const when = item.trashedAt ? formatWhen(item.trashedAt) : '—';
      rows.push(`${(item.name + (item.type === 'folder' ? '/' : '')).padEnd(28, ' ')} from ${from}   ${when}`);
    }
    return { output: `${rows.join('\n')}\n\ntrash restore <name>   ·   trash empty` };
  }
  if (sub === 'restore') {
    if (rest.length !== 1) return fail('trash: usage: trash restore <name>');
    const items = await list(TRASH_ID);
    const item = items.find((entry) => entry.name === rest[0]);
    if (!item) return fail(`trash: nothing named “${rest[0]}” in /Trash`);
    const { path } = await restoreNode(item.id);
    return { output: `restored to ${path}` };
  }
  if (sub === 'empty') {
    const count = await emptyTrash();
    return { output: count ? `deleted ${count} item${count === 1 ? '' : 's'} permanently` : 'Trash was already empty.' };
  }
  return fail('trash: usage: trash | trash restore <name> | trash empty');
}

async function cmdNew(args: string[], cwd: string): Promise<CommandResult> {
  if (!args.length) {
    const rows = NOTE_TYPES.map((type) => `${type.id.padEnd(12, ' ')} ${type.label} — ${type.blurb}`);
    return { output: `${rows.join('\n')}\n\nusage: new <method> [file]   e.g. new cornell "Lecture 3.md"` };
  }
  if (args.length > 2) return fail('new: usage: new <method> [file]');
  const type = getNoteType(args[0]!);
  if (!type) return fail(`new: unknown method “${args[0]}”. Type new to list methods.`);
  const target = resolveInput(cwd, args[1] ?? type.defaultName);
  const folderPath = parentPath(target);
  const folder = await getByPath(folderPath);
  if (!folder || folder.type !== 'folder') return fail(`new: no such folder: ${folderPath}`);
  const name = nameForType(type, baseName(target));
  await createFile(folder.id, name, type.template(titleFromName(name), new Date()));
  const created = folderPath === '/' ? `/${name}` : `${folderPath}/${name}`;
  return { output: `created ${created} (${type.label})\nopen it with: open "${name}"` };
}

function cmdTheme(args: string[], hooks: ShellHooks): CommandResult {
  const themes = hooks.getThemes();
  if (!args.length) {
    const current = hooks.getTheme();
    const lines = themes.map((theme) => `${theme.id === current ? '*' : ' '} ${theme.id.padEnd(14, ' ')} ${theme.name} — ${theme.blurb}`);
    return { output: `current: ${current}\n${lines.join('\n')}\n\nusage: theme <id or name>   ·   Settings → Appearance makes your own` };
  }
  const query = args.join(' ').toLowerCase();
  const match = themes.find((theme) => theme.id === query || theme.name.toLowerCase() === query);
  if (!match) return fail(`theme: unknown theme “${args.join(' ')}”. Type theme to list them.`);
  hooks.setTheme(match.id);
  return { output: `theme set to ${match.name} (${match.id})` };
}

export async function completeLine(line: string, cwd: string): Promise<{ line: string; matches: string[] }> {
  const endsWithSpace = /\s$/.test(line);
  const parsed = tokenize(line.trimEnd());
  if (parsed.error) return { line, matches: [] };
  const tokens = parsed.tokens;
  const completingCommand = !endsWithSpace && tokens.length <= 1;
  if (completingCommand) {
    const partial = tokens[0] ?? '';
    const matches = COMMANDS.filter((command) => command.startsWith(partial.toLowerCase()));
    if (matches.length === 1) {
      const next = matches[0]! + ' ';
      return { line: line.trimEnd().slice(0, line.trimEnd().length - partial.length) + next, matches };
    }
    return { line, matches };
  }

  const partial = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '');
  if (partial.includes('"') || partial.includes("'")) return { line, matches: [] };
  const { dir, prefix } = splitPartial(partial, cwd);
  let nodes: FSNode[] = [];
  try {
    nodes = await listPath(dir);
  } catch {
    return { line, matches: [] };
  }
  const matches = nodes
    .filter((node) => node.name.startsWith(prefix))
    .map((node) => (node.type === 'folder' ? `${node.name}/` : node.name));
  if (!matches.length) return { line, matches: [] };
  if (matches.length === 1) {
    const completed = quoteIfNeeded(dir === '/' && partial.startsWith('/') ? `/${matches[0]}` : rebuild(partial, matches[0]!));
    const suffix = matches[0]!.endsWith('/') ? '' : ' ';
    return { line: replacePartial(line, partial, completed + suffix, endsWithSpace), matches };
  }
  const shared = commonPrefix(matches);
  if (shared && shared !== prefix) {
    const completed = rebuild(partial, shared);
    return { line: replacePartial(line, partial, completed, endsWithSpace), matches };
  }
  return { line, matches };
}

function splitPartial(partial: string, cwd: string): { dir: string; prefix: string } {
  if (!partial) return { dir: cwd, prefix: '' };
  if (partial.endsWith('/')) return { dir: resolveInput(cwd, partial), prefix: '' };
  const full = resolveInput(cwd, partial);
  return { dir: full === '/' ? '/' : full.slice(0, full.lastIndexOf('/')) || '/', prefix: partial.split('/').pop() ?? '' };
}

function rebuild(partial: string, name: string): string {
  const slash = partial.lastIndexOf('/');
  if (slash === -1) return name;
  return partial.slice(0, slash + 1) + name;
}

function replacePartial(line: string, partial: string, next: string, endsWithSpace: boolean): string {
  if (endsWithSpace) return `${line}${next}`;
  if (partial && line.endsWith(partial)) return line.slice(0, -partial.length) + next;
  return line;
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

function commonPrefix(values: string[]): string {
  if (!values.length) return '';
  let prefix = values[0]!;
  for (const value of values) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem('aincrad-os-history');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string').slice(-200);
  } catch {
    return [];
  }
}

export function pushHistory(command: string): string[] {
  const history = loadHistory();
  if (history[history.length - 1] !== command) history.push(command);
  const trimmed = history.slice(-200);
  try {
    localStorage.setItem('aincrad-os-history', JSON.stringify(trimmed));
  } catch {
    /* History is a convenience; the archive still works if this fails. */
  }
  return trimmed;
}
