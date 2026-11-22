import React from 'react';
import type { KpTheme } from '../themes';
import type { LanguageCode } from '../types';
import { tr } from '../i18n';
import {
  AudioVisualizer,
  ModernBackdrop,
  VinylArt,
  mixRgb,
  rgbToRgba,
  themeHairline,
} from './R36SIcons';

export interface BootPreloadStatus {
  libraryReady: boolean;
  radioReady: boolean;
  iptvReady: boolean;
  footballReady: boolean;
  mediaCount: number;
  radioCount: number;
  iptvCount: number;
  matchCount: number;
}

interface BootSplashScreenProps {
  theme: KpTheme;
  lang: LanguageCode;
  progress: number; // 0..100
  stepLabel: string;
  status: BootPreloadStatus;
  fadingOut: boolean;
}

export const BootSplashScreen: React.FC<BootSplashScreenProps> = ({
  theme,
  lang,
  progress,
  stepLabel,
  status,
  fadingOut,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  const chips = [
    {
      label: tr('Biblioteca', lang),
      ready: status.libraryReady,
      count: status.mediaCount > 0 ? `${status.mediaCount}` : undefined,
    },
    {
      label: tr('Rádio Online', lang),
      ready: status.radioReady,
      count: status.radioCount > 0 ? `${status.radioCount}` : undefined,
    },
    {
      label: 'IPTV',
      ready: status.iptvReady,
      count: status.iptvCount > 0 ? `${status.iptvCount}` : undefined,
    },
    {
      label: tr('Placar da Bola', lang),
      ready: status.footballReady,
      count: status.matchCount > 0 ? `${status.matchCount}` : undefined,
    },
  ];

  return (
    <div
      className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center transition-all duration-300"
      style={{
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <ModernBackdrop theme={theme} />

      {/* Extra ambient central aura */}
      <div
        className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 w-[min(65vw,320px)] h-[min(65vw,320px)] rounded-full blur-3xl opacity-35 transition-opacity duration-500"
        style={{ backgroundColor: theme.accent }}
      />

      {/* Animated Center Emblem (Sonar rings + Orbiting particles + Spinning Vinyl) */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-[460px] px-4 -mt-2">
        <div className="relative w-[132px] h-[132px] flex items-center justify-center kp-boot-float">
          {/* 3 staggered expanding sonar rings */}
          {[0, 0.7, 1.4].map((delay, i) => (
            <span
              key={i}
              className="pointer-events-none absolute inset-2 rounded-full kp-boot-sonar"
              style={{
                border: `2px solid ${rgbToRgba(theme.accent, 0.65)}`,
                animationDelay: `${delay}s`,
              }}
            />
          ))}

          {/* Orbiting light particles */}
          <span
            className="pointer-events-none absolute w-[8px] h-[8px] rounded-full kp-boot-orbit"
            style={{
              backgroundColor: theme.accent,
              boxShadow: `0 0 12px ${theme.accent}`,
            }}
          />
          <span
            className="pointer-events-none absolute w-[6px] h-[6px] rounded-full kp-boot-orbit-rev"
            style={{
              backgroundColor: mixRgb(theme.accent, theme.text, 0.45),
              boxShadow: `0 0 10px ${theme.accent}`,
            }}
          />

          {/* Spinning vinyl emblem */}
          <div
            className="rounded-full p-1"
            style={{
              boxShadow: `0 0 36px ${rgbToRgba(theme.accent, 0.42)}`,
            }}
          >
            <VinylArt theme={theme} size={94} spinning={true} />
          </div>
        </div>

        {/* Staggered K PLAYER Brand Reveal */}
        <div className="mt-4 flex flex-col items-center kp-boot-rise" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center gap-2">
            <h1
              style={{
                color: theme.text,
                textShadow: `0 0 24px ${rgbToRgba(theme.accent, 0.25)}`,
              }}
              className="text-[32px] @min-[520px]:text-[36px] font-extrabold tracking-tight leading-none"
            >
              K <span style={{ color: theme.accent }}>PLAYER</span>
            </h1>
          </div>

          <div
            style={{
              backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
              border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
              color: theme.accent,
            }}
            className="mt-2 px-3 py-0.5 rounded-full text-[10.5px] font-extrabold tracking-wider"
          >
            v2.0.7 • R36S
          </div>

          <p style={{ color: theme.muted }} className="mt-1.5 text-[12px] font-medium text-center">
            {tr('Central de Mídia Portátil', lang)}
          </p>
        </div>

        {/* Live Animated Equalizer */}
        <div className="mt-4 max-w-full overflow-hidden flex justify-center kp-boot-rise" style={{ animationDelay: '160ms' }}>
          <AudioVisualizer theme={theme} bars={26} width={248} height={22} active={true} />
        </div>

        {/* Glowing Progress Bar + Shimmer + Status */}
        <div className="mt-4 w-full max-w-[420px] kp-boot-rise" style={{ animationDelay: '220ms' }}>
          <div
            style={{
              backgroundColor: mixRgb(theme.elevated, theme.text, 0.1),
              border: `1px solid ${themeHairline(theme)}`,
            }}
            className="w-full h-[10px] rounded-full overflow-hidden relative"
          >
            <div
              style={{
                width: `${clamped}%`,
                backgroundColor: theme.accent,
                boxShadow: `0 0 14px ${rgbToRgba(theme.accent, 0.75)}`,
              }}
              className="h-full rounded-full relative overflow-hidden transition-[width] duration-300 ease-out"
            >
              <span
                className="absolute inset-y-0 w-1/3 kp-boot-shimmer"
                style={{
                  background: `linear-gradient(90deg, transparent, ${rgbToRgba(theme.text, 0.55)}, transparent)`,
                }}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[12px]">
            <span style={{ color: theme.muted }} className="font-semibold truncate pr-3">
              {tr(stepLabel, lang)}
            </span>
            <span style={{ color: theme.accent }} className="font-extrabold tabular-nums shrink-0">
              {clamped}%
            </span>
          </div>
        </div>

        {/* Preloaded Module Status Pills */}
        <div
          className="mt-4 flex items-center justify-center gap-2 flex-wrap px-6 kp-boot-rise"
          style={{ animationDelay: '280ms' }}
        >
          {chips.map((c) => (
            <div
              key={c.label}
              style={{
                backgroundColor: c.ready
                  ? mixRgb(theme.elevated, theme.accent, 0.2)
                  : theme.panel,
                border: `1px solid ${
                  c.ready ? rgbToRgba(theme.accent, 0.55) : themeHairline(theme)
                }`,
                color: c.ready ? theme.text : theme.muted,
              }}
              className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 transition-all duration-300"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors ${c.ready ? '' : 'animate-pulse'}`}
                style={{
                  backgroundColor: c.ready ? theme.accent : theme.dim,
                  boxShadow: c.ready ? `0 0 8px ${theme.accent}` : undefined,
                }}
              />
              <span>{c.label}</span>
              {c.ready && c.count && (
                <span style={{ color: theme.accent }} className="tabular-nums font-extrabold">
                  {c.count}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
