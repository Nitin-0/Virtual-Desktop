import { useRef, useState, type CSSProperties } from 'react';
import { Check, Link2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useOS } from '../context/OSContext';
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  MAX_CUSTOM_THEMES,
  MAX_CUSTOM_WALLPAPERS,
  allThemes,
  customThemeId,
  isHex,
  normalizeImageUrl,
  parsePalette,
  probeImage,
  resolveTheme,
  themeVars,
  wallpaperNameFromUrl,
  type CustomWallpaper,
  type Palette,
  type ThemeDef,
} from '../os/themes';
import { useWallpaperSrc } from '../os/useWallpaperSrc';
import { ACCEPT_ATTR, deleteWallpaperFile, saveWallpaperFile } from '../os/wallpaperStore';
import { WALLPAPERS } from '../os/types';
import { messageOf, uid } from '../os/util';

const SLOT_LABELS = ['Darkest', 'Dark', 'Accent', 'Light', 'Lightest'] as const;
const GROUPS: ThemeDef['group'][] = ['Classic', 'Characters', 'Yours'];

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span className="theme-swatches" aria-hidden="true">
      {colors.map((color, index) => <i key={index} style={{ background: color }} />)}
    </span>
  );
}

interface Draft {
  editingId: string | null;
  name: string;
  colors: Palette;
  paste: string;
}

function ThemeEditor({ draft, onChange, onSave, onCancel, error }: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string;
}) {
  const preview: ThemeDef = { id: 'preview', name: draft.name || 'Preview', blurb: '', colors: draft.colors, group: 'Yours' };
  const setColor = (index: number, value: string) => {
    const colors = draft.colors.slice() as Palette;
    colors[index] = value;
    onChange({ ...draft, colors });
  };

  return (
    <div className="theme-editor" data-testid="theme-editor">
      <div className="theme-editor-head">
        <strong>{draft.editingId ? 'Edit theme' : 'New theme'}</strong>
        <span className="hint">Five colors, darkest to lightest. The middle one is the accent.</span>
      </div>
      <label className="field-label">
        Name
        <input
          className="field"
          value={draft.name}
          maxLength={40}
          placeholder="e.g. Midnight Rose"
          data-testid="theme-name"
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="field-label">
        Paste colors (optional)
        <input
          className="field"
          value={draft.paste}
          placeholder="#171923 #8D263D #C44C62 #E6B8B8 #D5A85B"
          data-testid="theme-paste"
          onChange={(event) => {
            const found = parsePalette(event.target.value);
            const colors = draft.colors.slice() as Palette;
            found.forEach((hex, index) => { colors[index] = hex; });
            onChange({ ...draft, paste: event.target.value, colors });
          }}
        />
      </label>
      <div className="theme-slots">
        {draft.colors.map((color, index) => (
          <label key={index} className="theme-slot">
            <input type="color" value={color.toLowerCase()} aria-label={`${SLOT_LABELS[index]} color`} onChange={(event) => setColor(index, event.target.value.toUpperCase())} />
            <span>{SLOT_LABELS[index]}</span>
            <input
              className="field mono"
              value={color}
              maxLength={7}
              aria-label={`${SLOT_LABELS[index]} hex`}
              data-testid={`theme-hex-${index}`}
              onChange={(event) => {
                const raw = event.target.value.trim();
                setColor(index, raw.startsWith('#') ? raw.toUpperCase() : `#${raw.toUpperCase()}`);
              }}
            />
          </label>
        ))}
      </div>
      <div className="theme-preview" style={themeVars(preview) as CSSProperties} aria-label="Preview">
        <span className="theme-preview-title">{draft.name || 'Preview'}</span>
        <span className="theme-preview-chip">Selected item</span>
        <button type="button" className="btn btn-primary" tabIndex={-1}>Button</button>
        <span className="theme-preview-bar"><span /></span>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <div className="row-gap">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" data-testid="theme-save" onClick={onSave}><Check size={14} /> Save and use</button>
      </div>
    </div>
  );
}

