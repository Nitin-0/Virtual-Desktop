/**
 * Lets an app handle the mobile Back button itself (for example, Inventory
 * going to the previous folder) before the shell closes the app.
 */
const handlers = new Map<string, () => boolean>();

/** `fn` returns true if it handled Back. Returns an unregister function. */
export function registerBackHandler(windowId: string, fn: () => boolean): () => void {
  handlers.set(windowId, fn);
  return () => {
    if (handlers.get(windowId) === fn) handlers.delete(windowId);
  };
}

/** True if the app in `windowId` handled Back. */
export function runBackHandler(windowId: string): boolean {
  return handlers.get(windowId)?.() ?? false;
}