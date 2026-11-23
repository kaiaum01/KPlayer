import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KP_THEMES } from './themes';
import { LANGUAGE_NAMES, TERMS_PAGES, tr } from './i18n';
import type {
  AppUpdateStatus,
  EqPresetName,
  FootballMatch,
  IptvChannel,
  LanguageCode,
  MediaTrack,
  OptionsContext,
  PlaybackHistoryEntry,
  RadioStation,
  RepeatMode,
  ScreenMode,
  VideoFit,
  WeatherData,
  WeatherLocation,
  WeatherMode,
} from './types';
import {
  AUDIO_EXT_RE,
  VIDEO_EXT_RE,
  createInitialDemoTracks,
  formatBytes,
  formatTime,
  parseLrc,
} from './utils/media';
import { describeWeatherCode, formatWeatherLocationShort } from './utils/weather';
import { getWeatherHomeHero } from './utils/weatherMood';
import { HeaderBar, UpdateBannerContext } from './components/HeaderBar';
import { OptionsMenu, type OptionsMenuHandle, type OptionSectionId } from './components/OptionsMenu';
import {
  ScreensaverOverlay,
  SCREENSAVER_TIMEOUT_OPTIONS,
  SCREENSAVER_VIZ_LABELS,
  formatScreensaverTimeout,
} from './components/ScreensaverOverlay';
import { WeatherGlyph, WeatherScreen, type WeatherScreenHandle } from './components/WeatherScreen';
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
import { Newspaper } from 'lucide-react';
import { PlacarDaBolaScreen, type PlacarDaBolaHandle } from './components/PlacarDaBolaScreen';
import { NewsScreen, type NewsScreenHandle } from './components/NewsScreen';
import { IptvScreen, type IptvScreenHandle } from './components/IptvScreen';
import { BootSplashScreen, type BootPreloadStatus } from './components/BootSplashScreen';
import { AndroidPlayerApp } from './components/AndroidPlayerApp';
import { playSfxForButton, playUiSfx, setUiSfxEnabled } from './utils/sfx';
import scraperCoverImg from './assets/images/kplayer_cover_transparent_v208.png';
import scraperBoxartImg from './assets/images/kplayer_boxart_disc_v208_1795391407681.jpg';
import scraperMarqueeImg from './assets/images/kplayer_marquee_transparent_v208.png';
import scraperFanartImg from './assets/images/kplayer_fanart_disc_v208_1795391408989.jpg';

const APP_VERSION = '2.1.0';
const DEFAULT_CHANGELOG_NOTES: string[] = [
  'Nova aba Notícias (antes do Placar da Bola) com cobertura do Brasil em português (Urgente, Mundo, Polícia, Entretenimento e Esportes) e leitor completo no controle.',
  'Dashboard reorganizada: Músicas e Vídeos unificados em um único card, mantendo acesso rápido a Arquivos, Rádio Online, IPTV, Notícias e Placar da Bola.',
  'Correção visual definitiva em todos os 14 temas do R36S: eliminadas listras internas em caixas translúcidas e HUD do protetor de tela, agora com gradiente suave real e borda nítida.',
  '10 visualizadores reativos ao áudio no Protetor de Tela (+ Automático) e sons táteis de clique ao navegar pelos menus.',
  'Mais animações em toda a interface e documentação atualizada no GitHub.',
];

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

type R36SDisplayMode = 'auto' | 'r36s' | 'square' | 'wide';

const R36S_DISPLAY_MODES: Array<{
  id: R36SDisplayMode;
  short: string;
  label: string;
  width?: number;
  height?: number;
}> = [
  { id: 'auto', short: 'Auto', label: 'Auto (Adaptativo)' },
  { id: 'r36s', short: '4:3', label: 'Clássico 4:3', width: 640, height: 480 },
  { id: 'square', short: '1:1', label: 'R36S Plus 1:1 (720×720)', width: 720, height: 720 },
  { id: 'wide', short: '16:9', label: 'Widescreen 16:9 (960×540)', width: 960, height: 540 },
];

type AndroidDisplayMode = 'auto' | 'phone' | 'landscape' | 'tablet';

