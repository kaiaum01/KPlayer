import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import Hls from 'hls.js';
import {
  Captions,
  FastForward,
  Gauge,
  Lock,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Rewind,
  Sun,
  Unlock,
  Volume2,
} from 'lucide-react';
import type { KpTheme } from '../themes';
import type { LanguageCode, VideoFit } from '../types';
import { tr } from '../i18n';
import { formatTime } from '../utils/media';
import { UpdateBannerContext } from './HeaderBar';
import { rgbToRgba } from './R36SIcons';
import type { R36SButton } from './R36SControls';

export interface VideoScreenHandle {
  handleButton: (btn: R36SButton) => void;
  toggleLock: () => void;
}

const SPEED_CYCLE = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const VideoScreen = forwardRef<
  VideoScreenHandle,
  {
    theme: KpTheme;
    themeIndex?: number;
    lang: LanguageCode;
    location: string;
    title: string;
    src: string;
    fallbackUrls?: string[];
    isLive: boolean;
    sectionLabel?: string;
    fit: VideoFit;
    rate: number;
    brightnessPct: number;
    paused: boolean;
    showOsd: boolean;
    initialPositionSec?: number;
    onProgressReport?: (sec: number, durSec: number) => void;
    onCycleRate: (nextRate: number) => void;
    onCycleFit: (nextFit: VideoFit) => void;
    onStepBrightness: (delta: number) => void;
    onTogglePause: () => void;
    onSeekDelta: (deltaSec: number) => void;
    onToggleOsd: () => void;
    onBack: () => void;
    onOpenOptions: () => void;
    onEnded: () => void;
    videoRefExternal: React.MutableRefObject<HTMLVideoElement | null>;
  }