export function ThemePicker() {
  const { settings, updateSettings, confirm, notify } = useOS();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const themes = allThemes(settings.customThemes);
  const active = resolveTheme(settings.theme, settings.customThemes);

  const startNew = () => {
    setError('');
    setDraft({ editingId: null, name: '', colors: active.colors.slice() as Palette, paste: '' });
  };

  const startEdit = (theme: ThemeDef) => {
    setError('');
    setDraft({ editingId: theme.id, name: theme.name, colors: theme.colors.slice() as Palette, paste: '' });
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError('Give the theme a name.');
      return;
    }
    if (!draft.colors.every(isHex)) {
      setError('Each color must be a hex code like #8D263D.');
      return;
    }
    const others = settings.customThemes.filter((theme) => theme.id !== draft.editingId);
    if (!draft.editingId && others.length >= MAX_CUSTOM_THEMES) {
      setError(`You can keep up to ${MAX_CUSTOM_THEMES} custom themes. Delete one first.`);
      return;
    }
    const id = draft.editingId ?? customThemeId(name, settings.customThemes.map((theme) => theme.id));
    const theme: ThemeDef = { id, name: name.slice(0, 40), blurb: 'Your theme', colors: draft.colors, group: 'Yours' };
    const customThemes = draft.editingId
      ? settings.customThemes.map((item) => (item.id === id ? theme : item))
      : [...settings.customThemes, theme];
    updateSettings({ customThemes, theme: id });
    setDraft(null);
    notify({ title: draft.editingId ? 'Theme updated' : 'Theme created', body: `${theme.name} · theme ${id}`, kind: 'ok' });
  };

  const remove = async (theme: ThemeDef) => {
    const ok = await confirm({ title: 'Delete theme?', message: `Delete “${theme.name}”? Built-in themes are not affected.`, confirmLabel: 'Delete theme', danger: true });
    if (!ok) return;
    updateSettings((current) => ({
      customThemes: current.customThemes.filter((item) => item.id !== theme.id),
      theme: current.theme === theme.id ? DEFAULT_THEME : current.theme,
    }));
    if (draft?.editingId === theme.id) setDraft(null);
  };

  return (
    <div className="theme-picker">
      {GROUPS.map((group) => {
        const list = themes.filter((theme) => theme.group === group);
        if (group !== 'Yours' && !list.length) return null;
        return (
          <div key={group} className="theme-group">
            <p className="theme-group-title">{group === 'Yours' ? 'Your themes' : group}</p>
            <div className="theme-row">
              {list.map((theme) => (
                <div key={theme.id} className="card-wrap">
                  <button
                    type="button"
                    className={`theme-card${active.id === theme.id ? ' is-active' : ''}`}
                    data-testid={`theme-${theme.id}`}
                    title={`theme ${theme.id}`}
                    onClick={() => updateSettings({ theme: theme.id })}
                  >
                    <Swatches colors={theme.colors} />
                    <strong>{theme.name}</strong>
                    <span>{theme.blurb}</span>
                  </button>
                  {theme.group === 'Yours' && (
                    <span className="card-actions">
                      <button type="button" className="icon-btn" aria-label={`Edit ${theme.name}`} onClick={() => startEdit(theme)}><Pencil size={12} /></button>
                      <button type="button" className="icon-btn" aria-label={`Delete ${theme.name}`} onClick={() => { void remove(theme); }}><X size={12} /></button>
                    </span>
                  )}
                </div>
              ))}
              {group === 'Yours' && (
                <button type="button" className="theme-card theme-card-new" data-testid="theme-new" onClick={startNew}>
                  <Plus size={18} />
                  <strong>New theme</strong>
                  <span>Starts from the current one</span>
                </button>
              )}
            </div>
          </div>
        );
      })}
      {draft && <ThemeEditor draft={draft} onChange={setDraft} onSave={save} onCancel={() => setDraft(null)} error={error} />}
      <p className="hint">{BUILTIN_THEMES.length} built-in themes. Terminal: <code>theme</code> lists them, <code>theme &lt;id&gt;</code> switches.</p>
    </div>
  );
}

function WallThumb({ wall }: { wall: CustomWallpaper }) {
  const src = useWallpaperSrc(wall);
  if (!src) return <span className="wall-solid wall-missing">{wall.kind === 'file' ? 'Loading…' : ''}</span>;
  return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" />;
}

