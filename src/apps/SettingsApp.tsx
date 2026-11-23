import { useEffect, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { playSound } from '../os/audio';
import { localStorageReport } from '../os/settings';
import { formatBytes, messageOf } from '../os/util';
import { AccountSettings } from './AccountSettings';
import { ThemePicker, WallpaperPicker } from './AppearanceSettings';
import { archiveStats, exportArchive, importArchive, resetArchive } from '../os/vfs';

export function SettingsApp() {
  const { settings, updateSettings, notify, confirm } = useOS();
  const [stats, setStats] = useState<{ count: number; files: number; folders: number; bytes: number } | null>(null);
  const [storageNote, setStorageNote] = useState('');
  const [eraseText, setEraseText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void archiveStats().then(setStats).catch(() => setStats(null));
    const report = localStorageReport();
    if (!report.available) setStorageNote('localStorage is unavailable in this browser.');
    else setStorageNote(`localStorage on this origin: ${formatBytes(report.totalChars)} across ${report.keys} keys (${formatBytes(report.aincradChars)} used by AINCRAD keys). Character counts, not a disk scan.`);
  };

  useEffect(() => {
    refresh();
  }, [settings.theme, settings.wallpaper]);

  const exportJson = async () => {
    try {
      const json = await exportArchive();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aincrad-archive-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify({
        title: 'Archive exported',
        body: 'Your browser downloaded a JSON file. That download is a copy of the virtual archive, not a Windows export.',
        kind: 'ok',
      });
    } catch (error) {
      notify({ title: 'Export failed', body: messageOf(error), kind: 'error' });
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const ok = await confirm({
        title: 'Replace the virtual archive?',
        message: 'Importing replaces every folder and file in IndexedDB on this origin. It does not change files on your device disk. This cannot be undone unless you exported first.',
        confirmLabel: 'Replace archive',
        danger: true,
      });
      if (!ok) return;
      await importArchive(parsed);
      refresh();
      notify({ title: 'Archive imported', body: file.name, kind: 'ok' });
    } catch (error) {
      notify({ title: 'Import failed', body: messageOf(error), kind: 'error' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const erase = async () => {
    if (eraseText !== 'ERASE') return;
    const ok = await confirm({
      title: 'Erase the virtual archive?',
      message: 'This deletes the IndexedDB archive in this browser and restores the starter files. Your device disk is not touched.',
      confirmLabel: 'Erase archive',
      danger: true,
    });
    if (!ok) return;
    try {
      await resetArchive();
      setEraseText('');
      refresh();
      notify({ title: 'Archive reset', body: 'Starter folders and files were restored.', kind: 'ok' });
    } catch (error) {
      notify({ title: 'Reset failed', body: messageOf(error), kind: 'error' });
    }
  };

  return (
    <div className="settings-app">
      <aside className="set-nav">
        <a href="#account">Account</a>
        <a href="#appearance">Appearance</a>
        <a href="#sound">Sound</a>
        <a href="#desktop">Desktop</a>
        <a href="#archive">Archive</a>
      </aside>
      <div className="set-panel">
        <section id="account">
          <h3>Account</h3>
          <AccountSettings />
        </section>

        <section id="appearance">
          <h3>Appearance</h3>
          <p className="hint">Themes recolor highlights, buttons, and panels. Wallpapers are images in this page, not your system wallpaper.</p>
          <ThemePicker />
          <h4 className="set-sub">Wallpaper</h4>
          <WallpaperPicker />
          <label className="slider-row">
            <span>Interface brightness {settings.brightness}%</span>
            <input
              type="range"
              min={50}
              max={100}
              value={settings.brightness}
              data-testid="brightness"
              onChange={(event) => updateSettings({ brightness: Number(event.target.value) })}
            />
          </label>
          <p className="hint">Dims the desktop and windows. The taskbar stays readable so you can change this back.</p>
          <label className="check-row"><input type="checkbox" checked={settings.animations} onChange={(event) => updateSettings({ animations: event.target.checked })} /> Window and menu animations</label>
          <label className="check-row"><input type="checkbox" checked={settings.showGrid} onChange={(event) => updateSettings({ showGrid: event.target.checked })} /> Faint geometric grid</label>
        </section>

        <section id="sound">
          <h3>Sound</h3>
          <p className="hint">Tones are synthesized with the Web Audio API. No audio files are downloaded.</p>
          <label className="check-row">
            <input
              type="checkbox"
              data-testid="sound-enabled"
              checked={settings.soundEnabled}
              onChange={(event) => updateSettings({ soundEnabled: event.target.checked })}
            />
            Interface sounds
          </label>
          <label className="slider-row">
            <span>Volume {Math.round(settings.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(event) => updateSettings({ volume: Number(event.target.value) / 100 })}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="sound-test"
            onClick={() => playSound('notify', settings.volume, true)}
          >
            Play test tone
          </button>
        </section>

        <section id="desktop">
          <h3>Desktop</h3>
          <div className="seg" role="group" aria-label="Icon size">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button key={size} type="button" className={settings.iconSize === size ? 'is-active' : ''} onClick={() => updateSettings({ iconSize: size })}>{size}</button>
            ))}
          </div>
          <label className="check-row"><input type="checkbox" checked={settings.showSeconds} onChange={(event) => updateSettings({ showSeconds: event.target.checked })} /> Show seconds on the clock</label>
          <label className="check-row"><input type="checkbox" data-testid="boot-toggle" checked={settings.bootScreen} onChange={(event) => updateSettings({ bootScreen: event.target.checked })} /> Show the boot screen when the page opens or reloads</label>
          <button type="button" className="btn btn-ghost" onClick={() => updateSettings({ iconPositions: {} })}>Reset icon positions</button>
        </section>

        <section id="archive">
          <h3>Archive</h3>
          <p className="hint">The virtual filesystem is IndexedDB on this origin. It is separate from your computer’s files. Export is the only built-in way to download a copy, and that download is handled by the browser.</p>
          <p data-testid="archive-stats">
            {stats ? `${stats.count} nodes · ${stats.folders} folders · ${stats.files} files · ${formatBytes(stats.bytes)} of text` : 'Reading archive…'}
          </p>
          <p className="hint">{storageNote}</p>
          <div className="row-gap">
            <button type="button" className="btn btn-primary" data-testid="export-archive" onClick={() => { void exportJson(); }}>Export JSON</button>
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Import JSON</button>
            <button type="button" className="btn btn-ghost" onClick={refresh}>Refresh counts</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => { void onImport(event.target.files?.[0]); }}
            />
          </div>
          <label className="field-label">
            Type ERASE to enable reset
            <input className="field" data-testid="erase-input" value={eraseText} onChange={(event) => setEraseText(event.target.value)} />
          </label>
          <button type="button" className="btn btn-danger" data-testid="erase-archive" disabled={eraseText !== 'ERASE'} onClick={() => { void erase(); }}>Erase archive</button>
        </section>
      </div>
    </div>
  );
}
