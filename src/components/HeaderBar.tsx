import React, { createContext, useContext, useEffect, useState } from 'react';
import type { KpTheme } from '../themes';
import { rgbToRgba, themeHairline } from './R36SIcons';

export interface UpdateBannerContextValue {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string;
  sleepRemainingMin?: number;
  onOpenUpdate?: () => void;
}

export const UpdateBannerContext = createContext<UpdateBannerContextValue>({
  currentVersion: '2.1.7',
  updateAvailable: false,
  latestVersion: '2.1.7',
  sleepRemainingMin: 0,
});

export function HeaderBar({
  theme,
  section,
  location,
}: {
  theme: KpTheme;
  section: string;
  location: string;
}) {
  const updateCtx = useContext(UpdateBannerContext);
  const [clock, setClock] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [battery, setBattery] = useState<number>(94);

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setClock(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      );
    }, 10_000);

    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; addEventListener: (e: string, cb: () => void) => void }>;
    };
    if (nav.getBattery) {
      nav
        .getBattery()
        .then((b) => {
          setBattery(Math.round(b.level * 100));
          b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
        })
        .catch(() => {});
    }
    return () => clearInterval(id);
  }, []);

  const sleepMin = updateCtx.sleepRemainingMin ?? 0;

  return (
    <div
      style={{
        backgroundColor: rgbToRgba(theme.panel, 0.85),
        borderBottom: `1px solid ${themeHairline(theme)}`,
        height: 34,
      }}
      className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 relative shrink-0 z-10"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        <span
          style={{
            backgroundColor: theme.accent,
            boxShadow: `0 0 8px ${rgbToRgba(theme.accent, 0.7)}`,
          }}
          className="w-[8px] h-[8px] rounded-full shrink-0"
        />
        <span
          style={{ color: theme.text }}
          className="text-[13px] sm:text-[14px] font-bold tracking-wide shrink-0"
        >
          K PLAYER
        </span>
        <span style={{ color: theme.dim }} className="text-[10.5px] shrink-0 hidden @min-[420px]:inline">
          {updateCtx.currentVersion}
        </span>
        <span
          style={{ color: theme.muted }}
          className="text-[11px] ml-0.5 truncate max-w-[140px] hidden @min-[620px]:inline"
        >
          {location}
        </span>
      </div>

      <div
        style={{ backgroundColor: theme.elevated, color: theme.muted }}
        className="max-w-[34%] @min-[520px]:w-[144px] h-[20px] rounded-full flex items-center justify-center text-[10px] sm:text-[10.5px] font-semibold tracking-wider shrink-0 px-2.5"
      >
        <span className="truncate">{section}</span>
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-2.5 text-[11.5px] sm:text-[12px] flex-1 min-w-0">
        {sleepMin > 0 && (
          <span
            style={{ color: theme.accent }}
            className="text-[10.5px] font-bold tabular-nums shrink-0 whitespace-nowrap"
            title={`Timer de sono ativo: ${sleepMin} min restantes`}
          >
            ZZZ {sleepMin}m
          </span>
        )}
        {updateCtx.updateAvailable && (
          <button
            type="button"
            onClick={() => updateCtx.onOpenUpdate?.()}
            style={{
              backgroundColor: rgbToRgba(theme.accent, 0.18),
              border: `1px solid ${rgbToRgba(theme.accent, 0.55)}`,
              color: theme.accent,
            }}
            className="h-[22px] px-2 rounded-full flex items-center gap-1 text-[9.5px] sm:text-[10px] font-extrabold shrink-0 cursor-pointer transition-all hover:brightness-110"
            title={`Nova versão v${updateCtx.latestVersion} disponível — pressione SELECT para atualizar`}
          >
            <span className="whitespace-nowrap">
              v{updateCtx.latestVersion}
            </span>
            <span className="hidden @min-[520px]:inline opacity-80">· SELECT</span>
          </button>
        )}
        <span style={{ color: theme.muted }} className="tabular-nums shrink-0">
          {clock}
        </span>
        <span style={{ color: theme.accent }} className="tabular-nums font-semibold shrink-0">
          {battery}%
        </span>
      </div>
    </div>
  );
}
