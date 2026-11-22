import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KpTheme } from '../themes';
import type { LyricLine, MediaTrack, RadioStation, WeatherData, WeatherLocation } from '../types';
import { describeWeatherCode, formatWeatherLocationShort } from '../utils/weather';
import { rgbToRgba } from './R36SIcons';

export const SCREENSAVER_TIMEOUT_OPTIONS = [0, 30, 60, 120, 300] as const;

export function formatScreensaverTimeout(sec: number): string {
  if (sec <= 0) return 'Desativado';
  if (sec < 60) return `${sec} segundos`;
  if (sec === 60) return '60 segundos';
  return `${Math.round(sec / 60)} minutos`;
}

export const SCREENSAVER_VIZ_LABELS = [
  'Auto (Alternar)',
  'Barras e Ondas',
  'Alquimia',
  'Bateria / Pulso',
  'Plenitude',
  'Ambience / Cosmos',
] as const;

// Cache Web Audio analyser per HTMLAudioElement so reopening never fails
const audioAnalyserCache = new WeakMap<
  HTMLAudioElement,
  { ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> }
>();

function getOrAttachAnalyser(audio: HTMLAudioElement | null) {
  if (!audio) return null;
  const cached = audioAnalyserCache.get(audio);
  if (cached) {
    if (cached.ctx.state === 'suspended') {
      cached.ctx.resume().catch(() => {});
    }
    return cached;
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const src = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    const bundle = { ctx, analyser, data };
    audioAnalyserCache.set(audio, bundle);
    return bundle;
  } catch {
    return null;
  }
}

export interface ScreensaverOverlayProps {
  theme: KpTheme;
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  activeTrack: MediaTrack | null;
  activeRadio: RadioStation | null;
  lyrics?: LyricLine[];
  activeLyricIndex: number;
  weatherData: WeatherData | null;
  weatherLocation: WeatherLocation | null;
  vizStyle: number;
  showClockWeather: boolean;
  showLyrics: boolean;
  onCycleViz: (dir: 1 | -1) => void;
  onToggleClockWeather: () => void;
  onToggleLyrics: () => void;
  onExit: () => void;
}

function formatPtDate(now: Date): string {
  const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dd = String(now.getDate()).padStart(2, '0');
  return `${days[now.getDay()]}, ${dd} de ${months[now.getMonth()]}`;
}

