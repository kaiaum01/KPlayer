import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import type { KpTheme } from '../themes';
import { rgbToRgba, themeHairline } from './R36SIcons';

export interface TrainerAudioInfo {
  kind: 'music' | 'radio';
  title: string;
  index: number;
  total: number;
  isPlaying: boolean;
}

export const TRAINER_ROW_COUNT = 5;

const rgba = rgbToRgba;

export interface GameTrainerHudProps {
  theme: KpTheme;
  audio: TrainerAudioInfo;
  volumePct: number;
  selectedRow: number;
  modeSubtitle?: string;
  onSelectRow: (row: number) => void;
  onActivateRow: (row: number) => void;
  onVolumeDelta: (delta: number) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Floating KPlayer Mini-Player HUD (L3 + R3).
 * Matches KPlayer's native visual design system across all 14 themes:
 *   - Rounded theme-tinted surface panel with subtle accent top line
 *   - KPlayer vinyl disc emblem ("K PLAYER" + "Mini-Player")
 *   - Rounded Now-Playing card with mini equalizer bars
 *   - 5 rounded KPlayer-style option cards with accent focus border & left bar
 *   - Zero "Trainer" wording anywhere
 */
export function GameTrainerHud({
  theme,
  audio,
  volumePct,
  selectedRow,
  modeSubtitle = 'Mini-Player nativo • v2.1.7',
  onSelectRow,
  onActivateRow,
  onVolumeDelta,
  onClose,
  className = '',
}: GameTrainerHudProps) {
  const isRadio = audio.kind === 'radio';
  const safeRow = ((selectedRow % TRAINER_ROW_COUNT) + TRAINER_ROW_COUNT) % TRAINER_ROW_COUNT;

  const rows: Array<{
    id: number;
    label: string;
    value: string;
    icon: React.ReactNode;
    accentWhenInactive?: boolean;
  }> = [
    {
      id: 0,
      label: 'Tocar / Pausar',
      value: audio.isPlaying ? 'Tocando' : 'Pausado',
      icon: audio.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />,
      accentWhenInactive: audio.isPlaying,
    },
    {
      id: 1,
      label: isRadio ? 'Próxima rádio' : 'Próxima música',
      value: 'R2',
      icon: <SkipForward className="w-3.5 h-3.5" />,
    },
    {
      id: 2,
      label: isRadio ? 'Voltar rádio' : 'Voltar música',
      value: 'L2',
      icon: <SkipBack className="w-3.5 h-3.5" />,
    },
    {
      id: 3,
      label: 'Volume do áudio',
      value: `${volumePct}%`,
      icon: <Volume2 className="w-3.5 h-3.5" />,
    },
    {
      id: 4,
      label: 'Ocultar mini-player',
      value: 'L3+R3',
      icon: <EyeOff className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div
      className={`w-[292px] rounded-2xl select-none overflow-hidden shadow-[0_18px_42px_rgba(0,0,0,0.72)] backdrop-blur-md ${className}`}
      style={{
        background: `linear-gradient(180deg, ${rgba(theme.panel, 0.96)} 0%, ${rgba(theme.bg, 0.96)} 100%)`,
        border: `1.5px solid ${rgba(theme.accent, 0.55)}`,
        color: theme.text,
      }}
    >
      {/* Subtle KPlayer top accent line */}
      <div
        className="h-[2.5px] w-full"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${theme.accent} 25%, ${theme.accent} 75%, transparent 100%)`,
        }}
      />

      {/* KPlayer Header: Vinyl Disc K Emblem + Brand + Item Index */}
      <div className="px-3 pt-2.5 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* KPlayer Vinyl Disc Emblem */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 relative shadow-inner"
            style={{
              backgroundColor: theme.isLight ? '#18181b' : '#0c1016',
              border: `2px solid ${theme.accent}`,
              boxShadow: `0 0 12px ${rgba(theme.accent, 0.32)}`,
            }}
          >
            <div
              className="w-5 h-5 rounded-full border border-white/15 flex items-center justify-center"
            >
              <div
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black leading-none"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.isLight ? '#ffffff' : '#080b10',
                }}
              >
                K
              </div>
            </div>
          </div>
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-extrabold tracking-wide">K PLAYER</span>
              <span
                className="text-[8.5px] font-bold px-1.5 py-[1px] rounded uppercase tracking-wider"
                style={{
                  backgroundColor: rgba(theme.accent, 0.16),
                  color: theme.accent,
                  border: `1px solid ${rgba(theme.accent, 0.35)}`,
                }}
              >
                Mini-Player
              </span>
            </div>
            <div className="text-[9.5px] mt-0.5 truncate" style={{ color: theme.muted }}>
              {modeSubtitle}
            </div>
          </div>
        </div>
        <span
          className="text-[10px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: rgba(theme.elevated, 0.85),
            color: theme.muted,
            border: `1px solid ${themeHairline(theme)}`,
          }}
        >
          {safeRow + 1}/{TRAINER_ROW_COUNT}
        </span>
      </div>

      {/* KPlayer Now-Playing Card */}
      <div className="px-2.5 pb-2">
        <div
          className="rounded-xl px-2.5 py-2 flex items-center gap-2.5"
          style={{
            backgroundColor: rgba(theme.elevated, 0.92),
            border: `1px solid ${themeHairline(theme)}`,
          }}
        >
          {/* Mini Equalizer / Paused Indicator */}
          <div className="w-6 h-6 rounded-lg flex items-end justify-center gap-[2.5px] pb-1 shrink-0"
            style={{ backgroundColor: rgba(theme.accent, 0.12) }}
          >
            {audio.isPlaying ? (
              <>
                <span
                  className="w-[3px] rounded-full animate-pulse"
                  style={{ height: '9px', backgroundColor: theme.accent }}
                />
                <span
                  className="w-[3px] rounded-full animate-pulse"
                  style={{ height: '14px', backgroundColor: theme.accent, animationDelay: '120ms' }}
                />
                <span
                  className="w-[3px] rounded-full animate-pulse"
                  style={{ height: '11px', backgroundColor: theme.accent, animationDelay: '240ms' }}
                />
              </>
            ) : (
              <Pause className="w-3.5 h-3.5 my-auto" style={{ color: theme.muted }} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wider">
              <span style={{ color: audio.isPlaying ? theme.accent : theme.muted }}>
                {audio.isPlaying ? 'Tocando agora' : 'Pausado'}
              </span>
              <span className="tabular-nums" style={{ color: theme.muted }}>
                {isRadio ? 'Rádio' : 'Faixa'} {audio.total > 0 ? audio.index + 1 : 0}/{audio.total}
              </span>
            </div>
            <div className="text-[11.5px] font-bold truncate mt-0.5" style={{ color: theme.text }}>
              {audio.title || 'Nenhuma faixa disponível'}
            </div>
          </div>
        </div>
      </div>

      {/* 5 KPlayer-Style Rounded Option Rows */}
      <div className="px-2.5 pb-2 flex flex-col gap-1">
        {rows.map((row) => {
          const active = row.id === safeRow;
          return (
            <div
              key={row.id}
              onMouseEnter={() => onSelectRow(row.id)}
              onClick={() => {
                onSelectRow(row.id);
                onActivateRow(row.id);
              }}
              className="relative rounded-xl px-2.5 py-[6.5px] cursor-pointer transition-all"
              style={{
                background: active
                  ? `linear-gradient(90deg, ${rgba(theme.accent, theme.isLight ? 0.18 : 0.24)} 0%, ${rgba(theme.elevated, 0.94)} 100%)`
                  : rgba(theme.elevated, 0.56),
                border: `1.5px solid ${active ? theme.accent : 'transparent'}`,
                color: theme.text,
              }}
            >
              {active && (
                <div
                  className="absolute left-1 top-1.5 bottom-1.5 w-[3px] rounded-full"
                  style={{ backgroundColor: theme.accent }}
                />
              )}
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold pl-1.5">
                <span className="flex items-center gap-2 min-w-0">
                  <span style={{ color: active ? theme.accent : theme.muted }}>{row.icon}</span>
                  <span className="truncate">{row.label}</span>
                </span>
                {row.id === 3 ? (
                  <div className="flex items-center gap-1 shrink-0 font-mono text-[10.5px] font-bold">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRow(3);
                        onVolumeDelta(-10);
                      }}
                      className="px-1 rounded hover:bg-white/10 cursor-pointer"
                      style={{ color: active ? theme.accent : theme.muted }}
                      title="Diminuir volume (←)"
                    >
                      &lt;
                    </button>
                    <span className="tabular-nums min-w-[30px] text-center" style={{ color: active ? theme.accent : theme.text }}>
                      {volumePct}%
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRow(3);
                        onVolumeDelta(10);
                      }}
                      className="px-1 rounded hover:bg-white/10 cursor-pointer"
                      style={{ color: active ? theme.accent : theme.muted }}
                      title="Aumentar volume (→)"
                    >
                      &gt;
                    </button>
                  </div>
                ) : (
                  <span
                    className="shrink-0 text-[10px] font-bold px-1.5 py-[1px] rounded"
                    style={{
                      backgroundColor: active
                        ? rgba(theme.accent, 0.18)
                        : rgba(theme.bg, 0.45),
                      color: active
                        ? theme.accent
                        : row.accentWhenInactive
                        ? theme.accent
                        : theme.muted,
                    }}
                  >
                    {row.value}
                  </span>
                )}
              </div>

              {row.id === 3 && (
                <div
                  className="mt-1.5 ml-1.5 h-[4px] w-[calc(100%-6px)] rounded-full overflow-hidden"
                  style={{
                    backgroundColor: rgba(theme.text, 0.14),
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${volumePct}%`, backgroundColor: theme.accent }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* KPlayer Footer Legend */}
      <div
        className="px-3 py-2 text-[9px] leading-tight"
        style={{
          backgroundColor: rgba(theme.bg, 0.72),
          borderTop: `1px solid ${themeHairline(theme)}`,
        }}
      >
        <div className="flex items-center justify-between font-medium" style={{ color: theme.muted }}>
          <span>↑↓ Menu</span>
          <span>←→ Volume</span>
          <span>B Confirmar</span>
          <span>L2/R2 Faixa</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[8.5px]" style={{ color: theme.muted }}>
            KPlayer • L3 + R3 nativo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-bold hover:underline cursor-pointer"
            style={{ color: theme.accent }}
          >
            A / L3+R3 Ocultar
          </button>
        </div>
      </div>
    </div>
  );
}

