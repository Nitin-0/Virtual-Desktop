/** Short synthesized interface tones. No audio files are fetched. */

export type SoundKind = 'open' | 'close' | 'notify' | 'error' | 'click' | 'ok';

let ctx: AudioContext | null = null;
let unlocked = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function unlockAudio(): void {
  unlocked = true;
  const audio = context();
  if (audio && audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
  }
}

function tone(audio: AudioContext, frequency: number, duration: number, volume: number, type: OscillatorType, when = 0): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const start = audio.currentTime + when;
  const peak = Math.max(0.0001, Math.min(0.2, volume));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playSound(kind: SoundKind, volume: number, enabled: boolean): void {
  if (!enabled || volume <= 0 || !unlocked) return;
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') {
    void audio.resume().catch(() => undefined);
    return;
  }
  const v = volume;
  try {
    if (kind === 'open') tone(audio, 740, 0.07, v * 0.5, 'sine');
    else if (kind === 'close') tone(audio, 420, 0.06, v * 0.4, 'sine');
    else if (kind === 'click') tone(audio, 980, 0.03, v * 0.25, 'sine');
    else if (kind === 'ok') tone(audio, 880, 0.06, v * 0.45, 'sine');
    else if (kind === 'error') {
      tone(audio, 196, 0.09, v * 0.4, 'triangle');
      tone(audio, 164, 0.12, v * 0.35, 'triangle', 0.08);
    } else {
      tone(audio, 660, 0.05, v * 0.35, 'sine');
      tone(audio, 880, 0.07, v * 0.3, 'sine', 0.06);
    }
  } catch {
    /* Audio failures should never break the desktop. */
  }
}
