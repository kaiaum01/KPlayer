import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KP_THEMES } from './themes';
import { LANGUAGE_CODES, LANGUAGE_NAMES, TERMS_PAGES, tr } from './i18n';
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
  KPlayerLogo,
  KpSprite,
  ModernBackdrop,
  PlayDisc,
  TileArrow,
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
import { YoutubeScreen, type YoutubeScreenHandle } from './components/YoutubeScreen';

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

  const theme = KP_THEMES[themeIndex] ?? KP_THEMES[0];

  // Screen navigation
  const [screen, setScreen] = useState<ScreenMode>(() => (onboarded ? 'home' : 'welcome'));
  const [prevScreen, setPrevScreen] = useState<ScreenMode>('home');
  const [termsPage, setTermsPage] = useState(0);
  const [termsReturn, setTermsReturn] = useState<ScreenMode>('welcome');
  const [dashFocus, setDashFocus] = useState(0);

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
  const youtubeRef = useRef<YoutubeScreenHandle | null>(null);

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

  // Football State
  const [matches, setMatches] = useState<FootballMatch[]>([]);
  const [footballSelected, setFootballSelected] = useState(0);
  const [footballLoading, setFootballLoading] = useState(false);

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
      setUserRadios(d.stations ?? []);
    } catch {
      setUserRadios([]);
    }
  }, []);

  useEffect(() => {
    fetchUserRadios();
  }, [fetchUserRadios]);

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

  // Fetch Radio stations when category changes or Radio opens
  const loadRadioCategory = useCallback(
    async (cat: number) => {
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
      setRadioLoading(true);
      try {
        const r = await fetch(`/api/radio?category=${cat}`);
        const d = (await r.json()) as { stations?: RadioStation[]; error?: string };
        setRadioStations(d.stations ?? []);
        if (d.error && (!d.stations || d.stations.length === 0)) {
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
      loadRadioCategory(radioCategory);
    }
  }, [screen, radioCategory, loadRadioCategory]);

  // Fetch IPTV channels
  const loadIptv = useCallback(
    async (src: 0 | 1 | 2, force = false) => {
      setIptvSelected(0);
      if (src === 0) {
        setIptvChannels(localIptvChannels);
        return;
      }
      setIptvLoading(true);
      try {
        const key = src === 1 ? 'br' : 'world';
        const r = await fetch(`/api/iptv?source=${key}${force ? '&refresh=1' : ''}`);
        const d = (await r.json()) as { channels?: IptvChannel[] };
        setIptvChannels(d.channels ?? []);
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
      loadIptv(iptvSource);
    }
  }, [screen, iptvSource, loadIptv]);

  // Fetch Football matches
  const loadFootball = useCallback(async (force = false) => {
    setFootballLoading(true);
    try {
      const r = await fetch(`/api/football${force ? '?refresh=1' : ''}`);
      const d = (await r.json()) as { matches?: FootballMatch[] };
      setMatches(d.matches ?? []);
      setFootballSelected(0);
    } catch {
      setMatches([]);
    } finally {
      setFootballLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === 'football') {
      loadFootball();
    }
  }, [screen, loadFootball]);

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
        setScreen('youtube');
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

      if (btn === 'L1') {
        stepTrack(-1);
        return;
      }
      if (btn === 'R1') {
        stepTrack(1);
        return;
      }

      if (screen === 'welcome') {
        if (btn === 'LEFT') setLanguage(((language + 2) % 3) as LanguageCode);
        else if (btn === 'RIGHT') setLanguage(((language + 1) % 3) as LanguageCode);
        else if (btn === 'B') {
          setOnboarded(true);
          setScreen('home');
        } else if (btn === 'Y') {
          setTermsReturn('welcome');
          setTermsPage(0);
          setScreen('terms');
        }
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
          if (radioCategory === 5) fetchUserRadios().then(() => loadRadioCategory(5));
          else loadRadioCategory(radioCategory);
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
        const len = matches.length;
        if (btn === 'A') setScreen('home');
        else if (btn === 'UP' && len) setFootballSelected((i) => (i + len - 1) % len);
        else if (btn === 'DOWN' && len) setFootballSelected((i) => (i + 1) % len);
        else if (btn === 'Y') loadFootball(true);
        return;
      }

      if (screen === 'youtube') {
        youtubeRef.current?.handleButton(btn);
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
      matches.length,
      loadFootball,
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
      football: 'Futebol',
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
  const footballWindowStart = Math.max(0, Math.min(footballSelected - 3, Math.max(0, matches.length - 6)));
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
          <span className="font-semibold text-zinc-100">KPlayer 1.0.4</span>
          <span className="text-zinc-500">R36S • Visual Moderno • 640×480</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1db954] text-[#0c140e] hover:bg-[#22d361] transition-colors cursor-pointer"
          >
            + {tr('Mídias locais', language)} / .LRC
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
            {/* ==================== WELCOME / ONBOARDING (09-boas-vindas.png) ==================== */}
            {screen === 'welcome' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />

                <button
                  type="button"
                  onClick={() => {
                    setTermsReturn('welcome');
                    setTermsPage(0);
                    setScreen('terms');
                  }}
                  style={{
                    left: 430,
                    top: 16,
                    width: 194,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: theme.elevated,
                    color: theme.muted,
                  }}
                  className="absolute z-10 flex items-center justify-center text-[13px] font-medium cursor-pointer hover:brightness-110"
                >
                  {tr('Y  Termos de uso', language)}
                </button>

                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-[54px]">
                  <KPlayerLogo theme={theme} size={76} />
                </div>

                <div
                  style={{ top: 146, color: theme.text }}
                  className="absolute z-10 inset-x-5 text-center text-[32px] font-extrabold tracking-wide"
                >
                  K PLAYER
                </div>
                <div
                  style={{ top: 191, color: theme.muted }}
                  className="absolute z-10 inset-x-5 text-center text-[16px]"
                >
                  {tr('Bem-vindo ao seu player', language)}
                </div>
                <div
                  style={{ top: 228, color: theme.text }}
                  className="absolute z-10 inset-x-5 text-center text-[17px] font-semibold"
                >
                  {tr('Escolha seu idioma', language)}
                </div>

                <div className="absolute z-10 left-[24px] top-[264px] flex gap-[8px]">
                  {LANGUAGE_NAMES.map((name, idx) => {
                    const chosen = idx === language;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setLanguage(idx as LanguageCode)}
                        style={{
                          ...modernCardStyle(theme, chosen, 12, theme.panel),
                          width: 192,
                          height: 66,
                        }}
                        className="text-left px-3.5 py-2.5 flex flex-col justify-between cursor-pointer transition-all"
                      >
                        <span
                          style={{ color: chosen ? theme.accent : theme.muted }}
                          className="text-[12px] font-bold"
                        >
                          {LANGUAGE_CODES[idx]}
                        </span>
                        <span style={{ color: theme.text }} className="text-[17px] font-semibold">
                          {name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOnboarded(true);
                    setScreen('home');
                  }}
                  style={{
                    left: 180,
                    top: 352,
                    width: 280,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: theme.accent,
                    color: theme.bg,
                    boxShadow: `0 0 22px ${rgbToRgba(theme.accent, 0.45)}`,
                  }}
                  className="absolute z-10 font-extrabold text-[18px] flex items-center justify-center cursor-pointer hover:brightness-110"
                >
                  {tr('B  Iniciar K PLAYER', language)}
                </button>

                <div
                  style={{ top: 410, color: theme.muted }}
                  className="absolute z-10 inset-x-5 text-center text-[12px]"
                >
                  {tr('Sua escolha será salva neste aparelho.', language)}
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'DIR', label: tr('Idioma', language) },
                    { key: 'B', label: tr('Iniciar', language) },
                    { key: 'Y', label: tr('Termos', language) },
                  ]}
                />
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
                        kind: 'youtube',
                        spriteCol: 1,
                        tag: 'PilasTube',
                        name: 'YouTube',
                        desc: tr('Vídeos online', language),
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
                              backgroundColor: rgbToRgba(theme.bg, 0.6),
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

                  <div className="flex items-center gap-3.5 pl-3 pr-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => stepTrack(-1)}
                      className="cursor-pointer hover:brightness-125 active:scale-95 transition-transform"
                      title="Anterior"
                    >
                      <KpSprite sheet="controles" col={2} themeIndex={themeIndex} size={24} />
                    </button>
                    <PlayDisc
                      theme={theme}
                      size={44}
                      playing={isPlaying && !isPaused}
                      onClick={togglePlayPause}
                      title="Reproduzir / Pausar"
                    />
                    <button
                      type="button"
                      onClick={() => stepTrack(1)}
                      className="cursor-pointer hover:brightness-125 active:scale-95 transition-transform"
                      title="Próxima"
                    >
                      <KpSprite sheet="controles" col={5} themeIndex={themeIndex} size={24} />
                    </button>
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
                        : tr('Busca automática: midias, /roms e /roms2', language)}
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
                        name: tr('Mídias do K PLAYER', language),
                        path: '/ports/kplayer/midias',
                        action: () => setLibLocationsView(false),
                      },
                      {
                        name: tr('Cartão /roms', language),
                        path: '/roms',
                        action: () => setLibLocationsView(false),
                      },
                      {
                        name: tr('Cartão /roms2', language),
                        path: '/roms2',
                        action: () => setLibLocationsView(false),
                      },
                      {
                        name: tr('Importar do dispositivo', language),
                        path: 'MP3, FLAC, WAV, OGG, MP4, WEBM, LRC, M3U',
                        action: () => fileInputRef.current?.click(),
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
                          ? '/ports/kplayer/midias'
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
                                className="text-xs font-bold w-4 text-center shrink-0"
                              >
                                {isCur ? '▮▮' : '▶'}
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

                {/* Bottom Transport Bar (x=16, y=374, w=608, h=56) */}
                <div
                  style={{
                    ...modernPanelStyle(theme, 14),
                    left: 16,
                    top: 374,
                    width: 608,
                    height: 56,
                  }}
                  className="absolute z-10 px-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 w-[180px] min-w-0">
                    <div
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                        color: theme.accent,
                      }}
                      className="w-[38px] h-[38px] rounded-[9px] flex items-center justify-center text-sm shrink-0"
                    >
                      ▶
                    </div>
                    <div className="min-w-0">
                      <div style={{ color: theme.accent }} className="text-[9px] font-bold tracking-wider">
                        {tr('A SEGUIR', language)}
                      </div>
                      <div style={{ color: theme.text }} className="text-[12px] font-semibold truncate">
                        {upNextTrack ? upNextTrack.title : tr('Fim da fila', language)}
                      </div>
                    </div>
                  </div>

                  {/* Center Transport + Progress */}
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => stepTrack(-1)}
                        className="cursor-pointer hover:brightness-125"
                      >
                        <KpSprite sheet="controles" col={2} themeIndex={themeIndex} size={18} />
                      </button>
                      <PlayDisc
                        theme={theme}
                        size={28}
                        playing={isPlaying && !isPaused}
                        onClick={togglePlayPause}
                      />
                      <button
                        type="button"
                        onClick={() => stepTrack(1)}
                        className="cursor-pointer hover:brightness-125"
                      >
                        <KpSprite sheet="controles" col={5} themeIndex={themeIndex} size={18} />
                      </button>
                    </div>
                    <div className="w-full flex items-center gap-2">
                      <span style={{ color: theme.muted }} className="text-[10px] tabular-nums">
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
                            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-[9px] h-[9px] rounded-full shadow"
                          />
                        </div>
                      </div>
                      <span style={{ color: theme.muted }} className="text-[10px] tabular-nums">
                        {formatTime(durationMs)}
                      </span>
                    </div>
                  </div>

                  <div className="w-[120px] flex items-center justify-end gap-1.5 shrink-0">
                    <span
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.15),
                        color: theme.accent,
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    >
                      {activeTrack?.format ?? 'AUDIO'}
                    </span>
                    <span style={{ color: theme.muted }} className="text-[10px]">
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

                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => stepTrack(-1)}
                        className="cursor-pointer hover:brightness-125"
                      >
                        <KpSprite sheet="controles" col={2} themeIndex={themeIndex} size={22} />
                      </button>
                      <PlayDisc
                        theme={theme}
                        size={40}
                        playing={onAir}
                        onClick={() => {
                          if (activeRadio) togglePlayPause();
                          else if (selectedRadio) playRadioStation(selectedRadio);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => stepTrack(1)}
                        className="cursor-pointer hover:brightness-125"
                      >
                        <KpSprite sheet="controles" col={5} themeIndex={themeIndex} size={22} />
                      </button>
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

            {/* ==================== YOUTUBE / PILASTUBE (10-youtube.png) ==================== */}
            {screen === 'youtube' && (
              <YoutubeScreen
                ref={youtubeRef}
                theme={theme}
                themeIndex={themeIndex}
                lang={language}
                location={locationLabel}
                toast={toast}
                onBack={() => setScreen('home')}
                onNotify={notify}
              />
            )}

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

            {/* ==================== FUTEBOL / GOLAZO ==================== */}
            {screen === 'football' && (
              <div className="w-full h-full relative overflow-hidden">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('FUTEBOL', language)}
                  location={locationLabel}
                />

                <div className="relative z-10 px-6 pt-3 flex items-center justify-between">
                  <h2 style={{ color: theme.text }} className="text-[22px] font-extrabold">
                    {tr('Jogos ao vivo', language)}
                  </h2>
                  <button
                    type="button"
                    onClick={() => loadFootball(true)}
                    style={{ backgroundColor: theme.elevated, color: theme.accent }}
                    className="px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer hover:brightness-110"
                  >
                    Y {tr('Atualizar', language)}
                  </button>
                </div>

                <div className="relative z-10 px-6 mt-2.5 space-y-1.5">
                  {footballLoading ? (
                    <div
                      style={{ color: theme.accent }}
                      className="h-[300px] flex items-center justify-center text-[17px] font-semibold"
                    >
                      {tr('Carregando placares...', language)}
                    </div>
                  ) : matches.length === 0 ? (
                    <div
                      style={{ color: theme.muted }}
                      className="h-[300px] flex items-center justify-center text-[17px]"
                    >
                      {tr('Nenhum jogo ao vivo', language)}
                    </div>
                  ) : (
                    matches.slice(footballWindowStart, footballWindowStart + 6).map((m, idx) => {
                      const realIdx = footballWindowStart + idx;
                      const focus = realIdx === footballSelected;
                      return (
                        <div
                          key={`${m.home}-${m.away}-${realIdx}`}
                          onMouseEnter={() => setFootballSelected(realIdx)}
                          style={{
                            ...modernCardStyle(theme, focus, 9, theme.panel),
                            height: 48,
                          }}
                          className="px-3 py-1 flex flex-col justify-between transition-all"
                        >
                          <div style={{ color: theme.accent }} className="text-[10px] font-bold truncate">
                            {m.league}
                          </div>
                          <div className="flex items-center text-[13px]">
                            <span style={{ color: theme.text }} className="w-[185px] truncate font-semibold">
                              {m.home}
                            </span>
                            <span
                              style={{ color: theme.text }}
                              className="w-[74px] text-center font-extrabold tabular-nums shrink-0"
                            >
                              {m.score}
                            </span>
                            <span style={{ color: theme.text }} className="flex-1 truncate font-semibold">
                              {m.away}
                            </span>
                            <span
                              style={{ color: theme.muted }}
                              className="text-[11px] w-[96px] text-right truncate shrink-0"
                            >
                              {m.status}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'DIR', label: tr('Navegar', language) },
                    { key: 'Y', label: tr('Atualizar', language) },
                    { key: 'A', label: tr('Voltar', language) },
                  ]}
                />
              </div>
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
    </div>
  );
}
