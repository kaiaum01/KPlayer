import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import type { KpTheme } from '../themes';
import type { LanguageCode, VideoFit } from '../types';
import { tr } from '../i18n';
import { formatTime } from '../utils/media';
import { HeaderBar } from './HeaderBar';
import { FooterBar, PlayDisc, rgbToRgba, themeHairline } from './R36SIcons';

export function VideoScreen({
  theme,
  themeIndex = 0,
  lang,
  location,
  title,
  src,
  isLive,
  fit,
  rate,
  paused,
  showOsd,
  onTogglePause,
  onSeekDelta,
  onToggleOsd,
  onBack,
  onOpenOptions,
  onEnded,
  videoRefExternal,
}: {
  theme: KpTheme;
  themeIndex?: number;
  lang: LanguageCode;
  location: string;
  title: string;
  src: string;
  isLive: boolean;
  fit: VideoFit;
  rate: number;
  paused: boolean;
  showOsd: boolean;
  onTogglePause: () => void;
  onSeekDelta: (deltaSec: number) => void;
  onToggleOsd: () => void;
  onBack: () => void;
  onOpenOptions: () => void;
  onEnded: () => void;
  videoRefExternal: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const localRef = useRef<HTMLVideoElement | null>(null);
  const [curMs, setCurMs] = useState(0);
  const [durMs, setDurMs] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [osdVisible, setOsdVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const bumpOsd = () => {
    setOsdVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setOsdVisible(false);
    }, 3000);
  };

  useEffect(() => {
    bumpOsd();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [src, paused, showOsd]);

  useEffect(() => {
    const video = localRef.current;
    videoRefExternal.current = video;
    if (!video || !src) return;

    setErrMsg(null);
    let hls: Hls | null = null;
    const isHls = src.toLowerCase().includes('.m3u8') || isLive;
    const streamSrc =
      src.startsWith('http://') || (src.startsWith('https://') && isLive)
        ? `/api/stream?url=${encodeURIComponent(src)}`
        : src;

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(streamSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          setErrMsg(tr('Não foi possível abrir o canal', lang));
        }
      });
    } else {
      video.src = streamSrc;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, isLive, lang, videoRefExternal]);

  useEffect(() => {
    const video = localRef.current;
    if (!video) return;
    video.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const video = localRef.current;
    if (!video) return;
    if (paused) video.pause();
    else video.play().catch(() => {});
  }, [paused]);

  const objectFit = fit === 1 ? 'object-cover' : fit === 2 ? 'object-fill' : 'object-contain';
  const showControls = showOsd && (osdVisible || paused || !!errMsg);
  const progressPct = durMs > 0 ? Math.min(100, (curMs / durMs) * 100) : isLive ? 100 : 0;

  return (
    <div
      className="w-full h-full bg-black relative overflow-hidden"
      onClick={bumpOsd}
    >
      <video
        ref={localRef}
        playsInline
        className={`w-full h-full ${objectFit}`}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurMs(v.currentTime * 1000);
          if (Number.isFinite(v.duration)) setDurMs(v.duration * 1000);
        }}
        onEnded={onEnded}
        onError={() => setErrMsg(tr('Não foi possível abrir o canal', lang))}
      />

      {errMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 px-8 text-center">
          <div style={{ color: theme.text }} className="text-[18px] font-semibold">
            {errMsg}
          </div>
          <div style={{ color: theme.muted }} className="text-[12px] mt-2">
            {title}
          </div>
        </div>
      )}

      {showControls && (
        <>
          <div className="absolute top-0 left-0 right-0 z-20">
            <HeaderBar
              theme={theme}
              section={isLive ? tr('IPTV', lang) : tr('VÍDEOS', lang)}
              location={location}
            />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            style={{
              backgroundColor: rgbToRgba(theme.panel, 0.88),
              color: theme.text,
              border: `1px solid ${themeHairline(theme)}`,
            }}
            className="absolute left-4 top-[46px] h-[28px] px-3.5 rounded-full text-[12px] font-medium z-20 cursor-pointer hover:opacity-90"
          >
            {tr('A  Voltar', lang)}
          </button>

          <div
            style={{
              backgroundColor: rgbToRgba(theme.panel, 0.88),
              color: theme.muted,
              border: `1px solid ${themeHairline(theme)}`,
            }}
            className="absolute right-4 top-[46px] h-[28px] px-3.5 rounded-full text-[11px] flex items-center z-20"
          >
            {tr('Controles ocultam em 3s', lang)}
          </div>

          <div
            style={{
              backgroundColor: rgbToRgba(theme.panel, 0.92),
              border: `1px solid ${themeHairline(theme)}`,
            }}
            className="absolute left-4 right-4 top-[328px] h-[100px] rounded-[18px] px-4 py-3 z-20 flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div style={{ color: theme.text }} className="text-[16px] font-semibold truncate">
                {title}
              </div>
              <div style={{ color: theme.muted }} className="text-[12px] tabular-nums shrink-0">
                {isLive ? tr('AO VIVO', lang) : `${formatTime(curMs)} / ${formatTime(durMs)}`}
              </div>
            </div>

            <div
              className="w-full h-[5px] rounded-full bg-white/15 overflow-hidden cursor-pointer"
              onClick={(e) => {
                if (isLive || !durMs || !localRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                localRef.current.currentTime = (ratio * durMs) / 1000;
              }}
            >
              <div
                style={{ width: `${progressPct}%`, backgroundColor: theme.accent }}
                className="h-full rounded-full"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PlayDisc theme={theme} size={30} playing={!paused} onClick={onTogglePause} />
                {!isLive && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: theme.text }}>
                    <button
                      type="button"
                      onClick={() => onSeekDelta(-10)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                    >
                      -10s
                    </button>
                    <button
                      type="button"
                      onClick={() => onSeekDelta(10)}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
                    >
                      +10s
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={onToggleOsd}
                  style={{ color: theme.muted }}
                  className="hover:underline cursor-pointer"
                >
                  X {tr('Ocultar auto.', lang)}
                </button>
                <button
                  type="button"
                  onClick={onOpenOptions}
                  style={{ color: theme.muted }}
                  className="hover:underline cursor-pointer"
                >
                  {tr('SELECT Opções', lang)}
                </button>
              </div>
            </div>
          </div>

          <FooterBar
            theme={theme}
            themeIndex={themeIndex}
            hints={[
              { key: 'B', label: tr('Pausa', lang) },
              { key: 'DIR', label: '10s' },
              { key: 'X', label: tr('Ocultar auto.', lang) },
              { key: 'A', label: tr('Voltar', lang) },
              { key: 'SELECT', label: tr('Opções', lang) },
            ]}
          />
        </>
      )}
    </div>
  );
}
