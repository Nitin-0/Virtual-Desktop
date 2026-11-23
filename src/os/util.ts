/** Small shared helpers. No DOM filesystem access lives here. */

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong.';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function byteSize(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch {
    return text.length;
  }
}

/** Collapse ., .., and duplicate slashes. Always returns an absolute virtual path. */
export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join('/')}`;
}

export function joinPath(cwd: string, input: string): string {
  if (!input || input === '~') return '/Home';
  if (input.startsWith('~/')) return normalizePath(`/Home/${input.slice(2)}`);
  if (input.startsWith('/')) return normalizePath(input);
  if (cwd === '/') return normalizePath(`/${input}`);
  return normalizePath(`${cwd}/${input}`);
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/') return '/';
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}`;
}

export function baseName(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/') return '';
  return normalized.split('/').pop() ?? '';
}

export function validateName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return 'Name cannot be empty.';
  if (name === '.' || name === '..') return 'That name is reserved.';
  if (name.length > 80) return 'Name must be 80 characters or fewer.';
  if (name.startsWith('-')) return 'Name cannot start with a dash.';
  if (/[\\/:*?"<>|]/.test(name)) return 'Name cannot include \\ / : * ? " < > |';
  if (/[\u0000-\u001f]/.test(name)) return 'Name cannot include control characters.';
  if (name.endsWith('.') || name.endsWith(' ')) return 'Name cannot end with a space or period.';
  return null;
}

export function unescapeText(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function tokenize(input: string): { tokens: string[]; error?: string } {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i += 1;
    if (i >= input.length) break;
    const quote = input[i]!;
    if (quote === '"' || quote === "'") {
      const end = input.indexOf(quote, i + 1);
      if (end === -1) return { tokens, error: 'Unclosed quote.' };
      tokens.push(input.slice(i + 1, end));
      i = end + 1;
    } else {
      let j = i;
      while (j < input.length && !/\s/.test(input[j]!)) j += 1;
      tokens.push(input.slice(i, j));
      i = j;
    }
  }
  return { tokens };
}