>(function VideoScreen(
  {
    theme,
    lang,
    title,
    src,
    fallbackUrls,
    isLive,
    sectionLabel,
    fit,
    rate,
    brightnessPct,
    paused,
    showOsd,
    initialPositionSec = 0,
    onProgressReport,
    onCycleRate,
    onCycleFit,
    onStepBrightness,
    onTogglePause,
    onSeekDelta,
    onToggleOsd,
    onBack,
    onOpenOptions,
    onEnded,
    videoRefExternal,
  },
  ref
) {
  const updateCtx = useContext(UpdateBannerContext);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const [curMs, setCurMs] = useState(0);
  const [durMs, setDurMs] = useState(0);
  const [resolution, setResolution] = useState<string>('');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [sourceIdx, setSourceIdx] = useState(0);
  const [osdVisible, setOsdVisible] = useState(true);
  const [dockFocused, setDockFocused] = useState(false);
  const [dockCursor, setDockCursor] = useState(0);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [abStartMs, setAbStartMs] = useState<number | null>(null);
  const [abEndMs, setAbEndMs] = useState<number | null>(null);
  const [subTrackIdx, setSubTrackIdx] = useState<number>(-1);
  const [audioTrackLabel, setAudioTrackLabel] = useState<string>('Padrão');
  const [hudToast, setHudToast] = useState<string | null>(null);
  const [clock, setClock] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [battery, setBattery] = useState<number>(94);

  const hideTimer = useRef<number | null>(null);
  const toastTimer = useRef<number | null>(null);
  const restoredPosRef = useRef<boolean>(false);
  const lastReportRef = useRef<number>(0);

  const flashHud = useCallback((msg: string) => {
    setHudToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setHudToast(null), 1600);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
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
    return () => window.clearInterval(id);
  }, []);

  const candidates = useMemo(() => {
    const out: string[] = [];
    for (const u of [src, ...(fallbackUrls ?? [])]) {
      if (u && !out.includes(u)) out.push(u);
    }
    return out;
  }, [src, fallbackUrls]);

  const activeUrl = candidates[sourceIdx] ?? '';

  useEffect(() => {
    setSourceIdx(0);
    setCurMs(0);
    setDurMs(0);
    setResolution('');
    setErrMsg(null);
    setAbStartMs(null);
    setAbEndMs(null);
    setControlsLocked(false);
    setDockFocused(false);
    restoredPosRef.current = false;
  }, [src, fallbackUrls]);

  const advanceMirrorOrFail = useCallback(() => {
    setSourceIdx((prev) => {
      if (prev + 1 < candidates.length) {
        return prev + 1;
      }
      setErrMsg(tr('Não foi possível abrir o canal', lang));
      return prev;
    });
  }, [candidates.length, lang]);

  const bumpOsd = useCallback(() => {
    setOsdVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setOsdVisible(false);
      setDockFocused(false);
    }, 3600);
  }, []);

  useEffect(() => {
    bumpOsd();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [activeUrl, paused, showOsd, bumpOsd]);

  useEffect(() => {
    const video = localRef.current;
    videoRefExternal.current = video;
    if (!video || !activeUrl) return;

    setErrMsg(null);
    let hls: Hls | null = null;
    const lower = activeUrl.toLowerCase();
    const isHls =
      lower.includes('.m3u8') ||
      lower.includes('master.txt') ||
      lower.includes('error.txt') ||
      lower.includes('playlist.m3u') ||
      lower.includes('/hls/');
    const streamSrc =
      activeUrl.startsWith('http://') || activeUrl.startsWith('https://')
        ? `/api/stream?url=${encodeURIComponent(activeUrl)}`
        : activeUrl;

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: isLive });
      hls.loadSource(streamSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal) {
          hls?.destroy();
          advanceMirrorOrFail();
        }
      });
    } else {
      video.src = streamSrc;
      video.play().catch(() => {});
    }

    return () => {
      if (onProgressReport && !isLive && Number.isFinite(video.duration) && video.duration > 0) {
        onProgressReport(video.currentTime, video.duration);
      }
      if (hls) hls.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [activeUrl, isLive, videoRefExternal, advanceMirrorOrFail, onProgressReport]);

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

  const seekAndFlash = useCallback(
    (deltaSec: number) => {
      if (isLive) return;
      onSeekDelta(deltaSec);
      bumpOsd();
      flashHud(deltaSec > 0 ? `+${deltaSec}s` : `${deltaSec}s`);
    },
    [isLive, onSeekDelta, bumpOsd, flashHud]
  );

  const cycleSpeed = useCallback(() => {
    const idx = SPEED_CYCLE.findIndex((s) => Math.abs(s - rate) < 0.02);
    const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length] ?? 1.0;
    onCycleRate(next);
    flashHud(`Velocidade ${next.toFixed(2)}x`);
  }, [rate, onCycleRate, flashHud]);

  const cycleFit = useCallback(() => {
    const next = ((fit + 1) % 3) as VideoFit;
    onCycleFit(next);
    const label = next === 0 ? 'Original' : next === 1 ? 'Preencher' : 'Esticar';
    flashHud(`Formato: ${label}`);
  }, [fit, onCycleFit, flashHud]);

  const cycleAudioTrack = useCallback(() => {
    const v = localRef.current as (HTMLVideoElement & {
      audioTracks?: ArrayLike<{ enabled: boolean; label?: string; language?: string }>;
    }) | null;
    const tracks = v?.audioTracks;
    if (tracks && tracks.length > 1) {
      let activeIdx = 0;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].enabled) activeIdx = i;
      }
      const nextIdx = (activeIdx + 1) % tracks.length;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === nextIdx;
      }
      const lbl = tracks[nextIdx].label || tracks[nextIdx].language || `Faixa ${nextIdx + 1}`;
      setAudioTrackLabel(lbl);
      flashHud(`Áudio: ${lbl}`);
    } else {
      flashHud('Áudio: Faixa única');
    }
  }, [flashHud]);

  const cycleSubTrack = useCallback(() => {
    const v = localRef.current;
    if (!v || !v.textTracks || v.textTracks.length === 0) {
      flashHud('Legendas: Nenhuma faixa');
      return;
    }
    const count = v.textTracks.length;
    const next = subTrackIdx + 1 >= count ? -1 : subTrackIdx + 1;
    for (let i = 0; i < count; i++) {
      v.textTracks[i].mode = i === next ? 'showing' : 'disabled';
    }
    setSubTrackIdx(next);
    flashHud(next < 0 ? 'Legendas: Desligadas' : `Legenda: ${v.textTracks[next].label || `Faixa ${next + 1}`}`);
  }, [subTrackIdx, flashHud]);

  const stepAbLoop = useCallback(() => {
    if (isLive) {
      flashHud('Loop A-B indisponível ao vivo');
      return;
    }
    if (abStartMs === null) {
      setAbStartMs(curMs);
      setAbEndMs(null);
      flashHud(`Loop A: ${formatTime(curMs)}`);
    } else if (abEndMs === null) {
      if (curMs <= abStartMs + 1000) {
        flashHud('Ponto B deve ser após A');
        return;
      }
      setAbEndMs(curMs);
      flashHud(`Loop A-B: ${formatTime(abStartMs)} → ${formatTime(curMs)}`);
    } else {
      setAbStartMs(null);
      setAbEndMs(null);
      flashHud('Loop A-B limpo');
    }
  }, [isLive, abStartMs, abEndMs, curMs, flashHud]);

  const toggleLock = useCallback(() => {
    setControlsLocked((prev) => {
      const next = !prev;
      flashHud(next ? 'Controles travados' : 'Controles destravados');
      return next;
    });
  }, [flashHud]);

  const fitShort = fit === 0 ? 'Orig.' : fit === 1 ? 'Cortar' : 'Esticar';
  const abLabel = abStartMs !== null && abEndMs !== null ? 'A-B ON' : abStartMs !== null ? 'Marcar B' : 'Loop A-B';

  const dockActions = useMemo(
    () => [
      {
        id: 'play',
        label: paused ? 'Tocar' : 'Pausar',
        icon: paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />,
        active: !paused,
        run: () => {
          onTogglePause();
          flashHud(paused ? 'Reproduzindo' : 'Pausado');
        },
      },
      {
        id: 'speed',
        label: `${rate.toFixed(2).replace(/\.00$/, '')}x`,
        icon: <Gauge className="w-3.5 h-3.5" />,
        active: Math.abs(rate - 1) > 0.01,
        run: cycleSpeed,
      },
      {
        id: 'fit',
        label: fitShort,
        icon: <Maximize2 className="w-3.5 h-3.5" />,
        active: fit !== 0,
        run: cycleFit,
      },
      {
        id: 'audio',
        label: audioTrackLabel,
        icon: <Volume2 className="w-3.5 h-3.5" />,
        active: false,
        run: cycleAudioTrack,
      },
      {
        id: 'sub',
        label: subTrackIdx >= 0 ? `Leg. ${subTrackIdx + 1}` : 'Legendas',
        icon: <Captions className="w-3.5 h-3.5" />,
        active: subTrackIdx >= 0,
        run: cycleSubTrack,
      },
      {
        id: 'bright',
        label: `${brightnessPct}%`,
        icon: <Sun className="w-3.5 h-3.5" />,
        active: brightnessPct < 100,
        run: () => {
          const nextDelta = brightnessPct >= 100 ? -80 : 10;
          onStepBrightness(nextDelta);
          const nextVal = Math.max(20, Math.min(100, brightnessPct + nextDelta));
          flashHud(`Brilho: ${nextVal}%`);
        },
      },
      {
        id: 'ab',
        label: abLabel,
        icon: <Repeat className="w-3.5 h-3.5" />,
        active: abStartMs !== null,
        run: stepAbLoop,
      },
      {
        id: 'lock',
        label: controlsLocked ? 'Destravar' : 'Travar',
        icon: controlsLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />,
        active: controlsLocked,
        run: toggleLock,
      },
    ],
    [
      paused,
      rate,
      fit,
      fitShort,
      audioTrackLabel,
      subTrackIdx,
      brightnessPct,
      abLabel,
      abStartMs,
      controlsLocked,
      onTogglePause,
      flashHud,
      cycleSpeed,
      cycleFit,
      cycleAudioTrack,
      cycleSubTrack,
      onStepBrightness,
      stepAbLoop,
      toggleLock,
    ]
  );

  useImperativeHandle(
    ref,
    () => ({
      toggleLock,
      handleButton: (btn: R36SButton) => {
        if (controlsLocked) {
          if (btn === 'X' || btn === 'START') {
            toggleLock();
          } else {
            bumpOsd();
            flashHud('Controles travados · Pressione X para destravar');
          }
          return;
        }
        bumpOsd();
        if (btn === 'A') {
          if (dockFocused) {
            setDockFocused(false);
          } else {
            onBack();
          }
          return;
        }
        if (btn === 'X') {
          onToggleOsd();
          return;
        }
        if (btn === 'Y') {
          stepAbLoop();
          return;
        }
        if (btn === 'L2') {
          seekAndFlash(-30);
          return;
        }
        if (btn === 'R2') {
          seekAndFlash(30);
          return;
        }
        if (btn === 'L1') {
          onStepBrightness(-10);
          flashHud(`Brilho: ${Math.max(20, brightnessPct - 10)}%`);
          return;
        }
        if (btn === 'R1') {
          onStepBrightness(10);
          flashHud(`Brilho: ${Math.min(100, brightnessPct + 10)}%`);
          return;
        }
        if (btn === 'DOWN') {
          setDockFocused(true);
          return;
        }
        if (btn === 'UP') {
          setDockFocused(false);
          return;
        }
        if (dockFocused) {
          if (btn === 'LEFT') {
            setDockCursor((c) => (c + dockActions.length - 1) % dockActions.length);
          } else if (btn === 'RIGHT') {
            setDockCursor((c) => (c + 1) % dockActions.length);
          } else if (btn === 'B') {
            dockActions[dockCursor]?.run();
          }
          return;
        }
        if (btn === 'LEFT') {
          seekAndFlash(-10);
        } else if (btn === 'RIGHT') {
          seekAndFlash(10);
        } else if (btn === 'B') {
          onTogglePause();
          flashHud(paused ? 'Reproduzindo' : 'Pausado');
        }
      },
    }),
    [
      controlsLocked,
      dockFocused,
      dockCursor,
      dockActions,
      brightnessPct,
      paused,
      toggleLock,
      bumpOsd,
      flashHud,
      onBack,
      onToggleOsd,
      stepAbLoop,
      seekAndFlash,
      onStepBrightness,
      onTogglePause,
    ]
  );

  const objectFit = fit === 1 ? 'object-cover' : fit === 2 ? 'object-fill' : 'object-contain';
  const showControls = !controlsLocked && showOsd && (osdVisible || paused || dockFocused || !!errMsg);
  const progressPct = durMs > 0 ? Math.min(100, (curMs / durMs) * 100) : isLive ? 100 : 0;
  const abStartPct = durMs > 0 && abStartMs !== null ? Math.min(100, (abStartMs / durMs) * 100) : null;
  const abEndPct = durMs > 0 && abEndMs !== null ? Math.min(100, (abEndMs / durMs) * 100) : null;
  const remainingMs = Math.max(0, durMs - curMs);
  const sleepMin = updateCtx.sleepRemainingMin ?? 0;
  const dimOpacity = Math.max(0, Math.min(0.75, ((100 - brightnessPct) / 100) * 0.8));

  return (
    <div
      className="w-full h-full bg-black relative overflow-hidden select-none"
      onClick={() => {
        if (controlsLocked) {
          bumpOsd();
          return;
        }
        bumpOsd();
      }}
    >
      <video
        ref={localRef}
        playsInline
        className={`w-full h-full ${objectFit}`}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setResolution(`${v.videoWidth}×${v.videoHeight}`);
          }
          if (Number.isFinite(v.duration) && v.duration > 0) {
            setDurMs(v.duration * 1000);
            if (!isLive && !restoredPosRef.current && initialPositionSec > 5 && initialPositionSec < v.duration * 0.94) {
              restoredPosRef.current = true;
              v.currentTime = initialPositionSec;
              flashHud(`Retomando em ${formatTime(initialPositionSec * 1000)}`);
            }
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const nowMs = v.currentTime * 1000;
          setCurMs(nowMs);
          if (Number.isFinite(v.duration)) {
            setDurMs(v.duration * 1000);
            if (!isLive && abStartMs !== null && abEndMs !== null && nowMs >= abEndMs) {
              v.currentTime = abStartMs / 1000;
            }
            const tNow = Date.now();
            if (!isLive && onProgressReport && tNow - lastReportRef.current > 4000) {
              lastReportRef.current = tNow;
              onProgressReport(v.currentTime, v.duration);
            }
          }
        }}
        onEnded={() => {
          if (!isLive && onProgressReport && durMs > 0) {
            onProgressReport(durMs / 1000, durMs / 1000);
          }
          onEnded();
        }}
        onError={advanceMirrorOrFail}
      />

      {/* Hardware-matching Brightness Dimming Layer */}
      {dimOpacity > 0.01 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-150"
          style={{ backgroundColor: `rgba(0,0,0,${dimOpacity.toFixed(2)})` }}
        />
      )}

      {/* Error State */}
      {errMsg && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-8 text-center">
          <div style={{ color: theme.text }} className="text-[17px] font-semibold">
            {errMsg}
          </div>
          <div style={{ color: theme.muted }} className="text-[12px] mt-1.5 max-w-[420px] truncate">
            {title}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            style={{ backgroundColor: theme.accent, color: theme.isLight ? '#fff' : '#090c12' }}
            className="mt-4 px-4 py-1.5 rounded-lg text-[12px] font-bold cursor-pointer"
          >
            {tr('Voltar', lang)}
          </button>
        </div>
      )}

      {/* Center Auto-Fading HUD Action Toast */}
      {hudToast && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center pointer-events-none">
          <div
            style={{
              backgroundColor: 'rgba(10, 14, 22, 0.84)',
              border: `1px solid ${rgbToRgba(theme.accent, 0.55)}`,
              color: '#f8fafc',
            }}
            className="px-4 py-2 rounded-xl text-[13px] font-bold tracking-wide backdrop-blur-md shadow-xl"
          >
            {hudToast}
          </div>
        </div>
      )}

      {/* Control Lock Minimal Banner */}
      {controlsLocked && (
        <div className="absolute top-4 inset-x-0 z-30 flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLock();
            }}
            style={{
              backgroundColor: 'rgba(10, 14, 22, 0.86)',
              border: `1px solid ${rgbToRgba(theme.accent, 0.65)}`,
              color: '#f8fafc',
            }}
            className="px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-[11.5px] font-semibold cursor-pointer shadow-lg backdrop-blur-md"
          >
            <Lock className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>Controles travados · Clique ou pressione X para destravar</span>
          </button>
        </div>
      )}

      {/* Cinematic Top & Bottom Translucent Gradient Scrims */}
      {showControls && (
        <>
          {/* Top Gradient Bar */}
          <div
            className="absolute top-0 inset-x-0 z-20 px-4 pt-3 pb-7 bg-gradient-to-b from-black/88 via-black/50 to-transparent"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={onBack}
                  className="text-[11.5px] font-bold text-white/90 hover:text-white px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  A · {tr('Voltar', lang)}
                </button>
                <div className="min-w-0">
                  <div className="text-[14px] sm:text-[15px] font-bold text-white truncate leading-tight">
                    {title}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-white/70 mt-0.5 tabular-nums truncate">
                    <span style={{ color: theme.accent }} className="font-bold">
                      {sectionLabel ?? (isLive ? tr('IPTV', lang) : tr('VÍDEOS', lang))}
                    </span>
                    {resolution && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{resolution}</span>
                      </>
                    )}
                    {Math.abs(rate - 1) > 0.01 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span style={{ color: theme.accent }}>{rate.toFixed(2)}x</span>
                      </>
                    )}
                    {abStartMs !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span style={{ color: theme.accent }}>
                          {abEndMs !== null
                            ? `A-B ${formatTime(abStartMs)}–${formatTime(abEndMs)}`
                            : `A ${formatTime(abStartMs)}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-[11px] text-white/80 tabular-nums shrink-0">
                {sleepMin > 0 && (
                  <span style={{ color: theme.accent }} className="font-bold">
                    ZZZ {sleepMin}m
                  </span>
                )}
                <span>{clock}</span>
                <span style={{ color: theme.accent }} className="font-bold">
                  {battery}%
                </span>
                <button
                  type="button"
                  onClick={onOpenOptions}
                  className="text-[11px] font-semibold text-white/85 hover:text-white px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer whitespace-nowrap"
                >
                  SELECT · {tr('Opções', lang)}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Gradient Scrim: Seek Bar + Transport + 8-Action Quick Dock */}
          <div
            className="absolute bottom-0 inset-x-0 z-20 px-4 pt-10 pb-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col gap-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Time row */}
            <div className="flex items-center justify-between text-[11px] text-white/80 tabular-nums">
              <div className="flex items-center gap-2">
                {!isLive ? (
                  <>
                    <span className="font-semibold text-white">{formatTime(curMs)}</span>
                    <span className="text-white/45">/</span>
                    <span>{formatTime(durMs)}</span>
                    {durMs > 0 && (
                      <span className="text-white/55 hidden @min-[420px]:inline">
                        (-{formatTime(remainingMs)})
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: theme.accent }} className="font-bold tracking-wider">
                    {tr('AO VIVO', lang)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10.5px] text-white/65">
                {!isLive && (
                  <>
                    <button
                      type="button"
                      onClick={() => seekAndFlash(-30)}
                      className="hover:text-white cursor-pointer flex items-center gap-0.5"
                    >
                      <Rewind className="w-3 h-3" /> 30s
                    </button>
                    <button
                      type="button"
                      onClick={() => seekAndFlash(-10)}
                      className="hover:text-white cursor-pointer"
                    >
                      -10s
                    </button>
                    <button
                      type="button"
                      onClick={() => seekAndFlash(10)}
                      className="hover:text-white cursor-pointer"
                    >
                      +10s
                    </button>
                    <button
                      type="button"
                      onClick={() => seekAndFlash(30)}
                      className="hover:text-white cursor-pointer flex items-center gap-0.5"
                    >
                      30s <FastForward className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Interactive Scrubbing Bar with A-B Loop Highlight */}
            <div
              className="w-full h-[6px] rounded-full bg-white/20 relative cursor-pointer group"
              onClick={(e) => {
                if (isLive || !durMs || !localRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                localRef.current.currentTime = (ratio * durMs) / 1000;
                bumpOsd();
              }}
            >
              {/* A-B Range Segment */}
              {abStartPct !== null && abEndPct !== null && (
                <div
                  style={{
                    left: `${abStartPct}%`,
                    width: `${Math.max(1, abEndPct - abStartPct)}%`,
                    backgroundColor: 'rgba(250, 204, 21, 0.55)',
                  }}
                  className="absolute top-0 bottom-0 rounded-full"
                />
              )}
              <div
                style={{ width: `${progressPct}%`, backgroundColor: theme.accent }}
                className="h-full rounded-full relative"
              >
                <span
                  style={{ backgroundColor: '#ffffff', boxShadow: `0 0 8px ${theme.accent}` }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-[10px] h-[10px] rounded-full"
                />
              </div>
              {abStartPct !== null && (
                <span
                  style={{ left: `${abStartPct}%` }}
                  className="absolute -top-1 w-[2px] h-[14px] bg-amber-300"
                  title="Ponto A"
                />
              )}
              {abEndPct !== null && (
                <span
                  style={{ left: `${abEndPct}%` }}
                  className="absolute -top-1 w-[2px] h-[14px] bg-amber-300"
                  title="Ponto B"
                />
              )}
            </div>

            {/* 8-Action Interactive Quick-Action Dock */}
            <div className="grid grid-cols-4 @min-[540px]:grid-cols-8 gap-1.5">
              {dockActions.map((act, idx) => {
                const focused = dockFocused && idx === dockCursor;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onMouseEnter={() => {
                      setDockCursor(idx);
                      bumpOsd();
                    }}
                    onClick={() => {
                      setDockCursor(idx);
                      act.run();
                      bumpOsd();
                    }}
                    style={{
                      backgroundColor: focused
                        ? rgbToRgba(theme.accent, 0.24)
                        : act.active
                        ? 'rgba(255,255,255,0.14)'
                        : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${
                        focused
                          ? theme.accent
                          : act.active
                          ? rgbToRgba(theme.accent, 0.45)
                          : 'rgba(255,255,255,0.12)'
                      }`,
                      color: focused || act.active ? '#ffffff' : 'rgba(255,255,255,0.82)',
                    }}
                    className="h-[34px] px-1.5 rounded-lg flex items-center justify-center gap-1 text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap overflow-hidden"
                  >
                    <span style={{ color: focused || act.active ? theme.accent : 'rgba(255,255,255,0.75)' }} className="shrink-0">
                      {act.icon}
                    </span>
                    <span className="truncate">{act.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Compact R36S Controls Hint Line */}
            <div className="flex items-center justify-between text-[9.5px] text-white/55 pt-0.5">
              <span>B Pausa · ←→ 10s · L2/R2 30s · ↓ Barra rápida</span>
              <span>L1/R1 Brilho · Y Loop A-B · X Ocultar</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
});