const ANDROID_DISPLAY_MODES: Array<{
  id: AndroidDisplayMode;
  short: string;
  label: string;
  width?: number;
  height?: number;
}> = [
  { id: 'auto', short: 'Auto', label: 'Auto (Adaptativo)' },
  { id: 'phone', short: 'Celular', label: 'Celular Retrato (390×780)', width: 390, height: 780 },
  { id: 'landscape', short: 'Paisagem', label: 'Celular Paisagem (820×400)', width: 820, height: 400 },
  { id: 'tablet', short: 'Tablet', label: 'Tablet / Dobrável (960×640)', width: 960, height: 640 },
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
  const [weatherMode, setWeatherMode] = useState<WeatherMode>(() => {
    const saved = loadStorage<string>('kp_weather_mode', '');
    if (saved === 'ip' || saved === 'manual' || saved === 'unset') return saved;
    return loadStorage<boolean>('kp_ip_loc', false) ? 'ip' : 'unset';
  });
  const [weatherLocation, setWeatherLocation] = useState<WeatherLocation | null>(() =>
    loadStorage<WeatherLocation | null>('kp_weather_loc', null)
  );
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherSetupView, setWeatherSetupView] = useState<'auto' | 'choose' | 'manual'>('auto');
  const [favoriteTrackIds, setFavoriteTrackIds] = useState<string[]>(() =>
    loadStorage('kp_fav_tracks', [])
  );
  const [favoriteRadios, setFavoriteRadios] = useState<RadioStation[]>(() =>
    loadStorage('kp_fav_radios', [])
  );
  const [playbackHistory, setPlaybackHistory] = useState<PlaybackHistoryEntry[]>(() =>
    loadStorage('kp_history', [])
  );
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [updateChecking, setUpdateChecking] = useState<boolean>(false);
  const [updateApplying, setUpdateApplying] = useState<boolean>(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number>(0);
  const [updateStage, setUpdateStage] = useState<string | null>(null);
  const [updateDetail, setUpdateDetail] = useState<string | null>(null);
  const [optionsInitialSection, setOptionsInitialSection] = useState<OptionSectionId | undefined>(undefined);
  const [optionsContext, setOptionsContext] = useState<OptionsContext>('general');
  const [homeLayoutInverted, setHomeLayoutInverted] = useState<boolean>(() =>
    loadStorage('kp_home_layout_inverted', false)
  );
  const [screensaverTimeoutSec, setScreensaverTimeoutSec] = useState<number>(() => {
    const saved = loadStorage<number>('kp_ss_timeout_v207', 30);
    return (SCREENSAVER_TIMEOUT_OPTIONS as readonly number[]).includes(saved) ? saved : 30;
  });
  const [screensaverVizStyle, setScreensaverVizStyle] = useState<number>(() => {
    const saved = loadStorage<number>('kp_ss_viz', 0);
    return saved >= 0 && saved < SCREENSAVER_VIZ_LABELS.length ? saved : 0;
  });
  const [screensaverShowClock, setScreensaverShowClock] = useState<boolean>(() =>
    loadStorage('kp_ss_clock', true)
  );
  const [screensaverShowLyrics, setScreensaverShowLyrics] = useState<boolean>(() =>
    loadStorage('kp_ss_lyrics', true)
  );
  const [uiSfxEnabled, setUiSfxEnabledState] = useState<boolean>(() =>
    loadStorage('kp_ui_sfx', true)
  );
  useEffect(() => {
    setUiSfxEnabled(uiSfxEnabled);
    try {
      localStorage.setItem('kp_ui_sfx', JSON.stringify(uiSfxEnabled));
    } catch {
      // Ignore storage quota errors
    }
  }, [uiSfxEnabled]);
  const [screensaverActive, setScreensaverActive] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const [weatherMoodSeed] = useState<number>(() => Math.floor(Math.random() * 100000));
  const [lastSeenVersion, setLastSeenVersion] = useState<string>(() =>
    loadStorage<string>('kp_last_seen_version', '')
  );
  const lastSeenVersionRef = useRef<string>(lastSeenVersion);
  useEffect(() => {
    lastSeenVersionRef.current = lastSeenVersion;
  }, [lastSeenVersion]);
  const [tutorialDone, setTutorialDone] = useState<boolean>(() =>
    loadStorage('kp_tutorial_done_v206', false)
  );
  const [tutorialFromOptions, setTutorialFromOptions] = useState<boolean>(false);
  const tutorialDoneRef = useRef<boolean>(tutorialDone);
  useEffect(() => {
    tutorialDoneRef.current = tutorialDone;
  }, [tutorialDone]);
  useEffect(() => {
    try {
      localStorage.setItem('kp_ss_timeout_v207', JSON.stringify(screensaverTimeoutSec));
      localStorage.setItem('kp_ss_viz', JSON.stringify(screensaverVizStyle));
      localStorage.setItem('kp_ss_clock', JSON.stringify(screensaverShowClock));
      localStorage.setItem('kp_ss_lyrics', JSON.stringify(screensaverShowLyrics));
    } catch {
      // Ignore storage quota errors
    }
  }, [screensaverTimeoutSec, screensaverVizStyle, screensaverShowClock, screensaverShowLyrics]);
  const [libSearchQuery, setLibSearchQuery] = useState<string>('');
  const [showDeck, setShowDeck] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 820 : true
  );
  const [r36sDisplayMode, setR36sDisplayMode] = useState<R36SDisplayMode>(() => {
    const saved = loadStorage<string>('kp_r36s_display', 'auto');
    return saved === 'r36s' || saved === 'square' || saved === 'wide' ? saved : 'auto';
  });
  const [androidDisplayMode, setAndroidDisplayMode] = useState<AndroidDisplayMode>(() => {
    const saved = loadStorage<string>('kp_android_display', 'auto');
    return saved === 'phone' || saved === 'landscape' || saved === 'tablet' ? saved : 'auto';
  });
  const [editionView, setEditionView] = useState<'r36s' | 'android' | 'split'>('r36s');
  const [showR36sModal, setShowR36sModal] = useState<boolean>(false);
  const [showAndroidModal, setShowAndroidModal] = useState<boolean>(false);
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
  const [streamNoticeAccepted, setStreamNoticeAccepted] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('kp_stream_notice_ok') === '1';
    } catch {
      return false;
    }
  });
  const [pendingStreamTarget, setPendingStreamTarget] = useState<'radio' | 'iptv'>('iptv');
  const [noticeReturn, setNoticeReturn] = useState<ScreenMode>('home');
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
  const placarRef = useRef<PlacarDaBolaHandle | null>(null);
  const newsRef = useRef<NewsScreenHandle | null>(null);
  const iptvRef = useRef<IptvScreenHandle | null>(null);
  const optionsRef = useRef<OptionsMenuHandle | null>(null);
  const weatherRef = useRef<WeatherScreenHandle | null>(null);

  const [activeTrack, setActiveTrack] = useState<MediaTrack | null>(() => tracks[0] ?? null);
  const [activeRadio, setActiveRadio] = useState<RadioStation | null>(null);
  const [activeVideoSrc, setActiveVideoSrc] = useState<string>('');
  const [activeVideoFallbacks, setActiveVideoFallbacks] = useState<string[]>([]);
  const [activeVideoTitle, setActiveVideoTitle] = useState<string>('');
  const [activeVideoLive, setActiveVideoLive] = useState<boolean>(false);
  const [activeVideoSection, setActiveVideoSection] = useState<string | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number>(() => tracks[0]?.durationMs ?? 0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [videoFit, setVideoFit] = useState<VideoFit>(0);
  const [showVideoOsd, setShowVideoOsd] = useState(true);
  const [sleepIdx, setSleepIdx] = useState(0);
  const [eqIdx, setEqIdx] = useState(0);

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

  // Adaptive viewport measurement for R36S & Android (Auto fills device viewport; fixed presets scale cleanly)
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 960, h: 600 });
  const [scale, setScale] = useState(1);
  const [androidScale, setAndroidScale] = useState(1);

  const activePreset = useMemo(
    () => R36S_DISPLAY_MODES.find((m) => m.id === r36sDisplayMode) ?? R36S_DISPLAY_MODES[0],
    [r36sDisplayMode]
  );

  const activeAndroidPreset = useMemo(
    () => ANDROID_DISPLAY_MODES.find((m) => m.id === androidDisplayMode) ?? ANDROID_DISPLAY_MODES[0],
    [androidDisplayMode]
  );

  useEffect(() => {
    const updateViewport = () => {
      const el = stageRef.current;
      if (!el) return;
      const splitAllowance = editionView === 'split' ? 404 : 0;
      const availW = Math.max(280, Math.floor(el.clientWidth - 16 - splitAllowance));
      const availH = Math.max(260, Math.floor(el.clientHeight - 16));
      setStageSize({ w: availW, h: availH });

      const targetW = activePreset.width ?? 640;
      const targetH = activePreset.height ?? 480;
      const s = Math.max(0.35, Math.min(availW / targetW, availH / targetH, 1.6));
      setScale(s);

      const androidAvailW = Math.max(280, Math.floor(el.clientWidth - 20));
      const androidAvailH = Math.max(260, Math.floor(el.clientHeight - 20));
      const aW = activeAndroidPreset.width ?? 390;
      const aH = activeAndroidPreset.height ?? 780;
      const aScale = Math.max(0.35, Math.min(androidAvailW / aW, androidAvailH / aH, 1.35));
      setAndroidScale(aScale);
    };
    updateViewport();
    const ro = new ResizeObserver(updateViewport);
    if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener('resize', updateViewport);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  }, [showDeck, editionView, activePreset, activeAndroidPreset]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('kp_lang', JSON.stringify(language));
      localStorage.setItem('kp_onboarded', JSON.stringify(onboarded));
      localStorage.setItem('kp_theme', JSON.stringify(themeIndex));
      localStorage.setItem('kp_repeat', JSON.stringify(repeatMode));
      localStorage.setItem('kp_shuffle', JSON.stringify(shuffle));
      localStorage.setItem('kp_ip_loc', JSON.stringify(weatherMode === 'ip'));
      localStorage.setItem('kp_weather_mode', JSON.stringify(weatherMode));
      localStorage.setItem('kp_weather_loc', JSON.stringify(weatherLocation));
      localStorage.setItem('kp_fav_tracks', JSON.stringify(favoriteTrackIds));
      localStorage.setItem('kp_fav_radios', JSON.stringify(favoriteRadios));
      localStorage.setItem('kp_history', JSON.stringify(playbackHistory));
      localStorage.setItem('kp_r36s_display', JSON.stringify(r36sDisplayMode));
      localStorage.setItem('kp_android_display', JSON.stringify(androidDisplayMode));
      localStorage.setItem('kp_home_layout_inverted', JSON.stringify(homeLayoutInverted));
      localStorage.setItem('kp_tutorial_done_v206', JSON.stringify(tutorialDone));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    language,
    onboarded,
    themeIndex,
    repeatMode,
    shuffle,
    weatherMode,
    weatherLocation,
    favoriteTrackIds,
    favoriteRadios,
    playbackHistory,
    r36sDisplayMode,
    androidDisplayMode,
    homeLayoutInverted,
    tutorialDone,
  ]);

  const recordHistory = useCallback(
    (kind: PlaybackHistoryEntry['kind'], title: string, subtitle?: string) => {
      if (!title.trim()) return;
      setPlaybackHistory((prev) => {
        const filtered = prev.filter((item) => !(item.kind === kind && item.title === title));
        return [{ kind, title, subtitle, playedAt: Date.now() }, ...filtered].slice(0, 40);
      });
    },
    []
  );

  const checkForUpdates = useCallback(
    async (force = false) => {
      setUpdateChecking(true);
      setUpdateProgress(22);
      setUpdateStage('Verificando atualizações...');
      setUpdateDetail('Consultando pasta updates/ no GitHub');
      const pulseTimer = window.setInterval(() => {
        setUpdateProgress((p) => (p < 82 ? p + 12 : p));
      }, 180);
      try {
        const r = await fetch(`/api/update/check${force ? '?refresh=1' : ''}`);
        if (!r.ok) {
          setUpdateProgress(0);
          setUpdateStage('Falha na verificação');
          setUpdateDetail('Não foi possível consultar o canal agora.');
          return;
        }
        const data = (await r.json()) as AppUpdateStatus;
        setUpdateStatus(data);
        setUpdateProgress(100);
        if (data.updateAvailable) {
          setUpdateStage(`Nova versão v${data.latestVersion} pronta`);
          setUpdateDetail('Selecione Baixar e atualizar para instalar preservando dados.');
          if (force) {
            setUpdateMessage(`Nova versão v${data.latestVersion} disponível na pasta updates/!`);
            notify(`Nova versão v${data.latestVersion} disponível`);
          }
        } else {
          setUpdateStage('Verificação concluída');
          setUpdateDetail(
            `KPlayer v${data.currentVersion} em dia · Monitorando v${data.nextExpectedVersion}+`
          );
          if (force) {
            setUpdateMessage(
              `KPlayer v${data.currentVersion} atualizado. Monitorando v${data.nextExpectedVersion}+.`
            );
            notify(`KPlayer v${data.currentVersion} está em dia`);
          }
        }
      } catch {
        setUpdateProgress(0);
        setUpdateStage('Sem conexão com updates/');
        setUpdateDetail('Verifique sua conexão e tente novamente.');
        if (force) {
          setUpdateMessage('Não foi possível consultar a pasta updates/ agora.');
        }
      } finally {
        window.clearInterval(pulseTimer);
        setUpdateChecking(false);
      }
    },
    [notify]
  );

  const saveUpdateRepo = useCallback(
    async (repo: string): Promise<boolean> => {
      try {
        const r = await fetch('/api/update/repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repository: repo }),
        });
        const d = (await r.json()) as { ok?: boolean; status?: AppUpdateStatus; error?: string };
        if (d.ok && d.status) {
          setUpdateStatus(d.status);
          setUpdateMessage(`Canal updates/ configurado para ${d.status.repository}`);
          notify('Canal de atualização salvo');
          return true;
        }
        setUpdateMessage(d.error || 'Formato inválido. Use usuario/repositorio');
        return false;
      } catch {
        setUpdateMessage('Falha ao salvar o repositório do GitHub.');
        return false;
      }
    },
    [notify]
  );

  const applyAppUpdate = useCallback(async () => {
    if (updateApplying) return;
    setUpdateApplying(true);
    setUpdateProgress(10);
    setUpdateStage('Conectando ao canal updates/...');
    setUpdateDetail('Preparando download seguro (preservando dados e histórico)');
    setUpdateMessage('Baixando atualização da pasta updates/ (preservando dados e histórico)...');

    const stepStages: Array<{ pct: number; stage: string; detail: string }> = [
      { pct: 28, stage: 'Baixando pacote R36S...', detail: 'Transferindo arquivos da pasta updates/' },
      { pct: 54, stage: 'Baixando pacote R36S...', detail: 'Verificando integridade dos blocos' },
      { pct: 76, stage: 'Validando checksum SHA-256...', detail: 'Garantindo autenticidade do pacote' },
      { pct: 90, stage: 'Aplicando atualização...', detail: 'Preservando favoritos, histórico, listas e clima' },
    ];
    let stepIdx = 0;
    const progressTimer = window.setInterval(() => {
      if (stepIdx < stepStages.length) {
        const s = stepStages[stepIdx++];
        setUpdateProgress(s.pct);
        setUpdateStage(s.stage);
        setUpdateDetail(s.detail);
      }
    }, 340);

    try {
      const r = await fetch('/api/update/apply', { method: 'POST' });
      const d = (await r.json()) as {
        ok?: boolean;
        message?: string;
        targetVersion?: string;
        restartRequired?: boolean;
      };
      window.clearInterval(progressTimer);
      if (d.ok) {
        setUpdateProgress(100);
        setUpdateStage('Atualização concluída!');
        setUpdateDetail(
          `Versão v${d.targetVersion ?? updateStatus?.latestVersion ?? APP_VERSION} pronta · Reiniciando KPlayer...`
        );
        setUpdateMessage(
          d.message ||
            `Atualização v${d.targetVersion ?? updateStatus?.latestVersion ?? APP_VERSION} aplicada. Reiniciando...`
        );
        notify('Atualização concluída! Reiniciando KPlayer...');
        window.setTimeout(() => {
          setUpdateApplying(false);
          setUpdateMessage(null);
          setBootRunId((n) => n + 1);
        }, 1250);
        return;
      }
      setUpdateProgress(0);
      setUpdateStage('Falha ao atualizar');
      setUpdateDetail('Seus dados e histórico seguem intactos.');
      setUpdateMessage('Não foi possível aplicar a atualização agora.');
      setUpdateApplying(false);
    } catch {
      window.clearInterval(progressTimer);
      setUpdateProgress(0);
      setUpdateStage('Erro de conexão');
      setUpdateDetail('Seus dados e histórico seguem intactos.');
      setUpdateMessage('Erro de conexão ao aplicar atualização.');
      setUpdateApplying(false);
    }
  }, [updateApplying, updateStatus?.latestVersion, notify]);

  // Automatically check GitHub updates/ channel every time the app starts or restarts
  useEffect(() => {
    void checkForUpdates(false);
  }, [bootRunId, checkForUpdates]);

  // Open-Meteo Weather & Location Engine (IP auto-detect or manual city)
  const fetchWeatherForLocation = useCallback(
    async (loc: WeatherLocation, force = false) => {
      setWeatherLoading(true);
      setWeatherError(null);
      try {
        const params = new URLSearchParams({
          lat: String(loc.latitude),
          lon: String(loc.longitude),
          name: loc.name,
          region: loc.region ?? '',
          country: loc.country ?? '',
        });
        if (force) params.set('refresh', '1');
        const r = await fetch(`/api/weather?${params.toString()}`);
        if (!r.ok) throw new Error('weather_unavailable');
        const data = (await r.json()) as WeatherData;
        setWeatherData(data);
        const shortLoc = formatWeatherLocationShort(data.location);
        if (shortLoc) setLocationLabel(shortLoc);
      } catch {
        setWeatherError('Não foi possível carregar o clima da Open-Meteo agora.');
      } finally {
        setWeatherLoading(false);
      }
    },
    []
  );

  const enableIpWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const r = await fetch('/api/location');
      const d = (await r.json()) as {
        ok?: boolean;
        location?: string;
        city?: string;
        region?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      };
      if (d.ok && d.city && typeof d.latitude === 'number' && typeof d.longitude === 'number') {
        const loc: WeatherLocation = {
          name: d.city,
          region: d.region || '',
          country: d.country || '',
          latitude: d.latitude,
          longitude: d.longitude,
        };
        setWeatherMode('ip');
        setWeatherLocation(loc);
        setLocationLabel(formatWeatherLocationShort(loc) || d.city);
        await fetchWeatherForLocation(loc, true);
        notify(`Clima ativado via IP: ${loc.name}`);
      } else {
        setWeatherError('Não foi possível detectar sua cidade pelo IP. Tente pesquisar manualmente.');
        setWeatherLoading(false);
      }
    } catch {
      setWeatherError('Erro ao detectar localização pelo IP. Tente pesquisar manualmente.');
      setWeatherLoading(false);
    }
  }, [fetchWeatherForLocation, notify]);

  const selectManualWeatherLocation = useCallback(
    async (loc: WeatherLocation) => {
      setWeatherMode('manual');
      setWeatherLocation(loc);
      setLocationLabel(formatWeatherLocationShort(loc) || loc.name);
      await fetchWeatherForLocation(loc, true);
      notify(`Clima definido: ${loc.name}`);
    },
    [fetchWeatherForLocation, notify]
  );

  const disableWeather = useCallback(() => {
    setWeatherMode('unset');
    setWeatherLocation(null);
    setWeatherData(null);
    setWeatherError(null);
    setLocationLabel(tr('Mídias locais', language));
    notify('Localização do clima removida');
  }, [language, notify]);

  const openWeatherScreen = useCallback(
    (setupMode: 'auto' | 'choose' | 'manual' = 'auto') => {
      setWeatherSetupView(setupMode);
      setScreen('weather');
      window.setTimeout(() => {
        if (setupMode === 'choose' || setupMode === 'manual') {
          weatherRef.current?.openSetup(setupMode);
        }
      }, 0);
    },
    []
  );

  // Sync weather automatically when configured via IP or manual city
  useEffect(() => {
    if (weatherMode === 'unset') {
      setLocationLabel(tr('Mídias locais', language));
      return;
    }
    if (weatherLocation) {
      setLocationLabel(formatWeatherLocationShort(weatherLocation) || weatherLocation.name);
      void fetchWeatherForLocation(weatherLocation, false);
      return;
    }
    if (weatherMode === 'ip') {
      void enableIpWeather();
    }
  }, [weatherMode, weatherLocation, language, fetchWeatherForLocation, enableIpWeather]);

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

      const iptvTask = fetch('/api/iptv/categories?source=canais')
        .then((r) => (r.ok ? r.json() : { totalCount: 0 }))
        .then((d: { totalCount?: number }) => Number(d.totalCount ?? 0))
        .catch(() => 0)
        .then((count) => {
          if (cancelled) return;
          setBootStatus((prev) => ({
            ...prev,
            iptvReady: true,
            iptvCount: count,
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

      setScreen(
        !onboardedRef.current
          ? 'welcome'
          : !tutorialDoneRef.current
          ? 'tutorial'
          : lastSeenVersionRef.current !== APP_VERSION
          ? 'changelog'
          : 'home'
      );
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

  // Audio & video library partitions + Android shared helpers
  const audioTracks = useMemo(() => tracks.filter((t) => t.kind === 'audio'), [tracks]);
  const videoTracks = useMemo(() => tracks.filter((t) => t.kind === 'video'), [tracks]);
  const favoriteTrackSet = useMemo(() => new Set(favoriteTrackIds), [favoriteTrackIds]);
  const favoriteRadioSet = useMemo(() => new Set(favoriteRadios.map((r) => r.uuid)), [favoriteRadios]);

  const toggleFavoriteTrackById = useCallback((id: string) => {
    setFavoriteTrackIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const toggleFavoriteRadioByUuid = useCallback(
    (uuid: string) => {
      setFavoriteRadios((prev) => {
        if (prev.some((s) => s.uuid === uuid)) {
          return prev.filter((s) => s.uuid !== uuid);
        }
        const match =
          radioStations.find((s) => s.uuid === uuid) ??
          userRadios.find((s) => s.uuid === uuid) ??
          (activeRadio?.uuid === uuid ? activeRadio : undefined);
        return match ? [...prev, match] : prev;
      });
    },
    [radioStations, userRadios, activeRadio]
  );

  const seekAudioMs = useCallback((ms: number) => {
    const audio = audioRef.current;
    const clamped = Math.max(0, ms);
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(audio.duration, clamped / 1000);
    }
    setCurrentMs(clamped);
  }, []);

  const playMediaTrack = useCallback(
    (track: MediaTrack) => {
      if (track.kind === 'video') {
        audioRef.current?.pause();
        setActiveRadio(null);
        setActiveTrack(track);
        setActiveVideoTitle(track.title);
        setActiveVideoSrc(track.url ?? '');
        setActiveVideoFallbacks([]);
        setActiveVideoLive(false);
        setActiveVideoSection(undefined);
        setIsPaused(false);
        setIsPlaying(true);
        setShowVideoOsd(true);
        recordHistory('video', track.title, track.folder || 'Vídeo');
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
      recordHistory('audio', track.title, track.artist);
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
    [ensureAudioEq, playbackRate, screen, language, notify, recordHistory]
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
      recordHistory('radio', station.name, station.country);

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
    [ensureAudioEq, language, notify, recordHistory]
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

  const playIptvItem = useCallback(
    (ch: IptvChannel, sectionLabel: string) => {
      audioRef.current?.pause();
      setActiveRadio(null);
      setActiveVideoTitle(ch.name);
      setActiveVideoSrc(ch.url);
      setActiveVideoFallbacks(ch.fallbackUrls ?? []);
      setActiveVideoLive(ch.mediaType ? ch.mediaType === 'live' : true);
      setActiveVideoSection(sectionLabel);
      setIsPaused(false);
      setShowVideoOsd(true);
      recordHistory('iptv', ch.name, ch.group || sectionLabel);
      setPrevScreen('iptv');
      setScreen('video');
    },
    [recordHistory]
  );

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

  // Filtered library list (with live typing search for Vídeos & Arquivos)
  const filteredLibrary = useMemo(() => {
    const q = libSearchQuery.trim().toLowerCase();
    return tracks.filter((t) => {
      if (libFavoritesOnly && !favoriteTrackIds.includes(t.id)) return false;
      if (libFilter === 1 && t.kind !== 'audio') return false;
      if (libFilter === 2 && t.kind !== 'video') return false;
      if (q) {
        const hay = `${t.name} ${t.title} ${t.artist} ${t.folder}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tracks, libFilter, libFavoritesOnly, favoriteTrackIds, libSearchQuery]);

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

  const openStreamingScreen = useCallback(
    (target: 'radio' | 'iptv', from: ScreenMode = 'home') => {
      if (streamNoticeAccepted) {
        setScreen(target);
        return;
      }
      setPendingStreamTarget(target);
      setNoticeReturn(from);
      setScreen('notice');
    },
    [streamNoticeAccepted]
  );

  const acceptStreamNotice = useCallback(() => {
    setStreamNoticeAccepted(true);
    try {
      sessionStorage.setItem('kp_stream_notice_ok', '1');
    } catch {
      // ignore storage failure
    }
    setScreen(pendingStreamTarget);
  }, [pendingStreamTarget]);

  // Open dashboard card
  const openDashboardCard = useCallback(
    (idx: number) => {
      setDashFocus(idx);
      if (idx === 0) {
        setLibFavoritesOnly(false);
        setLibLocationsView(false);
        setLibFilter(0);
        setLibSelected(0);
        setScreen('library');
      } else if (idx === 1) {
        setLibFavoritesOnly(false);
        setLibLocationsView(true);
        setLibFilter(0);
        setLibLocationSelected(0);
        setScreen('library');
      } else if (idx === 2) {
        openStreamingScreen('radio', 'home');
      } else if (idx === 3) {
        openStreamingScreen('iptv', 'home');
      } else if (idx === 4) {
        setScreen('news');
      } else if (idx === 5) {
        setScreen('football');
      }
    },
    [openStreamingScreen]
  );

  const openOptionsScreen = useCallback(
    (initialSec?: OptionSectionId) => {
      const origin = screen === 'options' ? prevScreen : screen;
      if (screen !== 'options') {
        setPrevScreen(screen === 'boot' || screen === 'welcome' || screen === 'tutorial' ? 'home' : screen);
      }
      const ctx: OptionsContext =
        origin === 'video'
          ? 'video'
          : origin === 'music'
          ? 'music'
          : origin === 'iptv'
          ? 'iptv'
          : origin === 'radio'
          ? 'radio'
          : 'general';
      setOptionsContext(ctx);
      const targetSec: OptionSectionId =
        initialSec ??
        (ctx === 'video'
          ? 'video_opts'
          : ctx === 'music'
          ? 'music_opts'
          : ctx === 'iptv'
          ? 'iptv_opts'
          : ctx === 'radio'
          ? 'radio_opts'
          : 'root');
      setOptionsInitialSection(targetSec);
      setScreen('options');
      window.setTimeout(() => {
        optionsRef.current?.openSection(targetSec);
      }, 0);
    },
    [screen, prevScreen]
  );

  // Automatic Screensaver idle trigger when playing Music or Radio
  useEffect(() => {
    const touch = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);

  useEffect(() => {
    if (screensaverTimeoutSec <= 0 || screensaverActive) return;
    const isAudioOrRadioPlaying =
      isPlaying && (Boolean(activeRadio) || activeTrack?.kind === 'audio');
    const blockedScreen =
      screen === 'boot' ||
      screen === 'welcome' ||
      screen === 'terms' ||
      screen === 'notice' ||
      screen === 'tutorial' ||
      screen === 'changelog' ||
      screen === 'video' ||
      updateApplying;
    if (!isAudioOrRadioPlaying || blockedScreen) return;

    const id = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= screensaverTimeoutSec * 1000) {
        setScreensaverActive(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    screensaverTimeoutSec,
    screensaverActive,
    isPlaying,
    activeRadio,
    activeTrack?.kind,
    screen,
    updateApplying,
  ]);

  // Unified R36S physical / keyboard / on-screen button handler
  const handleButton = useCallback(
    (btn: R36SButton) => {
      lastActivityRef.current = Date.now();
      if (screen === 'boot') return;
      playSfxForButton(btn);

      if (screensaverActive) {
        if (btn === 'L1') {
          setScreensaverVizStyle((v) => (v + SCREENSAVER_VIZ_LABELS.length - 1) % SCREENSAVER_VIZ_LABELS.length);
          return;
        }
        if (btn === 'R1') {
          setScreensaverVizStyle((v) => (v + 1) % SCREENSAVER_VIZ_LABELS.length);
          return;
        }
        if (btn === 'X') {
          setScreensaverShowLyrics((s) => !s);
          return;
        }
        if (btn === 'Y') {
          setScreensaverShowClock((s) => !s);
          return;
        }
        if (btn === 'START') {
          togglePlayPause();
          return;
        }
        setScreensaverActive(false);
        return;
      }

      if (btn === 'START') {
        togglePlayPause();
        return;
      }

      if (btn === 'SELECT') {
        if (screen === 'options') {
          setScreen(prevScreen);
        } else if (
          screen !== 'welcome' &&
          screen !== 'terms' &&
          screen !== 'notice' &&
          screen !== 'tutorial' &&
          screen !== 'changelog'
        ) {
          openOptionsScreen();
        }
        return;
      }

      if (screen === 'changelog') {
        if (btn === 'B' || btn === 'A' || btn === 'X' || btn === 'Y') {
          setLastSeenVersion(APP_VERSION);
          try {
            localStorage.setItem('kp_last_seen_version', JSON.stringify(APP_VERSION));
          } catch {
            // Ignore storage errors
          }
          setScreen('home');
        }
        return;
      }

      if (screen === 'tutorial') {
        if (btn === 'B' || btn === 'A' || btn === 'X' || btn === 'Y') {
          if (tutorialFromOptions) {
            setTutorialFromOptions(false);
            openOptionsScreen('root');
          } else {
            setTutorialDone(true);
            setScreen(lastSeenVersion !== APP_VERSION ? 'changelog' : 'home');
          }
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
          if (!tutorialDone) {
            setTutorialFromOptions(false);
            setScreen('tutorial');
          } else if (lastSeenVersion !== APP_VERSION) {
            setScreen('changelog');
          } else {
            setScreen('home');
          }
        } else if (btn === 'Y') {
          setTermsReturn('welcome');
          setTermsPage(0);
          setScreen('terms');
        }
        return;
      }

      if (screen === 'notice') {
        if (btn === 'B') acceptStreamNotice();
        else if (btn === 'A') setScreen(noticeReturn);
        else if (btn === 'Y') {
          setTermsReturn('notice');
          setTermsPage(1);
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
        const total = TERMS_PAGES.length;
        if (btn === 'LEFT') setTermsPage((p) => (p + total - 1) % total);
        else if (btn === 'RIGHT') setTermsPage((p) => (p + 1) % total);
        else if (btn === 'A' || btn === 'B') setScreen(termsReturn);
        return;
      }

      if (screen === 'home') {
        if (btn === 'LEFT') setDashFocus((f) => (f % 3 === 0 ? f + 2 : f - 1));
        else if (btn === 'RIGHT') setDashFocus((f) => (f % 3 === 2 ? f - 2 : f + 1));
        else if (btn === 'UP' || btn === 'DOWN') setDashFocus((f) => (f + 3) % 6);
        else if (btn === 'B') openDashboardCard(dashFocus);
        else if (btn === 'X') {
          openWeatherScreen('auto');
        } else if (btn === 'Y') {
          openOptionsScreen('root');
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
        iptvRef.current?.handleButton(btn);
        return;
      }

      if (screen === 'news') {
        newsRef.current?.handleButton(btn);
        return;
      }

      if (screen === 'football') {
        placarRef.current?.handleButton(btn);
        return;
      }

      if (screen === 'weather') {
        weatherRef.current?.handleButton(btn);
        return;
      }

      if (screen === 'options') {
        optionsRef.current?.handleButton(btn);
      }
    },
    [
      togglePlayPause,
      screensaverActive,
      screen,
      prevScreen,
      stepTrack,
      language,
      welcomeFocus,
      termsReturn,
      dashFocus,
      openDashboardCard,
      openWeatherScreen,
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
      openOptionsScreen,
      acceptStreamNotice,
      noticeReturn,
      openStreamingScreen,
      notify,
      tutorialDone,
      tutorialFromOptions,
      lastSeenVersion,
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

  const updateBannerValue = useMemo(
    () => ({
      currentVersion: updateStatus?.currentVersion ?? APP_VERSION,
      updateAvailable: Boolean(updateStatus?.updateAvailable),
      latestVersion: updateStatus?.latestVersion ?? APP_VERSION,
      onOpenUpdate: () => openOptionsScreen('update'),
    }),
    [updateStatus, openOptionsScreen]
  );

  const selectedRadio = radioStations[radioSelected];

  return (
    <UpdateBannerContext.Provider value={updateBannerValue}>
    <div className="h-screen w-screen bg-[#0a0c10] text-white flex flex-col overflow-hidden">
      {/* Hidden native input for real local media & LRC import */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,video/*,.lrc"
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

      {/* Minimal Top Utility Bar for Edition Switcher, Media Import & Downloads */}
      <div className="min-h-10 px-3 py-1.5 bg-[#101319] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 text-xs flex-wrap">
          <span className="font-bold text-zinc-100 whitespace-nowrap">
            KPlayer v{updateStatus?.currentVersion ?? APP_VERSION} • R36S
          </span>
          {updateStatus?.updateAvailable ? (
            <button
              type="button"
              onClick={() => openOptionsScreen('update')}
              style={{
                backgroundColor: rgbToRgba(theme.accent, 0.2),
                border: `1px solid ${rgbToRgba(theme.accent, 0.6)}`,
                color: theme.accent,
              }}
              className="px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap cursor-pointer flex items-center gap-1.5 hover:brightness-110 transition-all"
              title="Nova versão pronta na pasta updates/ do GitHub — clique ou pressione SELECT"
            >
              <span
                style={{ backgroundColor: theme.accent }}
                className="w-1.5 h-1.5 rounded-full animate-pulse"
              />
              Atualização v{updateStatus.latestVersion} disponível · SELECT
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openOptionsScreen('update')}
              className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-white/5 text-zinc-400 hover:text-zinc-200 border border-white/10 whitespace-nowrap cursor-pointer transition-colors"
              title="Auto-update monitorando novas versões na pasta updates/ do GitHub"
            >
              Auto-Update · SELECT
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowR36sModal(true)}
            style={{
              backgroundColor: theme.accent,
              color: theme.bg,
              boxShadow: `0 0 12px ${rgbToRgba(theme.accent, 0.35)}`,
            }}
            className="px-2.5 py-1 rounded-md text-xs font-bold hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
          >
            ⬇ Pacote R36S (.zip)
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-100 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            + {tr('Mídias locais', language)} / .LRC
          </button>
          {editionView === 'android' && (
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#181c25] border border-white/10"
              title="Adaptação de tela Android"
            >
              {ANDROID_DISPLAY_MODES.map((mode) => {
                const active = androidDisplayMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setAndroidDisplayMode(mode.id)}
                    style={
                      active
                        ? { backgroundColor: theme.accent, color: theme.bg }
                        : undefined
                    }
                    className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                      active ? '' : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {mode.id === 'auto' ? `Auto (${stageSize.w}×${stageSize.h})` : mode.short}
                  </button>
                );
              })}
            </div>
          )}
          {editionView !== 'android' && (
            <>
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-md bg-[#181c25] border border-white/10"
                title={tr('Adaptação de tela', language)}
              >
                {R36S_DISPLAY_MODES.map((mode) => {
                  const active = r36sDisplayMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setR36sDisplayMode(mode.id)}
                      style={
                        active
                          ? { backgroundColor: theme.accent, color: theme.bg }
                          : undefined
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                        active ? '' : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {mode.id === 'auto' ? `Auto (${stageSize.w}×${stageSize.h})` : mode.short}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setScreen('welcome')}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
                title="Visualizar tela inicial de boas-vindas"
              >
                Boas-vindas
              </button>
              <button
                type="button"
                onClick={() => setBootRunId((n) => n + 1)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
                title="Reproduzir tela de inicialização"
              >
                ↻ Reiniciar
              </button>
              <button
                type="button"
                onClick={() => setShowDeck((v) => !v)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#1e222c] text-zinc-200 hover:bg-[#282e3b] border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
              >
                {showDeck ? 'Ocultar R36S Deck' : 'Mostrar R36S Deck'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Responsive Stage: R36S (Principal - Adaptativo) / Android (Adaptativo) / Lado a Lado */}
      <div
        ref={stageRef}
        className={`flex-1 min-h-0 flex items-center justify-center gap-4 sm:gap-6 overflow-auto ${
          (r36sDisplayMode === 'auto' && editionView === 'r36s') ||
          (androidDisplayMode === 'auto' && editionView === 'android')
            ? 'p-1.5 sm:p-2.5'
            : 'p-2.5 sm:p-3'
        }`}
      >
        {editionView !== 'android' && (() => {
          const isFluid = r36sDisplayMode === 'auto';
          const presetW = activePreset.width ?? 640;
          const presetH = activePreset.height ?? 480;
          return (
            <div
              className={`flex flex-col items-center gap-1.5 ${
                isFluid
                  ? editionView === 'split'
                    ? 'flex-1 h-full min-w-[300px]'
                    : 'w-full h-full'
                  : 'shrink-0'
              }`}
            >
              {editionView === 'split' && (
                <div className="text-[11px] font-semibold text-zinc-400 shrink-0">
                  {isFluid
                    ? `R36S (Principal · Adaptativo ${stageSize.w}×${stageSize.h} · dArkOS)`
                    : `R36S (Principal · ${presetW}×${presetH} · dArkOS)`}
                </div>
              )}
              <div
                style={
                  isFluid
                    ? undefined
                    : {
                        width: Math.round(presetW * scale),
                        height: Math.round(presetH * scale),
                      }
                }
                className={`relative rounded-[14px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.75)] ring-2 ring-white/10 ${
                  isFluid ? 'w-full flex-1 min-h-0' : 'shrink-0'
                }`}
              >
                <div
                  style={
                    isFluid
                      ? {
                          width: '100%',
                          height: '100%',
                          backgroundColor: theme.bg,
                          color: theme.text,
                        }
                      : {
                          width: presetW,
                          height: presetH,
                          transform: `scale(${scale})`,
                          transformOrigin: 'top left',
                          backgroundColor: theme.bg,
                          color: theme.text,
                        }
                  }
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

            {/* ==================== WELCOME / ONBOARDING (ANIMATED BOOT STYLE v2.1.0) ==================== */}
            {screen === 'welcome' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center kp-screen-enter">
                <ModernBackdrop theme={theme} />

                {/* Ambient central aura matching Boot Splash */}
                <div
                  className="pointer-events-none absolute left-1/2 top-[128px] -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] rounded-full blur-3xl opacity-30 transition-colors duration-500"
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
                <div className="relative z-10 flex flex-col items-center justify-center w-full px-4">
                  <div className="relative w-[108px] h-[108px] flex items-center justify-center kp-boot-float">
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
                      <VinylArt theme={theme} size={76} spinning={true} />
                    </div>
                  </div>

                  {/* Brand wordmark + v2.0.3 pill + live equalizer */}
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
                      v2.1.0 • R36S
                    </div>
                  </div>

                  <div className="mt-2.5 kp-boot-rise" style={{ animationDelay: '130ms' }}>
                    <AudioVisualizer theme={theme} bars={24} width={220} height={14} active={true} />
                  </div>

                  {/* Row 0: Slim Unified Segmented Language Capsule */}
                  <div
                    className="mt-3.5 w-full flex flex-col items-center kp-boot-rise"
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
                      className="w-full max-w-[448px] p-1 grid grid-cols-3 gap-1 items-center transition-all"
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
                            className="h-[30px] rounded-full text-[11px] @min-[420px]:text-[12.5px] font-bold flex items-center justify-center cursor-pointer transition-all hover:brightness-115 truncate px-1"
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 1: Slim Theme Color Dots ("bolinhas") */}
                  <div
                    className="mt-3 w-full flex flex-col items-center kp-boot-rise"
                    style={{ animationDelay: '250ms' }}
                  >
                    <div
                      style={{ color: welcomeFocus === 1 ? theme.accent : theme.muted }}
                      className="text-[10px] font-bold tracking-wider uppercase mb-1.5 transition-colors"
                    >
                      {tr('Tema', language)} • {tr(theme.name, language)} ({themeIndex + 1}/{KP_THEMES.length})
                    </div>
                    <div
                      style={{
                        ...modernPanelStyle(theme, 23),
                        minHeight: 46,
                        borderColor:
                          welcomeFocus === 1
                            ? rgbToRgba(theme.accent, 0.65)
                            : themeHairline(theme),
                        boxShadow:
                          welcomeFocus === 1
                            ? `0 0 14px ${rgbToRgba(theme.accent, 0.22)}`
                            : undefined,
                      }}
                      className="w-full max-w-[532px] px-2.5 py-1.5 flex items-center justify-between gap-1 flex-wrap transition-all"
                    >
                      {KP_THEMES.map((tItem, idx) => {
                        const chosen = idx === themeIndex;
                        const isLight = idx === 2 || idx === 3 || idx === 12;
                        const outerColor = isLight ? tItem.bg : tItem.accent;
                        const innerColor = isLight ? tItem.accent : tItem.bg;
                        return (
                          <button
                            key={tItem.id}
                            type="button"
                            title={tr(tItem.name, language)}
                            aria-label={tr(tItem.name, language)}
                            onClick={() => {
                              playUiSfx('move');
                              setWelcomeFocus(1);
                              setThemeIndex(idx);
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              boxShadow: chosen
                                ? `0 0 0 2px ${theme.text}, 0 0 14px ${rgbToRgba(theme.accent, 0.65)}`
                                : 'none',
                            }}
                            className={`rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ${
                              chosen ? 'scale-115' : 'hover:scale-110 opacity-85 hover:opacity-100'
                            }`}
                          >
                            <span
                              style={{
                                width: 20,
                                height: 20,
                                backgroundColor: outerColor,
                                border: `1px solid ${rgbToRgba(theme.text, 0.22)}`,
                              }}
                              className="rounded-full flex items-center justify-center"
                            >
                              {(isLight || idx === 1 || idx === 11 || idx === 13) && (
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
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

                  {/* Minimal borderless pulsing continue hint (R36S physical button only — no touch) */}
                  <button
                    type="button"
                    onClick={() => {
                      setOnboarded(true);
                      if (!tutorialDone) {
                        setTutorialFromOptions(false);
                        setScreen('tutorial');
                      } else if (lastSeenVersion !== APP_VERSION) {
                        setScreen('changelog');
                      } else {
                        setScreen('home');
                      }
                    }}
                    style={{ color: theme.muted }}
                    className="mt-4 text-[11.5px] font-medium tracking-wide cursor-pointer hover:brightness-125 animate-pulse transition-colors"
                  >
                    {tr('Pressione B para continuar', language)}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== FIRST-RUN COMMANDS TUTORIAL (AND "REVER COMANDOS") ==================== */}
            {screen === 'tutorial' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                <ModernBackdrop theme={theme} />
                <HeaderBar theme={theme} section="COMANDOS" location={locationLabel} />
                <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-3.5 flex flex-col w-full max-w-[780px] mx-auto">
                  <div className="shrink-0">
                    <h2
                      style={{ color: theme.text }}
                      className="text-[20px] @min-[540px]:text-[24px] font-extrabold leading-tight"
                    >
                      {tutorialFromOptions ? 'Comandos do R36S' : 'Bem-vindo! Conheça os Comandos'}
                    </h2>
                    <p style={{ color: theme.muted }} className="text-[12px] mt-0.5">
                      {tutorialFromOptions
                        ? 'Lista completa de comandos do controle · Pressione B ou A para voltar'
                        : 'Tutorial inicial · Você pode rever quando quiser em Opções › Rever comandos'}
                    </p>
                  </div>

                  <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 grid grid-cols-1 @min-[680px]:grid-cols-2 gap-1.5 content-start">
                    {[
                      { btn: 'DIR', kb: 'Setas / WASD', desc: 'Navegar menus, listas e avançar/voltar 10s' },
                      { btn: 'B', kb: 'Enter / Z', desc: 'Confirmar, abrir item ou pausar/retomar' },
                      { btn: 'A', kb: 'Backspace / X', desc: 'Voltar à tela anterior ou fechar menu' },
                      { btn: 'X', kb: 'Espaço / C', desc: 'Clima completo (Início), trocar abas ou ocultar OSD' },
                      { btn: 'Y', kb: 'M / V', desc: 'Atualizar listas, trocar cidade ou Opções no início' },
                      { btn: 'L1 / R1', kb: 'Q / E', desc: 'Pesquisar (TV/Séries/Vídeos) ou trocar faixa' },
                      { btn: 'START', kb: 'P', desc: 'Pausar / retomar reprodução rapidamente' },
                      { btn: 'SELECT', kb: 'Tab / O', desc: 'Abrir opções da tela atual e atualizações' },
                    ].map((cmd) => (
                      <div
                        key={cmd.btn}
                        style={{
                          ...modernPanelStyle(theme, 11),
                        }}
                        className="px-3 py-2 flex items-center gap-2.5"
                      >
                        <span
                          style={{
                            backgroundColor: rgbToRgba(theme.accent, 0.18),
                            color: theme.accent,
                            border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                          }}
                          className="px-2 py-1 rounded-lg text-[11.5px] font-extrabold min-w-[64px] text-center shrink-0"
                        >
                          {cmd.btn}
                        </span>
                        <div className="min-w-0">
                          <div style={{ color: theme.text }} className="text-[13px] font-bold leading-snug">
                            {cmd.desc}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[10.5px]">
                            Teclado: {cmd.kb}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (tutorialFromOptions) {
                        setTutorialFromOptions(false);
                        openOptionsScreen('root');
                      } else {
                        setTutorialDone(true);
                        setScreen(lastSeenVersion !== APP_VERSION ? 'changelog' : 'home');
                      }
                    }}
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.bg,
                      boxShadow: `0 0 18px ${rgbToRgba(theme.accent, 0.35)}`,
                    }}
                    className="mt-3 w-full py-2.5 rounded-xl text-[14px] font-extrabold cursor-pointer hover:brightness-110 transition-all shrink-0"
                  >
                    {tutorialFromOptions
                      ? 'B ou A  •  Voltar às Opções'
                      : 'B  •  Entendi, começar a usar o K PLAYER'}
                  </button>
                </div>
              </div>
            )}

            {/* ==================== ONE-TIME POST-UPDATE CHANGELOG (SHOWN ONCE PER VERSION) ==================== */}
            {screen === 'changelog' && (() => {
              const ver = updateStatus?.currentVersion ?? APP_VERSION;
              const notes =
                updateStatus?.notes && updateStatus.notes.length > 0 && updateStatus.latestVersion === ver
                  ? updateStatus.notes.slice(0, 6)
                  : DEFAULT_CHANGELOG_NOTES;
              const handleDismissChangelog = () => {
                setLastSeenVersion(APP_VERSION);
                try {
                  localStorage.setItem('kp_last_seen_version', JSON.stringify(APP_VERSION));
                } catch {
                  // Ignore storage errors
                }
                setScreen('home');
              };

              return (
                <div className="w-full h-full relative overflow-hidden flex flex-col">
                  <ModernBackdrop theme={theme} />
                  <HeaderBar
                    theme={theme}
                    section="NOVIDADES"
                    location={locationLabel}
                  />
                  <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-4 flex flex-col w-full max-w-[820px] mx-auto">
                    <div className="shrink-0 mb-3 flex items-center justify-between gap-2">
                      <div>
                        <h2
                          style={{ color: theme.text }}
                          className="text-[21px] @min-[540px]:text-[25px] font-extrabold leading-tight"
                        >
                          Novidades da versão v{ver}
                        </h2>
                        <p style={{ color: theme.muted }} className="text-[12px] @min-[540px]:text-[13px] mt-0.5">
                          O que mudou nesta atualização • exibido apenas uma vez
                        </p>
                      </div>
                      <span
                        style={{
                          backgroundColor: rgbToRgba(theme.accent, 0.16),
                          border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                          color: theme.accent,
                        }}
                        className="px-2.5 py-1 rounded-full text-[11px] font-extrabold shrink-0"
                      >
                        v{ver}
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto kp-scroll space-y-2 pr-0.5">
                      {notes.map((item, idx) => (
                        <div
                          key={idx}
                          style={{ ...modernPanelStyle(theme, 12) }}
                          className="px-3.5 py-2.5 flex items-start gap-3"
                        >
                          <span
                            style={{
                              backgroundColor: theme.accent,
                              boxShadow: `0 0 8px ${rgbToRgba(theme.accent, 0.55)}`,
                            }}
                            className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                          />
                          <div
                            style={{ color: theme.text }}
                            className="text-[13px] @min-[540px]:text-[13.5px] font-semibold leading-snug"
                          >
                            {item}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleDismissChangelog}
                      style={{
                        backgroundColor: theme.accent,
                        color: theme.bg,
                        boxShadow: `0 0 18px ${rgbToRgba(theme.accent, 0.35)}`,
                      }}
                      className="mt-3 w-full py-2.5 rounded-xl text-[14px] font-extrabold cursor-pointer hover:brightness-110 transition-all shrink-0"
                    >
                      B  •  Continuar para o K PLAYER
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ==================== TERMS OF USE ==================== */}
            {screen === 'terms' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('Termos de uso', language)}
                  location={locationLabel}
                />
                <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-[54px] flex flex-col w-full max-w-[820px] mx-auto">
                  <h2 style={{ color: theme.text }} className="text-[22px] @min-[540px]:text-[26px] font-extrabold shrink-0">
                    {tr('Termos de uso', language)}
                  </h2>
                  <div
                    style={{ ...modernPanelStyle(theme, 16) }}
                    className="mt-3 flex-1 min-h-0 p-4 @min-[540px]:p-5 flex flex-col justify-between gap-3 overflow-y-auto kp-scroll"
                  >
                    <div>
                      <div style={{ color: theme.accent }} className="text-[17px] @min-[540px]:text-[19px] font-bold mb-2.5">
                        {tr(TERMS_PAGES[termsPage].title, language)}
                      </div>
                      <p style={{ color: theme.text }} className="text-[13px] @min-[540px]:text-[14px] leading-[1.6]">
                        {TERMS_PAGES[termsPage]?.body[language]}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setTermsPage((p) => (p + TERMS_PAGES.length - 1) % TERMS_PAGES.length)
                        }
                        style={{ backgroundColor: theme.elevated, color: theme.text }}
                        className="px-3 py-1 rounded-full text-xs cursor-pointer hover:brightness-110"
                      >
                        ◀
                      </button>
                      <span style={{ color: theme.muted }} className="text-[12px] font-semibold">
                        {termsPage + 1} / {TERMS_PAGES.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTermsPage((p) => (p + 1) % TERMS_PAGES.length)}
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
                    { key: 'DIR', label: `${termsPage + 1} / ${TERMS_PAGES.length}` },
                  ]}
                />
              </div>
            )}

            {/* ==================== TRANSPARENCY NOTICE BEFORE IPTV / RADIO ==================== */}
            {screen === 'notice' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('TRANSPARÊNCIA', language)}
                  location={locationLabel}
                />
                <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-[54px] flex flex-col w-full max-w-[820px] mx-auto">
                  <div className="flex items-center justify-between gap-2 shrink-0">
                    <div className="min-w-0">
                      <h2 style={{ color: theme.text }} className="text-[19px] @min-[540px]:text-[22px] font-extrabold leading-tight truncate">
                        {tr('Aviso de Transparência', language)}
                      </h2>
                      <div style={{ color: theme.muted }} className="text-[11px] @min-[540px]:text-[11.5px] mt-0.5 truncate">
                        {tr('Antes de acessar Rádio Online ou IPTV', language)}
                      </div>
                    </div>
                    <span
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.accent, 0.2),
                        color: theme.accent,
                        border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                      }}
                      className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
                    >
                      {pendingStreamTarget === 'iptv' ? 'IPTV' : tr('Rádio Online', language)}
                    </span>
                  </div>

                  <div
                    style={{ ...modernPanelStyle(theme, 14) }}
                    className="mt-2.5 flex-1 min-h-0 p-4 flex flex-col justify-between gap-3 overflow-y-auto kp-scroll"
                  >
                    <div className="space-y-2.5">
                      <div>
                        <div style={{ color: theme.accent }} className="text-[12.5px] font-bold">
                          1. {tr('Fontes abertas e agregadores públicos', language)}
                        </div>
                        <p style={{ color: theme.text }} className="text-[12px] @min-[540px]:text-[12.5px] leading-[1.52] mt-0.5">
                          {tr(
                            'Todos os dados de IPTV e Rádio são obtidos de agregadores públicos da internet e fontes abertas (como Radio-Browser e catálogos web públicos). O KPlayer é apenas um reprodutor e não hospeda nem transmite conteúdo próprio.',
                            language
                          )}
                        </p>
                      </div>

                      <div
                        style={{ borderTop: `1px solid ${rgbToRgba(theme.text, 0.08)}` }}
                        className="pt-2"
                      >
                        <div style={{ color: theme.accent }} className="text-[12.5px] font-bold">
                          2. {tr('Você tem direito de colocar seu próprio link', language)}
                        </div>
                        <p style={{ color: theme.text }} className="text-[12px] @min-[540px]:text-[12.5px] leading-[1.52] mt-0.5">
                          {tr(
                            'Com total transparência, você pode inserir seus próprios links e listas .m3u/.m3u8 (pelo teclado virtual ou na pasta iptv_usuario/) e rádios .pls/.m3u (em radios_usuario/) a qualquer momento.',
                            language
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 shrink-0">
                      <button
                        type="button"
                        onClick={acceptStreamNotice}
                        style={{ backgroundColor: theme.accent, color: theme.bg }}
                        className="flex-1 min-w-[160px] py-2 px-3 rounded-xl text-[12px] font-extrabold cursor-pointer hover:brightness-110 transition-all"
                      >
                        B • {tr('Concordo e continuar', language)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTermsReturn('notice');
                          setTermsPage(1);
                          setScreen('terms');
                        }}
                        style={{
                          backgroundColor: theme.elevated,
                          color: theme.text,
                          border: `1px solid ${rgbToRgba(theme.text, 0.12)}`,
                        }}
                        className="py-2 px-3 rounded-xl text-[11.5px] font-bold cursor-pointer hover:brightness-110 transition-all"
                      >
                        Y • {tr('Ler termos completos', language)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setScreen(noticeReturn)}
                        style={{
                          backgroundColor: theme.elevated,
                          color: theme.muted,
                        }}
                        className="py-2 px-3 rounded-xl text-[11.5px] font-bold cursor-pointer hover:brightness-110 transition-all"
                      >
                        A • {tr('Voltar', language)}
                      </button>
                    </div>
                  </div>
                </div>

                <FooterBar
                  theme={theme}
                  themeIndex={themeIndex}
                  toast={toast}
                  hints={[
                    { key: 'B', label: tr('Concordo e continuar', language) },
                    { key: 'Y', label: tr('Termos de uso', language) },
                    { key: 'A', label: tr('Voltar', language) },
                  ]}
                />
              </div>
            )}

            {/* ==================== DASHBOARD / HOME (v2.0.7: WEATHER-REACTIVE HERO + MINI PLAYER TOP + LARGE WEATHER BOTTOM) ==================== */}
            {screen === 'home' && (() => {
              const wxInfo = weatherData
                ? describeWeatherCode(weatherData.current.weatherCode, weatherData.current.isDay)
                : null;
              const weatherHero = getWeatherHomeHero(weatherData, weatherMoodSeed);
              const cityShort = formatWeatherLocationShort(weatherData?.location ?? weatherLocation);
              const todayDaily = weatherData?.daily?.[0];
              const nowTitle = activeRadio
                ? activeRadio.name
                : activeTrack
                ? activeTrack.title
                : tr('Nada tocando', language);
              const nowSub = activeRadio
                ? `${activeRadio.country} • ${tr('AO VIVO', language)}`
                : activeTrack
                ? activeTrack.artist || tr('Reprodução local', language)
                : tr('Pronto para dar o play', language);

              return (
              <div className="w-full h-full relative overflow-hidden flex flex-col kp-screen-enter">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('DASHBOARD', language)}
                  location={locationLabel}
                />

                <div className="relative z-10 flex-1 min-h-0 px-4 pt-2.5 pb-3 flex flex-col justify-between gap-2.5 overflow-y-auto kp-scroll w-full max-w-[1120px] mx-auto">
                  {/* Top Row: Weather-reactive Hero (or default "Seu som. Sua tela." when Weather is OFF) + Right Widget */}
                  <div className="shrink-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {weatherHero ? (
                        <>
                          <div className="flex flex-wrap items-baseline gap-x-2 leading-tight">
                            <span
                              style={{ color: theme.text }}
                              className="text-[21px] @min-[520px]:text-[26px] @min-[840px]:text-[30px] font-extrabold tracking-tight"
                            >
                              {weatherHero.headline}
                            </span>
                            <span
                              style={{ color: theme.accent }}
                              className="text-[20px] @min-[520px]:text-[24px] @min-[840px]:text-[28px] font-extrabold tracking-tight tabular-nums"
                            >
                              • {weatherHero.accentSuffix}
                            </span>
                          </div>
                          <p
                            style={{ color: theme.muted }}
                            className="text-[12px] @min-[520px]:text-[13px] mt-0.5 truncate"
                          >
                            {weatherHero.subtitle}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-baseline gap-x-2.5 leading-tight">
                            <span style={{ color: theme.text }} className="text-[24px] @min-[520px]:text-[29px] @min-[840px]:text-[33px] font-extrabold tracking-tight">
                              {tr('Seu som.', language)}
                            </span>
                            <span style={{ color: theme.muted }} className="text-[24px] @min-[520px]:text-[29px] @min-[840px]:text-[33px] font-extrabold tracking-tight">
                              {tr('Sua tela.', language)}
                            </span>
                          </div>
                          <p style={{ color: theme.muted }} className="text-[12px] @min-[520px]:text-[13px] mt-0.5 truncate">
                            {tr('Músicas, vídeos, rádios e TV ao vivo num player só.', language)}
                          </p>
                        </>
                      )}
                    </div>

                    {!homeLayoutInverted ? (
                      /* DEFAULT v2.0.6 TOP-RIGHT: Compact Mini Player showing ONLY what's playing */
                      <button
                        type="button"
                        onClick={() => setScreen(activeRadio ? 'radio' : 'music')}
                        style={{
                          ...modernCardStyle(theme, isPlaying && !isPaused, 14, theme.panel),
                        }}
                        className="px-3 py-1.5 flex items-center gap-2.5 shrink-0 max-w-[48%] cursor-pointer transition-all hover:brightness-110 text-left"
                        title="Abrir Player"
                      >
                        <VinylArt
                          theme={theme}
                          size={34}
                          coverUrl={activeTrack?.coverUrl}
                          centerLogoUrl={activeRadio?.favicon || undefined}
                          spinning={isPlaying && !isPaused}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 leading-none">
                            <span
                              style={{ backgroundColor: isPlaying && !isPaused ? theme.accent : theme.dim }}
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isPlaying && !isPaused ? 'animate-pulse' : ''}`}
                            />
                            <span
                              style={{ color: isPlaying ? theme.accent : theme.dim }}
                              className="text-[9.5px] font-extrabold tracking-wider uppercase whitespace-nowrap"
                            >
                              {isPlaying
                                ? !isPaused
                                  ? 'Reproduzindo'
                                  : tr('PAUSADO', language)
                                : 'Mini Player'}
                            </span>
                          </div>
                          <div
                            style={{ color: theme.text }}
                            className="text-[12.5px] @min-[520px]:text-[13.5px] font-extrabold truncate max-w-[135px] @min-[520px]:max-w-[185px] mt-0.5"
                          >
                            {nowTitle}
                          </div>
                        </div>
                      </button>
                    ) : (
                      /* INVERTED TOP-RIGHT: Compact Open-Meteo Weather Widget (Button X) */
                      <button
                        type="button"
                        onClick={() => openWeatherScreen('auto')}
                        style={{
                          ...modernCardStyle(theme, false, 14, theme.panel),
                        }}
                        className="px-3 py-1.5 flex items-center gap-2 shrink-0 max-w-[46%] cursor-pointer transition-all hover:brightness-110 text-right"
                        title="Abrir Clima (botão X)"
                      >
                        <div className="flex items-center justify-center shrink-0">
                          <WeatherGlyph
                            kind={wxInfo?.icon ?? 'partly-day'}
                            size={22}
                            color={theme.accent}
                          />
                        </div>
                        <div className="min-w-0">
                          {weatherData ? (
                            <>
                              <div className="flex items-baseline justify-end gap-1.5 leading-none">
                                <span
                                  style={{ color: theme.text }}
                                  className="text-[16px] @min-[520px]:text-[18px] font-extrabold tabular-nums"
                                >
                                  {Math.round(weatherData.current.temp)}°C
                                </span>
                                <span style={{ color: theme.accent }} className="text-[10px] font-extrabold shrink-0">
                                  X
                                </span>
                              </div>
                              <div
                                style={{ color: theme.muted }}
                                className="text-[10.5px] @min-[520px]:text-[11px] truncate max-w-[125px] @min-[520px]:max-w-[165px] mt-0.5"
                              >
                                {cityShort || wxInfo?.label}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-end gap-1 leading-none">
                                <span style={{ color: theme.text }} className="text-[12px] font-bold whitespace-nowrap">
                                  Clima
                                </span>
                                <span style={{ color: theme.accent }} className="text-[10px] font-extrabold">
                                  X
                                </span>
                              </div>
                              <div style={{ color: theme.muted }} className="text-[10px] truncate mt-0.5">
                                {weatherLoading ? 'Carregando...' : 'Definir local'}
                              </div>
                            </>
                          )}
                        </div>
                      </button>
                    )}
                  </div>

                  {/* Adaptive Category Card Grid */}
                  <div className="grid grid-cols-2 @min-[520px]:grid-cols-3 gap-2.5 @min-[520px]:gap-3.5 flex-1 content-center">
                    {(
                      [
                        {
                          kind: 'media',
                          spriteCol: 0,
                          tag: tr('LRC & Cinema', language),
                          name: tr('Músicas e Vídeos', language),
                          desc: tr('Áudio, vídeo e letras', language),
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
                          kind: 'news',
                          spriteCol: -1,
                          tag: tr('Brasil • Hoje', language),
                          name: tr('Notícias', language),
                          desc: tr('Últimas do dia', language),
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
                          onClick={() => {
                            playUiSfx('confirm');
                            openDashboardCard(i);
                          }}
                          style={{
                            borderRadius: 16,
                            border: focused
                              ? `2px solid ${theme.accent}`
                              : `1px solid ${themeHairline(theme)}`,
                            background: `linear-gradient(180deg, ${gradTop} 0%, ${theme.panel} 100%)`,
                            boxShadow: focused
                              ? `0 6px 22px ${rgbToRgba(theme.accent, 0.38)}`
                              : undefined,
                          }}
                          className={`relative text-left p-2.5 @min-[520px]:p-3 min-h-[86px] @min-[520px]:min-h-[96px] @min-[820px]:min-h-[112px] flex flex-col justify-between cursor-pointer kp-tile-anim active:scale-[0.98] ${
                            focused ? '-translate-y-[2px]' : 'hover:-translate-y-[1px]'
                          }`}
                        >
                          <div className="flex items-start gap-2 @min-[520px]:gap-2.5">
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                backgroundColor: rgbToRgba(theme.bg, 0.65),
                                border: `1px solid ${mixRgb(theme.panel, theme.text, 0.09)}`,
                              }}
                              className="flex items-center justify-center shrink-0"
                            >
                              {cardItem.spriteCol < 0 ? (
                                <Newspaper style={{ color: theme.accent }} className="w-5 h-5" />
                              ) : (
                                <KpSprite
                                  sheet="categorias"
                                  col={cardItem.spriteCol}
                                  themeIndex={themeIndex}
                                  size={24}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div
                                style={{ color: theme.accent }}
                                className="text-[10px] @min-[520px]:text-[10.5px] font-bold leading-tight truncate pr-4"
                              >
                                {cardItem.tag}
                              </div>
                            </div>
                            <div className="absolute right-2.5 top-2.5 @min-[520px]:right-3 @min-[520px]:top-3">
                              <TileArrow color={focused ? theme.accent : theme.dim} size={11} />
                            </div>
                          </div>

                          <div className="mt-2">
                            <div
                              style={{ color: theme.text }}
                              className="text-[15.5px] @min-[520px]:text-[17px] font-extrabold leading-tight truncate"
                            >
                              {cardItem.name}
                            </div>
                            <div style={{ color: theme.muted }} className="text-[10.5px] truncate mt-0.5">
                              {cardItem.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Bottom Large Area: DEFAULT = Large Open-Meteo Weather Card | INVERTED = Full Now Playing Player */}
                  {!homeLayoutInverted ? (
                    <button
                      type="button"
                      onClick={() => openWeatherScreen('auto')}
                      style={{
                        ...modernPanelStyle(theme, 18),
                      }}
                      className="w-full min-h-[106px] @min-[520px]:min-h-[120px] px-4 @min-[520px]:px-5 py-3 flex items-center justify-between gap-4 shrink-0 text-left cursor-pointer transition-all hover:brightness-105"
                      title="Abrir aplicativo completo de Clima (botão X)"
                    >
                      {weatherData ? (
                        <>
                          <div className="flex items-center gap-3.5 @min-[520px]:gap-4 min-w-0">
                            <div
                              style={{
                                backgroundColor: rgbToRgba(theme.accent, 0.14),
                                border: `1px solid ${rgbToRgba(theme.accent, 0.3)}`,
                              }}
                              className="w-[54px] h-[54px] @min-[520px]:w-[62px] @min-[520px]:h-[62px] rounded-2xl flex items-center justify-center shrink-0"
                            >
                              <WeatherGlyph
                                kind={wxInfo?.icon ?? 'partly-day'}
                                size={36}
                                color={theme.accent}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2.5">
                                <span
                                  style={{ color: theme.text }}
                                  className="text-[32px] @min-[520px]:text-[38px] font-black leading-none tabular-nums"
                                >
                                  {Math.round(weatherData.current.temp)}°C
                                </span>
                                {todayDaily && (
                                  <span style={{ color: theme.muted }} className="text-[12px] font-bold tabular-nums">
                                    ↑{Math.round(todayDaily.tempMax)}° ↓{Math.round(todayDaily.tempMin)}°
                                  </span>
                                )}
                              </div>
                              <div
                                style={{ color: theme.text }}
                                className="text-[14.5px] @min-[520px]:text-[16px] font-extrabold truncate mt-1"
                              >
                                {cityShort || 'Clima Atual'}
                              </div>
                              <div style={{ color: theme.muted }} className="text-[12px] truncate">
                                {wxInfo?.label} · Sensação {Math.round(weatherData.current.apparentTemp)}°C
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end justify-between gap-2 shrink-0 text-right">
                            <span
                              style={{
                                backgroundColor: rgbToRgba(theme.accent, 0.18),
                                color: theme.accent,
                                border: `1px solid ${rgbToRgba(theme.accent, 0.4)}`,
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold whitespace-nowrap"
                            >
                              X • Clima completo
                            </span>
                            <div style={{ color: theme.muted }} className="text-[11.5px] tabular-nums hidden @min-[480px]:block">
                              Umid. {Math.round(weatherData.current.humidity)}% · Vento {Math.round(weatherData.current.windSpeed)} km/h
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-4 w-full">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div
                              style={{
                                backgroundColor: rgbToRgba(theme.accent, 0.14),
                                border: `1px solid ${rgbToRgba(theme.accent, 0.3)}`,
                              }}
                              className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0"
                            >
                              <WeatherGlyph kind="partly-day" size={32} color={theme.accent} />
                            </div>
                            <div className="min-w-0">
                              <div style={{ color: theme.accent }} className="text-[10.5px] font-extrabold uppercase tracking-wider">
                                OPEN-METEO • CLIMA
                              </div>
                              <div style={{ color: theme.text }} className="text-[16px] @min-[520px]:text-[18px] font-extrabold truncate mt-0.5">
                                {weatherLoading ? 'Carregando previsão do tempo...' : 'Configure sua localização do clima'}
                              </div>
                              <div style={{ color: theme.muted }} className="text-[12px] truncate">
                                Pressione X para usar localização por IP ou pesquisar cidade manualmente
                              </div>
                            </div>
                          </div>
                          <span
                            style={{ backgroundColor: theme.accent, color: theme.bg }}
                            className="px-3 py-1.5 rounded-xl text-[11.5px] font-extrabold shrink-0"
                          >
                            X • Configurar
                          </span>
                        </div>
                      )}
                    </button>
                  ) : (
                    /* INVERTED BOTTOM: Full Now Playing Card */
                    <div
                      style={{
                        ...modernPanelStyle(theme, 18),
                      }}
                      className="w-full min-h-[100px] @min-[520px]:min-h-[112px] px-3.5 @min-[520px]:px-4 py-2 flex items-center justify-between gap-2 shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => setScreen(activeRadio ? 'radio' : 'music')}
                        className="flex items-center gap-3 @min-[520px]:gap-4 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <VinylArt
                          theme={theme}
                          size={72}
                          coverUrl={activeTrack?.coverUrl}
                          centerLogoUrl={activeRadio?.favicon || undefined}
                          spinning={isPlaying && !isPaused}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            style={{ color: isPlaying ? theme.accent : theme.dim }}
                            className="text-[10px] @min-[520px]:text-[10.5px] font-bold tracking-wider uppercase"
                          >
                            {isPlaying
                              ? !isPaused
                                ? tr('TOCANDO AGORA', language)
                                : tr('PAUSADO', language)
                              : tr('NADA TOCANDO', language)}
                          </div>
                          <div
                            style={{ color: theme.text }}
                            className="text-[15.5px] @min-[520px]:text-[18px] font-extrabold truncate leading-snug mt-0.5"
                          >
                            {nowTitle}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[12px] truncate">
                            {nowSub}
                          </div>
                          <div className="mt-1.5 hidden @min-[440px]:block overflow-hidden max-w-full">
                            <AudioVisualizer
                              theme={theme}
                              bars={28}
                              width={180}
                              height={13}
                              active={isPlaying && !isPaused}
                            />
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center justify-center gap-2 @min-[520px]:gap-3 pl-2 pr-0.5 shrink-0">
                        <TransportSkipButton
                          theme={theme}
                          direction="prev"
                          size={28}
                          onClick={() => stepTrack(-1)}
                          title="Anterior"
                        />
                        <PlayDisc
                          theme={theme}
                          size={42}
                          playing={isPlaying && !isPaused}
                          onClick={togglePlayPause}
                          title="Reproduzir / Pausar"
                        />
                        <TransportSkipButton
                          theme={theme}
                          direction="next"
                          size={28}
                          onClick={() => stepTrack(1)}
                          title="Próxima"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <FooterBar theme={theme} themeIndex={themeIndex} toast={toast} />
              </div>
              );
            })()}

            {/* ==================== LIBRARY / FILE BROWSER (v2.0.6: FULL-SCREEN, LARGER FONTS, TYPING SEARCH) ==================== */}
            {screen === 'library' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={
                    libLocationsView
                      ? tr('ARQUIVOS', language)
                      : tr('Músicas e Vídeos', language).toUpperCase()
                  }
                  location={locationLabel}
                />

                <div className="relative z-10 flex-1 min-h-0 px-4 pt-2.5 pb-3 flex flex-col w-full max-w-[1040px] mx-auto">
                  {/* Top Library Filter + Typing Search Banner */}
                  <div
                    style={{ ...modernPanelStyle(theme, 14) }}
                    className="px-3.5 py-2.5 flex flex-col gap-2 shrink-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <KpSprite sheet="categorias" col={2} themeIndex={themeIndex} size={24} />
                        <span style={{ color: theme.text }} className="text-[15px] @min-[520px]:text-[16px] font-extrabold truncate">
                          {libFavoritesOnly
                            ? tr('Minhas favoritas', language)
                            : libLocationsView
                            ? tr('Escolha o local das suas mídias', language)
                            : libFilter === 2
                            ? 'Meus Vídeos'
                            : tr('Pastas: /roms(2)/bgmusic e /roms(2)/videos', language)}
                        </span>
                      </div>

                      {!libLocationsView && (
                        <div className="flex items-center gap-1.5 w-full @min-[520px]:w-auto">
                          <input
                            type="text"
                            value={libSearchQuery}
                            onChange={(e) => {
                              setLibSearchQuery(e.target.value);
                              setLibSelected(0);
                            }}
                            placeholder={
                              libFilter === 2
                                ? 'Pesquisar vídeo digitando...'
                                : 'Pesquisar arquivo ou música...'
                            }
                            style={{
                              backgroundColor: rgbToRgba(theme.elevated, 0.95),
                              color: theme.text,
                              border: `1px solid ${libSearchQuery ? theme.accent : themeHairline(theme)}`,
                            }}
                            className="flex-1 @min-[520px]:w-[220px] px-3 py-1 rounded-lg text-[12.5px] outline-none"
                          />
                          {libSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setLibSearchQuery('')}
                              style={{
                                backgroundColor: rgbToRgba(theme.elevated, 0.9),
                                color: theme.muted,
                                border: `1px solid ${themeHairline(theme)}`,
                              }}
                              className="px-2.5 py-1 rounded-lg text-[12px] font-bold cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 @min-[520px]:gap-2">
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
                              height: 26,
                            }}
                            className="px-3.5 @min-[520px]:min-w-[92px] text-[12.5px] font-bold cursor-pointer transition-all"
                          >
                            {tr(tab, language)}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ backgroundColor: theme.elevated, color: theme.accent }}
                        className="ml-auto px-3 h-[26px] rounded-full text-[12px] font-bold cursor-pointer hover:brightness-110 whitespace-nowrap"
                      >
                        + {tr('Importar do dispositivo', language)}
                      </button>
                    </div>
                  </div>

                  {/* Locations View OR Full Scrollable Files List */}
                  <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 space-y-2">
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
                              ...modernCardStyle(theme, focus, 11, theme.panel),
                              height: 66,
                            }}
                            className="w-full px-4 flex items-center justify-between cursor-pointer text-left transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <KpSprite sheet="categorias" col={2} themeIndex={themeIndex} size={28} />
                              <div className="min-w-0">
                                <div style={{ color: theme.text }} className="text-[16.5px] @min-[520px]:text-[18px] font-extrabold truncate">
                                  {loc.name}
                                </div>
                                <div style={{ color: theme.muted }} className="text-[12.5px] truncate">
                                  {loc.path}
                                </div>
                              </div>
                            </div>
                            <span style={{ color: theme.accent }} className="text-[14px] font-bold shrink-0 pl-2">
                              {tr('Abrir', language)}
                            </span>
                          </button>
                        );
                      })
                    ) : filteredLibrary.length === 0 ? (
                      <div className="py-12 text-center px-6">
                        <div style={{ color: theme.text }} className="text-[20px] font-bold">
                          {libSearchQuery
                            ? 'Nenhum arquivo encontrado para a pesquisa'
                            : tr('Nenhuma mídia neste filtro', language)}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[13.5px] mt-2">
                          {libSearchQuery
                            ? 'Tente digitar outro termo ou limpe a busca acima.'
                            : tr('A volta. Esquerda/direita muda o filtro. Y atualiza.', language)}
                        </div>
                        <button
                          type="button"
                          onClick={() => (libSearchQuery ? setLibSearchQuery('') : fileInputRef.current?.click())}
                          style={{
                            backgroundColor: theme.accent,
                            color: theme.bg,
                            boxShadow: `0 0 16px ${rgbToRgba(theme.accent, 0.4)}`,
                          }}
                          className="mt-4 px-5 py-2 rounded-full text-[13.5px] font-bold cursor-pointer"
                        >
                          {libSearchQuery ? 'Limpar pesquisa' : `+ ${tr('Importar do dispositivo', language)}`}
                        </button>
                      </div>
                    ) : (
                      filteredLibrary.map((item, realIdx) => {
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
                              ...modernCardStyle(theme, focus, 10, theme.panel),
                              height: 54,
                            }}
                            className="w-full px-3.5 flex items-center justify-between text-left cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <KpSprite
                                sheet="categorias"
                                col={item.kind === 'audio' ? 0 : 1}
                                themeIndex={themeIndex}
                                size={26}
                              />
                              <div className="min-w-0">
                                <div style={{ color: theme.text }} className="text-[16px] font-bold truncate">
                                  {item.name}
                                </div>
                                <div style={{ color: theme.dim }} className="text-[11.5px]">
                                  {item.kind === 'audio' ? tr('Áudio', language) : tr('Vídeo', language)}
                                  {item.lyrics ? ' • LRC' : ''}
                                </div>
                              </div>
                            </div>
                            <span style={{ color: theme.muted }} className="text-[13px] font-semibold shrink-0 pl-2">
                              {formatBytes(item.sizeBytes)}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {!libLocationsView && (
                    <div style={{ color: theme.dim }} className="pt-1.5 text-[12px] font-semibold shrink-0">
                      {filteredLibrary.length ? libSelected + 1 : 0} / {filteredLibrary.length}
                    </div>
                  )}
                </div>

                <FooterBar theme={theme} themeIndex={themeIndex} toast={toast} />
              </div>
            )}

            {/* ==================== MUSIC PLAYER (ADAPTIVE MODERN SKIN) ==================== */}
            {screen === 'music' && (
              <div className="w-full h-full relative overflow-hidden flex flex-col">
                <ModernBackdrop theme={theme} />
                <HeaderBar
                  theme={theme}
                  section={tr('MÚSICAS', language)}
                  location={locationLabel}
                />

                <div className="relative z-10 flex-1 min-h-0 px-4 pt-2.5 pb-[52px] flex flex-col gap-2.5 w-full max-w-[1160px] mx-auto">
                  {/* Main Split: Album Metadata + Lyrics/Queue/Folder */}
                  <div className="flex-1 min-h-0 grid grid-cols-1 @min-[540px]:grid-cols-[minmax(216px,36%)_1fr] gap-3 overflow-hidden">
                    {/* Left Album & Metadata Card */}
                    <div
                      style={{
                        ...modernPanelStyle(theme, 16),
                      }}
                      className="p-3 flex flex-row @min-[540px]:flex-col items-center gap-3 @min-[540px]:gap-0 @min-[540px]:justify-center overflow-y-auto kp-scroll"
                    >
                      <VinylArt
                        theme={theme}
                        size={108}
                        coverUrl={activeTrack?.coverUrl}
                        spinning={isPlaying && !isPaused && !activeRadio}
                      />

                      <div className="min-w-0 flex-1 @min-[540px]:flex-none @min-[540px]:w-full @min-[540px]:mt-2.5 flex flex-col @min-[540px]:items-center">
                        <div
                          style={{ color: theme.text }}
                          className="text-[15px] @min-[540px]:text-[16px] font-extrabold @min-[540px]:text-center leading-tight line-clamp-2 w-full"
                        >
                          {activeTrack?.title ?? tr('Pronto para dar o play', language)}
                        </div>
                        <div
                          style={{ color: theme.accent }}
                          className="mt-1 text-[12px] font-semibold truncate w-full @min-[540px]:text-center"
                        >
                          {activeTrack?.artist ?? tr('Artista não informado', language)}
                        </div>
                        <div
                          style={{ color: theme.muted }}
                          className="text-[11px] truncate w-full @min-[540px]:text-center"
                        >
                          {activeTrack?.album ?? tr('Áudio local', language)}
                        </div>

                        <div className="mt-2 hidden @min-[540px]:flex justify-center max-w-full overflow-hidden">
                          <AudioVisualizer
                            theme={theme}
                            bars={26}
                            width={184}
                            height={15}
                            active={isPlaying && !isPaused && !activeRadio}
                          />
                        </div>

                        <div
                          style={{ backgroundColor: themeHairline(theme) }}
                          className="hidden @min-[540px]:block w-full h-[1px] my-2"
                        />

                        <div style={{ color: theme.text }} className="text-[10.5px] @min-[540px]:text-[11px] w-full truncate mt-1 @min-[540px]:mt-0">
                          {activeTrack?.format ?? 'AUDIO'} • {formatBytes(activeTrack?.sizeBytes ?? 0)} •{' '}
                          {formatTime(durationMs)}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[10.5px] @min-[540px]:text-[11px] w-full truncate mt-0.5 hidden @min-[540px]:block">
                          {activeTrack?.sampleRate
                            ? `${(activeTrack.sampleRate / 1000).toFixed(1)} kHz • ${activeTrack.channels ?? 2} ${tr('canais', language)}`
                            : tr('Analisando dados técnicos...', language)}
                        </div>
                        {activeTrack?.bitrateKbps && (
                          <div style={{ color: theme.accent }} className="text-[11px] font-semibold w-full truncate mt-0.5 hidden @min-[540px]:block">
                            {activeTrack.bitrateKbps} kbps
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Switchable Panel: Letras / Fila / Pasta */}
                    <div
                      style={{
                        ...modernPanelStyle(theme, 16),
                      }}
                      className="p-3 flex flex-col min-h-0 overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-2 shrink-0">
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
                              className="text-[12.5px] @min-[520px]:text-[13px] font-bold cursor-pointer transition-all"
                            >
                              {tr(tab, language)}
                            </button>
                          );
                        })}
                      </div>

                      {audioPanel === 0 ? (
                        <div className="flex-1 min-h-0 flex flex-col mt-3 overflow-hidden">
                          <div
                            style={{ color: theme.accent }}
                            className="text-[10px] font-bold tracking-wider uppercase shrink-0"
                          >
                            {activeTrack?.lyrics?.length
                              ? tr('LETRAS SINCRONIZADAS', language)
                              : tr('LETRAS', language)}
                          </div>
                          {activeTrack?.lyrics?.length ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-3 text-center">
                              <div style={{ color: theme.muted }} className="text-[13.5px] min-h-[20px]">
                                {activeLyricIndex > 0 ? activeTrack.lyrics[activeLyricIndex - 1].text : ''}
                              </div>
                              <div
                                style={{ color: theme.text }}
                                className="text-[18px] @min-[700px]:text-[22px] font-extrabold leading-snug"
                              >
                                {activeLyricIndex >= 0
                                  ? activeTrack.lyrics[activeLyricIndex].text
                                  : tr('Aguardando a letra...', language)}
                              </div>
                              <div style={{ color: theme.muted }} className="text-[13.5px] min-h-[20px]">
                                {activeLyricIndex + 1 < activeTrack.lyrics.length
                                  ? activeTrack.lyrics[activeLyricIndex + 1].text
                                  : ''}
                              </div>
                            </div>
                          ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                              <div style={{ color: theme.text }} className="text-[16px] font-bold">
                                {tr('Letras indisponíveis', language)}
                              </div>
                              <div style={{ color: theme.muted }} className="text-[12px] mt-2">
                                {tr('Use um .lrc com o mesmo nome do áudio.', language)}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1 min-h-0 flex flex-col mt-2.5 overflow-hidden">
                          <div style={{ color: theme.muted }} className="text-[11px] mb-2 truncate shrink-0">
                            {audioPanel === 2
                              ? '/roms/bgmusic  •  /roms2/bgmusic'
                              : `${audioTracks.length} ${tr('Músicas', language).toLowerCase()}`}
                          </div>
                          <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto kp-scroll pr-1">
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
                  </div>

                  {/* Adaptive Bottom Transport Bar */}
                  <div
                    style={{
                      ...modernPanelStyle(theme, 14),
                      minHeight: 56,
                    }}
                    className="w-full px-3 py-1.5 grid grid-cols-1 @min-[540px]:grid-cols-[minmax(146px,26%)_1fr_minmax(130px,24%)] items-center gap-2 shrink-0"
                  >
                    {/* Left column: Up Next */}
                    <div
                      style={{ borderRight: `1px solid ${themeHairline(theme)}` }}
                      className="hidden @min-[540px]:flex items-center gap-2.5 pr-2.5 h-[40px] min-w-0"
                    >
                      <div
                        style={{
                          backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                          color: theme.accent,
                        }}
                        className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center shrink-0"
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

                    {/* Center Transport + Progress */}
                    <div className="flex flex-col items-center justify-center px-1 @min-[540px]:px-3 gap-1.5">
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
                      className="hidden @min-[540px]:flex items-center justify-end gap-2 pl-2.5 h-[40px] min-w-0"
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
                fallbackUrls={activeVideoFallbacks}
                isLive={activeVideoLive}
                sectionLabel={activeVideoSection}
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

            {/* ==================== ONLINE RADIO (ADAPTIVE MODERN SKIN) ==================== */}
            {screen === 'radio' && (() => {
              const onAir = Boolean(activeRadio && isPlaying && !isPaused);
              const featured = activeRadio ?? selectedRadio;
              return (
                <div className="w-full h-full relative overflow-hidden flex flex-col">
                  <ModernBackdrop theme={theme} />
                  <HeaderBar
                    theme={theme}
                    section={tr('RÁDIO ONLINE', language)}
                    location={locationLabel}
                  />

                  <div className="relative z-10 flex-1 min-h-0 px-4 pt-2.5 pb-[52px] grid grid-cols-1 @min-[540px]:grid-cols-[minmax(216px,35%)_1fr] gap-3 overflow-hidden w-full max-w-[1160px] mx-auto">
                    {/* Left Station Tuner Card (compact bar on mobile, full sidebar on 4:3 / landscape) */}
                    <div
                      style={{
                        ...modernPanelStyle(theme, 16),
                      }}
                      className="p-2.5 @min-[540px]:p-3 flex flex-row @min-[540px]:flex-col items-center justify-between gap-2.5 @min-[540px]:gap-2 overflow-y-auto kp-scroll"
                    >
                      <div className="shrink-0">
                        <VinylArt
                          theme={theme}
                          size={72}
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
                        className="hidden @min-[540px]:inline-flex px-3.5 h-[19px] rounded-full items-center justify-center text-[10px] font-bold tracking-wider shrink-0"
                      >
                        {activeRadio ? tr('AO VIVO', language) : tr('RÁDIO ONLINE', language)}
                      </span>

                      <div className="min-w-0 flex-1 @min-[540px]:flex-none @min-[540px]:w-full @min-[540px]:text-center px-0.5">
                        <div style={{ color: theme.text }} className="text-[14px] @min-[540px]:text-[16px] font-extrabold truncate">
                          {featured?.name ?? tr('Estação online', language)}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[10.5px] @min-[540px]:text-[11px] truncate mt-0.5">
                          {featured?.tags || featured?.country || 'Internet'}
                        </div>
                        <div
                          style={{
                            backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                            color: theme.accent,
                          }}
                          className="mt-1.5 py-0.5 px-2.5 rounded-full text-[10px] @min-[540px]:text-[11px] font-bold truncate inline-block max-w-full"
                        >
                          {featured?.codec || 'STREAM'} • {featured?.bitrate ?? 0} kbps
                        </div>
                      </div>

                      <div className="hidden @min-[540px]:flex justify-center max-w-full overflow-hidden shrink-0">
                        <AudioVisualizer
                          theme={theme}
                          bars={26}
                          width={164}
                          height={12}
                          active={onAir}
                        />
                      </div>

                      <div className="flex items-center justify-center gap-2 @min-[540px]:gap-3.5 shrink-0">
                        <TransportSkipButton
                          theme={theme}
                          direction="prev"
                          size={26}
                          onClick={() => stepTrack(-1)}
                          title="Estação anterior"
                        />
                        <PlayDisc
                          theme={theme}
                          size={38}
                          playing={onAir}
                          onClick={() => {
                            if (activeRadio) togglePlayPause();
                            else if (selectedRadio) playRadioStation(selectedRadio);
                          }}
                        />
                        <TransportSkipButton
                          theme={theme}
                          direction="next"
                          size={26}
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
                        className="hidden @min-[540px]:block w-full max-w-[176px] h-[24px] rounded-full text-[10.5px] font-bold cursor-pointer hover:brightness-110 shrink-0"
                      >
                        {onAir ? tr('Transmitindo agora', language) : tr('B  Ouvir estação', language)}
                      </button>
                    </div>

                    {/* Right Category & Full Scrollable Station List */}
                    <div
                      style={{
                        ...modernPanelStyle(theme, 16),
                      }}
                      className="p-3 flex flex-col min-h-0 overflow-hidden"
                    >
                      <div className="flex items-baseline justify-between shrink-0">
                        <div style={{ color: theme.text }} className="text-[15.5px] @min-[520px]:text-[16px] font-extrabold">
                          {tr(RADIO_CATEGORIES[radioCategory], language)}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[11px]">
                          {radioStations.length} {tr('estações', language)}
                        </div>
                      </div>

                      {/* 7 Glowing Pill Category Tabs */}
                      <div className="flex gap-1 mt-2 overflow-x-auto pb-1 shrink-0">
                        {RADIO_CATEGORIES.map((cat, idx) => {
                          const activeCat = idx === radioCategory;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setRadioCategory(idx)}
                              style={modernPillStyle(theme, activeCat)}
                              className="px-2.5 py-1 text-[9.5px] font-bold whitespace-nowrap cursor-pointer shrink-0 transition-all"
                            >
                              {tr(cat, language)}
                            </button>
                          );
                        })}
                      </div>

                      {/* Full Scrollable Station Rows */}
                      <div className="mt-2 space-y-1.5 flex-1 min-h-0 overflow-y-auto kp-scroll pr-1">
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
                          radioStations.map((st, realIdx) => {
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

            {/* ==================== IPTV (CANAIS, FILMES, SÉRIES & USUÁRIO) ==================== */}
            {screen === 'iptv' && (
              <IptvScreen
                ref={iptvRef}
                theme={theme}
                themeIndex={themeIndex}
                language={language}
                locationLabel={locationLabel}
                toast={toast}
                notify={notify}
                onBackHome={() => setScreen('home')}
                onPlayItem={playIptvItem}
              />
            )}

            {/* ==================== NOTÍCIAS (NEWSDATA.IO + RSS BRASIL) ==================== */}
            {screen === 'news' && (
              <NewsScreen
                ref={newsRef}
                theme={theme}
                language={language}
                locationLabel={locationLabel}
                toast={toast}
                onBack={() => setScreen('home')}
              />
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

            {/* ==================== OPEN-METEO WEATHER APP (OPENED VIA BUTTON X ON HOME) ==================== */}
            {screen === 'weather' && (
              <WeatherScreen
                ref={weatherRef}
                theme={theme}
                language={language}
                locationLabel={locationLabel}
                toast={toast}
                weatherMode={weatherMode}
                weatherLocation={weatherLocation}
                weatherData={weatherData}
                weatherLoading={weatherLoading}
                weatherError={weatherError}
                initialSetupView={weatherSetupView}
                onChooseIpLocation={enableIpWeather}
                onSelectManualLocation={selectManualWeatherLocation}
                onRefreshWeather={async () => {
                  if (weatherLocation) await fetchWeatherForLocation(weatherLocation, true);
                  else if (weatherMode === 'ip') await enableIpWeather();
                }}
                onBack={() => setScreen('home')}
              />
            )}

            {/* ==================== CONTEXTUAL SELECTION-FIRST OPTIONS MENU (OPENED VIA SELECT) ==================== */}
            {screen === 'options' && (
              <OptionsMenu
                ref={optionsRef}
                theme={theme}
                themeIndex={themeIndex}
                language={language}
                locationLabel={locationLabel}
                toast={toast}
                context={optionsContext}
                initialSection={optionsInitialSection}
                homeLayoutInverted={homeLayoutInverted}
                playbackRate={playbackRate}
                videoFit={videoFit}
                repeatMode={repeatMode}
                shuffle={shuffle}
                eqIdx={eqIdx}
                eqPresets={EQ_PRESETS}
                sleepIdx={sleepIdx}
                sleepOptions={SLEEP_OPTIONS}
                r36sDisplayMode={r36sDisplayMode}
                displayModes={R36S_DISPLAY_MODES}
                stageSize={stageSize}
                weatherMode={weatherMode}
                weatherLocation={weatherLocation}
                activeTrack={activeTrack}
                favoriteTrackIds={favoriteTrackIds}
                history={playbackHistory}
                radioCategoryLabel={tr(RADIO_CATEGORIES[radioCategory] ?? 'Brasil', language)}
                updateStatus={updateStatus}
                updateChecking={updateChecking}
                updateApplying={updateApplying}
                updateMessage={updateMessage}
                updateProgress={updateProgress}
                updateStage={updateStage}
                updateDetail={updateDetail}
                screensaverTimeoutSec={screensaverTimeoutSec}
                screensaverVizStyle={screensaverVizStyle}
                screensaverShowClock={screensaverShowClock}
                screensaverShowLyrics={screensaverShowLyrics}
                uiSfxEnabled={uiSfxEnabled}
                onSetThemeIndex={setThemeIndex}
                onSetLanguage={setLanguage}
                onSetDisplayMode={setR36sDisplayMode}
                onToggleHomeLayout={() => {
                  setHomeLayoutInverted((inv) => {
                    const next = !inv;
                    notify(
                      next
                        ? 'Início invertido: Clima no topo e Player embaixo'
                        : 'Início padrão: Mini player no topo e Clima grande embaixo'
                    );
                    return next;
                  });
                }}
                onToggleUiSfx={() => {
                  setUiSfxEnabledState((prev) => {
                    const next = !prev;
                    setUiSfxEnabled(next);
                    if (next) playUiSfx('confirm');
                    notify(`Sons das teclas: ${next ? 'Ativado' : 'Desativado'}`);
                    return next;
                  });
                }}
                onCycleScreensaverTimeout={() => {
                  setScreensaverTimeoutSec((cur) => {
                    const idx = SCREENSAVER_TIMEOUT_OPTIONS.indexOf(
                      cur as (typeof SCREENSAVER_TIMEOUT_OPTIONS)[number]
                    );
                    const next =
                      SCREENSAVER_TIMEOUT_OPTIONS[(idx + 1) % SCREENSAVER_TIMEOUT_OPTIONS.length];
                    notify(`Protetor de tela: ${formatScreensaverTimeout(next)}`);
                    return next;
                  });
                }}
                onCycleScreensaverViz={() => {
                  setScreensaverVizStyle((cur) => {
                    const next = (cur + 1) % SCREENSAVER_VIZ_LABELS.length;
                    notify(`Visualizador: ${SCREENSAVER_VIZ_LABELS[next]}`);
                    return next;
                  });
                }}
                onToggleScreensaverClock={() => setScreensaverShowClock((s) => !s)}
                onToggleScreensaverLyrics={() => setScreensaverShowLyrics((s) => !s)}
                onStartScreensaverNow={() => {
                  lastActivityRef.current = Date.now();
                  setScreensaverActive(true);
                }}
                onOpenCommandsTutorial={() => {
                  setTutorialFromOptions(true);
                  setScreen('tutorial');
                }}
                onSetPlaybackRate={setPlaybackRate}
                onSetVideoFit={setVideoFit}
                onSetRepeatMode={setRepeatMode}
                onToggleShuffle={() => setShuffle((s) => !s)}
                onSetEqIdx={setEqIdx}
                onSetSleepIdx={setSleepIdx}
                onEnableIpWeather={enableIpWeather}
                onOpenWeatherManual={() => openWeatherScreen('manual')}
                onOpenWeatherScreen={() => openWeatherScreen('auto')}
                onDisableWeather={disableWeather}
                onToggleFavTrack={toggleTrackFav}
                onOpenFavorites={() => {
                  setLibFavoritesOnly(true);
                  setLibLocationsView(false);
                  setLibFilter(1);
                  setLibSelected(0);
                  setScreen('library');
                }}
                onResumeMedia={() => {
                  if (activeTrack) {
                    if (activeTrack.kind === 'audio') setScreen('music');
                    else playMediaTrack(activeTrack);
                  } else {
                    notify(tr('Abra uma mídia', language));
                  }
                }}
                onIptvSearch={() => {
                  window.setTimeout(() => iptvRef.current?.focusSearch(), 40);
                }}
                onIptvCycleSource={() => {
                  window.setTimeout(() => iptvRef.current?.cycleSource(), 40);
                }}
                onIptvRefresh={() => {
                  window.setTimeout(() => iptvRef.current?.refreshCurrent(), 40);
                }}
                onIptvAddUrl={() => {
                  window.setTimeout(() => iptvRef.current?.openAddUrl(), 40);
                }}
                onRadioToggleFav={() => {
                  const st = activeRadio ?? radioStations[radioSelected];
                  if (st) toggleRadioFav(st);
                  else notify('Nenhuma estação selecionada');
                }}
                onRadioCycleCategory={() => {
                  setRadioCategory((c) => (c + 1) % RADIO_CATEGORIES.length);
                }}
                onRadioRefresh={() => {
                  if (radioCategory === 5) fetchUserRadios().then(() => loadRadioCategory(5, true));
                  else loadRadioCategory(radioCategory, true);
                }}
                onOpenTerms={() => {
                  setTermsReturn('options');
                  setTermsPage(0);
                  setScreen('terms');
                }}
                onExitApp={() => setScreen('welcome')}
                onCheckUpdate={checkForUpdates}
                onApplyUpdate={applyAppUpdate}
                onSaveUpdateRepo={saveUpdateRepo}
                onClose={() => setScreen(prevScreen)}
              />
            )}

            {/* ==================== PROTETOR DE TELA (WMP VISUALIZERS + RELÓGIO/CLIMA + LETRAS) ==================== */}
            {screensaverActive && (
              <ScreensaverOverlay
                theme={theme}
                audioElement={audioRef.current}
                isPlaying={isPlaying}
                activeTrack={activeTrack}
                activeRadio={activeRadio}
                lyrics={activeTrack?.lyrics}
                activeLyricIndex={activeLyricIndex}
                weatherData={weatherData}
                weatherLocation={weatherLocation}
                vizStyle={screensaverVizStyle}
                showClockWeather={screensaverShowClock}
                showLyrics={screensaverShowLyrics}
                onCycleViz={(dir) =>
                  setScreensaverVizStyle(
                    (v) => (v + dir + SCREENSAVER_VIZ_LABELS.length) % SCREENSAVER_VIZ_LABELS.length
                  )
                }
                onToggleClockWeather={() => setScreensaverShowClock((s) => !s)}
                onToggleLyrics={() => setScreensaverShowLyrics((s) => !s)}
                onExit={() => {
                  lastActivityRef.current = Date.now();
                  setScreensaverActive(false);
                }}
              />
            )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modern Adaptive Android Edition (Side-by-Side or Dedicated Fluid/Preset View) */}
        {editionView !== 'r36s' && (() => {
          const isSplit = editionView === 'split';
          const isFluidAuto = !isSplit && androidDisplayMode === 'auto';
          const presetW = activeAndroidPreset.width ?? 390;
          const presetH = activeAndroidPreset.height ?? 780;
          const isBezelPreset = !isSplit && (androidDisplayMode === 'phone' || androidDisplayMode === 'landscape');

          const androidNode = (
            <AndroidPlayerApp
              theme={theme}
              themeIndex={themeIndex}
              setThemeIndex={setThemeIndex}
              language={language}
              setLanguage={setLanguage}
              audioTracks={audioTracks}
              videoTracks={videoTracks}
              activeTrack={activeTrack}
              activeRadio={activeRadio}
              isPlaying={isPlaying}
              isPaused={isPaused}
              currentMs={currentMs}
              durationMs={durationMs}
              repeatMode={repeatMode}
              shuffle={shuffle}
              eqPreset={EQ_PRESETS[eqIdx]?.name ?? 'Desativada'}
              sleepMinutes={SLEEP_OPTIONS[sleepIdx] ?? 0}
              playbackSpeed={playbackRate}
              favoriteIds={favoriteTrackSet}
              radioFavorites={favoriteRadioSet}
              noticeAccepted={streamNoticeAccepted}
              onAcceptNotice={() => {
                setStreamNoticeAccepted(true);
                try {
                  sessionStorage.setItem('kp_stream_notice_ok', '1');
                } catch {
                  // Ignore
                }
              }}
              onPlayTrack={playMediaTrack}
              onPlayRadio={playRadioStation}
              onTogglePlayPause={togglePlayPause}
              onStepTrack={(d) => stepTrack(d > 0 ? 1 : -1)}
              onSeekMs={seekAudioMs}
              onCycleRepeat={() => setRepeatMode((r) => ((r + 1) % 3) as RepeatMode)}
              onToggleShuffle={() => setShuffle((s) => !s)}
              onToggleFavoriteTrack={toggleFavoriteTrackById}
              onToggleFavoriteRadio={toggleFavoriteRadioByUuid}
              onSetEqPreset={(name) => {
                const idx = EQ_PRESETS.findIndex((p) => p.name === name);
                if (idx >= 0) setEqIdx(idx);
              }}
              onSetSleepMinutes={(mins) => {
                const idx = SLEEP_OPTIONS.indexOf(mins as (typeof SLEEP_OPTIONS)[number]);
                setSleepIdx(idx >= 0 ? idx : 0);
              }}
              onSetPlaybackSpeed={(speed) => {
                setPlaybackRate(speed);
                if (audioRef.current) audioRef.current.playbackRate = speed;
              }}
              onImportLocalFiles={() => fileInputRef.current?.click()}
              preloadedMatches={preloadedMatches}
              onMatchesLoaded={setPreloadedMatches}
              compactFrame={isSplit || isBezelPreset}
              fluidAdaptive={!isSplit}
              updateStatus={updateStatus}
              updateChecking={updateChecking}
              updateApplying={updateApplying}
              updateMessage={updateMessage}
              historyCount={playbackHistory.length}
              onCheckUpdate={checkForUpdates}
              onApplyUpdate={applyAppUpdate}
              onSaveUpdateRepo={saveUpdateRepo}
              weatherData={weatherData}
              weatherLocation={weatherLocation}
              onOpenWeather={() => {
                setEditionView('r36s');
                openWeatherScreen('auto');
              }}
            />
          );

          if (isSplit) {
            return (
              <div className="flex flex-col items-center gap-1.5 h-full max-h-[770px] justify-center shrink-0">
                <div className="text-[11px] font-semibold text-zinc-400">
                  Android (Adaptativo · Compose + Media3)
                </div>
                {androidNode}
              </div>
            );
          }

          if (isFluidAuto) {
            return (
              <div className="w-full h-full flex flex-col min-w-0 min-h-0">
                {androidNode}
              </div>
            );
          }

          return (
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                style={{
                  width: Math.round(presetW * androidScale),
                  height: Math.round(presetH * androidScale),
                }}
                className="relative shrink-0"
              >
                <div
                  style={{
                    width: presetW,
                    height: presetH,
                    transform: `scale(${androidScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  {androidNode}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Optional Interactive R36S Handheld Control Deck */}
      {showDeck && editionView !== 'android' && (
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
                  KPlayer v2.1.0 — Edição R36S
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
              <div className="w-[144px] shrink-0 rounded-xl overflow-hidden border border-white/15 bg-[radial-gradient(circle_at_center,rgba(29,185,84,0.18),rgba(10,12,16,0.96))] p-2 flex items-center justify-center shadow-lg">
                <img
                  src={scraperCoverImg}
                  alt="Capa transparente KPlayer v2.1.0 para R36S dArkOS"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 rounded-xl bg-[#0c0f15] border border-white/10 p-3 text-xs space-y-1.5 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Arquivo</span>
                  <span className="font-semibold text-zinc-100 truncate">
                    {r36sInfo?.filename ?? 'KPlayer-v2.1.0-R36S.zip'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Lançador .sh</span>
                  <span className="font-medium text-[#1db954] truncate">
                    KPlayer.sh (v2.1.0 estável)
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Tamanho</span>
                  <span className="font-medium text-zinc-200">
                    {r36sInfo ? formatBytes(r36sInfo.sizeBytes) : '~11 MB'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Artes Scraper</span>
                  <span className="font-medium text-[#1db954]">Capa & Marquee PNG Transparente</span>
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

            <div className="mt-3 rounded-xl bg-[#0c0f15] border border-white/10 p-2.5">
              <div className="text-[11px] font-bold text-zinc-200 mb-2">
                Artes em alta resolução em <code className="text-[#1db954]">kplayer/scraper/</code>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg overflow-hidden border border-white/10 bg-[#141923] flex flex-col">
                  <div className="h-16 flex items-center justify-center p-1.5 bg-[linear-gradient(45deg,#181c24_25%,#1f2530_25%,#1f2530_50%,#181c24_50%,#181c24_75%,#1f2530_75%)] bg-[length:12px_12px]">
                    <img
                      src={scraperMarqueeImg}
                      alt="Marquee Logo Transparente KPlayer R36S"
                      referrerPolicy="no-referrer"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="text-[10px] text-center text-zinc-400 py-0.5 bg-black/70">Marquee PNG (1600×490)</div>
                </div>
                <div className="rounded-lg overflow-hidden border border-white/10 bg-black flex flex-col">
                  <img
                    src={scraperBoxartImg}
                    alt="Boxart Disco KPlayer R36S"
                    referrerPolicy="no-referrer"
                    className="w-full h-16 object-cover"
                  />
                  <div className="text-[10px] text-center text-zinc-400 py-0.5">Boxart (900×1200)</div>
                </div>
                <div className="rounded-lg overflow-hidden border border-white/10 bg-black flex flex-col">
                  <img
                    src={scraperFanartImg}
                    alt="Fanart Full HD KPlayer R36S"
                    referrerPolicy="no-referrer"
                    className="w-full h-16 object-cover"
                  />
                  <div className="text-[10px] text-center text-zinc-400 py-0.5">Fanart (1920×1080)</div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-300 space-y-1.5">
              <div className="font-bold text-zinc-100">Como instalar no R36S (dArkOS / PortMaster):</div>
              <ol className="list-decimal list-inside space-y-1 text-zinc-300">
                <li>Baixe e extraia <code className="text-zinc-100">KPlayer-v2.1.0-R36S.zip</code>.</li>
                <li>
                  Copie <code className="text-zinc-100">KPlayer.sh</code> e a pasta{' '}
                  <code className="text-zinc-100">kplayer/</code> para{' '}
                  <code className="text-zinc-100">/roms/ports/</code> ou{' '}
                  <code className="text-zinc-100">/roms2/ports/</code>.
                </li>
                <li>
                  Abra <strong className="text-zinc-100">Ports → KPlayer</strong>. As imagens de Capa/Marquee transparentes ficam disponíveis em{' '}
                  <code className="text-zinc-100">kplayer/scraper/</code> sem modificar nenhum <code className="text-zinc-100">gamelist.xml</code>.
                </li>
              </ol>
              <p className="text-[11px] text-zinc-400 pt-1">
                Inclui binário ARM64 nativo v2.1.0, 10 visualizadores reativos (+ Automático), 14 temas R36S, sons táteis das teclas, interface animada, lançador KPlayer.sh estável e artes PNG transparentes em kplayer/scraper/.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2.5">
              <a
                href="/api/r36s/download"
                download="KPlayer-v2.1.0-R36S.zip"
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="flex-1 py-2.5 px-4 rounded-xl text-center text-sm font-extrabold hover:brightness-110 transition-all"
              >
                ⬇ Baixar KPlayer-v2.1.0-R36S.zip
              </a>
              <a
                href="/api/r36s/sha256"
                download="KPlayer-v2.1.0-R36S.zip.sha256"
                className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 transition-colors"
              >
                .sha256
              </a>
            </div>
          </div>
        </div>
      )}

      {/* KPlayer Android Edition Info & Build Modal */}
      {showAndroidModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowAndroidModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#131720] border border-white/15 p-5 shadow-2xl text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold tracking-wide text-[#1db954]">
                  Edição Android · Lado a Lado com R36S
                </div>
                <h2 className="text-xl font-extrabold mt-0.5">
                  KPlayer v2.0.4 — Android Adaptativo
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAndroidModal(false)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 flex gap-3.5 items-stretch">
              <div className="w-[128px] shrink-0 rounded-xl overflow-hidden border border-white/15 bg-black shadow-lg">
                <img
                  src={scraperBoxartImg}
                  alt="Capa KPlayer"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 rounded-xl bg-[#0c0f15] border border-white/10 p-3 text-xs space-y-1.5 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Pacote</span>
                  <span className="font-semibold text-zinc-100 truncate">io.kplayer.android</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Stack Nativa</span>
                  <span className="font-medium text-zinc-200 truncate">Kotlin · Compose · Media3</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Layout</span>
                  <span className="font-medium text-zinc-200">Retrato, Paisagem, Dobrável & Tablet</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Android mínimo</span>
                  <span className="font-medium text-zinc-200">Android 8.0+ (API 26–35)</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-400">Workflow CI</span>
                  <span className="font-medium text-[#1db954]">auto-update.yml (Release + APK)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-300 space-y-2">
              <div className="font-bold text-zinc-100">Mesmo KPlayer, 100% adaptativo ao seu dispositivo:</div>
              <ul className="list-disc list-inside space-y-1 text-zinc-300">
                <li>Se adapta automaticamente a celulares (retrato e paisagem), dobráveis, tablets e telas grandes — alternando entre Barra Inferior, Trilho Lateral, grades multi-coluna e Now Playing em 2 painéis.</li>
                <li>Player de música com disco/capa grande, letras sincronizadas (.LRC) com toque para avançar, fila, equalizador de hardware e timer de sono.</li>
                <li>Vídeos locais e streams HLS via Media3 ExoPlayer, IPTV desbloqueado (Canais · Filmes · Séries · Usuário), Rádio Online, Placar da Bola e os mesmos 7 temas + Aviso de Transparência.</li>
              </ul>
              <p className="text-[11px] text-zinc-400 pt-1">
                O projeto nativo está em <code className="text-zinc-200">android/</code> e é compilado automaticamente no GitHub Actions gerando <code className="text-zinc-200">KPlayer-v2.0.4-Android.apk</code> e publicando a Release lado a lado com o pacote principal do R36S.
              </p>
            </div>

            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowAndroidModal(false);
                  setEditionView('android');
                }}
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="flex-1 py-2.5 px-4 rounded-xl text-center text-sm font-extrabold hover:brightness-110 transition-all cursor-pointer"
              >
                Abrir Preview Android Adaptativo
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAndroidModal(false);
                  setEditionView('split');
                }}
                className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 transition-colors cursor-pointer"
              >
                Ver Lado a Lado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </UpdateBannerContext.Provider>
  );
}
