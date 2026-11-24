import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AuthScreens } from './components/AuthScreens';
import { BootScreen } from './components/BootScreen';
import { AuthProvider } from './context/AuthProvider';
import { ContextMenu } from './components/ContextMenu';
import { Desktop } from './components/Desktop';
import { MobileShell } from './components/MobileShell';
import { DialogHost } from './components/DialogHost';
import { Notifications } from './components/Notifications';
import { StartMenu } from './components/StartMenu';
import { Taskbar } from './components/Taskbar';
import { WindowFrame } from './components/WindowFrame';
import { OSProvider, useOS } from './context/OSContext';
import { WALLPAPERS } from './os/types';
import { resolveTheme, themeVars } from './os/themes';
import { useWallpaperSrc } from './os/useWallpaperSrc';
import { pruneWallpaperFiles } from './os/wallpaperStore';
import { useShellMode } from './os/useShellMode';

function Corners() {
  return (
    <div className="os-corners" aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

/**
 * A file dropped where nothing accepts it would make the browser open it and
 * leave the page, losing open windows. Places that accept drops call
 * preventDefault themselves; everywhere else the drop is refused.
 */
function useRefuseStrayDrops() {
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    };
    const onDrop = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

function Shell() {
  const { booted, settings, windows } = useOS();
  const shell = useShellMode(settings.shellMode);
  useRefuseStrayDrops();
  const customWall = settings.customWallpapers.find((item) => item.id === settings.wallpaper) ?? null;
  const customSrc = useWallpaperSrc(customWall);
  const builtinWall = WALLPAPERS.find((item) => item.id === settings.wallpaper) ?? WALLPAPERS[0]!;
  const wall = customWall
    ? { src: customSrc, color: undefined as string | undefined, custom: true }
    : { src: builtinWall.src, color: builtinWall.color, custom: false };
  const theme = resolveTheme(settings.theme, settings.customThemes);
  const style = useMemo(() => themeVars(theme) as CSSProperties, [theme]);
  // A custom wallpaper link can stop working later (offline, host removed it). Fall back to a plain fill.
  const [brokenWall, setBrokenWall] = useState<string | null>(null);

  // Drop uploaded images that no saved wallpaper refers to any more.
  const [pruned, setPruned] = useState(false);
  useEffect(() => {
    if (pruned || !booted) return;
    const keep = settings.customWallpapers.filter((item) => item.kind === 'file').map((item) => item.id);
    void pruneWallpaperFiles(keep).catch(() => 0).finally(() => setPruned(true));
  }, [booted, pruned, settings.customWallpapers]);

  return (
    <div
      className="os"
      data-theme={theme.id}
      style={style}
      data-animations={settings.animations ? 'on' : 'off'}
      data-shell={shell}
      data-testid="os-root"
    >
      <div className="os-wallpaper" data-testid="wallpaper">
        {wall.src && brokenWall !== wall.src
          ? <img src={wall.src} alt="" referrerPolicy={wall.custom ? 'no-referrer' : undefined} onError={() => setBrokenWall(wall.src ?? null)} />
          : <div className="wall-fill" style={{ background: wall.color ?? 'var(--deep, #05070c)' }} />}
      </div>
      {settings.showGrid && <div className="os-grid" />}
      <div className="os-vignette" />
      <Corners />
      {shell === 'mobile' ? (
        <MobileShell />
      ) : (
        <>
          <Desktop />
          {windows.map((win) => <WindowFrame key={win.id} win={win} />)}
        </>
      )}
      <div className="os-dim" style={{ opacity: (100 - settings.brightness) / 140 }} />
      {shell === 'desktop' && <Taskbar />}
      {shell === 'desktop' && <StartMenu />}
      <ContextMenu />
      <Notifications />
      <DialogHost />
      {!booted && <BootScreen />}
      <AuthScreens />
    </div>
  );
}

export default function App() {
  return (
    <OSProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </OSProvider>
  );
}