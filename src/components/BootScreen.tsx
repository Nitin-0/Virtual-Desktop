import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { OS_BUILD, OS_CODENAME, OS_NAME, OS_VERSION } from '../os/types';
import { useOS } from '../context/OSContext';

/** How long the boot sequence runs on every visit and reload. */
const BOOT_MS = 2600;
const STAGES = ['Link display', 'Open virtual archive', 'Restore preferences', 'Apply theme', 'Desktop ready'];

/**
 * Shown on every page load and reload. `?fast=1` (used by tests) or turning the
 * screen off in Settings skips it. Any key or click skips the rest once the
 * archive is open. Reduced motion keeps the same steps without animation.
 */
export function BootScreen() {
  const { ready, bootError, settings, enterDesktop, retryBoot } = useOS();
  const [instant] = useState(() => new URLSearchParams(window.location.search).has('fast') || !settings.bootScreen);
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (instant) return;
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 80);
    return () => window.clearInterval(timer);
  }, [instant]);

  useEffect(() => {
    if (instant) return;
    const skip = (event: Event) => {
      if (event instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      setSkipped(true);
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [instant]);

  const progress = instant || skipped ? 1 : Math.min(1, elapsed / BOOT_MS);
  // The bar waits short of the end until the archive has actually opened.
  const shown = ready ? progress : Math.min(progress, 0.92);
  const stage = Math.min(STAGES.length - 1, Math.floor(shown * STAGES.length));
  const finished = ready && !bootError && progress >= 1;

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(enterDesktop, instant ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [finished, instant, enterDesktop]);

  return (
    <div
      className={`boot${settings.animations ? '' : ' no-motion'}${finished ? ' is-leaving' : ''}`}
      role="dialog"
      aria-label={`Starting ${OS_NAME}`}
      aria-busy={!finished}
      data-testid="boot-screen"
    >
      <div className="boot-card">
        <img src="/images/emblem.jpg" alt="" className="boot-emblem" />
        <p className="boot-kicker">{OS_CODENAME} interface</p>
        <h1>{OS_NAME}</h1>
        <p className="boot-sub">Virtual desktop · browser archive · not your device disk</p>
        {bootError ? (
          <div className="boot-error">
            <p>{bootError}</p>
            <button className="btn btn-primary" type="button" onClick={retryBoot}>Retry</button>
          </div>
        ) : (
          <>
            <div className="boot-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown * 100)}>
              <span style={{ width: `${shown * 100}%` }} />
            </div>
            <ol className="boot-steps" data-testid="boot-stage">
              {STAGES.map((label, index) => {
                const state = index < stage || finished ? 'done' : index === stage ? 'now' : 'todo';
                return (
                  <li key={label} className={`is-${state}`}>
                    <span className="boot-dot" aria-hidden="true">{state === 'done' ? <Check size={11} /> : null}</span>
                    {label}
                  </li>
                );
              })}
            </ol>
            <p className="boot-hint">{ready ? 'Press any key to skip' : 'Opening archive…'}</p>
          </>
        )}
        <p className="boot-version">{OS_VERSION} · build {OS_BUILD}</p>
      </div>
    </div>
  );
}
