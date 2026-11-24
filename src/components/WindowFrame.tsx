import { type PointerEvent as ReactPointerEvent } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { getApp } from '../os/apps';
import type { AppWindow } from '../os/types';
import { useOS } from '../context/OSContext';
import { AppBoundary } from './AppBoundary';
import { AppHost } from './AppHost';

const EDGES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

export function WindowFrame({ win }: { win: AppWindow }) {
  const { activeId, focusWindow, closeWindow, minimizeWindow, toggleMaximize, moveWindow, resizeWindow, settings } = useOS();
  const app = getApp(win.appId);
  const focused = activeId === win.id;

  const onDragDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    focusWindow(win.id);
    if (win.maximized) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = win.x;
    const origY = win.y;
    let nx = origX;
    let ny = origY;
    let raf = 0;
    const move = (ev: PointerEvent) => {
      nx = origX + ev.clientX - startX;
      ny = origY + ev.clientY - startY;
      if (!raf) {
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          moveWindow(win.id, nx, ny);
        });
      }
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (raf) window.cancelAnimationFrame(raf);
      moveWindow(win.id, nx, ny);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  const onResizeDown = (edge: (typeof EDGES)[number], event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || win.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    focusWindow(win.id);
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const orig = { x: win.x, y: win.y, w: win.w, h: win.h };
    const minW = app?.minW ?? 320;
    const minH = app?.minH ?? 220;
    let next = orig;
    let raf = 0;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, w, h } = orig;
      if (edge.includes('e')) w = orig.w + dx;
      if (edge.includes('s')) h = orig.h + dy;
      if (edge.includes('w')) {
        w = orig.w - dx;
        x = orig.x + dx;
      }
      if (edge.includes('n')) {
        h = orig.h - dy;
        y = orig.y + dy;
      }
      if (w < minW) {
        if (edge.includes('w')) x -= minW - w;
        w = minW;
      }
      if (h < minH) {
        if (edge.includes('n')) y -= minH - h;
        h = minH;
      }
      const maxW = window.innerWidth - Math.max(0, x);
      const maxH = window.innerHeight - 52 - Math.max(0, y);
      w = Math.min(w, Math.max(minW, maxW));
      h = Math.min(h, Math.max(minH, maxH));
      next = { x, y, w, h };
      if (!raf) {
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          resizeWindow(win.id, next);
        });
      }
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (raf) window.cancelAnimationFrame(raf);
      resizeWindow(win.id, next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  return (
    <section
      className={`window${focused ? ' is-focused' : ''}${win.maximized ? ' is-max' : ''}`}
      data-app={win.appId}
      data-window-id={win.id}
      data-testid={`window-${win.appId}`}
      style={{
        display: win.minimized ? 'none' : 'flex',
        zIndex: win.z,
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
      }}
      onPointerDown={() => focusWindow(win.id)}
    >
      <header
        className="window-title"
        onPointerDown={onDragDown}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          toggleMaximize(win.id);
        }}
      >
        <span className="title-gem" aria-hidden="true" />
        <h2>{win.title}</h2>
        <div className="window-controls">
          <button type="button" aria-label="Minimize" onClick={() => minimizeWindow(win.id)}><Minus size={14} /></button>
          <button type="button" aria-label={win.maximized ? 'Restore' : 'Maximize'} onClick={() => toggleMaximize(win.id)}><Square size={12} /></button>
          <button type="button" aria-label="Close" className="is-close" data-testid={`close-${win.appId}`} onClick={() => { void closeWindow(win.id); }}><X size={14} /></button>
        </div>
      </header>
      {!win.maximized && EDGES.map((edge) => (
        <div
          key={edge}
          className={`resize-handle resize-${edge}`}
          onPointerDown={(event) => onResizeDown(edge, event)}
        />
      ))}
      <div className="window-corners" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className={`window-body${settings.animations ? '' : ' no-anim'}`}>
        <AppBoundary onClose={() => { void closeWindow(win.id); }}>
          <AppHost win={win} />
        </AppBoundary>
      </div>
    </section>
  );
}