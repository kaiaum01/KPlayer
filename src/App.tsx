import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KP_THEMES } from './themes';
import { LANGUAGE_NAMES, TERMS_PAGES, tr } from './i18n';
import type {
  EqPresetName,
  FootballMatch,
  IptvChannel,
  LanguageCode,
  MediaTrack,
  RadioStation,
  RepeatMode,
  ScreenMode,
  VideoFit,
} from './types';
import {
  AUDIO_EXT_RE,
  VIDEO_EXT_RE,
  createInitialDemoTracks,
  formatBytes,
  formatTime,
  parseLocalM3u,
  parseLrc,
} from './utils/media';
import { HeaderBar } from './components/HeaderBar';
import {
  AudioVisualizer,
  FooterBar,
  KpCardIcon,
  KpSprite,
  ModernBackdrop,
  PlayDisc,
  TileArrow,
  TransportSkipButton,
  VinylArt,
  mixRgb,
  modernCardStyle,
  modernPanelStyle,
  modernPillStyle,
  rgbToRgba,
  themeHairline,
} from './components/R36SIcons';
import { R36SControls, type R36SButton } from './components/R36SControls';
import { VideoScreen } from './components/VideoScreen';
import { PlacarDaBolaScreen, type PlacarDaBolaHandle } from './components/PlacarDaBolaScreen';
import { BootSplashScreen, type BootPreloadStatus } from './components/BootSplashScreen';
import portCoverImg from './assets/images/kplayer_port_cover_1795064951734.jpg';

const RADIO_CATEGORIES = [
  'Brasil',
  'Mais ouvidas',
  'Pop',
  'Rock',
  'Notícias',
  'Rádio do Usuário',
  'Favoritas',
] as const;

const SLEEP_OPTIONS = [0, 15, 30, 60, 90, 120] as const;

const EQ_PRESETS: Array<{ name: EqPresetName; low: number; mid: number; high: number }> = [
  { name: 'Desativada', low: 0, mid: 0, high: 0 },
  { name: 'Flat', low: 0, mid: 0, high: 0 },
  { name: 'Bass Boost', low: 7, mid: 1, high: -1 },
  { name: 'Rock', low: 5, mid: -1, high: 4 },
  { name: 'Pop', low: -1, mid: 4, high: 3 },
  { name: 'Jazz', low: 3, mid: 2, high: 4 },
  { name: 'Classical', low: 3, mid: 0, high: 5 },
  { name: 'Electronic', low: 6, mid: 1, high: 5 },
];

