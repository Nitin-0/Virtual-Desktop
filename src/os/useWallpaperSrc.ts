import { useEffect, useState } from 'react';
import type { CustomWallpaper } from './themes';
import { wallpaperFileUrl } from './wallpaperStore';

/**
 * The image address for a custom wallpaper: its link, or a blob: URL for an
 * uploaded image. `null` while an upload is loading or if it is no longer stored.
 */
export function useWallpaperSrc(wall: CustomWallpaper | null | undefined): string | null {
  const fileId = wall?.kind === 'file' ? wall.id : null;
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!fileId) return;
    let alive = true;
    wallpaperFileUrl(fileId)
      .then((url) => { if (alive) setLoaded({ id: fileId, url }); })
      .catch(() => { if (alive) setLoaded({ id: fileId, url: null }); });
    return () => { alive = false; };
  }, [fileId]);

  if (!wall) return null;
  if (wall.kind === 'link') return wall.url ?? null;
  return loaded?.id === fileId ? loaded.url : null;
}