export const ScreensaverOverlay: React.FC<ScreensaverOverlayProps> = ({
  theme,
  audioElement,
  isPlaying,
  activeTrack,
  activeRadio,
  lyrics,
  activeLyricIndex,
  weatherData,
  weatherLocation,
  vizStyle,
  showClockWeather,
  showLyrics,
  onCycleViz,
  onToggleClockWeather,
  onToggleLyrics,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [hintVisible, setHintVisible] = useState<boolean>(true);
  const [autoCycleIdx, setAutoCycleIdx] = useState<number>(1);
  const hintTimerRef = useRef<number | null>(null);

  const flashHint = () => {
    setHintVisible(true);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => setHintVisible(false), 4500);
  };

  useEffect(() => {
    flashHint();
    return () => {
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    };
  }, [vizStyle, showClockWeather, showLyrics]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (vizStyle !== 0) return;
    const id = window.setInterval(() => {
      setAutoCycleIdx((i) => (i % 5) + 1);
    }, 18000);
    return () => window.clearInterval(id);
  }, [vizStyle]);

  const effectiveViz = vizStyle === 0 ? autoCycleIdx : vizStyle;

  // 60fps Windows Media Player-inspired audio-reactive canvas renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyserBundle = getOrAttachAnalyser(audioElement);
    const bands = new Float32Array(32);
    const peaks = new Float32Array(32);
    let raf = 0;
    const startTs = performance.now();

    const seedTitle = activeRadio?.name || activeTrack?.title || 'kplayer';
    let seed = 37;
    for (let i = 0; i < seedTitle.length; i++) {
      seed = (seed * 31 + seedTitle.charCodeAt(i)) >>> 0;
    }
    const bpmHz = 1.75 + (seed % 55) * 0.014;

    const draw = (ts: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(240, Math.round(rect.height));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = (ts - startTs) / 1000;

      // Read real Web Audio FFT if signal is present; otherwise synthesize musical spectrum
      let realSignal = false;
      if (analyserBundle && isPlaying) {
        analyserBundle.analyser.getByteFrequencyData(analyserBundle.data);
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += analyserBundle.data[i];
        if (sum > 24) {
          realSignal = true;
          for (let i = 0; i < 32; i++) {
            const v = Math.min(1, analyserBundle.data[i] / 230);
            bands[i] = bands[i] * 0.55 + v * 0.45;
            peaks[i] = bands[i] > peaks[i] ? bands[i] : Math.max(bands[i], peaks[i] - 0.014);
          }
        }
      }

      if (!realSignal) {
        const energyScale = isPlaying ? 1.0 : 0.14;
        const beatPhase = (t * bpmHz) % 1;
        const kick = Math.pow(Math.max(0, 1 - beatPhase * 2.8), 2.2);
        const snare = Math.pow(Math.max(0, 1 - Math.abs(beatPhase - 0.5) * 5.0), 2.0);
        for (let i = 0; i < 32; i++) {
          const norm = i / 31;
          const w1 = 0.5 + 0.5 * Math.sin(t * (2.6 + norm * 4.4) + i * 0.55);
          const w2 = 0.5 + 0.5 * Math.cos(t * (4.1 - norm * 1.9) + i * 1.15 + (seed % 17));
          const w3 = 0.5 + 0.5 * Math.sin(t * 7.3 + i * 0.37);
          let target = 0.16 + 0.36 * w1 * w2 + 0.18 * w3;
          if (i < 8) target += kick * (0.58 - norm * 0.8);
          else if (i < 20) target += snare * 0.34 + kick * 0.16;
          else target += 0.28 * w3 * w1;
          target = Math.max(0.03, Math.min(1, target * energyScale));
          bands[i] = bands[i] * 0.62 + target * 0.38;
          peaks[i] = bands[i] > peaks[i] ? bands[i] : Math.max(bands[i], peaks[i] - 0.014);
        }
      }

      let bass = 0;
      let mid = 0;
      let high = 0;
      for (let i = 0; i < 8; i++) bass += bands[i];
      for (let i = 8; i < 20; i++) mid += bands[i];
      for (let i = 20; i < 32; i++) high += bands[i];
      bass /= 8;
      mid /= 12;
      high /= 12;

      const cx = w / 2;
      const cy = h / 2;

      if (effectiveViz === 1) {
        // 1. WMP Barras e Ondas (Ocean Mist Spectrum + Mirrored Floor + Dual Oscilloscope)
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgb(${Math.round(6 + bass * 10)}, ${Math.round(16 + mid * 24)}, ${Math.round(36 + mid * 28)})`);
        grad.addColorStop(0.65, '#070b16');
        grad.addColorStop(1, '#04060c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Ambient glow behind oscilloscope
        const orb = ctx.createRadialGradient(cx, cy * 0.96, 8, cx, cy * 0.96, 130 + bass * 85);
        orb.addColorStop(0, `hsla(${190 + Math.sin(t * 0.4) * 35}, 90%, 60%, 0.32)`);
        orb.addColorStop(1, 'transparent');
        ctx.fillStyle = orb;
        ctx.fillRect(0, 0, w, h);

        // Dual WMP Oscilloscope waves
        for (let waveIdx = 0; waveIdx < 2; waveIdx++) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 6) {
            const nx = x / w;
            const bi = Math.min(31, Math.floor(nx * 31));
            const env = Math.sin(nx * Math.PI);
            const amp = (24 + bands[bi] * h * 0.19) * env;
            const y =
              h * 0.47 +
              (waveIdx === 0
                ? Math.sin(nx * 14 - t * 5.2) * amp
                : Math.cos(nx * 10 + t * 4.1) * amp * 0.72);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle =
            waveIdx === 0
              ? `hsla(${(185 + t * 22) % 360}, 95%, 65%, 0.85)`
              : `hsla(${(285 - t * 18 + 360) % 360}, 90%, 68%, 0.58)`;
          ctx.lineWidth = waveIdx === 0 ? 2.6 : 1.8;
          ctx.stroke();
        }

        // 32 Glossy Spectrum Bars + Mirrored Reflection
        const baseY = h * 0.78;
        const padX = w * 0.05;
        const availW = w - padX * 2;
        const step = availW / 32;
        const barW = Math.max(5, step * 0.72);
        const maxBarH = h * 0.36;

        for (let i = 0; i < 32; i++) {
          const bx = padX + i * step + (step - barW) / 2;
          const bh = 6 + bands[i] * maxBarH;
          const hue = (155 + i * 5.4 + Math.sin(t * 0.5) * 24) % 360;

          const bGrad = ctx.createLinearGradient(bx, baseY - bh, bx, baseY);
          bGrad.addColorStop(0, `hsla(${hue}, 95%, 68%, 0.96)`);
          bGrad.addColorStop(1, `hsla(${(hue + 28) % 360}, 85%, 44%, 0.85)`);
          ctx.fillStyle = bGrad;
          ctx.beginPath();
          ctx.roundRect(bx, baseY - bh, barW, bh, [3, 3, 0, 0]);
          ctx.fill();

          // Glossy highlight strip
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(bx + 1.5, baseY - bh + 2, Math.max(1.5, barW * 0.24), Math.max(2, bh - 4));

          // Falling peak cap
          const py = baseY - (6 + peaks[i] * maxBarH) - 5;
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillRect(bx, py, barW, 2.5);

          // Mirrored floor reflection
          const rh = Math.min(h * 0.13, bh * 0.34);
          const rGrad = ctx.createLinearGradient(bx, baseY + 2, bx, baseY + 2 + rh);
          rGrad.addColorStop(0, `hsla(${hue}, 88%, 55%, 0.30)`);
          rGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = rGrad;
          ctx.fillRect(bx, baseY + 2, barW, rh);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.fillRect(padX, baseY + 1, availW, 1);
      } else if (effectiveViz === 2) {
        // 2. WMP Alquimia (Kaleidoscopic Swirling Energy Ribbons & Rotating Orbs)
        ctx.fillStyle = '#05040e';
        ctx.fillRect(0, 0, w, h);

        const baseHue = (t * 28) % 360;
        const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, 80 + bass * 110);
        core.addColorStop(0, `hsla(${(baseHue + 140) % 360}, 95%, 70%, 0.45)`);
        core.addColorStop(0.5, `hsla(${baseHue}, 90%, 55%, 0.22)`);
        core.addColorStop(1, 'transparent');
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, w, h);

        for (let arm = 0; arm < 6; arm++) {
          const armAng = arm * ((Math.PI * 2) / 6) + t * 0.65;
          const armHue = (baseHue + arm * 52) % 360;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          for (let s = 1; s <= 22; s++) {
            const fs = s / 22;
            const bi = (s * 3 + arm * 5) % 32;
            const r =
              fs * (Math.min(w, h) * 0.42 + bass * 58) +
              Math.sin(t * 3.2 + fs * 7.0) * (12 + bands[bi] * 24);
            const twist = armAng + fs * (2.6 + Math.sin(t * 0.9) * 1.1);
            const nx = cx + Math.cos(twist) * r * 1.2;
            const ny = cy + Math.sin(twist) * r * 0.88;
            ctx.lineTo(nx, ny);
            if (s % 5 === 0) {
              ctx.save();
              ctx.fillStyle = `hsla(${(armHue + 40) % 360}, 95%, 72%, 0.82)`;
              ctx.beginPath();
              ctx.arc(nx, ny, 2.5 + bands[bi] * 7.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
            }
          }
          ctx.strokeStyle = `hsla(${armHue}, 92%, 64%, 0.78)`;
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }

        // Outer harmonic polygon
        ctx.beginPath();
        for (let i = 0; i <= 32; i++) {
          const bi = i % 32;
          const ang = i * ((Math.PI * 2) / 32) - t * 0.45;
          const rad = Math.min(w, h) * 0.24 + bands[bi] * 85 + high * 22;
          const x = cx + Math.cos(ang) * rad * 1.22;
          const y = cy + Math.sin(ang) * rad * 0.86;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${(baseHue + 180) % 360}, 95%, 68%, 0.65)`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (effectiveViz === 3) {
        // 3. WMP Bateria / Pulso (Radiating Star Spokes + Beat Shockwaves + Sparks)
        ctx.fillStyle = '#04080d';
        ctx.fillRect(0, 0, w, h);

        const hue0 = (t * 22 + 120) % 360;
        for (let ring = 0; ring < 4; ring++) {
          const phase = (t * 0.75 + ring * 0.25) % 1;
          const rad = 26 + phase * (Math.min(w, h) * 0.48 + bass * 42);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rad * 1.15, rad * 0.85, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(${(hue0 + ring * 45) % 360}, 92%, 65%, ${(1 - phase) * 0.65})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        for (let i = 0; i < 32; i++) {
          const ang = i * ((Math.PI * 2) / 32) + Math.sin(t * 0.4) * 0.6;
          const rIn = 30 + bass * 18;
          const rOut = rIn + 32 + bands[i] * Math.min(w, h) * 0.36;
          const x1 = cx + Math.cos(ang) * rIn;
          const y1 = cy + Math.sin(ang) * rIn * 0.88;
          const x2 = cx + Math.cos(ang) * rOut * 1.15;
          const y2 = cy + Math.sin(ang) * rOut * 0.88;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = `hsla(${(hue0 + i * 9) % 360}, 95%, 64%, 0.88)`;
          ctx.lineWidth = 2.6;
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(x2, y2, 2.2 + bands[i] * 4, 0, Math.PI * 2);
          ctx.fill();
        }

        const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 40 + bass * 34);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.4, `hsla(${hue0}, 92%, 62%, 0.9)`);
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 40 + bass * 34, 0, Math.PI * 2);
        ctx.fill();

        for (let p = 0; p < 16; p++) {
          const ang = t * (1.1 + (p % 4) * 0.35) + p * 0.45;
          const rr = 95 + (p % 3) * 52 + high * 38;
          const sx = cx + Math.cos(ang) * rr * 1.25;
          const sy = cy + Math.sin(ang * 1.3) * rr * 0.75;
          ctx.fillStyle = `hsla(${(hue0 + p * 24) % 360}, 95%, 72%, 0.82)`;
          ctx.beginPath();
          ctx.arc(sx, sy, 2 + (p % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effectiveViz === 4) {
        // 4. WMP Plenitude (Flowing Layered Aurora Ribbons)
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#07081a');
        bgGrad.addColorStop(0.5, '#0b1024');
        bgGrad.addColorStop(1, '#090614');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const baseHue = (t * 20 + 210) % 360;
        for (let ribbon = 0; ribbon < 6; ribbon++) {
          const rf = ribbon / 5;
          const yMid = h * (0.24 + rf * 0.5);
          const hue = (baseHue + ribbon * 38) % 360;
          ctx.beginPath();
          for (let x = 0; x <= w; x += 8) {
            const nx = x / w;
            const bi = Math.min(31, Math.floor(nx * 31));
            const wave =
              Math.sin(nx * (6 + rf * 5) + t * (1.8 + rf * 0.9) + ribbon * 0.9) *
                (22 + bands[bi] * 58 + bass * 22) +
              Math.cos(nx * 11 - t * 2.4 + ribbon) * (9 + mid * 22);
            const y = yMid + wave;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `hsla(${hue}, 92%, 65%, 0.84)`;
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.strokeStyle = `hsla(${(hue + 24) % 360}, 90%, 70%, 0.24)`;
          ctx.lineWidth = 10;
          ctx.stroke();
        }
      } else {
        // 5. WMP Ambience / Cosmos (Pulsing Nebula Blooms & Starlight Field)
        ctx.fillStyle = '#04050d';
        ctx.fillRect(0, 0, w, h);

        const hue0 = (t * 16 + 260) % 360;
        for (let i = 0; i < 5; i++) {
          const a = t * (0.35 + i * 0.08) + i * 1.25;
          const nx = cx + Math.cos(a) * (w * 0.18 + i * 26);
          const ny = cy + Math.sin(a * 0.8) * (h * 0.15 + i * 18);
          const rad = 65 + bands[(i * 6) % 32] * 78 + bass * 42;
          const ng = ctx.createRadialGradient(nx, ny, 4, nx, ny, rad);
          ng.addColorStop(0, `hsla(${(hue0 + i * 48) % 360}, 92%, 62%, 0.34)`);
          ng.addColorStop(1, 'transparent');
          ctx.fillStyle = ng;
          ctx.beginPath();
          ctx.arc(nx, ny, rad, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let s = 0; s < 48; s++) {
          const speed = 0.08 + (s % 5) * 0.045;
          const fx = (((s * 97) % 640) / 640 * w + t * speed * 120) % w;
          const fy = (((s * 61 + (s % 7) * 23) % 480) / 480) * h + Math.sin(t * 1.4 + s) * 8;
          const r = s % 4 === 0 ? 1.8 + high * 2.8 : 1.1;
          const alpha = 0.45 + 0.3 * Math.sin(t * 3.5 + s * 1.7) + high * 0.25;
          ctx.fillStyle = `hsla(${(hue0 + s * 9) % 360}, 55%, 88%, ${Math.min(1, alpha)})`;
          ctx.beginPath();
          ctx.arc(fx, fy, r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const nx = x / w;
          const bi = Math.min(31, Math.floor(nx * 31));
          const y = h * 0.67 + Math.sin(nx * 12 + t * 2.8) * (16 + bands[bi] * 52 + mid * 20);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${(hue0 + 90) % 360}, 92%, 68%, 0.72)`;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [audioElement, isPlaying, activeRadio?.name, activeTrack?.title, effectiveViz]);

  const timeHm = useMemo(
    () => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    [now]
  );
  const timeSec = useMemo(() => `:${String(now.getSeconds()).padStart(2, '0')}`, [now]);
  const dateText = useMemo(() => formatPtDate(now), [now]);

  const wxDesc = weatherData
    ? describeWeatherCode(weatherData.current.weatherCode, weatherData.current.isDay)
    : null;
  const cityShort = formatWeatherLocationShort(weatherData?.location ?? weatherLocation);
  const todayDaily = weatherData?.daily?.[0];

  const hasLyrics = Boolean(!activeRadio && lyrics && lyrics.length > 0);
  const prevLine = hasLyrics && activeLyricIndex > 0 ? lyrics![activeLyricIndex - 1]?.text : '';
  const currLine =
    hasLyrics && activeLyricIndex >= 0
      ? lyrics![activeLyricIndex]?.text
      : hasLyrics
      ? 'Aguardando a letra...'
      : '';
  const nextLine =
    hasLyrics && activeLyricIndex + 1 < (lyrics?.length ?? 0)
      ? lyrics![activeLyricIndex + 1]?.text
      : '';

  const mainTitle = activeRadio?.name || activeTrack?.title || 'Protetor de Tela K PLAYER';
  const subTitle = activeRadio
    ? 'Rádio Online · Ao vivo'
    : activeTrack?.artist || (isPlaying ? 'Tocando música' : 'Modo visualização WMP');

  return (
    <div
      onClick={onExit}
      className="absolute inset-0 z-40 overflow-hidden select-none cursor-pointer bg-[#04060d]"
    >
      {/* Fullscreen WMP Visualizer Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      {/* Subtle dark vignette for crisp text readability over bright visualizers */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(4,6,14,0.10) 20%, rgba(4,6,14,0.58) 100%)',
        }}
      />

      {/* Overlay Content Layer */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-4 @min-[540px]:p-5">
        {/* Top: Clock + Date + Open-Meteo Weather Card */}
        {showClockWeather ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(8, 12, 22, 0.66)',
              border: `1px solid ${rgbToRgba(theme.accent, 0.32)}`,
              backdropFilter: 'blur(10px)',
            }}
            className="rounded-2xl px-4 py-3 flex items-center justify-between gap-4 shadow-lg"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span
                  style={{ color: theme.text }}
                  className="text-[36px] @min-[540px]:text-[44px] font-black leading-none tracking-tight tabular-nums"
                >
                  {timeHm}
                </span>
                <span
                  style={{ color: theme.accent }}
                  className="text-[16px] @min-[540px]:text-[18px] font-bold tabular-nums"
                >
                  {timeSec}
                </span>
              </div>
              <div style={{ color: theme.muted }} className="text-[13px] font-semibold mt-1 truncate">
                {dateText}
              </div>
            </div>

            <div className="h-12 w-px bg-white/15 shrink-0" />

            <div className="min-w-0 text-right flex-1">
              {weatherData ? (
                <>
                  <div className="flex items-baseline justify-end gap-2">
                    <span
                      style={{ color: theme.accent }}
                      className="text-[28px] @min-[540px]:text-[34px] font-black leading-none tabular-nums"
                    >
                      {Math.round(weatherData.current.temp)}°C
                    </span>
                    <span style={{ color: theme.text }} className="text-[13.5px] font-bold truncate">
                      {wxDesc?.label ?? 'Clima ao vivo'}
                    </span>
                  </div>
                  <div style={{ color: theme.muted }} className="text-[12px] font-medium mt-1 truncate">
                    {cityShort || 'Localização atual'}
                    {todayDaily
                      ? ` · Mín ${Math.round(todayDaily.tempMin)}° / Máx ${Math.round(todayDaily.tempMax)}°`
                      : ''}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: theme.text }} className="text-[14px] font-bold">
                    Clima Open-Meteo
                  </div>
                  <div style={{ color: theme.muted }} className="text-[11.5px] mt-0.5">
                    Configure sua cidade no botão X
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Center: Synchronized Lyrics over the Live Visualizer */}
        {showLyrics && hasLyrics ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'rgba(6, 9, 18, 0.56)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
            }}
            className="my-auto rounded-2xl px-5 py-4 text-center space-y-2.5 max-w-[92%] mx-auto w-full"
          >
            {prevLine && (
              <div style={{ color: theme.muted }} className="text-[13.5px] font-medium opacity-75 truncate">
                {prevLine}
              </div>
            )}
            <div
              style={{
                backgroundColor: rgbToRgba(theme.accent, 0.2),
                color: theme.text,
                textShadow: `0 0 18px ${rgbToRgba(theme.accent, 0.55)}`,
              }}
              className="px-4 py-2 rounded-xl text-[18px] @min-[540px]:text-[21px] font-extrabold leading-snug"
            >
              {currLine}
            </div>
            {nextLine && (
              <div style={{ color: theme.muted }} className="text-[13.5px] font-medium opacity-75 truncate">
                {nextLine}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Bottom: Controls Hint + Now-Playing Strip */}
        <div className="space-y-2">
          {hintVisible && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex flex-wrap items-center justify-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => {
                  onCycleViz(1);
                  flashHint();
                }}
                style={{
                  backgroundColor: 'rgba(10,14,24,0.82)',
                  border: `1px solid ${rgbToRgba(theme.accent, 0.4)}`,
                  color: theme.accent,
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                L1/R1 · Visualizador
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleLyrics();
                  flashHint();
                }}
                style={{
                  backgroundColor: 'rgba(10,14,24,0.82)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: showLyrics ? theme.accent : theme.muted,
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                X · Letras {showLyrics ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleClockWeather();
                  flashHint();
                }}
                style={{
                  backgroundColor: 'rgba(10,14,24,0.82)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: showClockWeather ? theme.accent : theme.muted,
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Y · Relógio/Clima {showClockWeather ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={onExit}
                style={{
                  backgroundColor: 'rgba(10,14,24,0.82)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: theme.text,
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
              >
                Sair
              </button>
            </div>
          )}

          <div
            onClick={(e) => {
              e.stopPropagation();
              flashHint();
            }}
            style={{
              backgroundColor: 'rgba(8, 12, 22, 0.78)',
              border: `1px solid ${rgbToRgba(theme.accent, 0.3)}`,
              backdropFilter: 'blur(10px)',
            }}
            className="rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Mini live equalizer icon */}
              <div className="flex items-end gap-[3px] h-6 shrink-0">
                {[0, 1, 2, 3].map((idx) => (
                  <span
                    key={idx}
                    style={{
                      backgroundColor: theme.accent,
                      height: isPlaying ? `${45 + ((idx * 17 + now.getSeconds() * 23) % 55)}%` : '24%',
                    }}
                    className="w-[3.5px] rounded-full transition-all duration-200"
                  />
                ))}
              </div>
              <div className="min-w-0">
                <div style={{ color: theme.text }} className="text-[14.5px] font-extrabold truncate">
                  {mainTitle}
                </div>
                <div style={{ color: theme.muted }} className="text-[11.5px] font-medium truncate">
                  {subTitle}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCycleViz(1);
                flashHint();
              }}
              style={{
                backgroundColor: rgbToRgba(theme.accent, 0.16),
                color: theme.accent,
                border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
              }}
              className="px-3 py-1 rounded-lg text-[11px] font-extrabold shrink-0 cursor-pointer"
            >
              WMP · {SCREENSAVER_VIZ_LABELS[effectiveViz]}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
