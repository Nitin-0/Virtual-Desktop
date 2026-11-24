import { useSyncExternalStore } from 'react';
import type { ShellMode } from './types';

/**
 * Phones (narrow screens) and touch-only devices such as tablets get the
 * mobile shell; computers with a mouse or trackpad get the desktop shell.
 */
const MOBILE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function isMobileDevice(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** The shell to show now. Updates live when the window is resized or the device rotates. */
export function useShellMode(preference: ShellMode): 'desktop' | 'mobile' {
  const mobileDevice = useSyncExternalStore(subscribe, isMobileDevice, () => false);
  if (preference === 'desktop' || preference === 'mobile') return preference;
  return mobileDevice ? 'mobile' : 'desktop';
}