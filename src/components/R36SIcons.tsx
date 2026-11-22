import React, { useEffect, useState } from 'react';
import type { KpTheme } from '../themes';

// Exact theme -> sprite sheet row mapping from source/sprites.h
export const KP_SPRITE_THEME_ROWS = [3, 0, 1, 2, 4, 5, 6] as const;

export function parseRgb(rgb: string): [number, number, number] {
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return [29, 185, 84];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

export function rgbToRgba(rgb: string, alpha: number): string {
  const [r, g, b] = parseRgb(rgb);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixRgb(rgbA: string, rgbB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseRgb(rgbA);
  const [r2, g2, b2] = parseRgb(rgbB);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function themeHairline(theme: KpTheme): string {
  return mixRgb(theme.panel, theme.text, 0.1);
}

export function modernPanelStyle(theme: KpTheme, radius = 16): React.CSSProperties {
  return {
    borderRadius: radius,
    border: `1px solid ${themeHairline(theme)}`,
    background: `linear-gradient(180deg, ${mixRgb(theme.panel, theme.text, 0.035)} 0%, ${theme.panel} 100%)`,
  };
}

export function modernCardStyle(
  theme: KpTheme,
  focus: boolean,
  radius = 10,
  baseColor?: string
): React.CSSProperties {
  const base = baseColor ?? theme.panel;
  if (focus) {
    return {
      borderRadius: radius,
      border: `2px solid ${theme.accent}`,
      backgroundColor: mixRgb(theme.elevated, theme.accent, 0.09),
      boxShadow: `0 0 14px ${rgbToRgba(theme.accent, 0.32)}`,
    };
  }
  return {
    borderRadius: radius,
    border: `1px solid ${mixRgb(base, theme.text, 0.08)}`,
    backgroundColor: base,
  };
}

export function modernPillStyle(theme: KpTheme, active: boolean): React.CSSProperties {
  if (active) {
    return {
      borderRadius: 9999,
      backgroundColor: theme.accent,
      color: theme.bg,
      boxShadow: `0 0 10px ${rgbToRgba(theme.accent, 0.35)}`,
    };
  }
  return {
    borderRadius: 9999,
    backgroundColor: theme.elevated,
    color: theme.muted,
  };
}

export function ModernBackdrop({ theme }: { theme: KpTheme }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundColor: theme.bg,
        backgroundImage: `radial-gradient(ellipse 85% 65% at 0% 0%, ${rgbToRgba(theme.accent, 0.19)} 0%, transparent 72%), radial-gradient(ellipse 60% 50% at 100% 100%, ${rgbToRgba(theme.accent, 0.1)} 0%, transparent 70%)`,
      }}
    />
  );
}

const SHEET_META = {
  controles: { url: '/sprites/controles.png', cols: 17, rows: 7 },
  categorias: { url: '/sprites/categorias.png', cols: 6, rows: 7 },
  botoes: { url: '/sprites/botoes.png', cols: 15, rows: 7 },
} as const;

