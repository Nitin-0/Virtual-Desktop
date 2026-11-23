import type { ReactNode } from 'react';

export function HexFrame({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <div className={`hex-frame${active ? ' is-active' : ''}`}>
      <svg viewBox="0 0 100 112" className="hex-stroke" aria-hidden="true">
        <polygon points="50,4 94,28 94,84 50,108 6,84 6,28" />
      </svg>
      <div className="hex-content">{children}</div>
    </div>
  );
}
