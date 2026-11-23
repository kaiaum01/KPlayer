import type { R36SButton } from '../components/R36SControls';

export type UiSfxKind = 'move' | 'confirm' | 'back' | 'tab' | 'error';

let sfxCtx: AudioContext | null = null;
let sfxEnabled = true;
let lastMoveAt = 0;

export function setUiSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled;
}

export function isUiSfxEnabled(): boolean {
  return sfxEnabled;
}

function getSfxContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sfxCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      sfxCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sfxCtx.state === 'suspended') {
    sfxCtx.resume().catch(() => {});
  }
  return sfxCtx;
}

export function playUiSfx(kind: UiSfxKind): void {
  if (!sfxEnabled) return;
  const nowMs = performance.now();
  if (kind === 'move' && nowMs - lastMoveAt < 26) return;
  if (kind === 'move') lastMoveAt = nowMs;

  const ctx = getSfxContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const gain2 = ctx.createGain();

    let f0 = 920;
    let f1 = 520;
    let dur = 0.024;
    let vol = 0.065;

    if (kind === 'confirm') {
      f0 = 640;
      f1 = 1080;
      dur = 0.048;
      vol = 0.085;
    } else if (kind === 'back') {
      f0 = 520;
      f1 = 280;
      dur = 0.042;
      vol = 0.075;
    } else if (kind === 'tab') {
      f0 = 820;
      f1 = 1220;
      dur = 0.032;
      vol = 0.065;
    } else if (kind === 'error') {
      f0 = 250;
      f1 = 185;
      dur = 0.068;
      vol = 0.08;
    }

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, f1), now + dur);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(f0 * 2, now);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(160, f1 * 2), now + dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.linearRampToValueAtTime(vol * 0.25, now + 0.002);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.7);

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(ctx.destination);
    gain2.connect(ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + dur + 0.01);
    osc2.stop(now + dur + 0.01);
  } catch {
    // Ignore autoplay or Web Audio restrictions gracefully
  }
}

export function playSfxForButton(btn: R36SButton): void {
  if (btn === 'UP' || btn === 'DOWN' || btn === 'LEFT' || btn === 'RIGHT') {
    playUiSfx('move');
  } else if (btn === 'B' || btn === 'START') {
    playUiSfx('confirm');
  } else if (btn === 'A') {
    playUiSfx('back');
  } else {
    playUiSfx('tab');
  }
}