export function KpSprite({
  sheet,
  col,
  themeIndex = 0,
  size = 24,
  className = '',
}: {
  sheet: keyof typeof SHEET_META;
  col: number;
  themeIndex?: number;
  size?: number;
  className?: string;
}) {
  const meta = SHEET_META[sheet];
  const row = KP_SPRITE_THEME_ROWS[themeIndex] ?? 3;
  return (
    <span
      aria-hidden="true"
      className={`block shrink-0 select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${meta.url})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${meta.cols * size}px ${meta.rows * size}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
      }}
    />
  );
}

export function KPlayerLogo({ theme, size = 76 }: { theme: KpTheme; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        backgroundColor: theme.accent,
        color: theme.bg,
        boxShadow: `0 0 24px ${rgbToRgba(theme.accent, 0.44)}`,
      }}
      className="flex items-center justify-center font-extrabold tracking-tight select-none shrink-0"
    >
      <span style={{ fontSize: Math.round(size * 0.56), lineHeight: 1 }} className="translate-x-[1px]">
        K
      </span>
      <svg
        width={Math.round(size * 0.26)}
        height={Math.round(size * 0.26)}
        viewBox="0 0 20 20"
        fill="currentColor"
        className="ml-0.5 shrink-0"
      >
        <path d="M4.2 2.9C4.2 2.2 5 1.8 5.6 2.2L16.6 9.1C17.2 9.5 17.2 10.5 16.6 10.9L5.6 17.8C5 18.2 4.2 17.8 4.2 17.1V2.9Z" />
      </svg>
    </div>
  );
}

export function TileArrow({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d="M2 10L10 2M4 2H10V8"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayDisc({
  theme,
  size = 44,
  playing = false,
  onClick,
  title,
}: {
  theme: KpTheme;
  size?: number;
  playing?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const iconSize = Math.round(size * 0.48);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        backgroundColor: theme.accent,
        color: theme.bg,
        boxShadow: `0 0 ${size >= 38 ? 18 : 12}px ${rgbToRgba(theme.accent, 0.45)}`,
      }}
      className="rounded-full flex items-center justify-center shrink-0 cursor-pointer hover:brightness-110 active:scale-95 transition-transform"
    >
      {playing ? (
        <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="currentColor" className="block">
          <rect x="4.6" y="3.2" width="3.8" height="13.6" rx="1.6" />
          <rect x="11.6" y="3.2" width="3.8" height="13.6" rx="1.6" />
        </svg>
      ) : (
        <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="currentColor" className="block">
          <path d="M6.4 3.6C6.4 2.9 7.2 2.5 7.8 2.9L16.7 9.1C17.2 9.5 17.2 10.5 16.7 10.9L7.8 17.1C7.2 17.5 6.4 17.1 6.4 16.4V3.6Z" />
        </svg>
      )}
    </button>
  );
}

export function TransportSkipButton({
  theme,
  direction,
  size = 24,
  onClick,
  title,
}: {
  theme: KpTheme;
  direction: 'prev' | 'next';
  size?: number;
  onClick?: () => void;
  title?: string;
}) {
  const iconSize = Math.round(size * 0.56);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        backgroundColor: mixRgb(theme.elevated, theme.text, 0.06),
        color: theme.text,
        border: `1px solid ${mixRgb(theme.panel, theme.text, 0.09)}`,
      }}
      className="rounded-full flex items-center justify-center shrink-0 cursor-pointer hover:brightness-125 active:scale-95 transition-all"
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="currentColor" className="block">
        {direction === 'prev' ? (
          <>
            <rect x="3.5" y="4" width="2.4" height="12" rx="1.2" />
            <path d="M16.2 4.6C16.2 3.9 15.4 3.5 14.8 3.9L7.4 9.1C6.9 9.5 6.9 10.5 7.4 10.9L14.8 16.1C15.4 16.5 16.2 16.1 16.2 15.4V4.6Z" />
          </>
        ) : (
          <>
            <rect x="14.1" y="4" width="2.4" height="12" rx="1.2" />
            <path d="M3.8 4.6C3.8 3.9 4.6 3.5 5.2 3.9L12.6 9.1C13.1 9.5 13.1 10.5 12.6 10.9L5.2 16.1C4.6 16.5 3.8 16.1 3.8 15.4V4.6Z" />
          </>
        )}
      </svg>
    </button>
  );
}

export function AudioVisualizer({
  theme,
  bars = 34,
  active = false,
  width = 200,
  height = 14,
}: {
  theme: KpTheme;
  bars?: number;
  active?: boolean;
  width?: number;
  height?: number;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = (now: number) => {
      setTick(now / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const gap = 2;
  const barW = Math.max(2, Math.floor((width - gap * (bars - 1)) / bars));

  return (
    <div
      style={{ width, height, gap }}
      className="flex items-end shrink-0"
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_, i) => {
        let v = 0.1;
        if (active) {
          v =
            0.22 +
            0.5 *
              Math.abs(Math.sin(tick * 2.4 + i * 0.55)) *
              (0.6 + 0.4 * Math.sin(tick * 1.1 + i * 0.13)) +
            0.18 * Math.abs(Math.sin(tick * 5.3 + i * 1.7));
          if (v > 1) v = 1;
        }
        const bh = Math.max(2, Math.round(v * height));
        const op = active ? 0.35 + v * 0.65 : 0.38;
        return (
          <span
            key={i}
            style={{
              width: barW,
              height: bh,
              borderRadius: barW >= 4 ? 2 : 1,
              backgroundColor: rgbToRgba(theme.accent, op),
            }}
          />
        );
      })}
    </div>
  );
}

export function VinylArt({
  theme,
  size = 124,
  coverUrl,
  spinning = false,
  pulse = false,
  centerLogoUrl,
}: {
  theme: KpTheme;
  size?: number;
  coverUrl?: string;
  spinning?: boolean;
  pulse?: boolean;
  centerLogoUrl?: string;
}) {
  if (coverUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          boxShadow: `0 0 18px ${rgbToRgba(theme.accent, 0.35)}`,
        }}
        className="overflow-hidden shrink-0"
      >
        <img
          src={coverUrl}
          alt="Cover"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const labelSize = Math.round(size * 0.33);
  const spindleSize = Math.max(5, Math.round(labelSize * 0.24));
  const discColor = mixRgb(theme.bg, theme.panel, 0.65);
  const grooveColor = mixRgb(theme.bg, theme.text, 0.12);

  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center shrink-0"
    >
      {pulse && (
        <>
          <span
            style={{ borderColor: theme.accent }}
            className="absolute inset-0 rounded-full border-2 kp-pulse-ring pointer-events-none"
          />
          <span
            style={{ borderColor: theme.accent, animationDelay: '0.9s' }}
            className="absolute inset-0 rounded-full border-2 kp-pulse-ring pointer-events-none"
          />
        </>
      )}
      <div
        style={{
          width: size,
          height: size,
          backgroundColor: discColor,
          boxShadow: `0 0 16px ${rgbToRgba(theme.accent, 0.32)}`,
          backgroundImage: `repeating-radial-gradient(circle at center, transparent 0px, transparent 3px, ${grooveColor} 3.5px, transparent 4.5px)`,
        }}
        className={`relative rounded-full flex items-center justify-center overflow-hidden ${
          spinning ? 'kp-spin-slow' : ''
        }`}
      >
        {/* Two opposite faint light reflection wedges */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `conic-gradient(from 25deg, transparent 0deg, ${rgbToRgba(
              theme.text,
              0.09
            )} 20deg, transparent 44deg, transparent 180deg, ${rgbToRgba(
              theme.text,
              0.09
            )} 200deg, transparent 224deg)`,
          }}
        />
        {/* Center label */}
        {centerLogoUrl ? (
          <div
            style={{
              width: Math.round(size * 0.46),
              height: Math.round(size * 0.46),
              backgroundColor: theme.text,
              border: `2px solid ${theme.accent}`,
            }}
            className="relative z-10 rounded-full flex items-center justify-center overflow-hidden p-1.5"
          >
            <img
              src={centerLogoUrl}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: labelSize,
              height: labelSize,
              backgroundColor: theme.accent,
              boxShadow: `inset 0 0 0 2px ${mixRgb(theme.accent, theme.text, 0.25)}`,
            }}
            className="relative z-10 rounded-full flex items-center justify-center"
          >
            <span
              style={{
                width: spindleSize,
                height: spindleSize,
                backgroundColor: theme.bg,
              }}
              className="rounded-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function KpCardIcon({
  kind,
  color,
  bg,
  size = 28,
}: {
  kind: 'music' | 'video' | 'folder' | 'radio' | 'iptv' | 'football' | 'youtube';
  color: string;
  bg: string;
  size?: number;
}) {
  if (kind === 'music') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path
          d="M5 16V14C5 9.03 9.03 5 14 5C18.97 5 23 9.03 23 14V16"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <rect x="3" y="14" width="6" height="10" rx="2.5" fill={color} />
        <rect x="19" y="14" width="6" height="10" rx="2.5" fill={color} />
      </svg>
    );
  }
  if (kind === 'video' || kind === 'youtube') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <rect x="2" y="3" width="24" height="22" rx="4" fill={color} />
        <rect x="5" y="7" width="18" height="14" rx="1.5" fill={bg} />
        <polygon points="11.5,10 19,14 11.5,18" fill={color} />
      </svg>
    );
  }
  if (kind === 'folder') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <path
          d="M3 8.5C3 6.84 4.34 5.5 6 5.5H11.5L14 8.5H22C23.66 8.5 25 9.84 25 11.5V20.5C25 22.16 23.66 23.5 22 23.5H6C4.34 23.5 3 22.16 3 20.5V8.5Z"
          fill={color}
        />
      </svg>
    );
  }
  if (kind === 'radio') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="15" r="4" fill={color} />
        <path d="M8.5 10.5C6.5 12.8 6.5 17.2 8.5 19.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M19.5 10.5C21.5 12.8 21.5 17.2 19.5 19.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M5 7.5C1.8 11.5 1.8 18.5 5 22.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M23 7.5C26.2 11.5 26.2 18.5 23 22.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === 'iptv') {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
        <rect x="2" y="5" width="24" height="17" rx="3.5" fill={color} />
        <rect x="5" y="8" width="18" height="11" rx="1.5" fill={bg} />
        <polygon points="11.5,10.5 18.5,13.5 11.5,16.5" fill={color} />
        <rect x="9" y="24" width="10" height="2" rx="1" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="11" stroke={color} strokeWidth="2.6" />
      <polygon points="14,7.5 18.5,11 16.8,16.8 11.2,16.8 9.5,11" fill={color} />
    </svg>
  );
}

const BUTTON_SPRITE_COL: Record<string, number> = {
  DIR: 0,
  A: 1,
  B: 2,
  X: 3,
  Y: 4,
  FN: 5,
  SELECT: 6,
  START: 7,
  L1: 10,
  R1: 12,
};

export function FooterBar({
  theme,
  toast,
}: {
  theme: KpTheme;
  themeIndex?: number;
  hints?: Array<{ key: string; label: string }>;
  toast?: string | null;
}) {
  if (!toast) return null;

  return (
    <div
      style={{
        height: 32,
        borderRadius: 14,
        backgroundColor: theme.elevated,
        color: theme.accent,
        border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
        boxShadow: `0 4px 18px ${rgbToRgba(theme.bg, 0.55)}`,
      }}
      className="absolute left-4 right-4 max-w-[520px] mx-auto bottom-3 z-30 flex items-center justify-center text-[12px] font-semibold px-4 pointer-events-none"
    >
      <span className="truncate">{toast}</span>
    </div>
  );
}
