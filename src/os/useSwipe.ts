import { useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface SwipeHandlers {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  /** Minimum travel in px before it counts as a swipe. */
  threshold?: number;
}

/**
 * Detects a one-finger (or mouse) swipe that starts on the element.
 * The finger is not captured, so taps on buttons inside keep working;
 * the end of the gesture is watched on the window instead.
 */
export function useSwipe({ onUp, onDown, onLeft, onRight, threshold = 60 }: SwipeHandlers) {
  const handlers = useRef({ onUp, onDown, onLeft, onRight });
  useLayoutEffect(() => {
    handlers.current = { onUp, onDown, onLeft, onRight };
  });

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const id = event.pointerId;
      const finish = (end: PointerEvent) => {
        if (end.pointerId !== id) return;
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        const dx = end.clientX - startX;
        const dy = end.clientY - startY;
        const h = handlers.current;
        if (Math.abs(dy) >= Math.abs(dx)) {
          if (dy <= -threshold) h.onUp?.();
          else if (dy >= threshold) h.onDown?.();
        } else if (dx <= -threshold) h.onLeft?.();
        else if (dx >= threshold) h.onRight?.();
      };
      const cancel = () => {
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
      };
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
    },
  };
}