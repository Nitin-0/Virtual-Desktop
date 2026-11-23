import { useCallback } from 'react';
import type { FSNode, MenuItem } from '../os/types';
import { NOTE_TYPES, appForFile, getNoteType, nameForType, titleFromName, type NoteType } from '../os/noteTypes';
import { messageOf } from '../os/util';
import { createFile } from '../os/vfs';
import { useOS } from './OSContext';

/** Menu entries for every note method. `onPick` receives the chosen type. */
export function noteMenuItems(onPick: (type: NoteType) => void): MenuItem[] {
  return NOTE_TYPES.map((type) => ({
    id: `note-${type.id}`,
    label: type.label,
    hint: type.blurb,
    onSelect: () => onPick(type),
  }));
}

export function useNotes() {
  const { prompt, notify, openOrFocus } = useOS();

  /** Open a file in the app that matches its type (Checklist for .todo, otherwise Codex). */
  const openFile = useCallback((node: FSNode) => {
    openOrFocus(appForFile(node.name), { fileId: node.id });
  }, [openOrFocus]);

  /** Ask for a name, create the note from its template in `parentId`, and open it. */
  const createNote = useCallback(async (parentId: string, typeOrId: NoteType | string): Promise<FSNode | null> => {
    const type = typeof typeOrId === 'string' ? getNoteType(typeOrId) : typeOrId;
    if (!type) return null;
    const raw = await prompt({
      title: `New ${type.label.toLowerCase()} note`,
      message: type.blurb,
      defaultValue: type.defaultName,
      confirmLabel: 'Create',
    });
    if (!raw) return null;
    const name = nameForType(type, raw);
    try {
      const node = await createFile(parentId, name, type.template(titleFromName(name), new Date()));
      openFile(node);
      notify({ title: `${type.label} created`, body: node.name, kind: 'ok' });
      return node;
    } catch (error) {
      notify({ title: 'Could not create note', body: messageOf(error), kind: 'error' });
      return null;
    }
  }, [notify, openFile, prompt]);

  return { openFile, createNote };
}
