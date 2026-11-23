import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useOS } from '../context/OSContext';
import {
  CHECKLIST_EXT,
  parseChecklist,
  serializeChecklist,
  titleFromName,
  type ChecklistEntry,
} from '../os/noteTypes';
import type { FSNode } from '../os/types';
import { messageOf, uid } from '../os/util';
import { createFile, ensureDocumentsFolder, getNode, list, onVfsChange, pathOf, writeContent } from '../os/vfs';

type Row = ChecklistEntry & { key: string };

function toRows(content: string): Row[] {
  return parseChecklist(content).map((entry) => ({ ...entry, key: uid() }));
}

function serialize(rows: Row[]): string {
  return serializeChecklist(rows.map((row): ChecklistEntry => (
    row.kind === 'item' ? { kind: 'item', done: row.done, text: row.text } : { kind: row.kind, text: row.text }
  )));
}

export function ChecklistApp({ windowId, fileId }: { windowId: string; fileId?: string }) {
  const { setWindowTitle, setWindowPayload, registerCloser, notify, openOrFocus } = useOS();
  const [node, setNode] = useState<FSNode | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('Opening…');
  const [missing, setMissing] = useState(false);
  const [location, setLocation] = useState('');
  const [draft, setDraft] = useState('');
  const [hideDone, setHideDone] = useState(false);

  const savedRef = useRef('');
  const latest = useRef({ node, rows, missing });
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const focusNext = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { node, rows, missing };
  });

  // Load the file, or create a new checklist in /Home/Documents when opened without one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = fileId;
        if (!id) {
          const folder = await ensureDocumentsFolder();
          const names = new Set((await list(folder.id)).map((child) => child.name));
          let name = `Checklist${CHECKLIST_EXT}`;
          for (let n = 2; names.has(name); n += 1) name = `Checklist ${n}${CHECKLIST_EXT}`;
          if (cancelled) return;
          const file = await createFile(folder.id, name, `# ${titleFromName(name)}\n`);
          if (cancelled) return;
          setWindowPayload(windowId, { fileId: file.id });
          return;
        }
        const loaded = await getNode(id);
        if (cancelled) return;
        if (!loaded || loaded.type !== 'file') {
          setMissing(true);
          setStatus('File not found');
          return;
        }
        const nextRows = toRows(loaded.content);
        savedRef.current = serialize(nextRows);
        setRows(nextRows);
        setNode(loaded);
        setMissing(false);
        setStatus('Saved');
        const where = await pathOf(loaded.id);
        if (!cancelled) setLocation(where);
      } catch (error) {
        if (!cancelled) {
          setStatus(messageOf(error));
          notify({ title: 'Could not open checklist', body: messageOf(error), kind: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, notify, setWindowPayload, windowId]);

  const flush = useCallback(async () => {
    const { node: current, rows: currentRows, missing: gone } = latest.current;
    if (!current || gone) return;
    const text = serialize(currentRows);
    if (text === savedRef.current) return;
    await writeContent(current.id, text);
    savedRef.current = text;
    setStatus('Saved');
  }, []);

  useEffect(() => registerCloser(windowId, flush), [registerCloser, windowId, flush]);

  // Autosave shortly after each change.
  useEffect(() => {
    if (!node || missing) return;
    if (serialize(rows) === savedRef.current) return;
    const timer = window.setTimeout(() => {
      setStatus('Saving…');
      flush().catch((error) => {
        setStatus('Save failed');
        notify({ title: 'Checklist not saved', body: messageOf(error), kind: 'error' });
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [rows, node, missing, flush, notify]);

  // Follow renames, deletes, and edits made in Codex or Terminal.
  useEffect(() => onVfsChange(() => {
    const current = latest.current.node;
    if (!current) return;
    void getNode(current.id).then(async (fresh) => {
      if (!fresh || fresh.type !== 'file') {
        setMissing(true);
        setStatus('Removed from archive');
        return;
      }
      if (fresh.name !== current.name) {
        setNode(fresh);
        setLocation(await pathOf(fresh.id));
      }
      const unsaved = serialize(latest.current.rows) !== savedRef.current;
      if (!unsaved && fresh.content !== savedRef.current) {
        const nextRows = toRows(fresh.content);
        savedRef.current = serialize(nextRows);
        setRows(nextRows);
        setNode(fresh);
        setStatus('Updated from archive');
      }
    });
  }), []);

  useEffect(() => {
    if (node) setWindowTitle(windowId, `Checklist — ${node.name}`);
  }, [node, setWindowTitle, windowId]);

  // After an add, delete, or move, put the caret in the item that should have it.
  useEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    inputs.current.get(key)?.focus();
  }, [rows]);

  const items = rows.filter((row) => row.kind === 'item');
  const doneCount = items.filter((row) => row.kind === 'item' && row.done).length;
  const titleRow = rows.find((row) => row.kind === 'title');
  const title = titleRow?.text ?? (node ? titleFromName(node.name) : '');

  const update = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? ({ ...row, ...patch } as Row) : row)));
  };

  const setTitle = (text: string) => {
    setRows((prev) => (prev.some((row) => row.kind === 'title')
      ? prev.map((row) => (row.kind === 'title' ? { ...row, text } : row))
      : [{ kind: 'title', text, key: uid() }, ...prev]));
  };

  const addItem = (text: string, afterKey?: string) => {
    const row: Row = { kind: 'item', done: false, text, key: uid() };
    setRows((prev) => {
      if (afterKey) {
        const index = prev.findIndex((entry) => entry.key === afterKey);
        if (index >= 0) return [...prev.slice(0, index + 1), row, ...prev.slice(index + 1)];
      }
      return [...prev, row];
    });
    return row.key;
  };

  const removeItem = (key: string) => {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.key === key);
      const before = prev.slice(0, index).reverse().find((row) => row.kind === 'item');
      if (before) focusNext.current = before.key;
      return prev.filter((row) => row.key !== key);
    });
  };

  const moveItem = (key: string, delta: -1 | 1) => {
    setRows((prev) => {
      const index = prev.findIndex((row) => row.key === key);
      let target = index + delta;
      while (target >= 0 && target < prev.length && prev[target]!.kind !== 'item') target += delta;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    focusNext.current = key;
  };

  if (missing) {
    return (
      <div className="app-error">
        <p>This checklist is no longer in the virtual archive.</p>
      </div>
    );
  }

  return (
    <div className="checklist" data-testid="checklist">
      <header className="check-head">
        <input
          className="check-title"
          value={title}
          aria-label="Checklist title"
          data-testid="checklist-title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="check-progress" aria-label={`${doneCount} of ${items.length} done`}>
          <span><strong data-testid="checklist-count">{doneCount}</strong> of {items.length} done</span>
          <span className="check-bar"><span style={{ width: items.length ? `${(doneCount / items.length) * 100}%` : 0 }} /></span>
        </div>
      </header>

      <form
        className="check-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          addItem(draft.trim());
          setDraft('');
        }}
      >
        <input
          className="field"
          value={draft}
          placeholder="Add an item and press Enter"
          data-testid="checklist-new"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}><Plus size={14} /> Add</button>
      </form>

      <ul className="check-list">
        {items.length === 0 && <li className="empty-note">No items yet.</li>}
        {rows.map((row) => {
          if (row.kind !== 'item') {
            return row.kind === 'text' && row.text.trim() ? <li key={row.key} className="check-text">{row.text}</li> : null;
          }
          if (hideDone && row.done) return null;
          return (
            <li key={row.key} className={`check-item${row.done ? ' is-done' : ''}`} data-testid="checklist-item">
              <input
                type="checkbox"
                checked={row.done}
                aria-label={`Mark “${row.text || 'item'}” ${row.done ? 'not done' : 'done'}`}
                onChange={(event) => update(row.key, { done: event.target.checked })}
              />
              <input
                className="check-text-input"
                value={row.text}
                aria-label="Item text"
                ref={(el) => {
                  if (el) inputs.current.set(row.key, el);
                  else inputs.current.delete(row.key);
                }}
                onChange={(event) => update(row.key, { text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    focusNext.current = addItem('', row.key);
                  } else if (event.key === 'Backspace' && row.text === '') {
                    event.preventDefault();
                    removeItem(row.key);
                  } else if (event.altKey && event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveItem(row.key, -1);
                  } else if (event.altKey && event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveItem(row.key, 1);
                  }
                }}
              />
              <button type="button" className="icon-btn" aria-label="Delete item" onClick={() => removeItem(row.key)}>
                <X size={14} />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="check-tools">
        <label className="check-row">
          <input type="checkbox" checked={hideDone} onChange={(event) => setHideDone(event.target.checked)} /> Hide completed
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={doneCount === 0}
          onClick={() => setRows((prev) => prev.filter((row) => !(row.kind === 'item' && row.done)))}
        >
          Clear completed
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!node}
          onClick={() => {
            if (node) void flush().finally(() => openOrFocus('editor', { fileId: node.id }));
          }}
        >
          Open as text
        </button>
      </div>

      <footer className="editor-foot">
        <span className="check-status" data-testid="checklist-status">{status}</span>
        <span>{location || 'Virtual archive'}</span>
        <span className="check-keys">Enter new · ⌫ on empty deletes · Alt+↑↓ moves</span>
      </footer>
    </div>
  );
}
