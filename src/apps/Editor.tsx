import { useEffect, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { messageOf } from '../os/util';
import { createFile, ensureDocumentsFolder, getNode, list, onVfsChange, pathOf, renameNode, trashNode, writeContent } from '../os/vfs';
import type { FSNode } from '../os/types';

export function EditorApp({ windowId, fileId }: { windowId: string; fileId?: string }) {
  const { setWindowTitle, setWindowPayload, registerCloser, notify, prompt, closeWindow } = useOS();
  const [node, setNode] = useState<FSNode | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState('Opening…');
  const [missing, setMissing] = useState(false);
  const missingRef = useRef(false);
  missingRef.current = missing;
  const [location, setLocation] = useState('');
  const contentRef = useRef('');
  const savedRef = useRef('');
  const dirtyRef = useRef(false);
  const nodeRef = useRef<FSNode | null>(null);
  contentRef.current = content;
  savedRef.current = saved;
  dirtyRef.current = content !== saved;
  nodeRef.current = node;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let id = fileId;
        if (!id) {
          const folder = await ensureDocumentsFolder();
          if (cancelled) return;
          const children = await list(folder.id);
          if (cancelled) return;
          const names = new Set(children.map((child) => child.name));
          let name = 'Untitled.txt';
          let n = 2;
          while (names.has(name)) {
            name = `Untitled ${n}.txt`;
            n += 1;
          }
          const file = await createFile(folder.id, name, '');
          if (cancelled) return;
          id = file.id;
          setWindowPayload(windowId, { fileId: id });
        }
        const loaded = await getNode(id);
        if (cancelled) return;
        if (!loaded || loaded.type !== 'file') {
          setMissing(true);
          setStatus('File not found');
          return;
        }
        setNode(loaded);
        setContent(loaded.content);
        setSaved(loaded.content);
        setMissing(false);
        setStatus('Saved');
        setWindowTitle(windowId, `Codex — ${loaded.name}`);
        setLocation(await pathOf(loaded.id));
      } catch (error) {
        if (!cancelled) {
          setStatus(messageOf(error));
          notify({ title: 'Could not open document', body: messageOf(error), kind: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, notify, setWindowPayload, setWindowTitle, windowId]);

  const flush = async () => {
    if (missingRef.current) return;
    const current = nodeRef.current;
    if (!current) return;
    const text = contentRef.current;
    if (text === savedRef.current) {
      setStatus('Saved');
      return;
    }
    setStatus('Saving…');
    const next = await writeContent(current.id, text);
    setSaved(text);
    setNode(next);
    setStatus('Saved');
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => registerCloser(windowId, () => flushRef.current()), [registerCloser, windowId]);

  useEffect(() => {
    if (!node || missing) return;
    if (content === saved) return;
    setStatus('Saving…');
    const timer = window.setTimeout(() => {
      void flushRef.current().catch((error) => {
        setStatus('Save failed');
        notify({ title: 'Autosave failed', body: messageOf(error), kind: 'error' });
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [content, saved, node, missing, notify]);

  useEffect(() => {
    if (node) setWindowTitle(windowId, `Codex — ${node.name}${content !== saved ? ' · unsaved' : ''}`);
  }, [content, saved, node, setWindowTitle, windowId]);

  useEffect(() => onVfsChange(() => {
    const current = nodeRef.current;
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
      if (fresh.content !== contentRef.current && fresh.modifiedAt !== (nodeRef.current?.modifiedAt ?? 0)) {
        if (!dirtyRef.current) {
          setContent(fresh.content);
          setSaved(fresh.content);
          setNode(fresh);
          setStatus('Updated from archive');
        } else {
          setStatus('Changed elsewhere — your edits are still here');
        }
      }
    });
  }), []);

  const rename = async () => {
    if (!node) return;
    const name = await prompt({ title: 'Rename document', message: 'New name in the virtual archive.', defaultValue: node.name, confirmLabel: 'Rename' });
    if (!name) return;
    try {
      await flushRef.current();
      const next = await renameNode(node.id, name);
      setNode(next);
      setLocation(await pathOf(next.id));
      notify({ title: 'Renamed', body: name, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Could not rename', body: messageOf(error), kind: 'error' });
    }
  };

  const removeDoc = async () => {
    if (!node) return;
    try {
      await flushRef.current();
      missingRef.current = true;
      await trashNode(node.id);
      setMissing(true);
      setNode(null);
      notify({ title: 'Moved to Trash', body: `${node.name} · open Trash to restore it`, kind: 'ok' });
      await closeWindow(windowId);
    } catch (error) {
      missingRef.current = false;
      notify({ title: 'Could not move to Trash', body: messageOf(error), kind: 'error' });
    }
  };


  const saveAs = async () => {
    if (!node) return;
    const name = await prompt({ title: 'Save as', message: 'Creates a new file in the same folder.', defaultValue: node.name, confirmLabel: 'Save' });
    if (!name || !node.parentId) return;
    try {
      const created = await createFile(node.parentId, name, contentRef.current);
      setNode(created);
      setSaved(created.content);
      setContent(created.content);
      setWindowPayload(windowId, { fileId: created.id });
      setLocation(await pathOf(created.id));
      setStatus('Saved');
      notify({ title: 'Saved as', body: name, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Could not save as', body: messageOf(error), kind: 'error' });
    }
  };

  if (missing) {
    return (
      <div className="app-error">
        <p>This file is no longer in the virtual archive.</p>
        <button type="button" className="btn btn-primary" onClick={() => { void saveAs(); }}>Save current text as a new file</button>
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <button type="button" className="btn btn-primary" data-testid="editor-save" onClick={() => { void flush().catch((error) => notify({ title: 'Save failed', body: messageOf(error), kind: 'error' })); }}>Save</button>
        <button type="button" className="btn btn-ghost" onClick={() => { void rename(); }}>Rename</button>
        <button type="button" className="btn btn-ghost" onClick={() => { void saveAs(); }}>Save as</button>
        <button type="button" className="btn btn-ghost" onClick={() => { void removeDoc(); }}>Move to Trash</button>
        <span className="editor-status" data-testid="editor-status">{status}</span>
      </div>
      <textarea
        className="editor-area"
        data-testid="editor-area"
        value={content}
        spellCheck
        onChange={(event) => setContent(event.target.value)}
        aria-label="Document text"
      />
      <footer className="editor-foot">
        <span>{content.length.toLocaleString()} characters</span>
        <span>{location || 'Virtual archive'}</span>
        <span>Autosave · IndexedDB · not your device disk</span>
      </footer>
    </div>
  );
}
