import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useOS } from '../context/OSContext';
import type { MenuItem } from '../os/types';

const MENU_W = 228;
const ITEM_H = 40;
const SEP_H = 8;

function estimateHeight(items: MenuItem[]): number {
  return items.reduce((sum, item) => sum + (item.separator ? SEP_H : ITEM_H), 0) + 4;
}

/** Keep a rendered menu fully on screen, using its real size rather than an estimate. */
function keepOnScreen(el: HTMLDivElement | null): void {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
  if (rect.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
}

interface Flyout {
  parentId: string;
  label: string;
  items: MenuItem[];
  left: number;
  top: number;
}

function MenuList({
  items,
  onHover,
  onPick,
  activeParent,
}: {
  items: MenuItem[];
  onHover?: (item: MenuItem, el: HTMLElement) => void;
  onPick: (item: MenuItem, el: HTMLElement) => void;
  activeParent?: string | null;
}) {
  return (
    <>
      {items.map((item) => item.separator ? (
        <div key={item.id} className="ctx-sep" role="separator" />
      ) : (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          aria-haspopup={item.children ? 'menu' : undefined}
          aria-expanded={item.children ? activeParent === item.id : undefined}
          className={`ctx-item${item.danger ? ' is-danger' : ''}${activeParent === item.id ? ' is-open' : ''}`}
          disabled={item.disabled}
          title={item.hint}
          data-testid={`menu-${item.id}`}
          onMouseEnter={(event) => onHover?.(item, event.currentTarget)}
          onClick={(event) => onPick(item, event.currentTarget)}
        >
          <span>{item.label}</span>
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
          {item.children && <ChevronRight size={14} aria-hidden="true" />}
        </button>
      ))}
    </>
  );
}

export function ContextMenu() {
  const { menu, hideMenu } = useOS();
  const ref = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const [menuKey, setMenuKey] = useState(menu);

  if (menuKey !== menu) {
    setMenuKey(menu);
    setFlyout(null);
  }

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      hideMenu();
    };
    const onScroll = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      hideMenu();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu, hideMenu]);

  if (!menu) return null;

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_W));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - estimateHeight(menu.items) - 8));
  // Too narrow for a submenu beside the menu (phones): the submenu replaces the menu,
  // with a back row, instead of being drawn on top of it.
  const narrow = window.innerWidth < MENU_W * 2 + 24;

  const openFlyout = (item: MenuItem, el: HTMLElement) => {
    if (!item.children || item.disabled) {
      setFlyout(null);
      return;
    }
    if (flyout?.parentId === item.id) return;
    const rect = el.getBoundingClientRect();
    const roomRight = rect.right + MENU_W + 8 <= window.innerWidth;
    const height = Math.min(estimateHeight(item.children), window.innerHeight - 16);
    if (narrow) {
      setFlyout({
        parentId: item.id,
        label: item.label,
        items: item.children,
        left,
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
      });
      return;
    }
    setFlyout({
      parentId: item.id,
      label: item.label,
      items: item.children,
      left: roomRight ? rect.right + 2 : Math.max(8, rect.left - MENU_W - 2),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)),
    });
  };

  const pick = (item: MenuItem, el: HTMLElement) => {
    if (item.children) {
      openFlyout(item, el);
      return;
    }
    hideMenu();
    item.onSelect?.();
  };

  if (narrow && flyout) {
    return (
      <div ref={ref} style={{ display: 'contents' }}>
        <div
          key={flyout.parentId}
          ref={keepOnScreen}
          className="ctx-menu ctx-sub"
          style={{ left: flyout.left, top: flyout.top }}
          role="menu"
          data-testid="context-submenu"
        >
          <button type="button" className="ctx-item ctx-back" data-testid="menu-back" onClick={() => setFlyout(null)}>
            <span><ChevronLeft size={15} aria-hidden="true" /> {flyout.label}</span>
          </button>
          <MenuList items={flyout.items} onPick={pick} />
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      <div key={`${menu.x},${menu.y}`} ref={keepOnScreen} className="ctx-menu" style={{ left, top }} role="menu" data-testid="context-menu">
        <MenuList items={menu.items} onHover={narrow ? undefined : openFlyout} onPick={pick} activeParent={flyout?.parentId ?? null} />
      </div>
      {flyout && (
        <div
          key={flyout.parentId}
          ref={keepOnScreen}
          className="ctx-menu ctx-sub"
          style={{ left: flyout.left, top: flyout.top }}
          role="menu"
          data-testid="context-submenu"
        >
          <MenuList items={flyout.items} onPick={pick} />
        </div>
      )}
    </div>
  );
}