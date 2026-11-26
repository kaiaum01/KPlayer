import React, { useEffect, useRef } from 'react';
import { Volume2, X } from 'lucide-react';
import type { KpTheme } from '../themes';

export interface TrainerAudioInfo {
  kind: 'music' | 'radio';
  title: string;
  index: number;
  total: number;
  isPlaying: boolean;
}

export const TRAINER_ROW_COUNT = 5;

function accentLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return 150;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
}

export interface GameTrainerHudProps {
  theme: KpTheme;
  audio: TrainerAudioInfo;
  volumePct: number;
  selectedRow: number;
  onSelectRow: (row: number) => void;
  onActivateRow: (row: number) => void;
  onVolumeDelta: (delta: number) => void;
  onClose: () => void;
  className?: string;
}

/**
 * GTA Cheat Trainer-style vertical floating menu HUD.
 * Matches the native C `kp_overlay_shared.h` layout row-for-row:
 *   Header banner ("KPLAYER TRAINER" + "1/5")
 *   Sub-header (Status + Track/Radio title)
 *   5 selectable rows with high-contrast white active bar
 *   Bottom control legend (↑↓ Menu · ←→ Vol · B Ativar · L2/R2 Faixa · L3+R3 Fechar)
 */
export function GameTrainerHud({
  theme,
  audio,
  volumePct,
  selectedRow,
  onSelectRow,
  onActivateRow,
  onVolumeDelta,
  onClose,
  className = '',
}: GameTrainerHudProps) {
  const hdrDarkText = accentLuminance(theme.accent) > 140;
  const hdrFg = hdrDarkText ? '#0a0c10' : '#f8fafc';
  const isRadio = audio.kind === 'radio';
  const safeRow = ((selectedRow % TRAINER_ROW_COUNT) + TRAINER_ROW_COUNT) % TRAINER_ROW_COUNT;

  const rows: Array<{
    id: number;
    label: string;
    value: string;
    accentWhenInactive?: boolean;
  }> = [
    {
      id: 0,
      label: 'TOCAR / PAUSAR',
      value: audio.isPlaying ? '[TOCANDO]' : '[PAUSADO]',
      accentWhenInactive: audio.isPlaying,
    },
    {
      id: 1,
      label: isRadio ? 'PRÓXIMA RÁDIO' : 'PRÓXIMA MÚSICA',
      value: '[R2 >>]',
    },
    {
      id: 2,
      label: isRadio ? 'VOLTAR RÁDIO' : 'VOLTAR MÚSICA',
      value: '[<< L2]',
    },
    {
      id: 3,
      label: 'VOLUME DO ÁUDIO',
      value: `< ${volumePct}% >`,
    },
    {
      id: 4,
      label: 'FECHAR TRAINER',
      value: '[L3+R3]',
    },
  ];

  return (
    <div
      className={`w-[288px] select-none overflow-hidden shadow-[0_14px_34px_rgba(0,0,0,0.78)] ${className}`}
      style={{
        backgroundColor: 'rgba(8, 10, 15, 0.92)',
        border: `1.5px solid ${theme.accent}`,
      }}
    >
      {/* Classic GTA Trainer solid bold Header Banner */}
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{
          backgroundColor: theme.accent,
          color: hdrFg,
          borderBottom: '2px solid rgba(0, 0, 0, 0.35)',
        }}
      >
        <div className="leading-none">
          <div className="text-[15px] font-black tracking-[0.08em] uppercase font-mono">
            KPLAYER TRAINER
          </div>
          <div className="text-[9px] font-bold tracking-[0.14em] uppercase opacity-80 mt-0.5">
            MOD MENU DE ÁUDIO • v2.1.5
          </div>
        </div>
        <span className="text-[11px] font-black font-mono tabular-nums">
          {safeRow + 1}/{TRAINER_ROW_COUNT}
        </span>
      </div>

      {/* Black Sub-Header: Status + Active Track */}
      <div
        className="px-2.5 py-1.5"
        style={{
          backgroundColor: 'rgba(4, 5, 8, 0.96)',
          borderBottom: `2px solid ${theme.accent}`,
        }}
      >
        <div className="flex items-center justify-between text-[9.5px] font-mono font-bold tracking-wider">
          <span style={{ color: theme.accent }}>
            {audio.isPlaying ? 'STATUS: TOCANDO' : 'STATUS: PAUSADO'}
          </span>
          <span className="text-zinc-400 tabular-nums">
            {isRadio ? 'RÁDIO' : 'FAIXA'} {audio.total > 0 ? audio.index + 1 : 0}/{audio.total}
          </span>
        </div>
        <div className="text-[11.5px] font-bold text-zinc-100 truncate mt-0.5">
          {audio.title || 'Nenhuma faixa disponível'}
        </div>
      </div>

      {/* 5 Selectable Trainer Menu Rows */}
      <div className="divide-y divide-white/[0.04]">
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
              className="relative px-2.5 py-[6.5px] cursor-pointer transition-colors"
              style={{
                backgroundColor: active
                  ? 'rgba(244, 247, 252, 0.98)'
                  : row.id % 2 === 1
                  ? 'rgba(16, 20, 28, 0.88)'
                  : 'rgba(11, 14, 20, 0.88)',
                color: active ? '#0a0c10' : '#eef2f9',
              }}
            >
              {active && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: theme.accent }}
                />
              )}
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono font-bold tracking-wide pl-1">
                <span className="truncate">{row.label}</span>
                {row.id === 3 ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRow(3);
                        onVolumeDelta(-10);
                      }}
                      className="px-1 rounded hover:bg-black/15 cursor-pointer"
                      title="Diminuir volume (←)"
                    >
                      &lt;
                    </button>
                    <span className="tabular-nums min-w-[30px] text-center">{volumePct}%</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRow(3);
                        onVolumeDelta(10);
                      }}
                      className="px-1 rounded hover:bg-black/15 cursor-pointer"
                      title="Aumentar volume (→)"
                    >
                      &gt;
                    </button>
                  </div>
                ) : (
                  <span
                    className="shrink-0 text-[10.5px] font-extrabold"
                    style={{
                      color: active
                        ? '#0a0c10'
                        : row.accentWhenInactive
                        ? theme.accent
                        : '#a5b4cc',
                    }}
                  >
                    {row.value}
                  </span>
                )}
              </div>

              {row.id === 3 && (
                <div
                  className="mt-1 ml-1 h-[3px] w-[calc(100%-4px)] overflow-hidden"
                  style={{
                    backgroundColor: active ? 'rgba(15,23,42,0.22)' : 'rgba(255,255,255,0.12)',
                  }}
                >
                  <div
                    className="h-full transition-all"
                    style={{ width: `${volumePct}%`, backgroundColor: theme.accent }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Key Legend */}
      <div
        className="px-2.5 py-1.5 text-[9px] font-mono leading-tight"
        style={{
          backgroundColor: 'rgba(4, 6, 10, 0.96)',
          borderTop: '1.5px solid rgba(52, 62, 82, 0.9)',
        }}
      >
        <div className="flex items-center justify-between text-zinc-400">
          <span>↑↓ MENU</span>
          <span>←→ VOL</span>
          <span>B ATIVAR</span>
        </div>
        <div className="flex items-center justify-between mt-0.5 font-bold" style={{ color: theme.accent }}>
          <span>L2/R2 FAIXA</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:underline cursor-pointer"
            style={{ color: theme.accent }}
          >
            A / L3+R3 FECHAR
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
  onToggleTrainer: () => void;
  onSelectRow: (row: number) => void;
  onActivateRow: (row: number) => void;
  onVolumeDelta: (delta: number) => void;
  onExitDemo: () => void;
}

/**
 * Full 640x480 interactive in-game preview demonstration showing a retro
 * night-city GTA-inspired game viewport running on the R36S with the
 * KPlayer Trainer Menu floating at top-left (toggled with L3 + R3).
 */
export function GameTrainerDemoStage({
  theme,
  trainerOpen,
  audio,
  volumePct,
  selectedRow,
  onToggleTrainer,
  onSelectRow,
  onActivateRow,
  onVolumeDelta,
  onExitDemo,
}: GameTrainerDemoStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
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

      // Night-city vice dusk sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#090d1f');
      sky.addColorStop(0.55, '#1d1438');
      sky.addColorStop(0.88, '#4a1d4f');
      sky.addColorStop(1, '#9e3858');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, horizon);

      // Retro sunset sun behind skyline
      const sunGrad = ctx.createLinearGradient(0, horizon - 72, 0, horizon);
      sunGrad.addColorStop(0, '#ffd166');
      sunGrad.addColorStop(1, '#ef476f');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(w * 0.56, horizon - 14, 52, 0, Math.PI * 2);
      ctx.fill();

      // City skyline silhouettes + warm lit windows
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

      // Ground / sidewalk plane
      ctx.fillStyle = '#12141e';
      ctx.fillRect(0, horizon, w, h - horizon);

      // Perspective asphalt boulevard
      ctx.fillStyle = '#1b1f2c';
      ctx.beginPath();
      ctx.moveTo(w * 0.43, horizon);
      ctx.lineTo(w * 0.57, horizon);
      ctx.lineTo(w * 0.94, h);
      ctx.lineTo(w * 0.06, h);
      ctx.closePath();
      ctx.fill();

      // Road shoulder curb lines
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.43, horizon);
      ctx.lineTo(w * 0.06, h);
      ctx.moveTo(w * 0.57, horizon);
      ctx.lineTo(w * 0.94, h);
      ctx.stroke();

      // Animated dashed center lane dividers
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

      // Passing street lamp posts
      for (let i = 0; i < 6; i++) {
        const z = ((i / 6) + phase / 6 * 3) % 1;
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

      // Stylized retro cruiser car silhouette at bottom-center
      const bob = Math.sin(t * 7) * 1.2;
      const cx = w * 0.5 + Math.sin(t * 0.7) * 10;
      const cy = h - 76 + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 58, cy + 44, 116, 12);
      // Car body
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
      // Rear window
      ctx.fillStyle = '#111728';
      ctx.beginPath();
      ctx.moveTo(cx - 32, cy + 9);
      ctx.lineTo(cx - 22, cy - 3);
      ctx.lineTo(cx + 22, cy - 3);
      ctx.lineTo(cx + 32, cy + 9);
      ctx.closePath();
      ctx.fill();
      // Glowing red taillights
      ctx.fillStyle = '#ff2a4b';
      ctx.fillRect(cx - 48, cy + 19, 18, 8);
      ctx.fillRect(cx + 30, cy + 19, 18, 8);
      ctx.fillStyle = 'rgba(255, 42, 75, 0.25)';
      ctx.fillRect(cx - 54, cy + 15, 28, 16);
      ctx.fillRect(cx + 26, cy + 15, 28, 16);
      // License plate
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cx - 12, cy + 24, 24, 9);
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 7px monospace';
      ctx.fillText('R36S', cx - 9, cy + 31);

      // Classic GTA-style circular minimap radar (bottom-left)
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
      // Player radar arrow
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rx, ry - 7);
      ctx.lineTo(rx - 5, ry + 5);
      ctx.lineTo(rx + 5, ry + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Subtle CRT scanline sheen
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let sy = 0; sy < h; sy += 4) {
        ctx.fillRect(0, sy, w, 1);
      }

      raf = window.requestAnimationFrame(render);
    };

    raf = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-black">
      {/* Live retro night-city game canvas */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full block object-cover"
      />

      {/* Simulated GTA-style top-right game HUD */}
      <div className="absolute top-3.5 right-3.5 flex flex-col items-end gap-1 pointer-events-none select-none">
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

      {/* Top-Left Docked GTA Cheat Trainer HUD (toggled by L3 + R3) */}
      {trainerOpen && (
        <div className="absolute top-3.5 left-3.5 z-10">
          <GameTrainerHud
            theme={theme}
            audio={audio}
            volumePct={volumePct}
            selectedRow={selectedRow}
            onSelectRow={onSelectRow}
            onActivateRow={onActivateRow}
            onVolumeDelta={onVolumeDelta}
            onClose={onToggleTrainer}
          />
        </div>
      )}

      {/* Unobtrusive Demo Controls Bar at Bottom-Right */}
      <div className="absolute bottom-3.5 right-3.5 z-10 flex items-center gap-2">
        {!trainerOpen && (
          <div className="px-2.5 py-1.5 rounded bg-black/80 border border-white/15 text-[10.5px] font-mono text-zinc-200 flex items-center gap-2 shadow-lg">
            <Volume2 className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span className="max-w-[175px] truncate">
              {audio.isPlaying ? audio.title : 'Pausado'} ({volumePct}%)
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleTrainer}
          className="px-2.5 py-1.5 rounded font-mono text-[10.5px] font-extrabold shadow-lg cursor-pointer hover:brightness-110 transition-all"
          style={{
            backgroundColor: trainerOpen ? 'rgba(15, 20, 30, 0.92)' : theme.accent,
            color: trainerOpen ? '#f8fafc' : '#0a0c10',
            border: `1px solid ${theme.accent}`,
          }}
        >
          {trainerOpen ? 'L3+R3 Fechar' : 'L3+R3 Abrir Trainer'}
        </button>
        <button
          type="button"
          onClick={onExitDemo}
          className="px-2.5 py-1.5 rounded bg-black/85 hover:bg-zinc-900 border border-white/20 text-[10.5px] font-bold text-zinc-200 flex items-center gap-1 cursor-pointer shadow-lg"
          title="Voltar para o KPlayer"
        >
          <X className="w-3.5 h-3.5" />
          Sair Demo
        </button>
      </div>
    </div>
  );
}