const OPTION_GROUPS = [
  { name: 'Reprodução', items: ['rate', 'fit', 'audioTrack', 'subtitles', 'repeat', 'shuffle', 'eq'] as const },
  { name: 'Biblioteca', items: ['favTrack', 'myFavs', 'resume', 'iptv', 'football'] as const },
  { name: 'Geral', items: ['language', 'theme', 'ipLocation', 'update', 'sleep', 'terms', 'exit'] as const },
];

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  // Persisted preferences matching KPlayer R36S settings.cfg & preferences.cfg
  const [language, setLanguage] = useState<LanguageCode>(() => loadStorage('kp_lang', 0));
  const [onboarded, setOnboarded] = useState<boolean>(() => loadStorage('kp_onboarded', false));
  const [themeIndex, setThemeIndex] = useState<number>(() => loadStorage('kp_theme', 0));
  const [welcomeFocus, setWelcomeFocus] = useState<0 | 1>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => loadStorage('kp_repeat', 0));
  const [shuffle, setShuffle] = useState<boolean>(() => loadStorage('kp_shuffle', false));
  const [ipLocationEnabled, setIpLocationEnabled] = useState<boolean>(() =>
    loadStorage('kp_ip_loc', false)
  );
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<string[]>(() =>
    loadStorage('kp_fav_tracks', [])
  );
  const [favoriteRadios, setFavoriteRadios] = useState<RadioStation[]>(() =>
    loadStorage('kp_fav_radios', [])
  );
  const [showDeck, setShowDeck] = useState<boolean>(true);
  const [showR36sModal, setShowR36sModal] = useState<boolean>(false);
  const [r36sInfo, setR36sInfo] = useState<{
    ready: boolean;
    version: string;
    filename: string;
    sizeBytes: number;
    sha256: string;
    arch: string;
  } | null>(null);

  useEffect(() => {
    fetch('/api/r36s/info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.ready) setR36sInfo(data);
      })
      .catch(() => {});
  }, []);

  const theme = KP_THEMES[themeIndex] ?? KP_THEMES[0];

  // Screen navigation — always starts on animated boot splash screen every time player turns on
  const [screen, setScreen] = useState<ScreenMode>('boot');
  const [prevScreen, setPrevScreen] = useState<ScreenMode>('home');
  const [termsPage, setTermsPage] = useState(0);
  const [termsReturn, setTermsReturn] = useState<ScreenMode>('welcome');
  const [dashFocus, setDashFocus] = useState(0);

  // Boot splash animation & upfront preload state
  const [bootRunId, setBootRunId] = useState(0);
  const [bootProgress, setBootProgress] = useState(6);
  const [bootStep, setBootStep] = useState('Iniciando K PLAYER');
  const [bootFading, setBootFading] = useState(false);
  const [bootStatus, setBootStatus] = useState<BootPreloadStatus>({
    libraryReady: false,
    radioReady: false,
    iptvReady: false,
    footballReady: false,
    mediaCount: 0,
    radioCount: 0,
    iptvCount: 0,
    matchCount: 0,
  });
  const [preloadedMatches, setPreloadedMatches] = useState<FootballMatch[]>([]);
  const radioCacheRef = useRef<Map<number, RadioStation[]>>(new Map());
  const iptvCacheRef = useRef<Map<number, IptvChannel[]>>(new Map());

  // Header location & toast notification
  const [locationLabel, setLocationLabel] = useState('Mídias locais');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Media Library
  const [tracks, setTracks] = useState<MediaTrack[]>(() => createInitialDemoTracks());
  const [libFilter, setLibFilter] = useState<0 | 1 | 2>(0); // 0=All, 1=Audio, 2=Video
  const [libLocationsView, setLibLocationsView] = useState(false);
  const [libFavoritesOnly, setLibFavoritesOnly] = useState(false);
  const [libSelected, setLibSelected] = useState(0);
  const [libLocationSelected, setLibLocationSelected] = useState(0);

  // Active Playback (Audio / Radio / Video)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const m3uInputRef = useRef<HTMLInputElement | null>(null);
  const placarRef = useRef<PlacarDaBolaHandle | null>(null);

  const [activeTrack, setActiveTrack] = useState<MediaTrack | null>(() => tracks[0] ?? null);
  const [activeRadio, setActiveRadio] = useState<RadioStation | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>('');
  const [activeVideoTitle, setActiveVideoTitle] = useState<string>('');
  const [activeVideoLive, setActiveVideoLive] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number>(() => tracks[0]?.durationMs ?? 0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [videoFit, setVideoFit] = useState<VideoFit>(0);
  const [showVideoOsd, setShowVideoOsd] = useState(true);
  const [sleepIdx, setSleepIdx] = useState(0);
  const [eqIdx, setEqIdx] = useState(0);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest'>('idle');

  // Music Screen Panel: 0=Lyrics, 1=Queue, 2=Folder
  const [audioPanel, setAudioPanel] = useState<0 | 1 | 2>(0);
  const [queueCursor, setQueueCursor] = useState(0);

  // Radio State
  const [radioCategory, setRadioCategory] = useState(0);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [userRadios, setUserRadios] = useState<RadioStation[]>([]);
  const [radioSelected, setRadioSelected] = useState(0);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);

  // IPTV State
  const [iptvSource, setIptvSource] = useState<0 | 1 | 2>(1); // 1=Brazil, 2=World, 0=Local
  const [iptvChannels, setIptvChannels] = useState<IptvChannel[]>([]);
  const [localIptvChannels, setLocalIptvChannels] = useState<IptvChannel[]>([]);
  const [iptvSelected, setIptvSelected] = useState(0);
  const [iptvLoading, setIptvLoading] = useState(false);

  // Options State
  const [optionGroupIdx, setOptionGroupIdx] = useState(0);
  const [optionRowIdx, setOptionRowIdx] = useState(0);

  // Responsive 640x480 viewport scaler
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      const el = stageRef.current;
      if (!el) return;
      const availW = el.clientWidth - 16;
      const availH = el.clientHeight - 16;
      const s = Math.max(0.45, Math.min(availW / 640, availH / 480, 1.55));
      setScale(s);
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [showDeck]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('kp_lang', JSON.stringify(language));
      localStorage.setItem('kp_onboarded', JSON.stringify(onboarded));
      localStorage.setItem('kp_theme', JSON.stringify(themeIndex));
      localStorage.setItem('kp_repeat', JSON.stringify(repeatMode));
      localStorage.setItem('kp_shuffle', JSON.stringify(shuffle));
      localStorage.setItem('kp_ip_loc', JSON.stringify(ipLocationEnabled));
      localStorage.setItem('kp_fav_tracks', JSON.stringify(favoriteTrackIds));
      localStorage.setItem('kp_fav_radios', JSON.stringify(favoriteRadios));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    language,
    onboarded,
    themeIndex,
    repeatMode,
    shuffle,
    ipLocationEnabled,
    favoriteTrackIds,
    favoriteRadios,
  ]);

  // Optional IP location
  useEffect(() => {
    if (!ipLocationEnabled) {
      setLocationLabel(tr('Mídias locais', language));
      return;
    }
    fetch('/api/location')
      .then((r) => r.json())
      .then((d: { location?: string }) => {
        if (d.location) setLocationLabel(d.location);
      })
      .catch(() => {});
  }, [ipLocationEnabled, language]);

  // Load user's actual .pls stations from ports/kplayer/radios_usuario/
  const fetchUserRadios = useCallback(async () => {
    try {
      const r = await fetch('/api/user-radios');
      const d = (await r.json()) as { stations?: RadioStation[] };
      const list = d.stations ?? [];
      setUserRadios(list);
      return list;
    } catch {
      setUserRadios([]);
      return [] as RadioStation[];
    }
  }, []);

  // Animated boot startup sequence: preloads library, radios, IPTV & Placar da Bola upfront
  // so entering screens inside KPlayer is instant with zero loading screen.
  const tracksCountRef = useRef(tracks.length);
  tracksCountRef.current = tracks.length;
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;

  useEffect(() => {
    let cancelled = false;
    setScreen('boot');
    setBootFading(false);
    setBootProgress(8);
    setBootStep('Iniciando K PLAYER');
    setBootStatus({
      libraryReady: false,
      radioReady: false,
      iptvReady: false,
      footballReady: false,
      mediaCount: 0,
      radioCount: 0,
      iptvCount: 0,
      matchCount: 0,
    });

    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const runBoot = async () => {
      const startTs = performance.now();

      // Phase 1: Library indexing ready
      await sleep(320);
      if (cancelled) return;
      setBootStep('Carregando biblioteca de mídias');
      setBootProgress(32);
      setBootStatus((prev) => ({
        ...prev,
        libraryReady: true,
        mediaCount: tracksCountRef.current,
      }));

      // Phase 2: Preload Radio, IPTV & Placar da Bola in parallel during boot animation
      await sleep(220);
      if (cancelled) return;
      setBootStep('Preparando rádios, IPTV e Placar da Bola');
      setBootProgress(52);

      const radioTask = Promise.all([
        fetchUserRadios(),
        fetch('/api/radio?category=0')
          .then((r) => (r.ok ? r.json() : { stations: [] }))
          .then((d: { stations?: RadioStation[] }) => d.stations ?? [])
          .catch(() => [] as RadioStation[]),
      ]).then(([uList, brList]) => {
        if (cancelled) return;
        radioCacheRef.current.set(0, brList);
        setRadioStations(brList);
        setBootStatus((prev) => ({
          ...prev,
          radioReady: true,
          radioCount: brList.length + uList.length,
        }));
        setBootProgress((p) => Math.max(p, 68));
      });

      const iptvTask = fetch('/api/iptv?source=br')
        .then((r) => (r.ok ? r.json() : { channels: [] }))
        .then((d: { channels?: IptvChannel[] }) => d.channels ?? [])
        .catch(() => [] as IptvChannel[])
        .then((channels) => {
          if (cancelled) return;
          iptvCacheRef.current.set(1, channels);
          setIptvChannels(channels);
          setBootStatus((prev) => ({
            ...prev,
            iptvReady: true,
            iptvCount: channels.length,
          }));
          setBootProgress((p) => Math.max(p, 82));
        });

      const footballTask = fetch('/api/football')
        .then((r) => (r.ok ? r.json() : { matches: [] }))
        .then((d: { matches?: FootballMatch[] }) => d.matches ?? [])
        .catch(() => [] as FootballMatch[])
        .then((list) => {
          if (cancelled) return;
          setPreloadedMatches(list);
          setBootStatus((prev) => ({
            ...prev,
            footballReady: true,
            matchCount: list.length,
          }));
          setBootProgress((p) => Math.max(p, 92));
        });

      // Wait for preloads (capped at 3.2s so boot never stalls offline)
      await Promise.race([Promise.all([radioTask, iptvTask, footballTask]), sleep(3200)]);
      if (cancelled) return;

      // Ensure smooth minimum ~1.9s animation so transitions feel fluid
      const elapsed = performance.now() - startTs;
      if (elapsed < 1850) {
        await sleep(1850 - elapsed);
      }
      if (cancelled) return;

      setBootStatus((prev) => ({
        ...prev,
        libraryReady: true,
        radioReady: true,
        iptvReady: true,
        footballReady: true,
      }));
      setBootStep('Tudo pronto!');
      setBootProgress(100);
      await sleep(360);
      if (cancelled) return;

      setBootFading(true);
      await sleep(280);
      if (cancelled) return;

      setScreen(onboardedRef.current ? 'home' : 'welcome');
      setBootFading(false);
    };

    runBoot();
    return () => {
      cancelled = true;
    };
  }, [bootRunId, fetchUserRadios]);

  // Web Audio Equalizer chain
  const eqNodesRef = useRef<{
    ctx: AudioContext;
    low: BiquadFilterNode;
    mid: BiquadFilterNode;
    high: BiquadFilterNode;
  } | null>(null);

  const ensureAudioEq = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || eqNodesRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createMediaElementSource(audio);
      const low = ctx.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 120;
      const mid = ctx.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      const high = ctx.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 6000;
      src.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(ctx.destination);
      eqNodesRef.current = { ctx, low, mid, high };
    } catch {
      // Fallback without Web Audio EQ
    }
  }, []);

  useEffect(() => {
    const preset = EQ_PRESETS[eqIdx] ?? EQ_PRESETS[0];
    if (eqNodesRef.current) {
      eqNodesRef.current.low.gain.value = preset.low;
      eqNodesRef.current.mid.gain.value = preset.mid;
      eqNodesRef.current.high.gain.value = preset.high;
    }
  }, [eqIdx]);

  // Sleep timer
  useEffect(() => {
    const mins = SLEEP_OPTIONS[sleepIdx];
    if (!mins) return;
    const id = window.setTimeout(() => {
      audioRef.current?.pause();
      videoRef.current?.pause();
      setIsPlaying(false);
      setIsPaused(true);
      setSleepIdx(0);
      notify(tr('Timer de sono', language));
    }, mins * 60_000);
    return () => window.clearTimeout(id);
  }, [sleepIdx, language, notify]);

  // Audio playback helpers
  const audioTracks = useMemo(() => tracks.filter((t) => t.kind === 'audio'), [tracks]);

  const playMediaTrack = useCallback(
    (track: MediaTrack) => {
      if (track.kind === 'video') {
        audioRef.current?.pause();
        setActiveRadio(null);
        setActiveTrack(track);
        setActiveVideoTitle(track.title);
        setActiveVideoSrc(track.url ?? '');
        setActiveVideoLive(false);
        setIsPaused(false);
        setIsPlaying(true);
        setShowVideoOsd(true);
        setPrevScreen(screen === 'video' ? 'library' : screen);
        setScreen('video');
        return;
      }

      const audio = audioRef.current;
      if (!audio || !track.url) return;
      ensureAudioEq();
      if (eqNodesRef.current?.ctx.state === 'suspended') {
        eqNodesRef.current.ctx.resume().catch(() => {});
      }
      setActiveRadio(null);
      setActiveTrack(track);
      setDurationMs(track.durationMs || 0);
      setCurrentMs(0);
      audio.src = track.url;
      audio.playbackRate = playbackRate;
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsPaused(false);
        })
        .catch(() => {
          notify(tr('Não foi possível abrir a mídia', language));
        });
    },
    [ensureAudioEq, playbackRate, screen, language, notify]
  );

  const playRadioStation = useCallback(
    (station: RadioStation) => {
      const audio = audioRef.current;
      if (!audio) return;
      ensureAudioEq();
      if (eqNodesRef.current?.ctx.state === 'suspended') {
        eqNodesRef.current.ctx.resume().catch(() => {});
      }
      setActiveTrack(null);
      setActiveRadio(station);
      setDurationMs(0);
      setCurrentMs(0);

      // Use server proxy for HTTP streams (avoid HTTPS mixed-content block) or fallback on error
      const proxied = `/api/stream?url=${encodeURIComponent(station.url)}`;
      const initialSrc = station.url.startsWith('http://') ? proxied : station.url;
      audio.src = initialSrc;
      audio.playbackRate = 1.0;

      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsPaused(false);
        })
        .catch(() => {
          if (initialSrc !== proxied) {
            audio.src = proxied;
            audio
              .play()
              .then(() => {
                setIsPlaying(true);
                setIsPaused(false);
              })
              .catch(() => {
                setIsPlaying(false);
                setIsPaused(true);
                notify(tr('Rádio indisponível', language));
              });
          } else {
            setIsPlaying(false);
            setIsPaused(true);
            notify(tr('Rádio indisponível', language));
          }
        });
    },
    [ensureAudioEq, language, notify]
  );

  const togglePlayPause = useCallback(() => {
    if (screen === 'video') {
      setIsPaused((p) => !p);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src) {
      if (activeTrack) {
        playMediaTrack(activeTrack);
        return;
      }
      if (audioTracks[0]) {
        playMediaTrack(audioTracks[0]);
        return;
      }
      return;
    }
    if (audio.paused) {
      if (eqNodesRef.current?.ctx.state === 'suspended') {
        eqNodesRef.current.ctx.resume().catch(() => {});
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsPaused(false);
        })
        .catch(() => {});
    } else {
      audio.pause();
      setIsPaused(true);
    }
  }, [screen, activeTrack, audioTracks, playMediaTrack]);

  const stepTrack = useCallback(
    (dir: 1 | -1) => {
      if (activeRadio && radioStations.length > 0) {
        const idx = radioStations.findIndex((s) => s.url === activeRadio.url);
        const nextIdx = (idx + dir + radioStations.length) % radioStations.length;
        setRadioSelected(nextIdx);
        playRadioStation(radioStations[nextIdx]);
        return;
      }
      if (audioTracks.length === 0) return;
      const idx = activeTrack ? audioTracks.findIndex((t) => t.id === activeTrack.id) : -1;
      let nextIdx: number;
      if (shuffle && audioTracks.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * audioTracks.length);
        } while (nextIdx === idx);
      } else {
        nextIdx = (idx + dir + audioTracks.length) % audioTracks.length;
      }
      playMediaTrack(audioTracks[nextIdx]);
    },
    [activeRadio, radioStations, playRadioStation, audioTracks, activeTrack, shuffle, playMediaTrack]
  );

  useEffect(() => {
    if (audioRef.current && !activeRadio) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeRadio]);

  // Fetch Radio stations when category changes or Radio opens (instant when preloaded at boot)
  const loadRadioCategory = useCallback(
    async (cat: number, force = false) => {
      setRadioError(null);
      setRadioSelected(0);
      if (cat === 5) {
        setRadioStations(userRadios);
        return;
      }
      if (cat === 6) {
        setRadioStations(favoriteRadios);
        return;
      }
      const cached = radioCacheRef.current.get(cat);
      if (!force && cached && cached.length > 0) {
        setRadioStations(cached);
        setRadioLoading(false);
        return;
      }
      setRadioLoading(true);
      try {
        const r = await fetch(`/api/radio?category=${cat}`);
        const d = (await r.json()) as { stations?: RadioStation[]; error?: string };
        const list = d.stations ?? [];
        if (list.length > 0) radioCacheRef.current.set(cat, list);
        setRadioStations(list);
        if (d.error && list.length === 0) {
          setRadioError(tr('Rádio indisponível', language));
        }
      } catch {
        setRadioStations([]);
        setRadioError(tr('Rádio indisponível', language));
      } finally {
        setRadioLoading(false);
      }
    },
    [userRadios, favoriteRadios, language]
  );

  useEffect(() => {
    if (screen === 'radio') {
      loadRadioCategory(radioCategory, false);
    }
  }, [screen, radioCategory, loadRadioCategory]);

  // Fetch IPTV channels (instant when preloaded at boot)
  const loadIptv = useCallback(
    async (src: 0 | 1 | 2, force = false) => {
      setIptvSelected(0);
      if (src === 0) {
        setIptvChannels(localIptvChannels);
        return;
      }
      const cached = iptvCacheRef.current.get(src);
      if (!force && cached && cached.length > 0) {
        setIptvChannels(cached);
        setIptvLoading(false);
        return;
      }
      setIptvLoading(true);
      try {
        const key = src === 1 ? 'br' : 'world';
        const r = await fetch(`/api/iptv?source=${key}${force ? '&refresh=1' : ''}`);
        const d = (await r.json()) as { channels?: IptvChannel[] };
        const list = d.channels ?? [];
        if (list.length > 0) iptvCacheRef.current.set(src, list);
        setIptvChannels(list);
      } catch {
        setIptvChannels([]);
      } finally {
        setIptvLoading(false);
      }
    },
    [localIptvChannels]
  );

  useEffect(() => {
    if (screen === 'iptv') {
      loadIptv(iptvSource, false);
    }
  }, [screen, iptvSource, loadIptv]);

  // Handle local media / LRC upload
  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const lrcMap = new Map<string, string>();
      const mediaFiles: File[] = [];

      for (const file of Array.from(files)) {
        if (/\.lrc$/i.test(file.name)) {
          const base = file.name.replace(/\.lrc$/i, '').toLowerCase();
          lrcMap.set(base, await file.text());
        } else if (/\.(m3u8?|pls)$/i.test(file.name)) {
          const parsed = parseLocalM3u(await file.text());
          if (parsed.length > 0) {
            setLocalIptvChannels((prev) => [...parsed, ...prev]);
            notify(`${parsed.length} ${tr('Canais ao vivo', language)}`);
          }
        } else if (
          file.type.startsWith('audio/') ||
          file.type.startsWith('video/') ||
          AUDIO_EXT_RE.test(file.name) ||
          VIDEO_EXT_RE.test(file.name)
        ) {
          mediaFiles.push(file);
        }
      }

      if (mediaFiles.length === 0 && lrcMap.size > 0) {
        // Attach LRC to existing matching tracks
        setTracks((prev) =>
          prev.map((t) => {
            const base = t.name.replace(/\.[^.]+$/, '').toLowerCase();
            const lrcText = lrcMap.get(base);
            return lrcText ? { ...t, lyrics: parseLrc(lrcText) } : t;
          })
        );
        notify(tr('LETRAS SINCRONIZADAS', language));
        return;
      }

      const added: MediaTrack[] = mediaFiles.map((file, idx) => {
        const isVideo = file.type.startsWith('video/') || VIDEO_EXT_RE.test(file.name);
        const base = file.name.replace(/\.[^.]+$/, '');
        const ext = (file.name.split('.').pop() || (isVideo ? 'VIDEO' : 'AUDIO')).toUpperCase();
        const lrcText = lrcMap.get(base.toLowerCase());
        return {
          id: `local-${Date.now()}-${idx}-${file.name}`,
          name: file.name,
          title: base,
          artist: tr('Artista não informado', language),
          album: isVideo ? tr('Vídeos', language) : tr('Áudio local', language),
          kind: isVideo ? 'video' : 'audio',
          format: ext,
          sizeBytes: file.size,
          durationMs: 0,
          url: URL.createObjectURL(file),
          folder: '/ports/kplayer/midias',
          lyrics: lrcText ? parseLrc(lrcText) : undefined,
        };
      });

      if (added.length > 0) {
        setTracks((prev) => [...added, ...prev]);
        notify(`${added.length} ${tr('Mídias locais', language)}`);
        if (!activeTrack && added[0].kind === 'audio') {
          setActiveTrack(added[0]);
        }
      }
    },
    [activeTrack, language, notify]
  );

  // Filtered library list
  const filteredLibrary = useMemo(() => {
    return tracks.filter((t) => {
      if (libFavoritesOnly && !favoriteTrackIds.includes(t.id)) return false;
      if (libFilter === 1) return t.kind === 'audio';
      if (libFilter === 2) return t.kind === 'video';
      return true;
    });
  }, [tracks, libFilter, libFavoritesOnly, favoriteTrackIds]);

  const toggleRadioFav = useCallback(
    (station: RadioStation | undefined) => {
      if (!station) return;
      setFavoriteRadios((prev) => {
        const exists = prev.some((s) => s.url === station.url);
        const next = exists ? prev.filter((s) => s.url !== station.url) : [...prev, station];
        if (radioCategory === 6) setRadioStations(next);
        return next;
      });
      notify(tr('Favorita atualizada', language));
    },
    [radioCategory, language, notify]
  );

  const toggleTrackFav = useCallback(() => {
    if (!activeTrack) {
      notify(tr('Abra uma mídia', language));
      return;
    }
    setFavoriteTrackIds((prev) =>
      prev.includes(activeTrack.id)
        ? prev.filter((id) => id !== activeTrack.id)
        : [...prev, activeTrack.id]
    );
    notify(tr('Favorita atualizada', language));
  }, [activeTrack, language, notify]);

  // Open dashboard card
  const openDashboardCard = useCallback(
    (idx: number) => {
      setDashFocus(idx);
      if (idx === 0) {
        if (!activeTrack && audioTracks[0]) setActiveTrack(audioTracks[0]);
        setScreen('music');
      } else if (idx === 1) {
        setLibFavoritesOnly(false);
        setLibLocationsView(false);
        setLibFilter(2);
        setLibSelected(0);
        setScreen('library');
      } else if (idx === 2) {
        setLibFavoritesOnly(false);
        setLibLocationsView(true);
        setLibFilter(0);
        setLibLocationSelected(0);
        setScreen('library');
      } else if (idx === 3) {
        setScreen('radio');
      } else if (idx === 4) {
        setIptvSource(1);
        setScreen('iptv');
      } else if (idx === 5) {
        setScreen('football');
      }
    },
    [activeTrack, audioTracks]
  );

  // Settings action handler
  const activateOption = useCallback(
    (key: string, dir: 1 | -1 = 1) => {
      switch (key) {
        case 'rate': {
          const steps = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
          const i = steps.findIndex((v) => Math.abs(v - playbackRate) < 0.01);
          setPlaybackRate(steps[(i + dir + steps.length) % steps.length]);
          break;
        }
        case 'fit':
          setVideoFit(((videoFit + dir + 3) % 3) as VideoFit);
          break;
        case 'repeat':
          setRepeatMode(((repeatMode + dir + 3) % 3) as RepeatMode);
          break;
        case 'shuffle':
          setShuffle((s) => !s);
          break;
        case 'eq':
          setEqIdx((i) => (i + dir + EQ_PRESETS.length) % EQ_PRESETS.length);
          break;
        case 'favTrack':
          toggleTrackFav();
          break;
        case 'myFavs':
          setLibFavoritesOnly(true);
          setLibLocationsView(false);
          setLibFilter(1);
          setLibSelected(0);
          setScreen('library');
          break;
        case 'resume':
          if (activeTrack) {
            if (activeTrack.kind === 'audio') setScreen('music');
            else playMediaTrack(activeTrack);
          } else {
            notify(tr('Abra uma mídia', language));
          }
          break;
        case 'iptv':
          setIptvSource(1);
          setScreen('iptv');
          break;
        case 'football':
          setScreen('football');
          break;
        case 'language':
          setLanguage(((language + dir + 3) % 3) as LanguageCode);
          break;
        case 'theme':
          setThemeIndex((i) => (i + dir + KP_THEMES.length) % KP_THEMES.length);
          break;
        case 'ipLocation':
          setIpLocationEnabled((v) => !v);
          break;
        case 'update':
          setUpdateStatus('checking');
          window.setTimeout(() => setUpdateStatus('latest'), 700);
          break;
        case 'sleep':
          setSleepIdx((i) => (i + dir + SLEEP_OPTIONS.length) % SLEEP_OPTIONS.length);
          break;
        case 'terms':
          setTermsReturn('options');
          setTermsPage(0);
          setScreen('terms');
          break;
        case 'exit':
          setScreen('welcome');
          break;
        default:
          notify(tr('Abra uma mídia', language));
      }
    },
    [
      playbackRate,
      videoFit,
      repeatMode,
      language,
      activeTrack,
      playMediaTrack,
      toggleTrackFav,
      notify,
    ]
  );

  // Unified R36S physical / keyboard / on-screen button handler
  const handleButton = useCallback(
    (btn: R36SButton) => {
      if (screen === 'boot') return;

      if (btn === 'START') {
        togglePlayPause();
        return;
      }

      if (btn === 'SELECT') {
        if (screen === 'options') {
          setScreen(prevScreen);
        } else if (screen !== 'welcome' && screen !== 'terms') {
          setPrevScreen(screen);
          setScreen('options');
        }
        return;
      }

      if (screen === 'welcome') {
        if (btn === 'UP' || btn === 'DOWN') {
          setWelcomeFocus((f) => (f === 0 ? 1 : 0));
        } else if (btn === 'LEFT') {
          if (welcomeFocus === 0) setLanguage(((language + 2) % 3) as LanguageCode);
          else setThemeIndex((t) => (t + KP_THEMES.length - 1) % KP_THEMES.length);
        } else if (btn === 'RIGHT') {
          if (welcomeFocus === 0) setLanguage(((language + 1) % 3) as LanguageCode);
          else setThemeIndex((t) => (t + 1) % KP_THEMES.length);
        } else if (btn === 'L1') {
          setWelcomeFocus(1);
          setThemeIndex((t) => (t + KP_THEMES.length - 1) % KP_THEMES.length);
        } else if (btn === 'R1') {
          setWelcomeFocus(1);
          setThemeIndex((t) => (t + 1) % KP_THEMES.length);
        } else if (btn === 'B') {
          setOnboarded(true);
          setScreen('home');
        } else if (btn === 'Y') {
          setTermsReturn('welcome');
          setTermsPage(0);
          setScreen('terms');
        }
        return;
      }

      if (btn === 'L1') {
        stepTrack(-1);
        return;
      }
      if (btn === 'R1') {
        stepTrack(1);
        return;
      }

      if (screen === 'terms') {
        if (btn === 'LEFT') setTermsPage((p) => (p + 2) % 3);
        else if (btn === 'RIGHT') setTermsPage((p) => (p + 1) % 3);
        else if (btn === 'A' || btn === 'B') setScreen(termsReturn);
        return;
      }

      if (screen === 'home') {
        if (btn === 'LEFT') setDashFocus((f) => (f % 3 === 0 ? f + 2 : f - 1));
        else if (btn === 'RIGHT') setDashFocus((f) => (f % 3 === 2 ? f - 2 : f + 1));
        else if (btn === 'UP' || btn === 'DOWN') setDashFocus((f) => (f + 3) % 6);
        else if (btn === 'B') openDashboardCard(dashFocus);
        else if (btn === 'X') setScreen(activeRadio ? 'radio' : 'music');
        else if (btn === 'Y') {
          setPrevScreen('home');
          setScreen('options');
        }
        return;
      }

      if (screen === 'library') {
        if (btn === 'A') {
          if (!libLocationsView && !libFavoritesOnly) {
            setLibLocationsView(true);
          } else {
            setScreen('home');
          }
          return;
        }
        if (btn === 'LEFT') {
          setLibFilter(((libFilter + 2) % 3) as 0 | 1 | 2);
          setLibSelected(0);
          return;
        }
        if (btn === 'RIGHT') {
          setLibFilter(((libFilter + 1) % 3) as 0 | 1 | 2);
          setLibSelected(0);
          return;
        }
        if (btn === 'X') {
          setScreen('music');
          return;
        }
        if (btn === 'Y') {
          notify(tr('Biblioteca atualizada', language));
          return;
        }
        if (libLocationsView) {
          if (btn === 'UP') setLibLocationSelected((i) => (i + 3) % 4);
          else if (btn === 'DOWN') setLibLocationSelected((i) => (i + 1) % 4);
          else if (btn === 'B') {
            if (libLocationSelected === 3) {
              fileInputRef.current?.click();
            } else {
              setLibLocationsView(false);
              setLibSelected(0);
            }
          }
        } else {
          const len = filteredLibrary.length;
          if (btn === 'UP' && len) setLibSelected((i) => (i + len - 1) % len);
          else if (btn === 'DOWN' && len) setLibSelected((i) => (i + 1) % len);
          else if (btn === 'B' && len) {
            const picked = filteredLibrary[libSelected];
            if (picked) {
              playMediaTrack(picked);
              if (picked.kind === 'audio') setScreen('music');
            }
          }
        }
        return;
      }

      if (screen === 'music') {
        if (btn === 'A') setScreen('home');
        else if (btn === 'Y') setAudioPanel(0);
        else if (btn === 'X') setAudioPanel((p) => (p === 1 ? 2 : 1));
        else if (btn === 'LEFT') {
          if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
        } else if (btn === 'RIGHT') {
          if (audioRef.current) audioRef.current.currentTime += 5;
        } else if (btn === 'UP' && audioPanel !== 0 && audioTracks.length) {
          setQueueCursor((c) => (c + audioTracks.length - 1) % audioTracks.length);
        } else if (btn === 'DOWN' && audioPanel !== 0 && audioTracks.length) {
          setQueueCursor((c) => (c + 1) % audioTracks.length);
        } else if (btn === 'B') {
          if (audioPanel !== 0 && audioTracks[queueCursor]) {
            playMediaTrack(audioTracks[queueCursor]);
          } else {
            togglePlayPause();
          }
        }
        return;
      }

      if (screen === 'video') {
        if (btn === 'A') {
          setIsPaused(true);
          setScreen(prevScreen === 'iptv' ? 'iptv' : 'library');
        } else if (btn === 'B') {
          setIsPaused((p) => !p);
        } else if (btn === 'X') {
          setShowVideoOsd((v) => !v);
        } else if (btn === 'LEFT' && !activeVideoLive && videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        } else if (btn === 'RIGHT' && !activeVideoLive && videoRef.current) {
          videoRef.current.currentTime += 10;
        }
        return;
      }

      if (screen === 'radio') {
        const len = radioStations.length;
        if (btn === 'A') setScreen('home');
        else if (btn === 'LEFT')
          setRadioCategory((c) => (c + RADIO_CATEGORIES.length - 1) % RADIO_CATEGORIES.length);
        else if (btn === 'RIGHT')
          setRadioCategory((c) => (c + 1) % RADIO_CATEGORIES.length);
        else if (btn === 'UP' && len) setRadioSelected((i) => (i + len - 1) % len);
        else if (btn === 'DOWN' && len) setRadioSelected((i) => (i + 1) % len);
        else if (btn === 'B' && len) {
          const st = radioStations[radioSelected];
          if (activeRadio?.url === st.url && isPlaying) togglePlayPause();
          else playRadioStation(st);
        } else if (btn === 'X' && len) {
          toggleRadioFav(radioStations[radioSelected]);
        } else if (btn === 'Y') {
          if (radioCategory === 5) fetchUserRadios().then(() => loadRadioCategory(5, true));
          else loadRadioCategory(radioCategory, true);
        }
        return;
      }

      if (screen === 'iptv') {
        const len = iptvChannels.length;
        if (btn === 'A') setScreen('home');
        else if (btn === 'UP' && len) setIptvSelected((i) => (i + len - 1) % len);
        else if (btn === 'DOWN' && len) setIptvSelected((i) => (i + 1) % len);
        else if (btn === 'X') setIptvSource(((iptvSource + 1) % 3) as 0 | 1 | 2);
        else if (btn === 'Y') {
          if (iptvSource === 0) m3uInputRef.current?.click();
          else loadIptv(iptvSource, true);
        } else if (btn === 'B' && len) {
          const ch = iptvChannels[iptvSelected];
          if (ch) {
            audioRef.current?.pause();
            setActiveRadio(null);
            setActiveVideoTitle(ch.name);
            setActiveVideoSrc(ch.url);
            setActiveVideoLive(true);
            setIsPaused(false);
            setShowVideoOsd(true);
            setPrevScreen('iptv');
            setScreen('video');
          }
        }
        return;
      }

      if (screen === 'football') {
        placarRef.current?.handleButton(btn);
        return;
      }

      if (screen === 'options') {
        const grp = OPTION_GROUPS[optionGroupIdx];
        if (btn === 'A') {
          setScreen(prevScreen);
        } else if (btn === 'X') {
          setOptionGroupIdx((g) => (g + 1) % OPTION_GROUPS.length);
          setOptionRowIdx(0);
        } else if (btn === 'UP') {
          setOptionRowIdx((r) => (r + grp.items.length - 1) % grp.items.length);
        } else if (btn === 'DOWN') {
          setOptionRowIdx((r) => (r + 1) % grp.items.length);
        } else if (btn === 'LEFT') {
          activateOption(grp.items[optionRowIdx], -1);
        } else if (btn === 'RIGHT' || btn === 'B') {
          activateOption(grp.items[optionRowIdx], 1);
        }
      }
    },
    [
      togglePlayPause,
      screen,
      prevScreen,
      stepTrack,
      language,
      welcomeFocus,
      termsReturn,
      dashFocus,
      openDashboardCard,
      activeRadio,
      libLocationsView,
      libFavoritesOnly,
      libFilter,
      libLocationSelected,
      filteredLibrary,
      libSelected,
      playMediaTrack,
      audioPanel,
      audioTracks,
      queueCursor,
      activeVideoLive,
      radioStations,
      radioSelected,
      isPlaying,
      playRadioStation,
      toggleRadioFav,
      radioCategory,
      fetchUserRadios,
      loadRadioCategory,
      iptvChannels,
      iptvSelected,
      iptvSource,
      loadIptv,
      optionGroupIdx,
      optionRowIdx,
      activateOption,
      notify,
    ]
  );

  // Keyboard bindings matching R36S / kplayer.gptk
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, R36SButton> = {
        ArrowUp: 'UP',
        w: 'UP',
        ArrowDown: 'DOWN',
        s: 'DOWN',
        ArrowLeft: 'LEFT',
        a: 'LEFT',
        ArrowRight: 'RIGHT',
        d: 'RIGHT',
        Enter: 'B',
        z: 'B',
        Backspace: 'A',
        Escape: 'A',
        x: 'A',
        ' ': 'X',
        c: 'X',
        m: 'Y',
        v: 'Y',
        Tab: 'SELECT',
        o: 'SELECT',
        p: 'START',
        '[': 'L1',
        q: 'L1',
        ']': 'R1',
        e: 'R1',
      };
      const mapped = map[e.key];
      if (mapped) {
        e.preventDefault();
        handleButton(mapped);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleButton]);

  // Current synced lyric index
  const activeLyricIndex = useMemo(() => {
    const list = activeTrack?.lyrics;
    if (!list || list.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].timeMs <= currentMs) idx = i;
      else break;
    }
    return idx;
  }, [activeTrack, currentMs]);

  const upNextTrack = useMemo(() => {
    if (!activeTrack || audioTracks.length <= 1) return null;
    const i = audioTracks.findIndex((t) => t.id === activeTrack.id);
    return audioTracks[(i + 1) % audioTracks.length] ?? null;
  }, [activeTrack, audioTracks]);

  const optionValueLabel = (key: string): string => {
    switch (key) {
      case 'rate':
        return `${playbackRate.toFixed(2)}x`;
      case 'fit':
        return videoFit === 0
          ? tr('Proporção original', language)
          : videoFit === 1
          ? tr('Preencher (corte)', language)
          : tr('Esticar', language);
      case 'audioTrack':
      case 'subtitles':
        return tr('Abra uma mídia', language);
      case 'repeat':
        return repeatMode === 1
          ? tr('Repetir faixa', language)
          : repeatMode === 2
          ? tr('Repetir fila', language)
          : tr('Desativada', language);
      case 'shuffle':
        return tr(shuffle ? 'Ativada' : 'Desativada', language);
      case 'eq':
        return eqIdx === 0 ? tr('Desativada', language) : EQ_PRESETS[eqIdx].name;
      case 'favTrack':
        return activeTrack
          ? tr(favoriteTrackIds.includes(activeTrack.id) ? 'Ativada' : 'Desativada', language)
          : tr('Abra uma mídia', language);
      case 'language':
        return LANGUAGE_NAMES[language];
      case 'theme':
        return tr(theme.name, language);
      case 'ipLocation':
        return tr(ipLocationEnabled ? 'Ativada' : 'Desativada', language);
      case 'update':
        return updateStatus === 'checking'
          ? 'Aguarde...'
          : updateStatus === 'latest'
          ? tr('Versão atual', language)
          : tr('B Verificar', language);
      case 'sleep':
        return sleepIdx === 0 ? tr('Desativada', language) : `${SLEEP_OPTIONS[sleepIdx]} min`;
      default:
        return tr('Abrir', language);
    }
  };

  const optionNameLabel = (key: string): string => {
    const names: Record<string, string> = {
      rate: 'Velocidade',
      fit: 'Formato da imagem',
      audioTrack: 'Faixa de áudio',
      subtitles: 'Legendas',
      repeat: 'Modo de repetição',
      shuffle: 'Aleatório',
      eq: 'Equalizador',
      favTrack: 'Favoritar faixa',
      myFavs: 'Minhas favoritas',
      resume: 'Retomar mídia',
      iptv: 'IPTV',
      football: 'Placar da Bola',
      language: 'Idioma',
      theme: 'Tema',
      ipLocation: 'Localização por IP',
      update: 'Atualização',
      sleep: 'Timer de sono',
      terms: 'Termos de uso',
      exit: 'Sair do KPlayer',
    };
    return tr(names[key] ?? key, language);
  };

  const selectedRadio = radioStations[radioSelected];
  const radioWindowStart = Math.max(0, Math.min(radioSelected - 2, Math.max(0, radioStations.length - 5)));
  const iptvWindowStart = Math.max(0, Math.min(iptvSelected - 3, Math.max(0, iptvChannels.length - 6)));
  const libWindowStart = Math.max(0, Math.min(libSelected - 3, Math.max(0, filteredLibrary.length - 6)));

  return (
    <div className="h-screen w-screen bg-[#0a0c10] text-white flex flex-col overflow-hidden">
      {/* Hidden native inputs for real local media & M3U import */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,video/*,.lrc,.m3u,.m3u8,.pls"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={m3uInputRef}
        type="file"
        accept=".m3u,.m3u8"
        className="hidden"
        onChange={(e) => {
          handleFilesSelected(e.target.files);
          e.target.value = '';
        }}
      />
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setCurrentMs(a.currentTime * 1000);
          if (Number.isFinite(a.duration) && a.duration > 0) {
            setDurationMs(a.duration * 1000);
          }
        }}
        onEnded={() => {
          if (repeatMode === 1 && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          } else if (repeatMode === 2 || audioTracks.length > 1) {
            stepTrack(1);
          } else {
            setIsPlaying(false);
            setIsPaused(true);
          }
        }}
      />

      {/* Minimal Top Utility Bar for Media Import & R36S Deck Toggle */}
      <div className="h-10 px-4 bg-[#101319] border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: theme.accent, boxShadow: `0 0 8px ${rgbToRgba(theme.accent, 0.7)}` }}
          />
          <span className="font-semibold text-zinc-100">KPlayer 2.0.0</span>
          <span className="text-zinc-500">R36S • Visual Moderno • 640×480</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowR36sModal(true)}
            style={{
              backgroundColor: theme.accent,
              color: theme.bg,
              boxShadow: `0 0 12px ${rgbToRgba(theme.accent, 0.35)}`,
            }}
            className="px-2.5 py-1 rounded-md text-xs font-bold hover:brightness-110 transition-all cursor-pointer"
          >
            ⬇ Baixar para R36S (.zip)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-100 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer"
          >
            + {tr('Mídias locais', language)} / .LRC
          </button>
          <button
            type="button"
            onClick={() => setScreen('welcome')}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer"
            title="Visualizar tela inicial de boas-vindas"
          >
            ✦ Boas-vindas
          </button>
          <button
            type="button"
            onClick={() => setBootRunId((n) => n + 1)}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer"
            title="Reproduzir tela de inicialização"
          >
            ↻ Reiniciar
          </button>
          <button
            type="button"
            onClick={() => setShowDeck((v) => !v)}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer"
          >
            {showDeck ? 'Ocultar controles R36S' : 'Mostrar controles R36S'}
          </button>
        </div>
      </div>

      {/* Main Responsive Stage holding exact 640x480 R36S Viewport */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 flex items-center justify-center p-2 overflow-hidden"
      >
        <div
          style={{
            width: 640 * scale,
            height: 480 * scale,
          }}
          className="relative shrink-0 rounded-[14px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.75)] ring-2 ring-white/10"
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: theme.bg,
              color: theme.text,
            }}
            className="kp-screen"
          >
            {/* ==================== ANIMATED BOOT SPLASH SCREEN ==================== */}
            {screen === 'boot' && (
              <BootSplashScreen
                theme={theme}
                lang={language}
                progress={bootProgress}
                stepLabel={bootStep}
                status={bootStatus}
                fadingOut={bootFading}
              />
            )}

            {/* ==================== WELCOME / ONBOARDING (ANIMATED BOOT STYLE v2.0.0) ==================== */}
            {screen === 'welcome' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col items-center">
                <ModernBackdrop theme={theme} />

                {/* Ambient central aura matching Boot Splash */}
                <div
                  className="pointer-events-none absolute left-1/2 top-[110px] -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full blur-3xl opacity-30 transition-colors duration-500"
                  style={{ backgroundColor: theme.accent }}
                />

                {/* Subtle top-right Terms shortcut micro-pill */}
                <button
                  type="button"
                  onClick={() => {
                    setTermsReturn('welcome');
                    setTermsPage(0);
                    setScreen('terms');
                  }}
                  style={{
                    ...modernPanelStyle(theme, 12),
                    right: 16,
                    top: 14,
                    width: 166,
                    height: 24,
                    color: theme.muted,
                  }}
                  className="absolute z-20 flex items-center justify-center text-[11px] font-medium cursor-pointer hover:brightness-125 transition-all"
                >
                  {tr('Y  Termos de uso', language)}
                </button>

                {/* Animated Boot-style Centerpiece (Sonar rings + Orbiting sparks + Spinning Vinyl) */}
                <div className="relative z-10 flex flex-col items-center pt-[26px] w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setOnboarded(true);
                      setScreen('home');
                    }}
                    title={tr('Toque ou pressione B para continuar', language)}
                    className="relative w-[112px] h-[112px] flex items-center justify-center kp-boot-float cursor-pointer"
                  >
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

                    <span
                      className="pointer-events-none absolute w-[7px] h-[7px] rounded-full kp-boot-orbit"
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: `0 0 12px ${theme.accent}`,
                      }}
                    />
                    <span
                      className="pointer-events-none absolute w-[5px] h-[5px] rounded-full kp-boot-orbit-rev"
                      style={{
                        backgroundColor: mixRgb(theme.accent, theme.text, 0.45),
                        boxShadow: `0 0 10px ${theme.accent}`,
                      }}
                    />

                    <div
                      className="rounded-full p-1 transition-shadow duration-300"
                      style={{
                        boxShadow: `0 0 32px ${rgbToRgba(theme.accent, 0.42)}`,
                      }}
                    >
                      <VinylArt theme={theme} size={78} spinning={true} />
                    </div>
                  </button>

                  {/* Brand wordmark + v2.0.0 pill + live equalizer */}
                  <div
                    className="mt-2 flex flex-col items-center kp-boot-rise"
                    style={{ animationDelay: '70ms' }}
                  >
                    <h1
                      style={{
                        color: theme.text,
                        textShadow: `0 0 22px ${rgbToRgba(theme.accent, 0.25)}`,
                      }}
                      className="text-[28px] font-extrabold tracking-tight leading-none"
                    >
                      K <span style={{ color: theme.accent }}>PLAYER</span>
                    </h1>

                    <div
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                        border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                        color: theme.accent,
                      }}
                      className="mt-1.5 px-3 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider"
                    >
                      v2.0.0 • R36S
                    </div>
                  </div>

                  <div className="mt-2.5 kp-boot-rise" style={{ animationDelay: '130ms' }}>
                    <AudioVisualizer theme={theme} bars={24} width={220} height={14} active={true} />
                  </div>

                  {/* Row 0: Slim Unified Segmented Language Capsule */}
                  <div
                    className="mt-3.5 flex flex-col items-center kp-boot-rise"
                    style={{ animationDelay: '190ms' }}
                  >
                    <div
                      style={{ color: welcomeFocus === 0 ? theme.accent : theme.muted }}
                      className="text-[10px] font-bold tracking-wider uppercase mb-1.5 transition-colors"
                    >
                      {tr('Idioma', language)}
                    </div>
                    <div
                      style={{
                        ...modernPanelStyle(theme, 19),
                        width: 448,
                        height: 38,
                        borderColor:
                          welcomeFocus === 0
                            ? rgbToRgba(theme.accent, 0.65)
                            : themeHairline(theme),
                        boxShadow:
                          welcomeFocus === 0
                            ? `0 0 14px ${rgbToRgba(theme.accent, 0.22)}`
                            : undefined,
                      }}
                      className="p-1 grid grid-cols-3 gap-1 items-center transition-all"
                    >
                      {LANGUAGE_NAMES.map((name, idx) => {
                        const chosen = idx === language;
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setWelcomeFocus(0);
                              setLanguage(idx as LanguageCode);
                            }}
                            style={
                              chosen
                                ? {
                                    backgroundColor: theme.accent,
                                    color: theme.bg,
                                    boxShadow: `0 0 12px ${rgbToRgba(theme.accent, 0.42)}`,
                                  }
                                : {
                                    backgroundColor: 'transparent',
                                    color: theme.muted,
                                  }
                            }
                            className="h-[30px] rounded-full text-[12.5px] font-bold flex items-center justify-center cursor-pointer transition-all hover:brightness-115"
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 1: Slim Theme Color Dots ("bolinhas") */}
                  <div
                    className="mt-3 flex flex-col items-center kp-boot-rise"
                    style={{ animationDelay: '250ms' }}
                  >
                    <div
                      style={{ color: welcomeFocus === 1 ? theme.accent : theme.muted }}
                      className="text-[10px] font-bold tracking-wider uppercase mb-1.5 transition-colors"
                    >
                      {tr('Tema', language)} • {tr(theme.name, language)}
                    </div>
                    <div
                      style={{
                        ...modernPanelStyle(theme, 23),
                        width: 348,
                        height: 46,
                        borderColor:
                          welcomeFocus === 1
                            ? rgbToRgba(theme.accent, 0.65)
                            : themeHairline(theme),
                        boxShadow:
                          welcomeFocus === 1
                            ? `0 0 14px ${rgbToRgba(theme.accent, 0.22)}`
                            : undefined,
                      }}
                      className="px-4 flex items-center justify-between transition-all"
                    >
                      {KP_THEMES.map((tItem, idx) => {
                        const chosen = idx === themeIndex;
                        const isLight = idx === 2 || idx === 3;
                        const outerColor = isLight ? tItem.bg : tItem.accent;
                        const innerColor = isLight ? tItem.accent : tItem.bg;
                        return (
                          <button
                            key={tItem.id}
                            type="button"
                            title={tr(tItem.name, language)}
                            aria-label={tr(tItem.name, language)}
                            onClick={() => {
                              setWelcomeFocus(1);
                              setThemeIndex(idx);
                            }}
                            style={{
                              width: 32,
                              height: 32,
                              boxShadow: chosen
                                ? `0 0 0 2px ${theme.text}, 0 0 14px ${rgbToRgba(theme.accent, 0.65)}`
                                : 'none',
                            }}
                            className={`rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
                              chosen ? 'scale-110' : 'hover:scale-110 opacity-85 hover:opacity-100'
                            }`}
                          >
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                backgroundColor: outerColor,
                                border: `1px solid ${rgbToRgba(theme.text, 0.22)}`,
                              }}
                              className="rounded-full flex items-center justify-center"
                            >
                              {(isLight || idx === 1) && (
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    backgroundColor: innerColor,
                                  }}
                                  className="rounded-full"
                                />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Minimal borderless pulsing continue hint (no B button box, no bottom bar) */}
                  <button
                    type="button"
                    onClick={() => {
                      setOnboarded(true);
                      setScreen('home');
                    }}
                    style={{ color: theme.muted }}
                    className="mt-5 text-[11.5px] font-medium tracking-wide cursor-pointer hover:brightness-125 animate-pulse transition-colors"
                  >
                    {tr('Toque ou pressione B para continuar', language)}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== TERMS OF USE ==================== */}
            {screen === 'terms' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('Termos de uso', language)}
                  location={locationLabel}
                />
                <div className="relative z-10 px-6 pt-4">
                  <h2 style={{ color: theme.text }} className="text-[26px] font-extrabold">
                    {tr('Termos de uso', language)}
                  </h2>
                  <div
                    style={{ ...modernPanelStyle(theme, 16), height: 296 }}
                    className="mt-3 p-5 flex flex-col justify-between"
                  >
                    <div>
                      <div style={{ color: theme.accent }} className="text-[19px] font-bold mb-3">
                        {tr(TERMS_PAGES[termsPage].title, language)}
                      </div>
                      <p style={{ color: theme.text }} className="text-[15px] leading-[1.6]">
                        {TERMS_PAGES[termsPage].body[language]}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setTermsPage((p) => (p + 2) % 3)}
                        style={{ backgroundColor: theme.elevated, color: theme.text }}
                        className="px-3 py-1 rounded-full text-xs cursor-pointer hover:brightness-110"
                      >
                        ◀
                      </button>
                      <span style={{ color: theme.muted }} className="text-[12px] font-semibold">
                        {termsPage + 1} / 3
                      </span>
                      <button
                        type="button"
                        onClick={() => setTermsPage((p) => (p + 1) % 3)}
                        style={{ backgroundColor: theme.elevated, color: theme.text }}
                        className="px-3 py-1 rounded-full text-xs cursor-pointer hover:brightness-110"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'A', label: tr('Voltar', language) },
                    { key: 'DIR', label: '1 / 3' },
                  ]}
                />
              </div>
            )}

            {/* ==================== DASHBOARD / HOME (01-inicio.png MODERN SKIN) ==================== */}
            {screen === 'home' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('DASHBOARD', language)}
                  location={locationLabel}
                />

                {/* Two-tone Hero Headline from source/skin.h lines 149-154 */}
                <div className="relative z-10 px-[18px] pt-[8px]">
                  <div className="flex items-baseline gap-2.5 leading-tight">
                    <span style={{ color: theme.text }} className="text-[28px] font-extrabold tracking-tight">
                      {tr('Seu som.', language)}
                    </span>
                    <span style={{ color: theme.muted }} className="text-[28px] font-extrabold tracking-tight">
                      {tr('Sua tela.', language)}
                    </span>
                  </div>
                  <p style={{ color: theme.muted }} className="text-[12px] mt-0.5 truncate">
                    {tr('Músicas, vídeos, rádios e TV ao vivo num player só.', language)}
                  </p>
                </div>

                {/* Exact 3x2 Modern Gradient Card Grid (y=104, 192x94 cards) */}
                <div className="relative z-10 px-4 mt-[10px] grid grid-cols-3 gap-x-4 gap-y-[10px]">
                  {(
                    [
                      {
                        kind: 'music',
                        spriteCol: 0,
                        tag: tr('LRC Sync', language),
                        name: tr('Músicas', language),
                        desc: tr('Sua trilha sonora,', language),
                      },
                      {
                        kind: 'video',
                        spriteCol: 1,
                        tag: tr('Ocultar auto.', language),
                        name: tr('Vídeos', language),
                        desc: tr('Cinema na palma', language),
                      },
                      {
                        kind: 'folder',
                        spriteCol: 2,
                        tag: tr('Mídias locais', language),
                        name: tr('Arquivos', language),
                        desc: tr('Explore as pastas', language),
                      },
                      {
                        kind: 'radio',
                        spriteCol: 3,
                        tag: tr('Radio Browser', language),
                        name: tr('Rádio Online', language),
                        desc: tr('Estações do mundo', language),
                      },
                      {
                        kind: 'iptv',
                        spriteCol: 4,
                        tag: tr('TV Online', language),
                        name: tr('IPTV', language),
                        desc: tr('Canais ao vivo', language),
                      },
                      {
                        kind: 'football',
                        spriteCol: 5,
                        tag: tr('Placar ao vivo', language),
                        name: tr('Placar da Bola', language),
                        desc: tr('Jogos e estatísticas', language),
                      },
                    ] as const
                  ).map((cardItem, i) => {
                    const focused = i === dashFocus;
                    const gradTop = mixRgb(theme.elevated, theme.accent, focused ? 0.22 : 0.1);
                    return (
                      <button
                        key={cardItem.kind}
                        type="button"
                        onMouseEnter={() => setDashFocus(i)}
                        onClick={() => openDashboardCard(i)}
                        style={{
                          height: 94,
                          borderRadius: 16,
                          border: focused
                            ? `2px solid ${theme.accent}`
                            : `1px solid ${themeHairline(theme)}`,
                          background: `linear-gradient(180deg, ${gradTop} 0%, ${theme.panel} 100%)`,
                          boxShadow: focused
                            ? `0 0 18px ${rgbToRgba(theme.accent, 0.36)}`
                            : undefined,
                        }}
                        className="relative text-left p-3 flex flex-col justify-between cursor-pointer transition-all"
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              backgroundColor: rgbToRgba(theme.bg, 0.65),
                              border: `1px solid ${mixRgb(theme.panel, theme.text, 0.09)}`,
                            }}
                            className="flex items-center justify-center shrink-0"
                          >
                            <KpSprite
                              sheet="categorias"
                              col={cardItem.spriteCol}
                              themeIndex={themeIndex}
                              size={26}
                            />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div
                              style={{ color: theme.accent }}
                              className="text-[10px] font-bold leading-tight truncate pr-4"
                            >
                              {cardItem.tag}
                            </div>
                          </div>
                          <div className="absolute right-3 top-3">
                            <TileArrow color={focused ? theme.accent : theme.dim} size={11} />
                          </div>
                        </div>

                        <div className="mt-auto">
                          <div
                            style={{ color: theme.text }}
                            className="text-[16px] font-extrabold leading-tight truncate"
                          >
                            {cardItem.name}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[10px] truncate mt-0.5">
                            {cardItem.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Modern Bottom Now Playing Card (y=318, h=108, vinyl + 34-bar visualizer + play_disc) */}
                <div
                  style={{
                    ...modernPanelStyle(theme, 18),
                    left: 16,
                    top: 318,
                    width: 608,
                    height: 108,
                  }}
                  className="absolute z-10 px-3.5 flex items-center justify-between"
                >
                  <button
                    type="button"
                    onClick={() => setScreen(activeRadio ? 'radio' : 'music')}
                    className="flex items-center gap-4 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <VinylArt
                      theme={theme}
                      size={84}
                      coverUrl={activeTrack?.coverUrl}
                      centerLogoUrl={activeRadio?.favicon || undefined}
                      spinning={isPlaying && !isPaused}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        style={{ color: isPlaying ? theme.accent : theme.dim }}
                        className="text-[10px] font-bold tracking-wider uppercase"
                      >
                        {isPlaying
                          ? !isPaused
                            ? tr('TOCANDO AGORA', language)
                            : tr('PAUSADO', language)
                          : tr('NADA TOCANDO', language)}
                      </div>
                      <div
                        style={{ color: theme.text }}
                        className="text-[17px] font-extrabold truncate leading-snug mt-0.5"
                      >
                        {activeRadio
                          ? activeRadio.name
                          : activeTrack
                          ? activeTrack.title
                          : tr('Pronto para dar o play', language)}
                      </div>
                      <div style={{ color: theme.muted }} className="text-[12px] truncate">
                        {activeRadio
                          ? `${activeRadio.country} • ${tr('AO VIVO', language)}`
                          : activeTrack
                          ? activeTrack.artist || tr('Reprodução local', language)
                          : tr('Abra Músicas ou Vídeos para começar', language)}
                      </div>
                      <div className="mt-2">
                        <AudioVisualizer
                          theme={theme}
                          bars={34}
                          width={200}
                          height={14}
                          active={isPlaying && !isPaused}
                        />
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center justify-center gap-3 pl-3 pr-1 shrink-0">
                    <TransportSkipButton
                      theme={theme}
                      direction="prev"
                      size={30}
                      onClick={() => stepTrack(-1)}
                      title="Anterior"
                    />
                    <PlayDisc
                      theme={theme}
                      size={44}
                      playing={isPlaying && !isPaused}
                      onClick={togglePlayPause}
                      title="Reproduzir / Pausar"
                    />
                    <TransportSkipButton
                      theme={theme}
                      direction="next"
                      size={30}
                      onClick={() => stepTrack(1)}
                      title="Próxima"
                    />
                  </div>
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'DIR', label: tr('Navegar', language) },
                    { key: 'B', label: tr('Abrir', language) },
                    { key: 'X', label: tr('Player', language) },
                    { key: 'Y', label: tr('Opções', language) },
                    { key: 'START', label: tr('Pausa', language) },
                  ]}
                />
              </div>
            )}

            {/* ==================== LIBRARY / FILE BROWSER ==================== */}
            {screen === 'library' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('BIBLIOTECA', language)}
                  location={locationLabel}
                />

                {/* Top Library Filter Banner */}
                <div
                  style={{ ...modernPanelStyle(theme, 14), height: 68 }}
                  className="relative z-10 mx-[14px] mt-[14px] px-3.5 py-2 flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <KpSprite sheet="categorias" col={2} themeIndex={themeIndex} size={22} />
                    <span style={{ color: theme.text }} className="text-[14px] font-bold truncate">
                      {libFavoritesOnly
                        ? tr('Minhas favoritas', language)
                        : libLocationsView
                        ? tr('Escolha o local das suas mídias', language)
                        : tr('Pastas: /roms(2)/bgmusic e /roms(2)/videos', language)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(['Todos', 'Músicas', 'Vídeos'] as const).map((tab, i) => {
                      const activeTab = i === libFilter;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => {
                            setLibFilter(i as 0 | 1 | 2);
                            setLibSelected(0);
                          }}
                          style={{
                            ...modernPillStyle(theme, activeTab),
                            width: 92,
                            height: 21,
                          }}
                          className="text-[12px] font-semibold cursor-pointer transition-all"
                        >
                          {tr(tab, language)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ backgroundColor: theme.elevated, color: theme.accent }}
                      className="ml-auto px-2.5 h-[21px] rounded-full text-[11px] font-semibold cursor-pointer hover:brightness-110"
                    >
                      + {tr('Importar do dispositivo', language)}
                    </button>
                  </div>
                </div>

                {/* Locations View OR Files List */}
                <div className="relative z-10 px-[14px] mt-3 space-y-1.5">
                  {libLocationsView ? (
                    [
                      {
                        name: tr('Músicas (SD1)', language),
                        path: '/roms/bgmusic',
                        action: () => {
                          setLibFilter(1);
                          setLibLocationsView(false);
                        },
                      },
                      {
                        name: tr('Músicas (SD2)', language),
                        path: '/roms2/bgmusic',
                        action: () => {
                          setLibFilter(1);
                          setLibLocationsView(false);
                        },
                      },
                      {
                        name: tr('Vídeos (SD1)', language),
                        path: '/roms/videos',
                        action: () => {
                          setLibFilter(2);
                          setLibLocationsView(false);
                        },
                      },
                      {
                        name: tr('Vídeos (SD2)', language),
                        path: '/roms2/videos',
                        action: () => {
                          setLibFilter(2);
                          setLibLocationsView(false);
                        },
                      },
                    ].map((loc, idx) => {
                      const focus = idx === libLocationSelected;
                      return (
                        <button
                          key={loc.name}
                          type="button"
                          onMouseEnter={() => setLibLocationSelected(idx)}
                          onClick={loc.action}
                          style={{
                            ...modernCardStyle(theme, focus, 10, theme.panel),
                            height: 58,
                          }}
                          className="w-full px-3.5 flex items-center justify-between cursor-pointer text-left transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <KpSprite sheet="categorias" col={2} themeIndex={themeIndex} size={26} />
                            <div className="min-w-0">
                              <div style={{ color: theme.text }} className="text-[16px] font-bold truncate">
                                {loc.name}
                              </div>
                              <div style={{ color: theme.muted }} className="text-[12px] truncate">
                                {loc.path}
                              </div>
                            </div>
                          </div>
                          <span style={{ color: theme.accent }} className="text-[13px] font-semibold shrink-0">
                            {tr('Abrir', language)}
                          </span>
                        </button>
                      );
                    })
                  ) : filteredLibrary.length === 0 ? (
                    <div className="pt-16 text-center px-6">
                      <div style={{ color: theme.text }} className="text-[20px] font-bold">
                        {tr('Nenhuma mídia neste filtro', language)}
                      </div>
                      <div style={{ color: theme.muted }} className="text-[13px] mt-2">
                        {tr('A volta. Esquerda/direita muda o filtro. Y atualiza.', language)}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          backgroundColor: theme.accent,
                          color: theme.bg,
                          boxShadow: `0 0 16px ${rgbToRgba(theme.accent, 0.4)}`,
                        }}
                        className="mt-4 px-5 py-2 rounded-full text-[13px] font-bold cursor-pointer"
                      >
                        + {tr('Importar do dispositivo', language)}
                      </button>
                    </div>
                  ) : (
                    filteredLibrary.slice(libWindowStart, libWindowStart + 6).map((item, offsetIdx) => {
                      const realIdx = libWindowStart + offsetIdx;
                      const focus = realIdx === libSelected;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onMouseEnter={() => setLibSelected(realIdx)}
                          onClick={() => {
                            playMediaTrack(item);
                            if (item.kind === 'audio') setScreen('music');
                          }}
                          style={{
                            ...modernCardStyle(theme, focus, 9, theme.panel),
                            height: 44,
                          }}
                          className="w-full px-3 flex items-center justify-between text-left cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <KpSprite
                              sheet="categorias"
                              col={item.kind === 'audio' ? 0 : 1}
                              themeIndex={themeIndex}
                              size={24}
                            />
                            <div className="min-w-0">
                              <div style={{ color: theme.text }} className="text-[15px] font-semibold truncate">
                                {item.name}
                              </div>
                              <div style={{ color: theme.dim }} className="text-[10px]">
                                {item.kind === 'audio' ? tr('Áudio', language) : tr('Vídeo', language)}
                                {item.lyrics ? ' • LRC' : ''}
                              </div>
                            </div>
                          </div>
                          <span style={{ color: theme.muted }} className="text-[12px] shrink-0 pl-2">
                            {formatBytes(item.sizeBytes)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {!libLocationsView && (
                  <div
                    style={{ left: 18, top: 416, color: theme.dim }}
                    className="absolute z-10 text-[11px]"
                  >
                    {filteredLibrary.length ? libSelected + 1 : 0} / {filteredLibrary.length}
                  </div>
                )}

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'B', label: tr('Abrir', language) },
                    { key: 'A', label: tr('Voltar', language) },
                    { key: 'DIR', label: tr('Categorias', language) },
                    { key: 'X', label: tr('Player', language) },
                    { key: 'Y', label: tr('Atualizar', language) },
                    { key: 'SELECT', label: tr('Opções', language) },
                  ]}
                />
              </div>
            )}

            {/* ==================== MUSIC PLAYER (02-musica.png MODERN SKIN) ==================== */}
            {screen === 'music' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('MÚSICAS', language)}
                  location={locationLabel}
                />

                {/* Left Album & Metadata Card (x=16, y=46, w=232, h=320) */}
                <div
                  style={{
                    ...modernPanelStyle(theme, 16),
                    left: 16,
                    top: 46,
                    width: 232,
                    height: 320,
                  }}
                  className="absolute z-10 p-3 flex flex-col items-center"
                >
                  <VinylArt
                    theme={theme}
                    size={122}
                    coverUrl={activeTrack?.coverUrl}
                    spinning={isPlaying && !isPaused && !activeRadio}
                  />

                  <div
                    style={{ color: theme.text }}
                    className="mt-2.5 text-[16px] font-extrabold text-center leading-tight line-clamp-2 w-full"
                  >
                    {activeTrack?.title ?? tr('Pronto para dar o play', language)}
                  </div>
                  <div
                    style={{ color: theme.accent }}
                    className="mt-1 text-[12px] font-semibold truncate w-full text-center"
                  >
                    {activeTrack?.artist ?? tr('Artista não informado', language)}
                  </div>
                  <div
                    style={{ color: theme.muted }}
                    className="text-[11px] truncate w-full text-center"
                  >
                    {activeTrack?.album ?? tr('Áudio local', language)}
                  </div>

                  <div className="mt-2">
                    <AudioVisualizer
                      theme={theme}
                      bars={30}
                      width={192}
                      height={16}
                      active={isPlaying && !isPaused && !activeRadio}
                    />
                  </div>

                  <div
                    style={{ backgroundColor: themeHairline(theme) }}
                    className="w-full h-[1px] my-2"
                  />

                  <div style={{ color: theme.text }} className="text-[11px] w-full truncate">
                    {activeTrack?.format ?? 'AUDIO'} • {formatBytes(activeTrack?.sizeBytes ?? 0)} •{' '}
                    {formatTime(durationMs)}
                  </div>
                  <div style={{ color: theme.muted }} className="text-[11px] w-full truncate mt-0.5">
                    {activeTrack?.sampleRate
                      ? `${(activeTrack.sampleRate / 1000).toFixed(1)} kHz • ${activeTrack.channels ?? 2} ${tr('canais', language)}`
                      : tr('Analisando dados técnicos...', language)}
                  </div>
                  {activeTrack?.bitrateKbps && (
                    <div style={{ color: theme.accent }} className="text-[11px] font-semibold w-full truncate mt-0.5">
                      {activeTrack.bitrateKbps} kbps
                    </div>
                  )}
                </div>

                {/* Right Switchable Panel: Letras / Fila / Pasta (x=260, y=46, w=364, h=320) */}
                <div
                  style={{
                    ...modernPanelStyle(theme, 16),
                    left: 260,
                    top: 46,
                    width: 364,
                    height: 320,
                  }}
                  className="absolute z-10 p-3 flex flex-col"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {(['Letras', 'Fila', 'Pasta'] as const).map((tab, i) => {
                      const activeTab = i === audioPanel;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setAudioPanel(i as 0 | 1 | 2)}
                          style={{
                            ...modernPillStyle(theme, activeTab),
                            height: 28,
                          }}
                          className="text-[13px] font-bold cursor-pointer transition-all"
                        >
                          {tr(tab, language)}
                        </button>
                      );
                    })}
                  </div>

                  {audioPanel === 0 ? (
                    <div className="flex-1 flex flex-col mt-3 overflow-hidden">
                      <div
                        style={{ color: theme.accent }}
                        className="text-[10px] font-bold tracking-wider uppercase"
                      >
                        {activeTrack?.lyrics?.length
                          ? tr('LETRAS SINCRONIZADAS', language)
                          : tr('LETRAS', language)}
                      </div>
                      {activeTrack?.lyrics?.length ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-3 text-center">
                          <div style={{ color: theme.muted }} className="text-[14px] min-h-[20px]">
                            {activeLyricIndex > 0 ? activeTrack.lyrics[activeLyricIndex - 1].text : ''}
                          </div>
                          <div
                            style={{ color: theme.text }}
                            className="text-[19px] font-extrabold leading-snug"
                          >
                            {activeLyricIndex >= 0
                              ? activeTrack.lyrics[activeLyricIndex].text
                              : tr('Aguardando a letra...', language)}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[14px] min-h-[20px]">
                            {activeLyricIndex + 1 < activeTrack.lyrics.length
                              ? activeTrack.lyrics[activeLyricIndex + 1].text
                              : ''}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                          <div style={{ color: theme.text }} className="text-[17px] font-bold">
                            {tr('Letras indisponíveis', language)}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[12px] mt-2">
                            {tr('Use um .lrc com o mesmo nome do áudio.', language)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col mt-2.5 overflow-hidden">
                      <div style={{ color: theme.muted }} className="text-[11px] mb-2 truncate">
                        {audioPanel === 2
                          ? '/roms/bgmusic  •  /roms2/bgmusic'
                          : `${audioTracks.length} ${tr('Músicas', language).toLowerCase()}`}
                      </div>
                      <div className="space-y-1.5 overflow-y-auto kp-scroll pr-1">
                        {audioTracks.map((t, idx) => {
                          const focus = idx === queueCursor;
                          const isCur = activeTrack?.id === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onMouseEnter={() => setQueueCursor(idx)}
                              onClick={() => playMediaTrack(t)}
                              style={{
                                ...modernCardStyle(theme, focus, 8, theme.panel),
                                height: 41,
                              }}
                              className="w-full px-2.5 flex items-center gap-2.5 text-left cursor-pointer transition-all"
                            >
                              <span
                                style={{ color: isCur ? theme.accent : theme.muted }}
                                className="w-4 h-4 flex items-center justify-center shrink-0"
                              >
                                {isCur ? (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="block">
                                    <rect x="1.5" y="4" width="2" height="7" rx="1" />
                                    <rect x="5" y="1" width="2" height="10" rx="1" />
                                    <rect x="8.5" y="3" width="2" height="8" rx="1" />
                                  </svg>
                                ) : (
                                  <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" className="block">
                                    <path d="M3 2.2C3 1.7 3.6 1.4 4 1.7L9.8 5.5C10.2 5.8 10.2 6.2 9.8 6.5L4 10.3C3.6 10.6 3 10.3 3 9.8V2.2Z" />
                                  </svg>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div
                                  style={{ color: isCur ? theme.accent : theme.text }}
                                  className="text-[13px] font-semibold truncate"
                                >
                                  {t.title}
                                </div>
                                <div style={{ color: theme.muted }} className="text-[10px] truncate">
                                  {isCur ? tr('Em reprodução', language) : tr('B  Reproduzir', language)}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Transport Bar (x=16, y=374, w=608, h=56) — Symmetric 164 | 1fr | 164 grid */}
                <div
                  style={{
                    ...modernPanelStyle(theme, 14),
                    left: 16,
                    top: 374,
                    width: 608,
                    height: 56,
                  }}
                  className="absolute z-10 px-2.5 grid grid-cols-[164px_1fr_164px] items-center"
                >
                  {/* Left column: Up Next */}
                  <div
                    style={{ borderRight: `1px solid ${themeHairline(theme)}` }}
                    className="flex items-center gap-2.5 pr-2.5 h-[40px] min-w-0"
                  >
                    <div
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                        color: theme.accent,
                      }}
                      className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="block">
                        <path d="M4.5 2.7C4.5 2.1 5.2 1.8 5.7 2.1L13.1 7.4C13.5 7.7 13.5 8.3 13.1 8.6L5.7 13.9C5.2 14.2 4.5 13.9 4.5 13.3V2.7Z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div style={{ color: theme.accent }} className="text-[9px] font-bold tracking-wider leading-tight">
                        {tr('A SEGUIR', language)}
                      </div>
                      <div style={{ color: theme.text }} className="text-[11.5px] font-semibold truncate leading-tight mt-0.5">
                        {upNextTrack ? upNextTrack.title : tr('Fim da fila', language)}
                      </div>
                    </div>
                  </div>

                  {/* Center Transport + Progress (dead-center horizontally & vertically balanced) */}
                  <div className="flex flex-col items-center justify-center px-3 gap-1.5">
                    <div className="flex items-center justify-center gap-4">
                      <TransportSkipButton
                        theme={theme}
                        direction="prev"
                        size={24}
                        onClick={() => stepTrack(-1)}
                        title="Anterior"
                      />
                      <PlayDisc
                        theme={theme}
                        size={30}
                        playing={isPlaying && !isPaused}
                        onClick={togglePlayPause}
                        title="Reproduzir / Pausar"
                      />
                      <TransportSkipButton
                        theme={theme}
                        direction="next"
                        size={24}
                        onClick={() => stepTrack(1)}
                        title="Próxima"
                      />
                    </div>
                    <div className="w-full flex items-center justify-center gap-2">
                      <span
                        style={{ color: theme.muted }}
                        className="text-[9.5px] tabular-nums min-w-[28px] text-right leading-none"
                      >
                        {formatTime(currentMs)}
                      </span>
                      <div
                        style={{ backgroundColor: mixRgb(theme.elevated, theme.text, 0.14) }}
                        className="flex-1 h-[4px] rounded-full relative cursor-pointer"
                        onClick={(e) => {
                          if (!audioRef.current || !durationMs) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          audioRef.current.currentTime = (ratio * durationMs) / 1000;
                        }}
                      >
                        <div
                          style={{
                            width: `${durationMs > 0 ? Math.min(100, (currentMs / durationMs) * 100) : 0}%`,
                            backgroundColor: theme.accent,
                          }}
                          className="h-full rounded-full relative"
                        >
                          <span
                            style={{ backgroundColor: theme.text }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-[8px] h-[8px] rounded-full shadow"
                          />
                        </div>
                      </div>
                      <span
                        style={{ color: theme.muted }}
                        className="text-[9.5px] tabular-nums min-w-[28px] text-left leading-none"
                      >
                        {formatTime(durationMs)}
                      </span>
                    </div>
                  </div>

                  {/* Right column: Format pill + file size */}
                  <div
                    style={{ borderLeft: `1px solid ${themeHairline(theme)}` }}
                    className="flex items-center justify-end gap-2 pl-2.5 h-[40px] min-w-0"
                  >
                    <span
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                        color: theme.accent,
                      }}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0"
                    >
                      {activeTrack?.format ?? 'AUDIO'}
                    </span>
                    <span style={{ color: theme.text }} className="text-[11px] font-medium tabular-nums truncate">
                      {formatBytes(activeTrack?.sizeBytes ?? 0)}
                    </span>
                  </div>
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'A', label: tr('Voltar', language) },
                    { key: 'Y', label: tr('Letras', language) },
                    { key: 'X', label: tr('Fila / Pasta', language) },
                    { key: 'SELECT', label: tr('Opções', language) },
                  ]}
                />
              </div>
            )}

            {/* ==================== VIDEO & IPTV PLAYER ==================== */}
            {screen === 'video' && (
              <VideoScreen
                theme={theme}
                themeIndex={themeIndex}
                lang={language}
                location={locationLabel}
                title={activeVideoTitle}
                src={activeVideoSrc}
                isLive={activeVideoLive}
                fit={videoFit}
                rate={playbackRate}
                paused={isPaused}
                showOsd={showVideoOsd}
                onTogglePause={() => setIsPaused((p) => !p)}
                onSeekDelta={(sec) => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + sec);
                  }
                }}
                onToggleOsd={() => setShowVideoOsd((v) => !v)}
                onBack={() => {
                  setIsPaused(true);
                  setScreen(prevScreen === 'iptv' ? 'iptv' : 'library');
                }}
                onOpenOptions={() => {
                  setPrevScreen('video');
                  setScreen('options');
                }}
                onEnded={() => {
                  if (repeatMode === 1 && videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.play().catch(() => {});
                  } else {
                    setIsPaused(true);
                  }
                }}
                videoRefExternal={videoRef}
              />
            )}

            {/* ==================== ONLINE RADIO (03-radio.png MODERN SKIN) ==================== */}
            {screen === 'radio' && (() => {
              const onAir = Boolean(activeRadio && isPlaying && !isPaused);
              const featured = activeRadio ?? selectedRadio;
              return (
                <div className="w-full h-full relative overflow-hidden">
                  <ModernBackdrop theme={theme} />
                  <HeaderBar
                    theme={theme}
                    section={tr('RÁDIO ONLINE', language)}
                    location={locationLabel}
                  />

                  {/* Left Station Tuner Card (x=16, y=46, w=224, h=384) */}
                  <div
                    style={{
                      ...modernPanelStyle(theme, 16),
                      left: 16,
                      top: 46,
                      width: 224,
                      height: 384,
                    }}
                    className="absolute z-10 p-3 flex flex-col items-center justify-between"
                  >
                    <div className="pt-1">
                      <VinylArt
                        theme={theme}
                        size={118}
                        spinning={onAir}
                        pulse={onAir}
                        centerLogoUrl={featured?.favicon || undefined}
                      />
                    </div>

                    <span
                      style={{
                        backgroundColor: onAir ? theme.accent : theme.elevated,
                        color: onAir ? theme.bg : theme.muted,
                      }}
                      className="px-3.5 h-[19px] rounded-full inline-flex items-center justify-center text-[10px] font-bold tracking-wider"
                    >
                      {activeRadio ? tr('AO VIVO', language) : tr('RÁDIO ONLINE', language)}
                    </span>

                    <div className="w-full text-center px-1">
                      <div style={{ color: theme.text }} className="text-[16px] font-extrabold truncate">
                        {featured?.name ?? tr('Estação online', language)}
                      </div>
                      <div style={{ color: theme.muted }} className="text-[11px] truncate mt-0.5">
                        {featured?.tags || featured?.country || 'Internet'}
                      </div>
                      <div
                        style={{
                          backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                          color: theme.accent,
                        }}
                        className="mt-2 py-1 px-3 rounded-full text-[11px] font-bold truncate inline-block max-w-full"
                      >
                        {featured?.codec || 'STREAM'} • {featured?.bitrate ?? 0} kbps
                      </div>
                    </div>

                    <AudioVisualizer
                      theme={theme}
                      bars={30}
                      width={176}
                      height={12}
                      active={onAir}
                    />

                    <div className="flex items-center justify-center gap-3.5">
                      <TransportSkipButton
                        theme={theme}
                        direction="prev"
                        size={28}
                        onClick={() => stepTrack(-1)}
                        title="Estação anterior"
                      />
                      <PlayDisc
                        theme={theme}
                        size={40}
                        playing={onAir}
                        onClick={() => {
                          if (activeRadio) togglePlayPause();
                          else if (selectedRadio) playRadioStation(selectedRadio);
                        }}
                      />
                      <TransportSkipButton
                        theme={theme}
                        direction="next"
                        size={28}
                        onClick={() => stepTrack(1)}
                        title="Próxima estação"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => selectedRadio && playRadioStation(selectedRadio)}
                      style={{
                        backgroundColor: theme.elevated,
                        color: activeRadio ? theme.accent : theme.muted,
                      }}
                      className="w-[168px] h-[22px] rounded-full text-[10.5px] font-bold cursor-pointer hover:brightness-110"
                    >
                      {onAir ? tr('Transmitindo agora', language) : tr('B  Ouvir estação', language)}
                    </button>
                  </div>

                  {/* Right Category & Station List (x=252, y=46, w=372, h=384) */}
                  <div
                    style={{
                      ...modernPanelStyle(theme, 16),
                      left: 252,
                      top: 46,
                      width: 372,
                      height: 384,
                    }}
                    className="absolute z-10 p-3 flex flex-col"
                  >
                    <div className="flex items-baseline justify-between">
                      <div style={{ color: theme.text }} className="text-[16px] font-extrabold">
                        {tr(RADIO_CATEGORIES[radioCategory], language)}
                      </div>
                      <div style={{ color: theme.muted }} className="text-[11px]">
                        {radioStations.length} {tr('estações', language)}
                      </div>
                    </div>

                    {/* 7 Glowing Pill Category Tabs */}
                    <div className="flex gap-1 mt-2 overflow-x-auto pb-1">
                      {RADIO_CATEGORIES.map((cat, idx) => {
                        const activeCat = idx === radioCategory;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setRadioCategory(idx)}
                            style={modernPillStyle(theme, activeCat)}
                            className="px-2 py-1 text-[9.5px] font-bold whitespace-nowrap cursor-pointer shrink-0 transition-all"
                          >
                            {tr(cat, language)}
                          </button>
                        );
                      })}
                    </div>

                    {/* 5 Visible Station Rows */}
                    <div className="mt-2 space-y-1.5 flex-1 overflow-hidden">
                      {radioLoading ? (
                        <div
                          style={{ color: theme.accent }}
                          className="h-full flex items-center justify-center text-[14px] font-semibold"
                        >
                          {tr('Buscando estações...', language)}
                        </div>
                      ) : radioStations.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                          <div style={{ color: theme.text }} className="text-[15px] font-bold">
                            {radioCategory === 6
                              ? tr('Nenhuma rádio favorita', language)
                              : radioError ?? tr('Nenhuma estação encontrada', language)}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[12px] mt-1">
                            {tr('Pressione Y para tentar novamente', language)}
                          </div>
                        </div>
                      ) : (
                        radioStations.slice(radioWindowStart, radioWindowStart + 5).map((st, idx) => {
                          const realIdx = radioWindowStart + idx;
                          const focus = realIdx === radioSelected;
                          const isFav = favoriteRadios.some((f) => f.url === st.url);
                          const isLiveNow = activeRadio?.url === st.url && !isPaused;
                          return (
                            <button
                              key={st.uuid + realIdx}
                              type="button"
                              onMouseEnter={() => setRadioSelected(realIdx)}
                              onClick={() => playRadioStation(st)}
                              style={{
                                ...modernCardStyle(theme, focus, 10, theme.elevated),
                                height: 49,
                              }}
                              className="w-full px-2.5 flex items-center justify-between text-left cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <span
                                  style={{
                                    backgroundColor: isLiveNow ? theme.accent : theme.panel,
                                    color: isLiveNow ? theme.bg : focus ? theme.accent : theme.muted,
                                  }}
                                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                                >
                                  {isLiveNow ? '▶' : '~'}
                                </span>
                                <div className="min-w-0">
                                  <div
                                    style={{ color: isLiveNow ? theme.accent : theme.text }}
                                    className="text-[13.5px] font-bold truncate"
                                  >
                                    {isFav ? '★ ' : ''}
                                    {st.name}
                                  </div>
                                  <div style={{ color: theme.muted }} className="text-[10px] truncate">
                                    {st.tags || st.country} {isLiveNow ? `• ${tr('AO VIVO', language)}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div
                                  style={{ color: focus ? theme.accent : theme.muted }}
                                  className="text-[10px] font-bold"
                                >
                                  {st.codec || 'STREAM'}
                                </div>
                                <div style={{ color: theme.muted }} className="text-[10px]">
                                  {st.bitrate} kbps
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <FooterBar
                    theme={theme}
                    themeIndex={themeIndex}
                    toast={toast}
                    hints={[
                      { key: 'DIR', label: tr('Navegar', language) },
                      { key: 'B', label: tr('Ouvir', language) },
                      { key: 'X', label: tr('Favorita', language) },
                      { key: 'Y', label: tr('Atualizar', language) },
                      { key: 'A', label: tr('Início', language) },
                      { key: 'SELECT', label: tr('Opções', language) },
                    ]}
                  />
                </div>
              );
            })()}

            {/* ==================== IPTV ==================== */}
            {screen === 'iptv' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar theme={theme} section={tr('IPTV', language)} location={locationLabel} />

                <div className="relative z-10 px-6 pt-3 flex items-center justify-between">
                  <h2 style={{ color: theme.text }} className="text-[22px] font-extrabold">
                    {iptvSource === 1
                      ? tr('IPTV Brasil', language)
                      : iptvSource === 2
                      ? tr('IPTV Mundo', language)
                      : tr('Listas próprias', language)}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 1, label: 'Brasil' },
                        { id: 2, label: 'Mundo' },
                        { id: 0, label: 'Local' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setIptvSource(s.id)}
                        style={modernPillStyle(theme, iptvSource === s.id)}
                        className="px-3 py-1 text-[11px] font-bold cursor-pointer transition-all"
                      >
                        {s.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => m3uInputRef.current?.click()}
                      style={{ backgroundColor: theme.elevated, color: theme.accent }}
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer hover:brightness-110"
                    >
                      + M3U
                    </button>
                  </div>
                </div>

                {iptvLoading ? (
                  <div
                    style={{ color: theme.accent }}
                    className="relative z-10 h-[310px] flex items-center justify-center text-[16px] font-semibold"
                  >
                    {tr('Atualizando canais...', language)}
                  </div>
                ) : iptvChannels.length === 0 ? (
                  <div className="relative z-10 h-[310px] flex flex-col items-center justify-center text-center px-8">
                    <div style={{ color: theme.muted }} className="text-[18px] font-semibold">
                      {tr('Nenhum canal encontrado', language)}
                    </div>
                    <div style={{ color: theme.muted }} className="text-[13px] mt-2">
                      {iptvSource
                        ? tr('Pressione Y para atualizar', language)
                        : 'Clique em + M3U para carregar uma lista local'}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 px-6 mt-2.5 flex gap-3.5">
                    {/* Left Channel Info Card (w=200, h=310) */}
                    <div
                      style={{ ...modernPanelStyle(theme, 14), width: 200, height: 310 }}
                      className="p-3 flex flex-col shrink-0"
                    >
                      <div
                        style={{ backgroundColor: theme.elevated }}
                        className="w-full h-[120px] rounded-[10px] flex items-center justify-center overflow-hidden p-2"
                      >
                        {iptvChannels[iptvSelected]?.logo ? (
                          <img
                            src={iptvChannels[iptvSelected].logo}
                            alt=""
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <KpCardIcon kind="iptv" color={theme.accent} bg={theme.elevated} size={42} />
                        )}
                      </div>
                      <div
                        style={{ color: theme.text }}
                        className="mt-3 text-[15px] font-bold text-center truncate"
                      >
                        {iptvChannels[iptvSelected]?.name}
                      </div>
                      <div style={{ color: theme.muted }} className="mt-4 text-[11px]">
                        {tr('Categoria', language)}
                      </div>
                      <div style={{ color: theme.text }} className="text-[13px] truncate">
                        {iptvChannels[iptvSelected]?.group || '--'}
                      </div>
                      <div style={{ color: theme.muted }} className="mt-3 text-[11px]">
                        ID
                      </div>
                      <div style={{ color: theme.text }} className="text-[12px] truncate">
                        {iptvChannels[iptvSelected]?.id || '--'}
                      </div>
                    </div>

                    {/* Right Channel List (6 visible rows) */}
                    <div className="flex-1 space-y-1.5 min-w-0">
                      {iptvChannels.slice(iptvWindowStart, iptvWindowStart + 6).map((ch, idx) => {
                        const realIdx = iptvWindowStart + idx;
                        const focus = realIdx === iptvSelected;
                        return (
                          <button
                            key={ch.url + realIdx}
                            type="button"
                            onMouseEnter={() => setIptvSelected(realIdx)}
                            onClick={() => {
                              audioRef.current?.pause();
                              setActiveRadio(null);
                              setActiveVideoTitle(ch.name);
                              setActiveVideoSrc(ch.url);
                              setActiveVideoLive(true);
                              setIsPaused(false);
                              setShowVideoOsd(true);
                              setPrevScreen('iptv');
                              setScreen('video');
                            }}
                            style={{
                              ...modernCardStyle(theme, focus, 9, theme.panel),
                              height: 46,
                            }}
                            className="w-full px-3 flex items-center gap-3 text-left cursor-pointer transition-all"
                          >
                            <span style={{ color: focus ? theme.accent : theme.muted }} className="text-[12px] font-bold w-7 shrink-0">
                              {realIdx + 1}
                            </span>
                            <span style={{ color: theme.text }} className="text-[14px] font-semibold truncate">
                              {ch.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'DIR', label: tr('Navegar', language) },
                    { key: 'B', label: tr('Abrir', language) },
                    { key: 'X', label: 'Fonte' },
                    { key: 'Y', label: tr('Atualizar', language) },
                    { key: 'A', label: tr('Voltar', language) },
                  ]}
                />
              </div>
            )}

            {/* ==================== PLACAR DA BOLA (SOFASCORE STYLE) ==================== */}
            {screen === 'football' && (
              <PlacarDaBolaScreen
                ref={placarRef}
                theme={theme}
                themeIndex={themeIndex}
                lang={language}
                location={locationLabel}
                toast={toast}
                initialMatches={preloadedMatches}
                onMatchesLoaded={setPreloadedMatches}
                onBack={() => setScreen('home')}
              />
            )}

            {/* ==================== OPTIONS / SETTINGS (07-opcoes.png MODERN SKIN) ==================== */}
            {screen === 'options' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('OPÇÕES', language)}
                  location={locationLabel}
                />

                <div className="relative z-10 px-6 pt-3">
                  <h2 style={{ color: theme.text }} className="text-[23px] font-extrabold">
                    {tr('Opções', language)}
                  </h2>

                  {/* 3 Glowing Pill Category Tabs: Reprodução, Biblioteca, Geral */}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {OPTION_GROUPS.map((g, gi) => {
                      const activeGrp = gi === optionGroupIdx;
                      return (
                        <button
                          key={g.name}
                          type="button"
                          onClick={() => {
                            setOptionGroupIdx(gi);
                            setOptionRowIdx(0);
                          }}
                          style={{
                            ...modernPillStyle(theme, activeGrp),
                            height: 30,
                          }}
                          className="text-[13px] font-bold cursor-pointer transition-all"
                        >
                          {tr(g.name, language)}
                        </button>
                      );
                    })}
                  </div>

                  {/* Glowing Option Rows */}
                  <div className="mt-2.5 space-y-1.5">
                    {OPTION_GROUPS[optionGroupIdx].items.map((key, ri) => {
                      const focused = ri === optionRowIdx;
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseEnter={() => setOptionRowIdx(ri)}
                          onClick={() => activateOption(key, 1)}
                          style={{
                            ...modernCardStyle(theme, focused, 10, theme.panel),
                            height: 36,
                          }}
                          className="w-full px-4 flex items-center justify-between text-left cursor-pointer transition-all"
                        >
                          <span
                            style={{ color: focused ? theme.accent : theme.text }}
                            className="text-[14.5px] font-bold"
                          >
                            {optionNameLabel(key)}
                          </span>
                          <span style={{ color: theme.muted }} className="text-[13.5px] font-medium truncate max-w-[260px]">
                            {optionValueLabel(key)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'DIR', label: tr('Navegar', language) },
                    { key: 'B', label: tr('Alterar', language) },
                    { key: 'X', label: tr('Categorias', language) },
                    { key: 'A', label: tr('Voltar', language) },
                    { key: 'SELECT', label: tr('Fechar', language) },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Optional Interactive R36S Handheld Control Deck */}
      {showDeck && (
        <div className="px-3 pb-3 flex justify-center shrink-0">
          <R36SControls onPress={handleButton} />
        </div>
      )}

      {/* R36S Compiled ARM64 Package Download Modal */}
      {showR36sModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowR36sModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#131720] border border-white/15 p-5 shadow-2xl text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#1db954]">
                  Pacote Compilado ARM64 • R36S
                </div>
                <h2 className="text-xl font-extrabold mt-0.5">
                  KPlayer v2.0.0 — Visual Moderno
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowR36sModal(false)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 flex gap-3.5 items-stretch">
              <div className="w-[144px] shrink-0 rounded-xl overflow-hidden border border-white/15 bg-black shadow-lg">
                <img
                  src={portCoverImg}
                  alt="Capa do Port KPlayer v2.0.0 para R36S dArkOS"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 rounded-xl bg-[#0c0f15] border border-white/10 p-3 text-xs space-y-1.5 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Arquivo</span>
                  <span className="font-semibold text-zinc-100 truncate">
                    {r36sInfo?.filename ?? 'KPlayer-v2.0.0-R36S.zip'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Arquitetura</span>
                  <span className="font-medium text-zinc-200 truncate">
                    {r36sInfo?.arch ?? 'ARM64 (dArkOS)'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Tamanho</span>
                  <span className="font-medium text-zinc-200">
                    {r36sInfo ? formatBytes(r36sInfo.sizeBytes) : '~6.9 MB'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">dArkOS XML</span>
                  <span className="font-medium text-[#1db954]">gamelist.xml + capa PNG</span>
                </div>
                {r36sInfo?.sha256 && (
                  <div className="pt-1 border-t border-white/10">
                    <div className="text-zinc-400 mb-0.5">SHA-256</div>
                    <div className="font-mono text-[9.5px] text-zinc-300 break-all leading-tight">
                      {r36sInfo.sha256}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-300 space-y-1.5">
              <div className="font-bold text-zinc-100">Como instalar no R36S (dArkOS / PortMaster):</div>
              <ol className="list-decimal list-inside space-y-1 text-zinc-300">
                <li>Baixe e extraia <code className="text-zinc-100">KPlayer-v2.0.0-R36S.zip</code>.</li>
                <li>
                  Copie <code className="text-zinc-100">KPlayer.sh</code>,{' '}
                  <code className="text-zinc-100">kplayer/</code>,{' '}
                  <code className="text-zinc-100">images/KPlayer-image.png</code> e{' '}
                  <code className="text-zinc-100">gamelist.xml</code> (ou mescle{' '}
                  <code className="text-zinc-100">kplayer/KPlayer-metadata.xml</code>) para{' '}
                  <code className="text-zinc-100">/roms/ports/</code>.
                </li>
                <li>
                  Coloque músicas em <code className="text-zinc-100">/roms/bgmusic</code> ou{' '}
                  <code className="text-zinc-100">/roms2/bgmusic</code> e vídeos em{' '}
                  <code className="text-zinc-100">/roms/videos</code> ou{' '}
                  <code className="text-zinc-100">/roms2/videos</code>.
                </li>
              </ol>
              <p className="text-[11px] text-zinc-400 pt-1">
                Inclui binário ARM64 v2.0.0, capa 640×480 e XML dArkOS, tela de boas-vindas animada com seletor de temas, libVLC ARM64, <strong>Placar da Bola</strong>, IPTV e rádios <code className="text-zinc-300">.pls</code>.
              </p>
            </div>

            <div className="mt-5 flex items-center gap-2.5">
              <a
                href="/api/r36s/download"
                download="KPlayer-v2.0.0-R36S.zip"
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="flex-1 py-2.5 px-4 rounded-xl text-center text-sm font-extrabold hover:brightness-110 transition-all"
              >
                ⬇ Baixar KPlayer-v2.0.0-R36S.zip
              </a>
              <a
                href="/api/r36s/sha256"
                download="KPlayer-v2.0.0-R36S.zip.sha256"
                className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 transition-colors"
              >
                .sha256
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