export function WallpaperPicker() {
  const { settings, updateSettings, notify, confirm } = useOS();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'link' | 'file' | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const full = settings.customWallpapers.length >= MAX_CUSTOM_WALLPAPERS;
  const fullMessage = `You can keep up to ${MAX_CUSTOM_WALLPAPERS} custom wallpapers. Delete one first.`;

  const addLink = async () => {
    setError('');
    const href = normalizeImageUrl(url);
    if (!href) {
      setError('Enter a full web address that starts with https://');
      return;
    }
    const existing = settings.customWallpapers.find((wall) => wall.url === href);
    if (existing) {
      updateSettings({ wallpaper: existing.id });
      setUrl('');
      setName('');
      return;
    }
    if (full) {
      setError(fullMessage);
      return;
    }
    setBusy('link');
    try {
      const size = await probeImage(href);
      const wall: CustomWallpaper = { id: `url-${uid().slice(0, 12)}`, kind: 'link', name: (name.trim() || wallpaperNameFromUrl(href)).slice(0, 40), url: href };
      updateSettings((current) => ({ customWallpapers: [...current.customWallpapers, wall], wallpaper: wall.id }));
      setUrl('');
      setName('');
      notify({ title: 'Wallpaper added', body: `${wall.name} · ${size.width}×${size.height}`, kind: 'ok' });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (files: FileList | null) => {
    setError('');
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setBusy('file');
    const added: CustomWallpaper[] = [];
    const problems: string[] = [];
    let room = MAX_CUSTOM_WALLPAPERS - settings.customWallpapers.length;
    for (const file of list) {
      if (room <= 0) {
        problems.push(fullMessage);
        break;
      }
      try {
        const saved = await saveWallpaperFile(file);
        const label = (name.trim() && list.length === 1 ? name.trim() : file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ')).slice(0, 40) || 'My wallpaper';
        added.push({ id: saved.id, kind: 'file', name: label });
        room -= 1;
      } catch (err) {
        problems.push(`${file.name}: ${messageOf(err)}`);
      }
    }
    if (added.length) {
      updateSettings((current) => ({ customWallpapers: [...current.customWallpapers, ...added], wallpaper: added[added.length - 1]!.id }));
      notify({ title: added.length === 1 ? 'Wallpaper uploaded' : `${added.length} wallpapers uploaded`, body: 'Stored in this browser only', kind: 'ok' });
      setName('');
    }
    if (problems.length) setError(problems.join(' '));
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = async (wall: CustomWallpaper) => {
    const ok = await confirm({
      title: 'Delete wallpaper?',
      message: wall.kind === 'file'
        ? `Delete “${wall.name}”? The copy stored in this browser is removed. The file on your computer is not touched.`
        : `Delete “${wall.name}”? Only the saved link is removed.`,
      confirmLabel: 'Delete wallpaper',
      danger: true,
    });
    if (!ok) return;
    updateSettings((current) => ({
      customWallpapers: current.customWallpapers.filter((item) => item.id !== wall.id),
      wallpaper: current.wallpaper === wall.id ? 'dusk' : current.wallpaper,
    }));
    if (wall.kind === 'file') await deleteWallpaperFile(wall.id).catch(() => undefined);
    notify({ title: 'Wallpaper deleted', body: wall.name, kind: 'ok' });
  };

  return (
    <div className="wall-picker">
      <div className="wall-grid">
        {WALLPAPERS.map((wall) => (
          <button
            key={wall.id}
            type="button"
            className={`wall-card${settings.wallpaper === wall.id ? ' is-active' : ''}`}
            data-testid={`wall-${wall.id}`}
            onClick={() => updateSettings({ wallpaper: wall.id })}
          >
            {wall.src ? <img src={wall.src} alt="" /> : <span className="wall-solid" style={{ background: wall.color }} />}
            <em>{wall.name}</em>
          </button>
        ))}
        {settings.customWallpapers.map((wall) => (
          <div key={wall.id} className="card-wrap">
            <button
              type="button"
              className={`wall-card${settings.wallpaper === wall.id ? ' is-active' : ''}`}
              data-testid={`wall-${wall.id}`}
              title={wall.kind === 'link' ? wall.url : 'Uploaded from your computer'}
              onClick={() => updateSettings({ wallpaper: wall.id })}
            >
              <WallThumb wall={wall} />
              <em>{wall.kind === 'file' ? <Upload size={11} aria-label="Uploaded" /> : <Link2 size={11} aria-label="Link" />} {wall.name}</em>
            </button>
            <button
              type="button"
              className="card-delete"
              aria-label={`Delete wallpaper ${wall.name}`}
              title="Delete wallpaper"
              data-testid={`wall-delete-${wall.id}`}
              onClick={() => { void remove(wall); }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="wall-add">
        <p className="theme-group-title">Upload from your computer</p>
        <div className="wall-add-row">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="wall-upload"
            disabled={busy !== null || full}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} /> {busy === 'file' ? 'Saving…' : 'Choose image…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            hidden
            data-testid="wall-file"
            onChange={(event) => { void upload(event.target.files); }}
          />
          <span className="hint">JPG, PNG, WebP, GIF, or AVIF up to 20 MB. A copy is kept in this browser and works offline.</span>
        </div>
      </div>

      <form
        className="wall-add"
        onSubmit={(event) => {
          event.preventDefault();
          void addLink();
        }}
      >
        <p className="theme-group-title">Or add from a link</p>
        <div className="wall-add-row">
          <input
            className="field"
            type="url"
            value={url}
            placeholder="https://example.com/wallpaper.jpg"
            aria-label="Image link"
            data-testid="wall-url"
            onChange={(event) => { setUrl(event.target.value); setError(''); }}
          />
          <input
            className="field wall-add-name"
            value={name}
            maxLength={40}
            placeholder="Name (optional)"
            aria-label="Wallpaper name"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn btn-primary" data-testid="wall-add" disabled={busy !== null || !url.trim()}>
            {busy === 'link' ? 'Checking…' : <><Plus size={14} /> Add</>}
          </button>
        </div>
        <p className="hint">
          Paste a direct image link (Imgur, GitHub, your own site). It loads from that site each time, so it needs a connection, and the site can see the request.
        </p>
      </form>
      {error && <p className="dialog-error" data-testid="wall-error">{error}</p>}
    </div>
  );
}