export interface GameTrainerDemoStageProps {
  theme: KpTheme;
  trainerOpen: boolean;
  audio: TrainerAudioInfo;
  volumePct: number;
  selectedRow: number;
  systemInjected?: boolean;
  onToggleTrainer: () => void;
  onSelectRow: (row: number) => void;
  onActivateRow: (row: number) => void;
  onVolumeDelta: (delta: number) => void;
  onExitDemo: () => void;
}

/**
 * Full 640x480 interactive preview demonstrating the KPlayer-styled Mini-Player (L3 + R3)
 * floating directly over both a Port/Game (native always-on) and EmulationStation (system-wide injected).
 */
export function GameTrainerDemoStage({
  theme,
  trainerOpen,
  audio,
  volumePct,
  selectedRow,
  systemInjected = false,
  onToggleTrainer,
  onSelectRow,
  onActivateRow,
  onVolumeDelta,
  onExitDemo,
}: GameTrainerDemoStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scene, setScene] = useState<'game' | 'es'>(systemInjected ? 'es' : 'game');

  useEffect(() => {
    if (scene !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const buildings = [
      { x: 14, w: 54, h: 120 },
      { x: 74, w: 42, h: 86 },
      { x: 122, w: 66, h: 148 },
      { x: 196, w: 48, h: 98 },
      { x: 252, w: 72, h: 132 },
      { x: 332, w: 52, h: 108 },
      { x: 392, w: 76, h: 156 },
      { x: 476, w: 58, h: 112 },
      { x: 542, w: 86, h: 138 },
    ];

    const render = () => {
      t += 0.032;
      const w = canvas.width;
      const h = canvas.height;
      const horizon = Math.floor(h * 0.48);

      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#090d1f');
      sky.addColorStop(0.55, '#1d1438');
      sky.addColorStop(0.88, '#4a1d4f');
      sky.addColorStop(1, '#9e3858');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);

      const sunGrad = ctx.createLinearGradient(0, horizon - 72, 0, horizon);
      sunGrad.addColorStop(0, '#ffd166');
      sunGrad.addColorStop(1, '#ef476f');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(w * 0.56, horizon - 14, 52, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const by = horizon - b.h;
        ctx.fillStyle = '#0d0f1c';
        ctx.fillRect(b.x, by, b.w, b.h);
        ctx.fillStyle = 'rgba(255, 210, 125, 0.55)';
        for (let wy = by + 10; wy < horizon - 10; wy += 12) {
          for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 11) {
            if (((wx + wy + i * 7) % 5) !== 0) {
              ctx.fillRect(wx, wy, 5, 6);
            }
          }
        }
      }

      ctx.fillStyle = '#12141e';
      ctx.fillRect(0, horizon, w, h - horizon);

      ctx.fillStyle = '#1b1f2c';
      ctx.beginPath();
      ctx.moveTo(w * 0.43, horizon);
      ctx.lineTo(w * 0.57, horizon);
      ctx.lineTo(w * 0.94, h);
      ctx.lineTo(w * 0.06, h);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.43, horizon);
      ctx.lineTo(w * 0.06, h);
      ctx.moveTo(w * 0.57, horizon);
      ctx.lineTo(w * 0.94, h);
      ctx.stroke();

      const dashCount = 9;
      const phase = (t * 1.45) % 1;
      for (let i = 0; i < dashCount; i++) {
        const z0 = (i + phase) / dashCount;
        const z1 = Math.min(1, z0 + 0.055);
        const p0 = z0 * z0;
        const p1 = z1 * z1;
        const y0 = horizon + p0 * (h - horizon);
        const y1 = horizon + p1 * (h - horizon);
        const lw = 2 + p0 * 7;
        ctx.fillStyle = '#f6c453';
        ctx.fillRect(w * 0.5 - lw * 0.5, y0, lw, Math.max(2, y1 - y0));
      }

      for (let i = 0; i < 6; i++) {
        const z = ((i / 6) + (phase / 6) * 3) % 1;
        const p = z * z;
        const py = horizon + p * (h - horizon);
        const spread = 50 + p * 270;
        const poleH = 18 + p * 95;
        ctx.fillStyle = '#2c3144';
        ctx.fillRect(w * 0.5 - spread - 3, py - poleH, 3 + p * 2, poleH);
        ctx.fillRect(w * 0.5 + spread, py - poleH, 3 + p * 2, poleH);
        ctx.fillStyle = 'rgba(255, 224, 150, 0.85)';
        ctx.beginPath();
        ctx.arc(w * 0.5 - spread + 4, py - poleH, 2.5 + p * 4, 0, Math.PI * 2);
        ctx.arc(w * 0.5 + spread - 4, py - poleH, 2.5 + p * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      const bob = Math.sin(t * 7) * 1.2;
      const cx = w * 0.5 + Math.sin(t * 0.7) * 10;
      const cy = h - 76 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 58, cy + 44, 116, 12);
      ctx.fillStyle = '#252c42';
      ctx.fillRect(cx - 54, cy + 12, 108, 32);
      ctx.fillStyle = '#333f5e';
      ctx.beginPath();
      ctx.moveTo(cx - 42, cy + 12);
      ctx.lineTo(cx - 28, cy - 8);
      ctx.lineTo(cx + 28, cy - 8);
      ctx.lineTo(cx + 42, cy + 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111728';
      ctx.beginPath();
      ctx.moveTo(cx - 32, cy + 9);
      ctx.lineTo(cx - 22, cy - 3);
      ctx.lineTo(cx + 22, cy - 3);
      ctx.lineTo(cx + 32, cy + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff2a4b';
      ctx.fillRect(cx - 48, cy + 19, 18, 8);
      ctx.fillRect(cx + 30, cy + 19, 18, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - 12, cy + 24, 24, 9);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 7px monospace';
      ctx.fillText('R36S', cx - 9, cy + 31);

      const rx = 56;
      const ry = h - 54;
      ctx.save();
      ctx.beginPath();
      ctx.arc(rx, ry, 36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13, 21, 30, 0.86)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#090d14';
      ctx.stroke();
      ctx.clip();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(rx - 40, ry - 8);
      ctx.lineTo(rx + 40, ry - 8);
      ctx.moveTo(rx, ry - 40);
      ctx.lineTo(rx, ry + 40);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 7);
      ctx.lineTo(rx - 5, ry + 5);
      ctx.lineTo(rx + 5, ry + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let sy = 0; sy < h; sy += 4) {
        ctx.fillRect(0, sy, w, 1);
      }

      raf = window.requestAnimationFrame(render);
    };

    raf = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(raf);
  }, [scene]);

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-[#0b101b]">
      {scene === 'game' ? (
        <>
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="w-full h-full block object-cover"
          />
          <div className="absolute top-12 right-3.5 flex flex-col items-end gap-1 pointer-events-none select-none">
            <div className="font-mono font-black text-[18px] leading-none tracking-wider text-emerald-400 drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)]">
              $0048520
            </div>
            <div className="flex items-center gap-1 text-amber-400 text-[13px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)]">
              <span>★</span>
              <span>★</span>
              <span className="text-zinc-600/80">★</span>
              <span className="text-zinc-600/80">★</span>
              <span className="text-zinc-600/80">★</span>
            </div>
            <div className="w-24 h-2 bg-black/75 border border-black p-[1px]">
              <div className="h-full w-[82%] bg-emerald-500" />
            </div>
            <div className="w-24 h-1.5 bg-black/75 border border-black p-[1px]">
              <div className="h-full w-[64%] bg-sky-400" />
            </div>
          </div>
        </>
      ) : (
        <div
          className="w-full h-full flex flex-col justify-between p-5 select-none"
          style={{
            background: 'radial-gradient(circle at 75% 25%, #1d283a 0%, #0f141e 55%, #090c12 100%)',
          }}
        >
          <div className="flex items-center justify-end gap-2 pt-8">
            <div className="text-right">
              <div className="text-[11px] font-extrabold tracking-widest uppercase text-zinc-400">
                EmulationStation • dArkOS R36S
              </div>
              <div className="text-[10px] font-semibold text-emerald-400 mt-0.5">
                Música do ES: Desativada pelo script • Injeção persistente ativa
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 my-auto pr-2">
            {['PORTS', 'PS1', 'GBA', 'SNES'].map((sys, idx) => (
              <div
                key={sys}
                className="rounded-2xl px-4 py-5 text-center transition-all"
                style={{
                  width: idx === 0 ? 132 : 84,
                  backgroundColor: idx === 0 ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
                  border: idx === 0 ? `2px solid ${theme.accent}` : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div className="text-[16px] font-black tracking-wider text-white">{sys}</div>
                <div className="text-[9.5px] text-zinc-400 mt-1">
                  {idx === 0 ? '18 jogos' : idx === 1 ? '42 jogos' : idx === 2 ? '64 jogos' : '95 jogos'}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-400 pb-8">
            <span>Persistente mesmo após reiniciar o console</span>
            <span>Desativar apenas em KPlayer → Opções</span>
          </div>
        </div>
      )}

      {/* Scene Switcher Top-Right (Port Nativo vs EmulationStation Injetado) */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-black/75 p-1 rounded-xl border border-white/15">
        <button
          type="button"
          onClick={() => setScene('game')}
          className="px-2 py-1 rounded-lg text-[9.5px] font-bold cursor-pointer transition-colors"
          style={{
            backgroundColor: scene === 'game' ? theme.accent : 'transparent',
            color: scene === 'game' ? '#0a0c10' : '#cbd5e1',
          }}
        >
          Port / Jogo
        </button>
        <button
          type="button"
          onClick={() => setScene('es')}
          className="px-2 py-1 rounded-lg text-[9.5px] font-bold cursor-pointer transition-colors"
          style={{
            backgroundColor: scene === 'es' ? theme.accent : 'transparent',
            color: scene === 'es' ? '#0a0c10' : '#cbd5e1',
          }}
        >
          EmulationStation
        </button>
      </div>

      {/* Top-Left Docked KPlayer Mini-Player HUD (toggled by L3 + R3) */}
      {trainerOpen && (
        <div className="absolute top-3 left-3 z-10">
          <GameTrainerHud
            theme={theme}
            audio={audio}
            volumePct={volumePct}
            selectedRow={selectedRow}
            modeSubtitle={
              scene === 'es'
                ? 'Sistema injetado (ES mudo) • v2.1.7'
                : 'Port nativo (L3 + R3) • v2.1.7'
            }
            onSelectRow={onSelectRow}
            onActivateRow={onActivateRow}
            onVolumeDelta={onVolumeDelta}
            onClose={onToggleTrainer}
          />
        </div>
      )}

      {/* Demo Controls Bar at Bottom-Right */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
        {!trainerOpen && (
          <div className="px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-[10px] text-zinc-200 flex items-center gap-1.5 shadow-lg">
            <Volume2 className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span className="max-w-[140px] truncate">
              {audio.isPlaying ? audio.title : 'Pausado'} ({volumePct}%)
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleTrainer}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold shadow-lg cursor-pointer hover:brightness-110 transition-all"
          style={{
            backgroundColor: trainerOpen ? 'rgba(15, 20, 30, 0.92)' : theme.accent,
            color: trainerOpen ? '#f8fafc' : '#0a0c10',
            border: `1px solid ${theme.accent}`,
          }}
        >
          {trainerOpen ? 'L3+R3 Ocultar' : 'L3+R3 Mini-Player'}
        </button>
        <button
          type="button"
          onClick={onExitDemo}
          className="px-2.5 py-1.5 rounded-lg bg-black/85 hover:bg-zinc-900 border border-white/20 text-[10px] font-bold text-zinc-200 flex items-center gap-1 cursor-pointer shadow-lg"
          title="Voltar para o KPlayer"
        >
          <X className="w-3.5 h-3.5" />
          Voltar
        </button>
      </div>
    </div>
  );
}
