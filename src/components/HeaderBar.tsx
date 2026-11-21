import React, { useEffect, useState } from 'react';
import type { KpTheme } from '../themes';
import { rgbToRgba, themeHairline } from './R36SIcons';

export function HeaderBar({
  theme,
  section,
  location,
}: {
  theme: KpTheme;
  section: string;
  location: string;
}) {
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

  return (
    <div
      style={{
        backgroundColor: rgbToRgba(theme.panel, 0.85),
        borderBottom: `1px solid ${themeHairline(theme)}`,
        height: 32,
      }}
      className="w-full flex items-center px-3.5 relative shrink-0 z-10"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          style={{
            backgroundColor: theme.accent,
            boxShadow: `0 0 8px ${rgbToRgba(theme.accent, 0.7)}`,
          }}
          className="w-[8px] h-[8px] rounded-full shrink-0"
        />
        <span
          style={{ color: theme.text }}
          className="text-[14px] font-bold tracking-wide shrink-0"
        >
          K PLAYER
        </span>
        <span style={{ color: theme.dim }} className="text-[11px] shrink-0">
          2.0.2
        </span>
        <span
          style={{ color: theme.muted }}
          className="text-[11px] ml-1 truncate max-w-[116px]"
        >
          {location}
        </span>
      </div>

      <div
        style={{ backgroundColor: theme.elevated, color: theme.muted }}
        className="absolute left-1/2 -translate-x-1/2 w-[144px] h-[20px] rounded-full flex items-center justify-center text-[10.5px] font-semibold tracking-wider"
      >
        <span className="truncate px-2.5">{section}</span>
      </div>

      <div className="ml-auto flex items-center gap-3 text-[12px]">
        <span style={{ color: theme.muted }} className="tabular-nums">
          {clock}
        </span>
        <span style={{ color: theme.accent }} className="tabular-nums font-semibold">
          {battery}%
        </span>
      </div>
    </div>
  );
}
