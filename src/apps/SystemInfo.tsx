import { useEffect, useState } from 'react';
import { APPS } from '../os/apps';
import { localStorageReport } from '../os/settings';
import { OS_BUILD, OS_CODENAME, OS_NAME, OS_VERSION } from '../os/types';
import { formatBytes } from '../os/util';
import { useNow } from '../os/useNow';
import { archiveStats } from '../os/vfs';
import { useOS } from '../context/OSContext';

interface Row { label: string; value: string; note?: string }

function webglNote(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'Not available';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'Available. Renderer string is hidden by the browser.';
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
    return renderer ? `Available · browser string: ${renderer}` : 'Available. Renderer string was empty.';
  } catch {
    return 'Not available';
  }
}

export function SystemApp() {
  const { settings } = useOS();
  const now = useNow(1000);
  const [rows, setRows] = useState<Row[]>([]);
  const [caps, setCaps] = useState<{ name: string; ok: boolean; detail: string }[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stats = await archiveStats().catch(() => null);
      let estimate = 'Not reported by this browser.';
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          const usage = est.usage != null ? formatBytes(est.usage) : 'unknown';
          const quota = est.quota != null ? formatBytes(est.quota) : 'unknown';
          estimate = `${usage} used of about ${quota} for this origin. Includes all site data, not only AINCRAD. This is a browser quota estimate, not a disk inventory.`;
        }
      } catch {
        estimate = 'Storage estimate failed.';
      }
      const store = localStorageReport();
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        userAgentData?: { brands?: { brand: string; version: string }[]; mobile?: boolean; platform?: string };
      };
      const uaData = nav.userAgentData;
      const next: Row[] = [
        { label: 'System', value: `${OS_NAME} ${OS_VERSION}`, note: `${OS_CODENAME} · build ${OS_BUILD}` },
        { label: 'Session', value: settings.username, note: 'A name stored in preferences. Not an operating-system account.' },
        { label: 'Timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable' },
        { label: 'User agent', value: navigator.userAgent || 'Unavailable' },
        { label: 'Client hints', value: uaData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(', ') || 'Not exposed', note: uaData ? `Platform: ${uaData.platform || 'unknown'} · mobile: ${uaData.mobile ? 'yes' : 'no'}` : 'User-Agent Client Hints are not available here.' },
        { label: 'Language', value: navigator.language || 'Unknown', note: navigator.languages?.join(', ') },
        { label: 'Online', value: navigator.onLine ? 'Yes' : 'No' },
        { label: 'Cookies enabled', value: navigator.cookieEnabled ? 'Yes' : 'No', note: 'Browser flag. AINCRAD does not set tracking cookies.' },
        { label: 'Display', value: `${window.screen.width}×${window.screen.height} · avail ${window.screen.availWidth}×${window.screen.availHeight}`, note: `colorDepth ${window.screen.colorDepth} · devicePixelRatio ${window.devicePixelRatio}. Browser-reported display metrics, not a monitor model.` },
        { label: 'Logical processors', value: navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'Not reported', note: 'navigator.hardwareConcurrency, if the browser exposes it.' },
        { label: 'deviceMemory', value: nav.deviceMemory ? `${nav.deviceMemory} GB (bucketed estimate)` : 'Not reported', note: 'Only present in some browsers, and only as a coarse bucket. Not a hardware scan.' },
        { label: 'WebGL', value: webglNote(), note: 'A browser graphics string when exposed. It can be privacy-masked. Not a fabricated GPU model.' },
        { label: 'Virtual archive', value: stats ? `${stats.count} nodes · ${formatBytes(stats.bytes)} of text` : 'Unavailable', note: 'IndexedDB on this origin. Not your device filesystem.' },
        { label: 'localStorage', value: store.available ? `${formatBytes(store.aincradChars)} in AINCRAD keys · ${formatBytes(store.totalChars)} on this origin` : 'Unavailable', note: 'Character length of stored strings, not bytes on disk.' },
        { label: 'Origin storage estimate', value: estimate },
      ];
      const capabilities = [
        { name: 'IndexedDB', ok: typeof indexedDB !== 'undefined', detail: 'Required for the virtual archive' },
        { name: 'localStorage', ok: store.available, detail: 'Preferences and command history' },
        { name: 'sessionStorage', ok: typeof sessionStorage !== 'undefined', detail: 'Welcome notice once per tab session' },
        { name: 'Web Audio', ok: typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window, detail: 'Synthesized interface tones' },
        { name: 'Notifications API', ok: 'Notification' in window, detail: 'Notification' in window ? `Permission: ${Notification.permission}` : 'Not available' },
        { name: 'Clipboard API', ok: !!navigator.clipboard, detail: 'Used only if you copy the user agent' },
        { name: 'Service worker', ok: 'serviceWorker' in navigator, detail: 'Supported by the browser. AINCRAD does not register one.' },
        { name: 'File System Access', ok: 'showOpenFilePicker' in window, detail: 'May be available, but unused. The archive stays in IndexedDB on purpose.' },
      ];
      if (!cancelled) {
        setRows(next);
        setCaps(capabilities);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.username]);

  const copyUa = async () => {
    try {
      await navigator.clipboard.writeText(navigator.userAgent);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sys-app">
      <div className="sys-callout">
        <strong>This is a browser page, not Windows.</strong>
        <p>Figures below come from APIs this browser actually exposes. Missing values are shown as not reported. Hardware that the browser hides is not invented.</p>
        <p className="sys-clock" data-testid="sys-clock">{now.toLocaleString()}</p>
      </div>
      <dl className="sys-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
            {row.note && <p>{row.note}</p>}
          </div>
        ))}
      </dl>
      <div className="row-gap">
        <button type="button" className="btn btn-ghost" onClick={() => { void copyUa(); }}>{copied ? 'User agent copied' : 'Copy user agent'}</button>
        {'Notification' in window && Notification.permission !== 'granted' && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { void Notification.requestPermission(); }}
          >
            Request notification permission
          </button>
        )}
      </div>
      <h3>Browser capabilities</h3>
      <ul className="cap-list">
        {caps.map((cap) => (
          <li key={cap.name} className={cap.ok ? 'is-ok' : 'is-no'}>
            <strong>{cap.name}</strong>
            <span>{cap.ok ? 'Available' : 'Unavailable'}</span>
            <em>{cap.detail}</em>
          </li>
        ))}
      </ul>
      <h3>Applications</h3>
      <ul className="app-list">
        {APPS.map((app) => (
          <li key={app.id}>
            <strong>{app.name}</strong>
            <span>{app.id}</span>
            <em>{app.description}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
