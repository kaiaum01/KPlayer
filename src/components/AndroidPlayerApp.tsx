import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Disc3,
  Download,
  Film,
  FolderOpen,
  Heart,
  Home,
  ListMusic,
  Mic2,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Trophy,
  Tv,
  Upload,
  X,
} from 'lucide-react';
import { KP_THEMES, type KpTheme } from '../themes';
import { LANGUAGE_NAMES, TERMS_PAGES, tr } from '../i18n';
import type {
  AppUpdateStatus,
  EpgChannelGuide,
  EqPresetName,
  FootballMatch,
  FootballMatchDetail,
  IptvCategory,
  IptvChannel,
  IptvSourceKey,
  LanguageCode,
  MediaTrack,
  RadioStation,
  RepeatMode,
  VideoFit,
} from '../types';
import { formatTime } from '../utils/media';
import { AudioVisualizer, VinylArt, mixRgb, rgbToRgba } from './R36SIcons';

export interface AndroidPlayerAppProps {
  theme: KpTheme;
  themeIndex: number;
  setThemeIndex: (idx: number) => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  audioTracks: MediaTrack[];
  videoTracks: MediaTrack[];
  activeTrack: MediaTrack | null;
  activeRadio: RadioStation | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentMs: number;
  durationMs: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  eqPreset: EqPresetName;
  sleepMinutes: number;
  playbackSpeed: number;
  favoriteIds: Set<string>;
  radioFavorites: Set<string>;
  noticeAccepted: boolean;
  onAcceptNotice: () => void;
  onPlayTrack: (track: MediaTrack) => void;
  onPlayRadio: (station: RadioStation) => void;
  onTogglePlayPause: () => void;
  onStepTrack: (delta: number) => void;
  onSeekMs: (ms: number) => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleFavoriteTrack: (id: string) => void;
  onToggleFavoriteRadio: (uuid: string) => void;
  onSetEqPreset: (preset: EqPresetName) => void;
  onSetSleepMinutes: (minutes: number) => void;
  onSetPlaybackSpeed: (speed: number) => void;
  onImportLocalFiles: () => void;
  preloadedMatches: FootballMatch[];
  onMatchesLoaded: (matches: FootballMatch[]) => void;
  compactFrame?: boolean;
  fluidAdaptive?: boolean;
  updateStatus?: AppUpdateStatus | null;
  updateChecking?: boolean;
  updateApplying?: boolean;
  updateMessage?: string | null;
  historyCount?: number;
  onCheckUpdate?: (force?: boolean) => Promise<void>;
  onApplyUpdate?: () => Promise<void>;
  onSaveUpdateRepo?: (repo: string) => Promise<boolean>;
}

type AndroidTab = 'home' | 'music' | 'iptv' | 'radio' | 'football';
type NowPlayingView = 'art' | 'lyrics' | 'queue' | 'eq';

const RADIO_CATS = ['Brasil', 'Mais ouvidas', 'Pop', 'Rock', 'Notícias', 'Rádio do Usuário', 'Favoritas'] as const;
const EQ_LIST: EqPresetName[] = ['Desativada', 'Flat', 'Bass Boost', 'Rock', 'Pop', 'Jazz', 'Classical', 'Electronic'];
const SLEEP_LIST = [0, 15, 30, 60, 90, 120];
const SPEED_LIST = [0.75, 1.0, 1.25, 1.5, 2.0];
const IPTV_TABS: Array<{ key: IptvSourceKey; label: string }> = [
  { key: 'canais', label: 'Canais' },
  { key: 'filmes', label: 'Filmes' },
  { key: 'series', label: 'Séries' },
  { key: 'usuario', label: 'Usuário' },
];

export const AndroidPlayerApp: React.FC<AndroidPlayerAppProps> = ({
  theme,
  themeIndex,
  setThemeIndex,
  language,
  setLanguage,
  audioTracks,
  videoTracks,
  activeTrack,
  activeRadio,
  isPlaying,
  isPaused,
  currentMs,
  durationMs,
  repeatMode,
  shuffle,
  eqPreset,
  sleepMinutes,
  playbackSpeed,
  favoriteIds,
  radioFavorites,
  noticeAccepted,
  onAcceptNotice,
  onPlayTrack,
  onPlayRadio,
  onTogglePlayPause,
  onStepTrack,
  onSeekMs,
  onCycleRepeat,
  onToggleShuffle,
  onToggleFavoriteTrack,
  onToggleFavoriteRadio,
  onSetEqPreset,
  onSetSleepMinutes,
  onSetPlaybackSpeed,
  onImportLocalFiles,
  preloadedMatches,
  onMatchesLoaded,
  compactFrame = true,
  fluidAdaptive = false,
  updateStatus = null,
  updateChecking = false,
  updateApplying = false,
  updateMessage = null,
  historyCount = 0,
  onCheckUpdate,
  onApplyUpdate,
  onSaveUpdateRepo,
}) => {
  const [tab, setTab] = useState<AndroidTab>('home');
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [nowView, setNowView] = useState<NowPlayingView>('art');
  const [wideSideTab, setWideSideTab] = useState<'lyrics' | 'queue' | 'eq'>('lyrics');
  const [showVideosSheet, setShowVideosSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingNoticeTab, setPendingNoticeTab] = useState<AndroidTab | null>(null);
  const [androidRepoInput, setAndroidRepoInput] = useState<string>(updateStatus?.repository ?? '');

  useEffect(() => {
    if (updateStatus?.repository) {
      setAndroidRepoInput((prev) => prev || updateStatus.repository);
    }
  }, [updateStatus?.repository]);

  // Music library state
  const [musicQuery, setMusicQuery] = useState('');
  const [musicFilter, setMusicFilter] = useState<'all' | 'fav' | 'folders'>('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // Video & IPTV inline overlay playback
  const [activeVideoOverlay, setActiveVideoOverlay] = useState<{
    title: string;
    subtitle: string;
    url: string;
    fallbackUrls?: string[];
    isLive?: boolean;
    channel?: IptvChannel;
  } | null>(null);
  const [videoFit, setVideoFit] = useState<VideoFit>(0);
  const [videoSpeed, setVideoSpeed] = useState(1);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Radio state
  const [radioCat, setRadioCat] = useState<(typeof RADIO_CATS)[number]>('Brasil');
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [userRadios, setUserRadios] = useState<RadioStation[]>([]);
  const [radioLoading, setRadioLoading] = useState(false);
  const [radioQuery, setRadioQuery] = useState('');

  // IPTV state
  const [iptvSource, setIptvSource] = useState<IptvSourceKey>('canais');
  const [iptvCategories, setIptvCategories] = useState<IptvCategory[]>([]);
  const [iptvSelectedCat, setIptvSelectedCat] = useState<IptvCategory | null>(null);
  const [iptvItems, setIptvItems] = useState<IptvChannel[]>([]);
  const [iptvSeriesShow, setIptvSeriesShow] = useState<IptvChannel | null>(null);
  const [iptvEpisodes, setIptvEpisodes] = useState<IptvChannel[]>([]);
  const [iptvLoading, setIptvLoading] = useState(false);
  const [iptvQuery, setIptvQuery] = useState('');
  const [userUrlInput, setUserUrlInput] = useState('');
  const [userNameInput, setUserNameInput] = useState('');
  const [showAddIptvForm, setShowAddIptvForm] = useState(false);
  const [iptvStatusMsg, setIptvStatusMsg] = useState<string | null>(null);
  const m3uUploadRef = useRef<HTMLInputElement | null>(null);

  // Live EPG schedule sheet state
  const [epgChannel, setEpgChannel] = useState<IptvChannel | null>(null);
  const [epgGuide, setEpgGuide] = useState<EpgChannelGuide | null>(null);
  const [epgLoading, setEpgLoading] = useState(false);

  // Football (Placar da Bola) state
  const [matches, setMatches] = useState<FootballMatch[]>(preloadedMatches);
  const [footballFilter, setFootballFilter] = useState<'all' | 'live' | 'br' | 'eu'>('all');
  const [footballLoading, setFootballLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<FootballMatch | null>(null);
  const [matchDetail, setMatchDetail] = useState<FootballMatchDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'stats' | 'events' | 'lineups'>('stats');
  const [detailLoading, setDetailLoading] = useState(false);

  const isLightTheme = themeIndex === 2 || themeIndex === 3;
  const subtleBorder = isLightTheme ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.08)';
  const surfaceGlass = rgbToRgba(theme.panel, isLightTheme ? 0.94 : 0.9);

  useEffect(() => {
    if (preloadedMatches.length > 0 && matches.length === 0) {
      setMatches(preloadedMatches);
    }
  }, [preloadedMatches, matches.length]);

  // Attach HLS / direct stream to portrait video overlay
  useEffect(() => {
    const el = videoElRef.current;
    if (!activeVideoOverlay || !el) return;
    setVideoError(null);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const candidates = [activeVideoOverlay.url, ...(activeVideoOverlay.fallbackUrls ?? [])].filter(Boolean);
    let idx = 0;

    const playCandidate = (rawUrl: string) => {
      const isLocalBlob = rawUrl.startsWith('blob:') || rawUrl.startsWith('/');
      const srcUrl = isLocalBlob
        ? rawUrl
        : `/api/stream?url=${encodeURIComponent(rawUrl)}`;
      const looksHls = /\.m3u8(\?|$)/i.test(rawUrl) || rawUrl.includes('m3u8');

      if (looksHls && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(srcUrl);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          el.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) {
            hls.destroy();
            hlsRef.current = null;
            idx++;
            if (idx < candidates.length) {
              playCandidate(candidates[idx]);
            } else {
              setVideoError('Fluxo indisponível no momento. Tente outro canal ou fonte.');
            }
          }
        });
      } else {
        el.src = srcUrl;
        el.load();
        el.play().catch(() => {});
      }
    };

    playCandidate(candidates[0]);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeVideoOverlay]);

  useEffect(() => {
    if (videoElRef.current) {
      videoElRef.current.playbackRate = videoSpeed;
    }
  }, [videoSpeed]);

  // Fetch Radio stations
  const fetchRadios = useCallback(async (category: (typeof RADIO_CATS)[number]) => {
    setRadioLoading(true);
    try {
      if (category === 'Rádio do Usuário') {
        const r = await fetch('/api/user-radios');
        const d = await r.json();
        const list = Array.isArray(d.stations) ? d.stations : [];
        setUserRadios(list);
        setRadioStations(list);
      } else if (category === 'Favoritas') {
        setRadioStations((prev) => prev.filter((s) => radioFavorites.has(s.uuid)));
      } else {
        const r = await fetch(`/api/radio?category=${encodeURIComponent(category)}`);
        const d = await r.json();
        setRadioStations(Array.isArray(d.stations) ? d.stations : []);
      }
    } catch {
      setRadioStations([]);
    } finally {
      setRadioLoading(false);
    }
  }, [radioFavorites]);

  // Fetch IPTV categories
  const fetchIptvCats = useCallback(async (src: IptvSourceKey, refresh = false) => {
    setIptvLoading(true);
    setIptvSelectedCat(null);
    setIptvSeriesShow(null);
    setIptvItems([]);
    setIptvEpisodes([]);
    try {
      const r = await fetch(`/api/iptv/categories?source=${encodeURIComponent(src)}${refresh ? '&refresh=1' : ''}`);
      const d = await r.json();
      setIptvCategories(Array.isArray(d.categories) ? d.categories : []);
    } catch {
      setIptvCategories([]);
    } finally {
      setIptvLoading(false);
    }
  }, []);

  const fetchIptvCategoryItems = useCallback(async (src: IptvSourceKey, cat: IptvCategory) => {
    setIptvSelectedCat(cat);
    setIptvSeriesShow(null);
    setIptvEpisodes([]);
    setIptvLoading(true);
    try {
      const r = await fetch(
        `/api/iptv/items?source=${encodeURIComponent(src)}&category=${encodeURIComponent(cat.id)}`,
      );
      const d = await r.json();
      setIptvItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      setIptvItems([]);
    } finally {
      setIptvLoading(false);
    }
  }, []);

  const fetchSeriesEpisodes = useCallback(async (show: IptvChannel) => {
    setIptvSeriesShow(show);
    setIptvLoading(true);
    try {
      const params = new URLSearchParams({
        letter: show.letter || 'a',
        shard: show.shard || '0',
        title: show.name,
      });
      const r = await fetch(`/api/iptv/episodes?${params.toString()}`);
      const d = await r.json();
      setIptvEpisodes(Array.isArray(d.episodes) ? d.episodes : []);
    } catch {
      setIptvEpisodes([]);
    } finally {
      setIptvLoading(false);
    }
  }, []);

  const fetchFootball = useCallback(async () => {
    setFootballLoading(true);
    try {
      const r = await fetch('/api/football');
      const d = await r.json();
      const list: FootballMatch[] = Array.isArray(d.matches) ? d.matches : [];
      setMatches(list);
      onMatchesLoaded(list);
    } catch {
      // Keep existing matches
    } finally {
      setFootballLoading(false);
    }
  }, [onMatchesLoaded]);

  const openMatchDetail = useCallback(async (match: FootballMatch) => {
    setSelectedMatch(match);
    setDetailTab('stats');
    setDetailLoading(true);
    setMatchDetail(null);
    try {
      const r = await fetch(
        `/api/football/match?league=${encodeURIComponent(match.leagueCode)}&id=${encodeURIComponent(match.id)}`,
      );
      const d = await r.json();
      setMatchDetail(d.detail ?? null);
    } catch {
      setMatchDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openEpgSheet = useCallback(async (ch: IptvChannel) => {
    setEpgChannel(ch);
    setEpgGuide(null);
    setEpgLoading(true);
    try {
      const qs = new URLSearchParams({ channel: ch.name });
      if (ch.id) qs.set('tvgId', ch.id);
      const r = await fetch(`/api/iptv/epg?${qs.toString()}`);
      const d = (await r.json()) as EpgChannelGuide;
      setEpgGuide(d);
    } catch {
      setEpgGuide({
        matchedChannel: null,
        now: ch.epgNow ?? null,
        next: ch.epgNext ?? null,
        schedule: [],
      });
    } finally {
      setEpgLoading(false);
    }
  }, []);

  const navigateTab = useCallback(
    (next: AndroidTab) => {
      if ((next === 'iptv' || next === 'radio') && !noticeAccepted) {
        setPendingNoticeTab(next);
        return;
      }
      setPendingNoticeTab(null);
      setShowVideosSheet(false);
      setShowSettingsSheet(false);
      setTab(next);
      if (next === 'radio' && radioStations.length === 0) fetchRadios(radioCat);
      if (next === 'iptv' && iptvCategories.length === 0) fetchIptvCats(iptvSource);
      if (next === 'football' && matches.length === 0) fetchFootball();
    },
    [
      noticeAccepted,
      radioStations.length,
      fetchRadios,
      radioCat,
      iptvCategories.length,
      fetchIptvCats,
      iptvSource,
      matches.length,
      fetchFootball,
    ],
  );

  // Filtered Music
  const musicFolders = useMemo(() => {
    const map = new Map<string, MediaTrack[]>();
    audioTracks.forEach((t) => {
      const key = t.folder || 'Músicas';
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return Array.from(map.entries());
  }, [audioTracks]);

  const filteredTracks = useMemo(() => {
    const q = musicQuery.trim().toLowerCase();
    return audioTracks.filter((t) => {
      if (musicFilter === 'fav' && !favoriteIds.has(t.id)) return false;
      if (musicFilter === 'folders' && selectedFolder && (t.folder || 'Músicas') !== selectedFolder) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });
  }, [audioTracks, musicQuery, musicFilter, selectedFolder, favoriteIds]);

  const activeLyricIndex = useMemo(() => {
    const lines = activeTrack?.lyrics;
    if (!lines || lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].timeMs <= currentMs + 120) idx = i;
      else break;
    }
    return idx;
  }, [activeTrack?.lyrics, currentMs]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (footballFilter === 'live') return m.state === 'in';
      if (footballFilter === 'br') return m.region === 'br';
      if (footballFilter === 'eu') return m.region === 'eu';
      return true;
    });
  }, [matches, footballFilter]);

  const liveMatchCount = useMemo(() => matches.filter((m) => m.state === 'in').length, [matches]);

  const handleAddUserIptvUrl = async () => {
    const url = userUrlInput.trim();
    if (!/^https?:\/\//i.test(url)) {
      setIptvStatusMsg('Informe um link válido iniciado por http:// ou https://');
      return;
    }
    setIptvLoading(true);
    setIptvStatusMsg(null);
    try {
      const r = await fetch('/api/iptv/user/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name: userNameInput.trim() || undefined }),
      });
      if (r.ok) {
        setUserUrlInput('');
        setUserNameInput('');
        setShowAddIptvForm(false);
        setIptvStatusMsg('Playlist adicionada com sucesso.');
        await fetchIptvCats('usuario', true);
      } else {
        setIptvStatusMsg('Não foi possível salvar a playlist.');
      }
    } catch {
      setIptvStatusMsg('Erro de rede ao salvar playlist.');
    } finally {
      setIptvLoading(false);
    }
  };

  const handleUploadUserM3u = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setIptvLoading(true);
    setIptvStatusMsg(null);
    try {
      const r = await fetch('/api/iptv/user/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content }),
      });
      if (r.ok) {
        setIptvStatusMsg(`Arquivo ${file.name} importado.`);
        await fetchIptvCats('usuario', true);
      }
    } finally {
      setIptvLoading(false);
      e.target.value = '';
    }
  };

  const hasMiniPlayer = Boolean(activeTrack || activeRadio);
  const progressRatio = durationMs > 0 ? Math.min(1, Math.max(0, currentMs / durationMs)) : 0;

  const navItems = [
    { id: 'home' as const, label: 'Início', icon: Home },
    { id: 'music' as const, label: 'Música', icon: Music2 },
    { id: 'iptv' as const, label: 'IPTV', icon: Tv },
    { id: 'radio' as const, label: 'Rádio', icon: Radio },
    { id: 'football' as const, label: 'Placar', icon: Trophy },
  ];

  const rootClassName = fluidAdaptive
    ? compactFrame
      ? 'relative @container w-full h-full rounded-[34px] border-[5px] shadow-[0_28px_90px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col select-none'
      : 'relative @container w-full h-full rounded-[16px] sm:rounded-[20px] border shadow-2xl overflow-hidden flex flex-col select-none'
    : compactFrame
    ? 'relative @container w-[372px] h-[740px] max-h-full rounded-[38px] border-[6px] shadow-[0_28px_90px_rgba(0,0,0,0.75)] overflow-hidden flex flex-col shrink-0 select-none'
    : 'relative @container w-full h-full rounded-[20px] border shadow-2xl overflow-hidden flex flex-col select-none';

  return (
    <div
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        borderColor: compactFrame ? 'rgba(255,255,255,0.14)' : subtleBorder,
      }}
      className={rootClassName}
    >
      {/* Hidden .m3u / .m3u8 upload input for IPTV do Usuário */}
      <input
        ref={m3uUploadRef}
        type="file"
        accept=".m3u,.m3u8,.txt"
        onChange={handleUploadUserM3u}
        className="hidden"
      />

      {/* Ambient Atmospheric Tint */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[340px] @min-[680px]:w-[520px] h-[220px] rounded-full blur-3xl opacity-20 transition-colors duration-500"
        style={{ backgroundColor: theme.accent }}
      />

      {/* Compact Android Status / Top Notch Safe Bar (Phones only; hidden on wide/tablet viewports) */}
      <div className="relative z-20 h-7 px-5 flex @min-[680px]:hidden items-center justify-between text-[11px] font-semibold tabular-nums shrink-0">
        <span style={{ color: theme.muted }}>
          {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <div className="w-16 h-4 rounded-full bg-black/50 border border-white/10" aria-hidden="true" />
        <span style={{ color: theme.muted }}>Android · 2.0.3</span>
      </div>

      {/* ==================== ADAPTIVE BODY: LEFT NAV RAIL (>=680px) + MAIN VIEWPORT ==================== */}
      <div className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
        {/* Adaptive Left Navigation Rail for Landscape Phones, Foldables, Tablets & Desktops */}
        {!pendingNoticeTab && (
          <aside
            aria-label="Navegação lateral KPlayer Android"
            style={{
              backgroundColor: theme.panel,
              borderRight: `1px solid ${subtleBorder}`,
            }}
            className="hidden @min-[680px]:flex flex-col w-[78px] @min-[960px]:w-[212px] shrink-0 py-3 px-2 @min-[960px]:px-3 gap-1.5 z-20"
          >
            <div className="flex items-center justify-center @min-[960px]:justify-start gap-2.5 px-1.5 pb-3 mb-1 border-b" style={{ borderColor: subtleBorder }}>
              <VinylArt theme={theme} size={34} spinning={isPlaying && !isPaused} />
              <div className="hidden @min-[960px]:block min-w-0">
                <div className="text-[15px] font-extrabold leading-none tracking-tight">
                  K <span style={{ color: theme.accent }}>Player</span>
                </div>
                <div className="text-[10.5px] mt-1 truncate" style={{ color: theme.muted }}>
                  Android · v2.0.3
                </div>
              </div>
            </div>

            <nav className="flex-1 flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id && !showVideosSheet && !showSettingsSheet;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateTab(item.id)}
                    style={{
                      backgroundColor: active ? rgbToRgba(theme.accent, 0.16) : 'transparent',
                      color: active ? theme.accent : theme.muted,
                    }}
                    className="min-h-[46px] rounded-xl px-2 @min-[960px]:px-3 flex flex-col @min-[960px]:flex-row items-center justify-center @min-[960px]:justify-start gap-1 @min-[960px]:gap-3 cursor-pointer transition-colors hover:bg-white/5"
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-[10px] @min-[960px]:text-[13px] font-bold leading-none whitespace-nowrap">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => {
                setShowVideosSheet(false);
                setShowSettingsSheet(true);
              }}
              style={{
                backgroundColor: showSettingsSheet ? rgbToRgba(theme.accent, 0.16) : 'transparent',
                color: showSettingsSheet ? theme.accent : theme.muted,
              }}
              className="min-h-[44px] rounded-xl px-2 @min-[960px]:px-3 flex flex-col @min-[960px]:flex-row items-center justify-center @min-[960px]:justify-start gap-1 @min-[960px]:gap-3 cursor-pointer transition-colors hover:bg-white/5"
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span className="text-[10px] @min-[960px]:text-[13px] font-bold leading-none whitespace-nowrap">
                Opções
              </span>
            </button>
          </aside>
        )}

        {/* ==================== MAIN SCROLLABLE CONTENT COLUMN ==================== */}
        <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        {/* Top-bar Update Notice Banner when a newer commit version is available in GitHub updates/ */}
        {updateStatus?.updateAvailable && !showSettingsSheet && !pendingNoticeTab && (
          <button
            type="button"
            onClick={() => {
              setShowVideosSheet(false);
              setShowSettingsSheet(true);
            }}
            style={{
              backgroundColor: rgbToRgba(theme.accent, 0.16),
              borderBottom: `1px solid ${rgbToRgba(theme.accent, 0.4)}`,
              color: theme.accent,
            }}
            className="w-full px-4 py-2 flex items-center justify-between gap-2 text-left shrink-0 cursor-pointer hover:brightness-110 transition-all"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11.5px] font-extrabold truncate">
                Nova versão v{updateStatus.latestVersion} disponível · Toque para atualizar
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}
        {/* 1. TRANSPARENCY NOTICE GATE (IPTV / RÁDIO) */}
        {pendingNoticeTab && (
          <div className="flex-1 overflow-y-auto kp-scroll px-5 py-6 flex flex-col justify-center">
            <div className="w-full max-w-[500px] mx-auto">
            <div className="flex flex-col items-center text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{
                  backgroundColor: rgbToRgba(theme.accent, 0.14),
                  color: theme.accent,
                }}
              >
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-[20px] font-extrabold tracking-tight" style={{ textWrap: 'balance' }}>
                {tr('Aviso de Transparência', language)}
              </h2>
              <p className="text-[12.5px] mt-1 font-medium" style={{ color: theme.accent }}>
                {pendingNoticeTab === 'iptv'
                  ? 'IPTV · Canais, Filmes, Séries e Usuário'
                  : 'Rádio Online · Fontes Abertas'}
              </p>
            </div>

            <div
              className="mt-5 rounded-2xl p-4 space-y-2.5 text-[13px] leading-relaxed"
              style={{
                backgroundColor: theme.panel,
                border: `1px solid ${subtleBorder}`,
              }}
            >
              <p style={{ color: theme.text }}>
                Todos os dados de <strong>IPTV e Rádio Online</strong> foram retirados de{' '}
                <strong>agregadores públicos da internet ou de fontes abertas</strong>.
              </p>
              <p style={{ color: theme.muted }}>
                O KPlayer atua estritamente como reprodutor de mídia e não hospeda nem transmite conteúdo próprio.
              </p>
              <p style={{ color: theme.accent }} className="font-semibold">
                Você tem total direito de inserir seu próprio link (.m3u / .m3u8) ou importar arquivos locais a qualquer momento.
              </p>
            </div>

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  onAcceptNotice();
                  const dest = pendingNoticeTab;
                  setPendingNoticeTab(null);
                  setTab(dest);
                  if (dest === 'radio' && radioStations.length === 0) fetchRadios(radioCat);
                  if (dest === 'iptv' && iptvCategories.length === 0) fetchIptvCats(iptvSource);
                }}
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="w-full min-h-[48px] rounded-2xl text-[14px] font-bold cursor-pointer active:scale-[0.98] transition-transform"
              >
                Entendi, continuar
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  style={{
                    backgroundColor: theme.panel,
                    color: theme.text,
                    border: `1px solid ${subtleBorder}`,
                  }}
                  className="min-h-[44px] rounded-xl text-[13px] font-semibold cursor-pointer"
                >
                  Ler Termos
                </button>
                <button
                  type="button"
                  onClick={() => setPendingNoticeTab(null)}
                  style={{
                    backgroundColor: theme.panel,
                    color: theme.muted,
                    border: `1px solid ${subtleBorder}`,
                  }}
                  className="min-h-[44px] rounded-xl text-[13px] font-semibold cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

        {/* 2. HOME TAB (ADAPTIVE EDITORIAL DASHBOARD) */}
        {!pendingNoticeTab && !showVideosSheet && !showSettingsSheet && tab === 'home' && (
          <div className="flex-1 overflow-y-auto kp-scroll px-4 @min-[680px]:px-6 pt-2 @min-[680px]:pt-4 pb-36 @min-[680px]:pb-24">
            <div className="max-w-5xl mx-auto w-full space-y-5">
            {/* Compact Top App Bar */}
            <header className="flex items-center justify-between min-h-[44px]">
              <div>
                <h1 className="text-[22px] font-extrabold tracking-tight leading-none">
                  K <span style={{ color: theme.accent }}>Player</span>
                </h1>
                <p className="text-[12px] mt-1" style={{ color: theme.muted }}>
                  Android Adaptativo · {audioTracks.length} músicas · {videoTracks.length} vídeos
                </p>
              </div>
              <button
                type="button"
                aria-label="Opções e Temas"
                onClick={() => setShowSettingsSheet(true)}
                style={{
                  backgroundColor: theme.panel,
                  color: theme.text,
                  border: `1px solid ${subtleBorder}`,
                }}
                className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
              >
                <Settings className="w-5 h-5" />
              </button>
            </header>

            {/* Primary Focal Hero Card — Modern Now Playing / Quick Play */}
            <div
              onClick={() => {
                if (activeTrack || activeRadio) setShowNowPlaying(true);
                else if (audioTracks[0]) {
                  onPlayTrack(audioTracks[0]);
                  setShowNowPlaying(true);
                } else setTab('music');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setShowNowPlaying(true);
              }}
              style={{
                background: `linear-gradient(145deg, ${mixRgb(theme.elevated, theme.accent, 0.14)} 0%, ${theme.panel} 100%)`,
                border: `1px solid ${rgbToRgba(theme.accent, 0.25)}`,
              }}
              className="rounded-3xl p-4 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3.5">
                <VinylArt
                  theme={theme}
                  size={68}
                  coverUrl={activeTrack?.coverUrl}
                  centerLogoUrl={activeRadio?.favicon || undefined}
                  spinning={isPlaying && !isPaused}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-semibold" style={{ color: theme.accent }}>
                    {isPlaying && !isPaused
                      ? 'Tocando agora'
                      : activeTrack || activeRadio
                      ? 'Em pausa'
                      : 'Pronto para ouvir'}
                  </div>
                  <div className="text-[16px] font-extrabold truncate mt-0.5">
                    {activeRadio?.name ?? activeTrack?.title ?? 'Sua música em alta definição'}
                  </div>
                  <div className="text-[12px] truncate mt-0.5" style={{ color: theme.muted }}>
                    {activeRadio
                      ? `${activeRadio.country} · ${activeRadio.codec || 'Stream'}`
                      : activeTrack
                      ? `${activeTrack.artist} · ${activeTrack.format}`
                      : 'Toque para abrir o player completo'}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={isPlaying && !isPaused ? 'Pausar' : 'Reproduzir'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!activeTrack && !activeRadio && audioTracks[0]) onPlayTrack(audioTracks[0]);
                    else onTogglePlayPause();
                  }}
                  style={{ backgroundColor: theme.accent, color: theme.bg }}
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 cursor-pointer shadow-lg active:scale-95 transition-transform"
                >
                  {isPlaying && !isPaused ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>
              </div>
              <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: subtleBorder }}>
                <AudioVisualizer theme={theme} bars={24} width={150} height={12} active={isPlaying && !isPaused} />
                <span className="text-[11px] font-medium tabular-nums" style={{ color: theme.muted }}>
                  {activeRadio ? 'Ao vivo' : `${formatTime(currentMs)} / ${formatTime(durationMs)}`}
                </span>
              </div>
            </div>

            {/* Adaptive Feature Grid: 2x2 on phones, 4-column strip on landscape/tablet */}
            <section className="grid grid-cols-2 @min-[560px]:grid-cols-4 gap-2.5">
              {[
                {
                  label: 'Músicas',
                  meta: `${audioTracks.length} faixas · LRC`,
                  icon: Music2,
                  action: () => setTab('music'),
                },
                {
                  label: 'Vídeos',
                  meta: `${videoTracks.length} locais · HLS`,
                  icon: Film,
                  action: () => setShowVideosSheet(true),
                },
                {
                  label: 'IPTV',
                  meta: '245 canais · VOD',
                  icon: Tv,
                  action: () => navigateTab('iptv'),
                },
                {
                  label: 'Rádio Online',
                  meta: 'Brasil · Mundo',
                  icon: Radio,
                  action: () => navigateTab('radio'),
                },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.label}
                    type="button"
                    onClick={card.action}
                    style={{
                      backgroundColor: theme.panel,
                      border: `1px solid ${subtleBorder}`,
                    }}
                    className="rounded-2xl p-3.5 text-left min-h-[86px] flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <Icon className="w-5 h-5" style={{ color: theme.accent }} />
                    <div>
                      <div className="text-[14.5px] font-bold leading-tight">{card.label}</div>
                      <div className="text-[11.5px] mt-0.5 truncate" style={{ color: theme.muted }}>
                        {card.meta}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>

            {/* Placar da Bola Full-Width Match Strip */}
            <button
              type="button"
              onClick={() => navigateTab('football')}
              style={{
                backgroundColor: theme.panel,
                border: `1px solid ${subtleBorder}`,
              }}
              className="w-full rounded-2xl p-3.5 flex items-center justify-between text-left cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: rgbToRgba(theme.accent, 0.14), color: theme.accent }}
                >
                  <Trophy className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14.5px] font-bold">Placar da Bola</div>
                  <div className="text-[12px] truncate tabular-nums" style={{ color: theme.muted }}>
                    {liveMatchCount > 0
                      ? `${liveMatchCount} ao vivo · ${matches.length} partidas hoje`
                      : 'Brasileirão · Libertadores · Champions'}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0" style={{ color: theme.muted }} />
            </button>

            {/* Quick Local Tracks */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[14.5px] font-bold">Biblioteca rápida</h2>
                <button
                  type="button"
                  onClick={onImportLocalFiles}
                  style={{ color: theme.accent }}
                  className="text-[12px] font-semibold cursor-pointer min-h-[36px] px-1 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Importar áudio/.LRC
                </button>
              </div>
              <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 gap-2">
                {audioTracks.slice(0, 6).map((t) => {
                  const active = activeTrack?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onPlayTrack(t);
                        setShowNowPlaying(true);
                      }}
                      style={{
                        backgroundColor: active ? theme.elevated : theme.panel,
                        border: `1px solid ${active ? rgbToRgba(theme.accent, 0.4) : subtleBorder}`,
                      }}
                      className="w-full min-h-[58px] px-3 py-2 rounded-2xl flex items-center gap-3 text-left cursor-pointer"
                    >
                      <VinylArt theme={theme} size={38} coverUrl={t.coverUrl} spinning={active && isPlaying && !isPaused} />
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[13.5px] font-bold truncate"
                          style={{ color: active ? theme.accent : theme.text }}
                        >
                          {t.title}
                        </div>
                        <div className="text-[11.5px] truncate" style={{ color: theme.muted }}>
                          {t.artist} · {t.format}
                          {t.lyrics && t.lyrics.length > 0 ? ' · LRC' : ''}
                        </div>
                      </div>
                      <span className="text-[11.5px] tabular-nums shrink-0" style={{ color: theme.dim }}>
                        {formatTime(t.durationMs)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            </div>
          </div>
        )}

        {/* 3. MUSIC TAB (MODERN PORTRAIT LIBRARY) */}
        {!pendingNoticeTab && !showVideosSheet && !showSettingsSheet && tab === 'music' && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center justify-between min-h-[44px] shrink-0">
              <div>
                <h1 className="text-[20px] font-extrabold leading-tight">Músicas</h1>
                <p className="text-[11.5px] tabular-nums" style={{ color: theme.muted }}>
                  {filteredTracks.length} faixas · Letras .LRC suportadas
                </p>
              </div>
              <button
                type="button"
                onClick={onImportLocalFiles}
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="min-h-[40px] px-3 rounded-xl text-[12px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </header>

            {/* Search Input */}
            <div
              className="mt-2.5 flex items-center gap-2 px-3 rounded-xl min-h-[44px] shrink-0"
              style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
              <input
                type="text"
                value={musicQuery}
                onChange={(e) => setMusicQuery(e.target.value)}
                placeholder="Buscar música, artista ou álbum"
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: theme.text }}
              />
              {musicQuery && (
                <button type="button" onClick={() => setMusicQuery('')} className="p-1 cursor-pointer">
                  <X className="w-4 h-4" style={{ color: theme.muted }} />
                </button>
              )}
            </div>

            {/* Segmented Filter Control */}
            <div
              className="mt-2.5 grid grid-cols-3 gap-1 p-1 rounded-xl shrink-0"
              style={{ backgroundColor: theme.panel }}
            >
              {[
                { key: 'all' as const, label: 'Todas' },
                { key: 'fav' as const, label: 'Favoritas' },
                { key: 'folders' as const, label: 'Pastas' },
              ].map((f) => {
                const active = musicFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setMusicFilter(f.key);
                      if (f.key !== 'folders') setSelectedFolder(null);
                    }}
                    style={
                      active
                        ? { backgroundColor: theme.accent, color: theme.bg }
                        : { color: theme.muted }
                    }
                    className="min-h-[34px] rounded-lg text-[12px] font-bold cursor-pointer transition-colors"
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Folder Breadcrumb or Adaptive Track Grid */}
            <div className="flex-1 overflow-y-auto kp-scroll mt-3 pb-36 @min-[680px]:pb-24">
              {musicFilter === 'folders' && !selectedFolder ? (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {musicFolders.map(([folderName, list]) => (
                  <button
                    key={folderName}
                    type="button"
                    onClick={() => setSelectedFolder(folderName)}
                    style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                    className="w-full min-h-[58px] px-3.5 rounded-2xl flex items-center justify-between text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderOpen className="w-5 h-5 shrink-0" style={{ color: theme.accent }} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold truncate">{folderName}</div>
                        <div className="text-[11.5px] tabular-nums" style={{ color: theme.muted }}>
                          {list.length} faixas
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4" style={{ color: theme.muted }} />
                  </button>
                ))}
                </div>
              ) : (
                <>
                  {selectedFolder && (
                    <button
                      type="button"
                      onClick={() => setSelectedFolder(null)}
                      style={{ color: theme.accent }}
                      className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-2 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" /> Todas as pastas / {selectedFolder}
                    </button>
                  )}
                  {filteredTracks.length === 0 ? (
                    <div className="py-14 text-center text-[13px]" style={{ color: theme.muted }}>
                      Nenhuma faixa encontrada neste filtro.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                    {filteredTracks.map((t) => {
                      const active = activeTrack?.id === t.id;
                      const fav = favoriteIds.has(t.id);
                      return (
                        <div
                          key={t.id}
                          style={{
                            backgroundColor: active ? theme.elevated : theme.panel,
                            border: `1px solid ${active ? rgbToRgba(theme.accent, 0.42) : subtleBorder}`,
                          }}
                          className="min-h-[60px] px-3 py-2 rounded-2xl flex items-center gap-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onPlayTrack(t);
                              setShowNowPlaying(true);
                            }}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <VinylArt theme={theme} size={40} coverUrl={t.coverUrl} spinning={active && isPlaying && !isPaused} />
                            <div className="min-w-0 flex-1">
                              <div
                                className="text-[13.5px] font-bold truncate"
                                style={{ color: active ? theme.accent : theme.text }}
                              >
                                {t.title}
                              </div>
                              <div className="text-[11.5px] truncate" style={{ color: theme.muted }}>
                                {t.artist} · {t.format}
                                {t.lyrics && t.lyrics.length > 0 ? ' · LRC' : ''}
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label="Favoritar faixa"
                            onClick={() => onToggleFavoriteTrack(t.id)}
                            className="w-10 h-10 flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <Heart
                              className="w-4 h-4"
                              style={{ color: fav ? theme.accent : theme.dim }}
                              fill={fav ? theme.accent : 'none'}
                            />
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 4. IPTV TAB (UNLOCKED CATEGORIES, SERIES EPISODES, USER URL & FILE UPLOAD) */}
        {!pendingNoticeTab && !showVideosSheet && !showSettingsSheet && tab === 'iptv' && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center justify-between min-h-[44px] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {(iptvSelectedCat || iptvSeriesShow) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (iptvSeriesShow) {
                        setIptvSeriesShow(null);
                        setIptvEpisodes([]);
                      } else {
                        setIptvSelectedCat(null);
                        setIptvItems([]);
                      }
                    }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: theme.panel }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="min-w-0">
                  <h1 className="text-[19px] font-extrabold truncate leading-tight">
                    {iptvSeriesShow?.name ?? iptvSelectedCat?.name ?? 'IPTV'}
                  </h1>
                  <p className="text-[11.5px] truncate" style={{ color: theme.muted }}>
                    {iptvSeriesShow
                      ? `${iptvEpisodes.length} episódios`
                      : iptvSelectedCat
                      ? `${iptvItems.length} itens na categoria`
                      : 'Agregadores abertos · Sem limite'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {iptvSource === 'usuario' && (
                  <button
                    type="button"
                    aria-label="Adicionar playlist IPTV"
                    onClick={() => setShowAddIptvForm((v) => !v)}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Atualizar IPTV"
                  onClick={() => fetchIptvCats(iptvSource, true)}
                  style={{ backgroundColor: theme.panel }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${iptvLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </header>

            {/* 4 Source Tabs: Canais · Filmes · Séries · Usuário */}
            <div
              className="mt-2.5 grid grid-cols-4 gap-1 p-1 rounded-xl shrink-0"
              style={{ backgroundColor: theme.panel }}
            >
              {IPTV_TABS.map((tItem) => {
                const active = iptvSource === tItem.key;
                return (
                  <button
                    key={tItem.key}
                    type="button"
                    onClick={() => {
                      setIptvSource(tItem.key);
                      setIptvQuery('');
                      fetchIptvCats(tItem.key);
                    }}
                    style={
                      active
                        ? { backgroundColor: theme.accent, color: theme.bg }
                        : { color: theme.muted }
                    }
                    className="min-h-[34px] rounded-lg text-[11.5px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    {tItem.label}
                  </button>
                );
              })}
            </div>

            {/* Native Android User IPTV Form (Direct Keyboard URL + Local .m3u Upload) */}
            {iptvSource === 'usuario' && (showAddIptvForm || iptvCategories.length === 0) && (
              <div
                className="mt-2.5 p-3 rounded-2xl space-y-2 shrink-0"
                style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
              >
                <div className="text-[12px] font-bold">Adicionar sua própria playlist (.m3u / .m3u8)</div>
                <input
                  type="text"
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  placeholder="Nome da lista (opcional)"
                  className="w-full px-3 min-h-[38px] rounded-xl text-[12.5px] outline-none"
                  style={{ backgroundColor: theme.elevated, color: theme.text }}
                />
                <input
                  type="url"
                  value={userUrlInput}
                  onChange={(e) => setUserUrlInput(e.target.value)}
                  placeholder="https://exemplo.com/minha-lista.m3u8"
                  className="w-full px-3 min-h-[38px] rounded-xl text-[12.5px] outline-none"
                  style={{ backgroundColor: theme.elevated, color: theme.text }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleAddUserIptvUrl}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="min-h-[40px] rounded-xl text-[12px] font-bold cursor-pointer"
                  >
                    Salvar link
                  </button>
                  <button
                    type="button"
                    onClick={() => m3uUploadRef.current?.click()}
                    style={{ backgroundColor: theme.elevated, color: theme.text }}
                    className="min-h-[40px] rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" /> Arquivo .m3u
                  </button>
                </div>
                {iptvStatusMsg && (
                  <div className="text-[11.5px]" style={{ color: theme.accent }}>
                    {iptvStatusMsg}
                  </div>
                )}
              </div>
            )}

            {/* Instant Search */}
            <div
              className="mt-2.5 flex items-center gap-2 px-3 rounded-xl min-h-[42px] shrink-0"
              style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
              <input
                type="text"
                value={iptvQuery}
                onChange={(e) => setIptvQuery(e.target.value)}
                placeholder="Buscar categoria, canal, filme ou série"
                className="flex-1 bg-transparent text-[12.5px] outline-none"
                style={{ color: theme.text }}
              />
            </div>

            {/* Category / Item / Episode Adaptive Grid */}
            <div className="flex-1 overflow-y-auto kp-scroll mt-2.5 pb-36 @min-[680px]:pb-24">
              {iptvLoading ? (
                <div className="py-14 text-center text-[13px]" style={{ color: theme.muted }}>
                  Carregando catálogo...
                </div>
              ) : iptvSeriesShow ? (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {iptvEpisodes
                  .filter((ep) => !iptvQuery.trim() || ep.name.toLowerCase().includes(iptvQuery.toLowerCase()))
                  .map((ep, idx) => (
                    <button
                      key={`${ep.id}-${idx}`}
                      type="button"
                      onClick={() =>
                        setActiveVideoOverlay({
                          title: ep.name,
                          subtitle: iptvSeriesShow.name,
                          url: ep.url,
                          fallbackUrls: ep.fallbackUrls,
                        })
                      }
                      style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                      className="w-full min-h-[56px] px-3.5 py-2 rounded-2xl flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-[13.5px] font-bold truncate">{ep.name}</div>
                        <div className="text-[11.5px]" style={{ color: theme.muted }}>
                          {ep.season ? `Temporada ${ep.season} · Ep. ${ep.episode ?? idx + 1}` : 'Episódio'}
                        </div>
                      </div>
                      <Play className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                    </button>
                  ))}
                </div>
              ) : iptvSelectedCat ? (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {iptvItems
                  .filter((it) => !iptvQuery.trim() || it.name.toLowerCase().includes(iptvQuery.toLowerCase()))
                  .map((it, idx) => {
                    const isLiveChannel =
                      it.mediaType === 'live' || iptvSource === 'canais' || iptvSource === 'usuario';
                    return (
                      <div
                        key={`${it.id}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (it.mediaType === 'series-show') {
                            fetchSeriesEpisodes(it);
                          } else {
                            setActiveVideoOverlay({
                              title: it.name,
                              subtitle: it.epgNow
                                ? `${it.epgNow.title} · ${it.epgNow.startLabel}–${it.epgNow.stopLabel}`
                                : it.group || iptvSelectedCat.name,
                              url: it.url,
                              fallbackUrls: it.fallbackUrls,
                              isLive: isLiveChannel,
                              channel: it,
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (it.mediaType === 'series-show') {
                              fetchSeriesEpisodes(it);
                            } else {
                              setActiveVideoOverlay({
                                title: it.name,
                                subtitle: it.epgNow
                                  ? `${it.epgNow.title} · ${it.epgNow.startLabel}–${it.epgNow.stopLabel}`
                                  : it.group || iptvSelectedCat.name,
                                url: it.url,
                                fallbackUrls: it.fallbackUrls,
                                isLive: isLiveChannel,
                                channel: it,
                              });
                            }
                          }
                        }}
                        style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                        className="w-full min-h-[62px] px-3 py-2.5 rounded-2xl flex items-center gap-3 text-left cursor-pointer"
                      >
                        <div
                          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                          style={{ backgroundColor: theme.elevated }}
                        >
                          {it.logo ? (
                            <img
                              src={it.logo}
                              alt={it.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Tv className="w-4 h-4" style={{ color: theme.accent }} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[13.5px] font-bold truncate">{it.name}</div>
                            {it.epgNow && (
                              <span
                                className="text-[10px] font-bold tabular-nums shrink-0"
                                style={{ color: theme.accent }}
                              >
                                {it.epgNow.startLabel}–{it.epgNow.stopLabel}
                              </span>
                            )}
                          </div>
                          {it.epgNow ? (
                            <div className="mt-0.5 space-y-1">
                              <div className="text-[11.5px] truncate" style={{ color: theme.muted }}>
                                Agora: {it.epgNow.title}
                              </div>
                              <div
                                className="h-1 rounded-full overflow-hidden"
                                style={{ backgroundColor: subtleBorder }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(4, Math.min(100, it.epgNow.progressPct ?? 0))}%`,
                                    backgroundColor: theme.accent,
                                  }}
                                />
                              </div>
                              {it.epgNext && (
                                <div className="text-[10.5px] truncate tabular-nums" style={{ color: theme.dim }}>
                                  A seguir {it.epgNext.startLabel}: {it.epgNext.title}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11.5px] truncate" style={{ color: theme.muted }}>
                              {[it.group, it.year, it.episodeCount ? `${it.episodeCount} eps` : '']
                                .filter(Boolean)
                                .join(' · ') || 'Reproduzir'}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isLiveChannel && (
                            <button
                              type="button"
                              aria-label={`Guia EPG de ${it.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEpgSheet(it);
                              }}
                              style={{
                                backgroundColor: rgbToRgba(theme.accent, 0.14),
                                color: theme.accent,
                              }}
                              className="min-h-[34px] px-2.5 rounded-xl flex items-center gap-1 text-[10.5px] font-bold cursor-pointer"
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span>EPG</span>
                            </button>
                          )}
                          {it.mediaType === 'series-show' ? (
                            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
                          ) : (
                            <Play className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {iptvCategories
                  .filter((c) => !iptvQuery.trim() || c.name.toLowerCase().includes(iptvQuery.toLowerCase()))
                  .map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => fetchIptvCategoryItems(iptvSource, cat)}
                      style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                      className="w-full min-h-[54px] px-4 rounded-2xl flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-[14px] font-bold truncate pr-3">{cat.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {cat.count > 0 && (
                          <span className="text-[12px] font-bold tabular-nums" style={{ color: theme.accent }}>
                            {cat.count}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4" style={{ color: theme.muted }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. RADIO ONLINE TAB */}
        {!pendingNoticeTab && !showVideosSheet && !showSettingsSheet && tab === 'radio' && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center justify-between min-h-[44px] shrink-0">
              <div>
                <h1 className="text-[20px] font-extrabold leading-tight">Rádio Online</h1>
                <p className="text-[11.5px]" style={{ color: theme.muted }}>
                  Diretório aberto Radio-Browser · {radioCat}
                </p>
              </div>
              <button
                type="button"
                aria-label="Atualizar estações"
                onClick={() => fetchRadios(radioCat)}
                style={{ backgroundColor: theme.panel }}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${radioLoading ? 'animate-spin' : ''}`} />
              </button>
            </header>

            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
              {RADIO_CATS.map((cat) => {
                const active = cat === radioCat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setRadioCat(cat);
                      fetchRadios(cat);
                    }}
                    style={
                      active
                        ? { backgroundColor: theme.accent, color: theme.bg }
                        : { backgroundColor: theme.panel, color: theme.muted }
                    }
                    className="min-h-[34px] px-3 rounded-xl text-[12px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            <div
              className="mt-2 flex items-center gap-2 px-3 rounded-xl min-h-[42px] shrink-0"
              style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
              <input
                type="text"
                value={radioQuery}
                onChange={(e) => setRadioQuery(e.target.value)}
                placeholder="Filtrar estação de rádio"
                className="flex-1 bg-transparent text-[12.5px] outline-none"
                style={{ color: theme.text }}
              />
            </div>

            <div className="flex-1 overflow-y-auto kp-scroll mt-2.5 pb-36 @min-[680px]:pb-24">
              {radioLoading ? (
                <div className="py-14 text-center text-[13px]" style={{ color: theme.muted }}>
                  Sintonizando estações...
                </div>
              ) : (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {(radioCat === 'Rádio do Usuário' ? userRadios : radioStations)
                  .filter((st) => !radioQuery.trim() || st.name.toLowerCase().includes(radioQuery.toLowerCase()))
                  .map((st) => {
                    const active = activeRadio?.uuid === st.uuid;
                    const fav = radioFavorites.has(st.uuid);
                    return (
                      <div
                        key={st.uuid}
                        style={{
                          backgroundColor: active ? theme.elevated : theme.panel,
                          border: `1px solid ${active ? rgbToRgba(theme.accent, 0.45) : subtleBorder}`,
                        }}
                        className="min-h-[60px] px-3 py-2 rounded-2xl flex items-center gap-2.5"
                      >
                        <button
                          type="button"
                          onClick={() => onPlayRadio(st)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <VinylArt
                            theme={theme}
                            size={40}
                            centerLogoUrl={st.favicon || undefined}
                            spinning={active && isPlaying && !isPaused}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[13.5px] font-bold truncate"
                              style={{ color: active ? theme.accent : theme.text }}
                            >
                              {st.name}
                            </div>
                            <div className="text-[11.5px] truncate tabular-nums" style={{ color: theme.muted }}>
                              {st.country} · {st.codec || 'STREAM'} · {st.bitrate || 128} kbps
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label="Favoritar rádio"
                          onClick={() => onToggleFavoriteRadio(st.uuid)}
                          className="w-10 h-10 flex items-center justify-center cursor-pointer shrink-0"
                        >
                          <Heart
                            className="w-4 h-4"
                            style={{ color: fav ? theme.accent : theme.dim }}
                            fill={fav ? theme.accent : 'none'}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. PLACAR DA BOLA TAB (MODERN PORTRAIT MATCH CENTER) */}
        {!pendingNoticeTab && !showVideosSheet && !showSettingsSheet && tab === 'football' && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center justify-between min-h-[44px] shrink-0">
              <div>
                <h1 className="text-[20px] font-extrabold leading-tight">Placar da Bola</h1>
                <p className="text-[11.5px] tabular-nums" style={{ color: theme.accent }}>
                  {liveMatchCount} ao vivo · {matches.length} partidas
                </p>
              </div>
              <button
                type="button"
                aria-label="Atualizar placares"
                onClick={fetchFootball}
                style={{ backgroundColor: theme.panel }}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${footballLoading ? 'animate-spin' : ''}`} />
              </button>
            </header>

            <div
              className="mt-2.5 grid grid-cols-4 gap-1 p-1 rounded-xl shrink-0"
              style={{ backgroundColor: theme.panel }}
            >
              {[
                { key: 'all' as const, label: 'Todos' },
                { key: 'live' as const, label: 'Ao vivo' },
                { key: 'br' as const, label: 'Brasil' },
                { key: 'eu' as const, label: 'Europa' },
              ].map((f) => {
                const active = footballFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFootballFilter(f.key)}
                    style={
                      active
                        ? { backgroundColor: theme.accent, color: theme.bg }
                        : { color: theme.muted }
                    }
                    className="min-h-[34px] rounded-lg text-[12px] font-bold cursor-pointer"
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto kp-scroll mt-3 pb-36 @min-[680px]:pb-24">
              {footballLoading && filteredMatches.length === 0 ? (
                <div className="py-14 text-center text-[13px]" style={{ color: theme.muted }}>
                  Atualizando jogos...
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="py-14 text-center text-[13px]" style={{ color: theme.muted }}>
                  Nenhuma partida encontrada neste filtro.
                </div>
              ) : (
                <div className="grid grid-cols-1 @min-[600px]:grid-cols-2 @min-[980px]:grid-cols-3 gap-2.5">
                {filteredMatches.map((m) => {
                  const isLive = m.state === 'in';
                  return (
                    <button
                      key={`${m.leagueCode}-${m.id}`}
                      type="button"
                      onClick={() => openMatchDetail(m)}
                      style={{
                        backgroundColor: theme.panel,
                        border: `1px solid ${isLive ? rgbToRgba(theme.accent, 0.35) : subtleBorder}`,
                      }}
                      className="w-full rounded-2xl p-3.5 text-left space-y-2 cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold truncate" style={{ color: theme.muted }}>
                          {m.league}
                        </span>
                        <span
                          className="font-bold tabular-nums shrink-0"
                          style={{ color: isLive ? theme.accent : theme.dim }}
                        >
                          {m.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {m.homeLogo && (
                            <img
                              src={m.homeLogo}
                              alt={m.home}
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 object-contain shrink-0"
                            />
                          )}
                          <span className="text-[13.5px] font-bold truncate">{m.home}</span>
                        </div>
                        <span
                          className="text-[16px] font-extrabold tabular-nums px-2"
                          style={{ color: isLive ? theme.accent : theme.text }}
                        >
                          {m.score || '×'}
                        </span>
                        <div className="flex items-center justify-end gap-2 min-w-0">
                          <span className="text-[13.5px] font-bold truncate text-right">{m.away}</span>
                          {m.awayLogo && (
                            <img
                              src={m.awayLogo}
                              alt={m.away}
                              referrerPolicy="no-referrer"
                              className="w-5 h-5 object-contain shrink-0"
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 7. VIDEOS LIBRARY SHEET */}
        {!pendingNoticeTab && showVideosSheet && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center justify-between min-h-[44px] shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowVideosSheet(false)}
                  style={{ backgroundColor: theme.panel }}
                  className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h1 className="text-[19px] font-extrabold leading-tight">Vídeos</h1>
                  <p className="text-[11.5px] tabular-nums" style={{ color: theme.muted }}>
                    {videoTracks.length} arquivos locais
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onImportLocalFiles}
                style={{ backgroundColor: theme.accent, color: theme.bg }}
                className="min-h-[38px] px-3 rounded-xl text-[12px] font-bold cursor-pointer"
              >
                + Importar
              </button>
            </header>
            <div className="flex-1 overflow-y-auto kp-scroll mt-3 pb-36 @min-[680px]:pb-24">
              {videoTracks.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <Film className="w-9 h-9 mx-auto" style={{ color: theme.muted }} />
                  <p className="text-[13px]" style={{ color: theme.muted }}>
                    Nenhum vídeo importado ainda. Toque em <strong>+ Importar</strong> para carregar MP4, MKV ou WEBM.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 @min-[580px]:grid-cols-2 @min-[960px]:grid-cols-3 gap-2">
                {videoTracks.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      if (v.url) {
                        setActiveVideoOverlay({
                          title: v.title,
                          subtitle: `${v.folder} · ${v.format}`,
                          url: v.url,
                        });
                      }
                    }}
                    style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                    className="w-full min-h-[62px] px-3.5 py-2.5 rounded-2xl flex items-center gap-3 text-left cursor-pointer"
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: rgbToRgba(theme.accent, 0.14), color: theme.accent }}
                    >
                      <Film className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold truncate">{v.title}</div>
                      <div className="text-[11.5px] tabular-nums" style={{ color: theme.muted }}>
                        {v.folder} · {v.format} · {formatTime(v.durationMs)}
                      </div>
                    </div>
                    <Play className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                  </button>
                ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. SETTINGS & THEMES SHEET */}
        {!pendingNoticeTab && showSettingsSheet && (
          <div className="flex-1 flex flex-col min-h-0 px-4 pt-2">
            <header className="flex items-center gap-2 min-h-[44px] shrink-0">
              <button
                type="button"
                onClick={() => setShowSettingsSheet(false)}
                style={{ backgroundColor: theme.panel }}
                className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-[19px] font-extrabold leading-tight">Opções & Temas</h1>
                <p className="text-[11.5px]" style={{ color: theme.muted }}>
                  Sincronizado com o KPlayer v2.0.3
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto kp-scroll mt-3 pb-36 @min-[680px]:pb-24">
              <div className="max-w-3xl mx-auto w-full space-y-5">
              {/* Auto-Update Section (GitHub updates/ channel) */}
              <section
                className="p-3.5 rounded-2xl space-y-2.5"
                style={{
                  backgroundColor: theme.panel,
                  border: `1px solid ${
                    updateStatus?.updateAvailable ? rgbToRgba(theme.accent, 0.55) : subtleBorder
                  }`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Download className="w-4 h-4" style={{ color: theme.accent }} />
                      <span className="text-[13.5px] font-extrabold">Atualizar KPlayer (Auto-Update)</span>
                    </div>
                    <p className="text-[11.5px] mt-0.5" style={{ color: theme.muted }}>
                      {updateStatus?.updateAvailable
                        ? `Nova versão v${updateStatus.latestVersion} pronta na pasta updates/ do GitHub.`
                        : `Versão v${updateStatus?.currentVersion ?? '2.0.3'} instalada · Monitorando v${updateStatus?.nextExpectedVersion ?? '2.0.4'}+ ao iniciar.`}
                    </p>
                  </div>
                  <span
                    style={{
                      backgroundColor: updateStatus?.updateAvailable
                        ? rgbToRgba(theme.accent, 0.2)
                        : theme.elevated,
                      color: updateStatus?.updateAvailable ? theme.accent : theme.muted,
                    }}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0"
                  >
                    {updateStatus?.updateAvailable ? `v${updateStatus.latestVersion}` : 'Em dia'}
                  </span>
                </div>

                <div className="text-[11px]" style={{ color: theme.muted }}>
                  Preserva favoritos ({favoriteIds.size}), histórico ({historyCount}), listas IPTV/Rádio, idioma e tema, e reinicia após atualizar.
                </div>

                {updateMessage && (
                  <div
                    className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold"
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.14),
                      color: theme.accent,
                    }}
                  >
                    {updateMessage}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={updateChecking || updateApplying}
                    onClick={() => onCheckUpdate && void onCheckUpdate(true)}
                    style={{
                      backgroundColor: theme.elevated,
                      color: theme.text,
                      border: `1px solid ${subtleBorder}`,
                    }}
                    className="min-h-[38px] rounded-xl text-[12px] font-bold cursor-pointer disabled:opacity-60"
                  >
                    {updateChecking ? 'Verificando...' : 'Verificar agora'}
                  </button>
                  <button
                    type="button"
                    disabled={updateApplying}
                    onClick={() => onApplyUpdate && void onApplyUpdate()}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="min-h-[38px] rounded-xl text-[12px] font-extrabold cursor-pointer disabled:opacity-60"
                  >
                    {updateApplying
                      ? 'Atualizando...'
                      : updateStatus?.updateAvailable
                      ? `Atualizar v${updateStatus.latestVersion}`
                      : 'Sincronizar e reiniciar'}
                  </button>
                </div>

                {onSaveUpdateRepo && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (androidRepoInput.trim()) void onSaveUpdateRepo(androidRepoInput.trim());
                    }}
                    className="flex items-center gap-1.5 pt-0.5"
                  >
                    <input
                      type="text"
                      value={androidRepoInput}
                      onChange={(e) => setAndroidRepoInput(e.target.value)}
                      placeholder="GitHub: usuario/KPlayer (pasta updates/)"
                      style={{
                        backgroundColor: theme.elevated,
                        color: theme.text,
                        border: `1px solid ${subtleBorder}`,
                      }}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-[11.5px] outline-none"
                    />
                    <button
                      type="submit"
                      style={{ backgroundColor: theme.elevated, color: theme.accent }}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      Salvar
                    </button>
                  </form>
                )}
              </section>

              {/* 7 Theme Swatches */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13.5px] font-bold">7 Temas de Cores</span>
                  <span className="text-[12px]" style={{ color: theme.accent }}>
                    {tr(theme.name, language)}
                  </span>
                </div>
                <div
                  className="p-3 rounded-2xl flex items-center justify-between"
                  style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                >
                  {KP_THEMES.map((tItem, idx) => {
                    const chosen = idx === themeIndex;
                    const light = idx === 2 || idx === 3;
                    return (
                      <button
                        key={tItem.id}
                        type="button"
                        aria-label={tItem.name}
                        onClick={() => setThemeIndex(idx)}
                        style={{
                          boxShadow: chosen ? `0 0 0 2px ${theme.text}` : undefined,
                        }}
                        className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                      >
                        <span
                          className="w-6 h-6 rounded-full"
                          style={{
                            backgroundColor: light ? tItem.bg : tItem.accent,
                            border: `1px solid ${subtleBorder}`,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Language */}
              <section>
                <div className="text-[13.5px] font-bold mb-2">Idioma</div>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl" style={{ backgroundColor: theme.panel }}>
                  {LANGUAGE_NAMES.map((name, idx) => {
                    const active = idx === language;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setLanguage(idx as LanguageCode)}
                        style={
                          active
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { color: theme.muted }
                        }
                        className="min-h-[38px] rounded-xl text-[12px] font-bold cursor-pointer"
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Equalizer Presets */}
              <section>
                <div className="text-[13.5px] font-bold mb-2">Equalizador de Áudio</div>
                <div className="flex flex-wrap gap-1.5">
                  {EQ_LIST.map((eq) => {
                    const active = eqPreset === eq;
                    return (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => onSetEqPreset(eq)}
                        style={
                          active
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { backgroundColor: theme.panel, color: theme.text }
                        }
                        className="min-h-[36px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer"
                      >
                        {eq}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Sleep Timer */}
              <section>
                <div className="text-[13.5px] font-bold mb-2">Timer de sono</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {SLEEP_LIST.map((m) => {
                    const active = sleepMinutes === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onSetSleepMinutes(m)}
                        style={
                          active
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { backgroundColor: theme.panel, color: theme.text }
                        }
                        className="min-h-[38px] rounded-xl text-[12px] font-semibold tabular-nums cursor-pointer"
                      >
                        {m === 0 ? 'Desligado' : `${m} min`}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Terms & Transparency */}
              <button
                type="button"
                onClick={() => setShowTermsModal(true)}
                style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                className="w-full min-h-[54px] px-4 rounded-2xl flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5" style={{ color: theme.accent }} />
                  <div>
                    <div className="text-[13.5px] font-bold">Termos de Uso & Transparência</div>
                    <div className="text-[11.5px]" style={{ color: theme.muted }}>
                      Fontes abertas · Direito ao seu próprio link
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: theme.muted }} />
              </button>
              </div>
            </div>
          </div>
        )}

      {/* ==================== FLOATING MINI-PLAYER + 5-TAB BOTTOM NAV (COMPACT ONLY) ==================== */}
      {!pendingNoticeTab && !showNowPlaying && !activeVideoOverlay && (
        <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col pointer-events-none">
          {hasMiniPlayer && (
            <div className="px-3 pb-2 @min-[680px]:pb-3 pointer-events-auto">
              <div
                onClick={() => setShowNowPlaying(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowNowPlaying(true);
                }}
                style={{
                  backgroundColor: theme.elevated,
                  border: `1px solid ${rgbToRgba(theme.accent, 0.25)}`,
                }}
                className="rounded-2xl overflow-hidden shadow-xl cursor-pointer max-w-[640px] mx-auto w-full"
              >
                <div className="px-3 py-2 flex items-center gap-2.5">
                  <VinylArt
                    theme={theme}
                    size={38}
                    coverUrl={activeTrack?.coverUrl}
                    centerLogoUrl={activeRadio?.favicon || undefined}
                    spinning={isPlaying && !isPaused}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold truncate">
                      {activeRadio?.name ?? activeTrack?.title}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: theme.muted }}>
                      {activeRadio ? `${activeRadio.country} · Ao vivo` : activeTrack?.artist}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Anterior"
                    onClick={(e) => {
                      e.stopPropagation();
                      onStepTrack(-1);
                    }}
                    className="w-9 h-9 flex items-center justify-center cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={isPlaying && !isPaused ? 'Pausar' : 'Reproduzir'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePlayPause();
                    }}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shrink-0"
                  >
                    {isPlaying && !isPaused ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    )}
                  </button>
                </div>
                {!activeRadio && (
                  <div className="h-[2.5px] w-full bg-black/25">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${progressRatio * 100}%`, backgroundColor: theme.accent }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fixed 5-Tab Bottom Navigation Bar (Phones only; replaced by Left Rail on >=680px) */}
          <nav
            aria-label="Navegação KPlayer Android"
            style={{
              backgroundColor: surfaceGlass,
              borderTop: `1px solid ${subtleBorder}`,
            }}
            className="backdrop-blur-md grid @min-[680px]:hidden grid-cols-5 h-[62px] px-1 pointer-events-auto"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id && !showVideosSheet && !showSettingsSheet;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTab(item.id)}
                  className="flex flex-col items-center justify-center gap-0.5 min-h-[48px] cursor-pointer"
                >
                  <Icon
                    className="w-5 h-5 transition-colors"
                    style={{ color: active ? theme.accent : theme.muted }}
                  />
                  <span
                    className="text-[10px] font-semibold tracking-tight"
                    style={{ color: active ? theme.accent : theme.muted }}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
        </div>
      </div>

      {/* ==================== FULL-SCREEN ADAPTIVE NOW PLAYING SHEET ==================== */}
      {showNowPlaying && (
        <div
          style={{
            background: `linear-gradient(180deg, ${mixRgb(theme.elevated, theme.accent, 0.18)} 0%, ${theme.bg} 42%, ${theme.bg} 100%)`,
          }}
          className="absolute inset-0 z-30 flex flex-col px-5 @min-[680px]:px-7 pt-9 @min-[680px]:pt-4 pb-5 overflow-hidden"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between min-h-[44px] shrink-0 max-w-5xl mx-auto w-full">
            <button
              type="button"
              aria-label="Recolher player"
              onClick={() => setShowNowPlaying(false)}
              style={{ backgroundColor: rgbToRgba(theme.panel, 0.7) }}
              className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-[11px] font-semibold" style={{ color: theme.accent }}>
                {activeRadio ? 'Rádio ao vivo' : 'Tocando agora'}
              </div>
              <div className="text-[11.5px]" style={{ color: theme.muted }}>
                {activeRadio
                  ? activeRadio.country
                  : activeTrack
                  ? `${activeTrack.format}${activeTrack.bitrateKbps ? ` · ${activeTrack.bitrateKbps} kbps` : ''}`
                  : 'KPlayer Android'}
              </div>
            </div>
            <button
              type="button"
              aria-label="Favoritar"
              onClick={() => {
                if (activeRadio) onToggleFavoriteRadio(activeRadio.uuid);
                else if (activeTrack) onToggleFavoriteTrack(activeTrack.id);
              }}
              style={{ backgroundColor: rgbToRgba(theme.panel, 0.7) }}
              className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer"
            >
              {(() => {
                const isFav = activeRadio
                  ? radioFavorites.has(activeRadio.uuid)
                  : activeTrack
                  ? favoriteIds.has(activeTrack.id)
                  : false;
                return (
                  <Heart
                    className="w-5 h-5"
                    style={{ color: isFav ? theme.accent : theme.text }}
                    fill={isFav ? theme.accent : 'none'}
                  />
                );
              })()}
            </button>
          </div>

          {/* WIDE 2-PANE LAYOUT (Landscape Phones, Foldables, Tablets & Desktop >= 680px) */}
          <div className="hidden @min-[680px]:grid flex-1 min-h-0 grid-cols-[minmax(260px,0.95fr)_minmax(260px,1.05fr)] gap-6 items-center max-w-5xl mx-auto w-full pt-3 overflow-hidden">
            {/* Left Pane: Vinyl + Track Meta + Scrubber + Transport */}
            <div className="h-full min-h-0 flex flex-col items-center justify-center gap-3 overflow-y-auto kp-scroll px-1">
              <div
                className="p-2.5 rounded-full shrink-0"
                style={{ boxShadow: `0 18px 50px ${rgbToRgba(theme.accent, 0.24)}` }}
              >
                <VinylArt
                  theme={theme}
                  size={156}
                  coverUrl={activeTrack?.coverUrl}
                  centerLogoUrl={activeRadio?.favicon || undefined}
                  spinning={isPlaying && !isPaused}
                />
              </div>
              <AudioVisualizer theme={theme} bars={24} width={164} height={14} active={isPlaying && !isPaused} />
              <div className="w-full text-center">
                <h2 className="text-[19px] font-extrabold truncate leading-tight">
                  {activeRadio?.name ?? activeTrack?.title ?? 'Nenhuma mídia selecionada'}
                </h2>
                <p className="text-[12.5px] truncate mt-0.5" style={{ color: theme.muted }}>
                  {activeRadio
                    ? `${activeRadio.country} · ${activeRadio.codec || 'Stream'} · ${activeRadio.bitrate || 128} kbps`
                    : activeTrack
                    ? `${activeTrack.artist} · ${activeTrack.album || activeTrack.folder}`
                    : 'Escolha uma música ou estação'}
                </p>
              </div>
              {!activeRadio && (
                <div className="w-full max-w-[360px]">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1000, durationMs)}
                    value={Math.min(currentMs, Math.max(1000, durationMs))}
                    onChange={(e) => onSeekMs(Number(e.target.value))}
                    style={{ accentColor: theme.accent }}
                    className="w-full h-1.5 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] tabular-nums mt-1" style={{ color: theme.dim }}>
                    <span>{formatTime(currentMs)}</span>
                    <span>{formatTime(durationMs)}</span>
                  </div>
                </div>
              )}
              <div className="w-full max-w-[340px] flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Aleatório"
                  onClick={onToggleShuffle}
                  className="w-10 h-10 flex items-center justify-center cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" style={{ color: shuffle ? theme.accent : theme.muted }} />
                </button>
                <button
                  type="button"
                  aria-label="Anterior"
                  onClick={() => onStepTrack(-1)}
                  className="w-11 h-11 flex items-center justify-center cursor-pointer"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </button>
                <button
                  type="button"
                  aria-label={isPlaying && !isPaused ? 'Pausar' : 'Tocar'}
                  onClick={onTogglePlayPause}
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.bg,
                    boxShadow: `0 10px 26px ${rgbToRgba(theme.accent, 0.38)}`,
                  }}
                  className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
                >
                  {isPlaying && !isPaused ? (
                    <Pause className="w-6 h-6 fill-current" />
                  ) : (
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Próxima"
                  onClick={() => onStepTrack(1)}
                  className="w-11 h-11 flex items-center justify-center cursor-pointer"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </button>
                <button
                  type="button"
                  aria-label="Repetição"
                  onClick={onCycleRepeat}
                  className="w-10 h-10 flex items-center justify-center cursor-pointer"
                >
                  {repeatMode === 1 ? (
                    <Repeat1 className="w-4 h-4" style={{ color: theme.accent }} />
                  ) : (
                    <Repeat className="w-4 h-4" style={{ color: repeatMode === 2 ? theme.accent : theme.muted }} />
                  )}
                </button>
              </div>
            </div>

            {/* Right Pane: Synchronized Lyrics / Queue / EQ & Sleep */}
            <div
              style={{ backgroundColor: rgbToRgba(theme.panel, 0.72), border: `1px solid ${subtleBorder}` }}
              className="h-full min-h-0 rounded-3xl p-4 flex flex-col overflow-hidden"
            >
              <div
                className="grid grid-cols-3 gap-1 p-1 rounded-xl shrink-0"
                style={{ backgroundColor: theme.bg }}
              >
                {[
                  { id: 'lyrics' as const, label: 'Letras .LRC', icon: Mic2 },
                  { id: 'queue' as const, label: 'Fila', icon: ListMusic },
                  { id: 'eq' as const, label: 'EQ · Sono', icon: sleepMinutes > 0 ? Timer : SlidersHorizontal },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = wideSideTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setWideSideTab(item.id)}
                      style={
                        active
                          ? { backgroundColor: theme.accent, color: theme.bg }
                          : { color: theme.muted }
                      }
                      className="min-h-[36px] rounded-lg flex items-center justify-center gap-1.5 text-[11.5px] font-bold cursor-pointer whitespace-nowrap"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 min-h-0 mt-3 overflow-y-auto kp-scroll">
                {wideSideTab === 'lyrics' && (
                  <div className="space-y-3 py-2 text-center">
                    {activeTrack?.lyrics && activeTrack.lyrics.length > 0 ? (
                      activeTrack.lyrics.map((line, i) => {
                        const active = i === activeLyricIndex;
                        return (
                          <button
                            key={`${line.timeMs}-${i}`}
                            type="button"
                            onClick={() => onSeekMs(line.timeMs)}
                            style={{
                              color: active ? theme.accent : theme.muted,
                              opacity: active ? 1 : 0.65,
                            }}
                            className={`block w-full text-center cursor-pointer transition-all ${
                              active ? 'text-[17px] font-extrabold scale-[1.02]' : 'text-[13.5px] font-medium'
                            }`}
                          >
                            {line.text}
                          </button>
                        );
                      })
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-[13px]" style={{ color: theme.muted }}>
                        <Mic2 className="w-7 h-7" style={{ color: theme.dim }} />
                        <p>Nenhuma letra .LRC sincronizada nesta faixa.</p>
                        <button
                          type="button"
                          onClick={onImportLocalFiles}
                          style={{ color: theme.accent }}
                          className="text-[12.5px] font-bold cursor-pointer mt-1"
                        >
                          + Importar arquivo .LRC
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {wideSideTab === 'queue' && (
                  <div className="space-y-1.5">
                    {audioTracks.map((t) => {
                      const active = activeTrack?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onPlayTrack(t)}
                          style={{
                            backgroundColor: active ? theme.elevated : theme.bg,
                            border: `1px solid ${active ? rgbToRgba(theme.accent, 0.4) : subtleBorder}`,
                          }}
                          className="w-full min-h-[50px] px-3 rounded-2xl flex items-center justify-between text-left cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <div
                              className="text-[13px] font-bold truncate"
                              style={{ color: active ? theme.accent : theme.text }}
                            >
                              {t.title}
                            </div>
                            <div className="text-[11px] truncate" style={{ color: theme.muted }}>
                              {t.artist}
                            </div>
                          </div>
                          <span className="text-[11px] tabular-nums" style={{ color: theme.dim }}>
                            {formatTime(t.durationMs)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {wideSideTab === 'eq' && (
                  <div className="space-y-4 py-1">
                    <div>
                      <div className="text-[12.5px] font-bold mb-2">Equalizador ({eqPreset})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {EQ_LIST.map((eq) => (
                          <button
                            key={eq}
                            type="button"
                            onClick={() => onSetEqPreset(eq)}
                            style={
                              eqPreset === eq
                                ? { backgroundColor: theme.accent, color: theme.bg }
                                : { backgroundColor: theme.bg, color: theme.text }
                            }
                            className="min-h-[34px] px-2.5 rounded-xl text-[11.5px] font-semibold cursor-pointer"
                          >
                            {eq}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[12.5px] font-bold mb-2">Velocidade ({playbackSpeed}x)</div>
                      <div className="flex gap-1.5">
                        {SPEED_LIST.map((sp) => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => onSetPlaybackSpeed(sp)}
                            style={
                              playbackSpeed === sp
                                ? { backgroundColor: theme.accent, color: theme.bg }
                                : { backgroundColor: theme.bg, color: theme.text }
                            }
                            className="flex-1 min-h-[34px] rounded-xl text-[11.5px] font-bold tabular-nums cursor-pointer"
                          >
                            {sp}x
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[12.5px] font-bold mb-2">
                        Timer de sono ({sleepMinutes === 0 ? 'Desligado' : `${sleepMinutes} min`})
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {SLEEP_LIST.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => onSetSleepMinutes(m)}
                            style={
                              sleepMinutes === m
                                ? { backgroundColor: theme.accent, color: theme.bg }
                                : { backgroundColor: theme.bg, color: theme.text }
                            }
                            className="min-h-[34px] rounded-xl text-[11.5px] font-semibold tabular-nums cursor-pointer"
                          >
                            {m === 0 ? 'Off' : `${m}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* COMPACT PORTRAIT LAYOUT (< 680px) */}
          <div className="flex-1 min-h-0 flex flex-col @min-[680px]:hidden">
          {/* Center Interactive Stage: Art | Synced LRC Lyrics | Queue | EQ & Sleep */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center my-3 overflow-hidden">
            {nowView === 'art' && (
              <div className="flex flex-col items-center">
                <div
                  className="p-3 rounded-full"
                  style={{
                    boxShadow: `0 20px 60px ${rgbToRgba(theme.accent, 0.25)}`,
                  }}
                >
                  <VinylArt
                    theme={theme}
                    size={212}
                    coverUrl={activeTrack?.coverUrl}
                    centerLogoUrl={activeRadio?.favicon || undefined}
                    spinning={isPlaying && !isPaused}
                  />
                </div>
                <div className="mt-4">
                  <AudioVisualizer theme={theme} bars={28} width={184} height={18} active={isPlaying && !isPaused} />
                </div>
              </div>
            )}

            {nowView === 'lyrics' && (
              <div className="w-full h-full overflow-y-auto kp-scroll px-2 py-4 space-y-3 text-center">
                {activeTrack?.lyrics && activeTrack.lyrics.length > 0 ? (
                  activeTrack.lyrics.map((line, i) => {
                    const active = i === activeLyricIndex;
                    return (
                      <button
                        key={`${line.timeMs}-${i}`}
                        type="button"
                        onClick={() => onSeekMs(line.timeMs)}
                        style={{
                          color: active ? theme.accent : theme.muted,
                          opacity: active ? 1 : 0.65,
                        }}
                        className={`block w-full text-center cursor-pointer transition-all ${
                          active ? 'text-[17px] font-extrabold scale-[1.02]' : 'text-[13.5px] font-medium'
                        }`}
                      >
                        {line.text}
                      </button>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-[13px]" style={{ color: theme.muted }}>
                    <Mic2 className="w-7 h-7" style={{ color: theme.dim }} />
                    <p>Nenhuma letra .LRC sincronizada nesta faixa.</p>
                    <button
                      type="button"
                      onClick={onImportLocalFiles}
                      style={{ color: theme.accent }}
                      className="text-[12.5px] font-bold cursor-pointer mt-1"
                    >
                      + Importar arquivo .LRC
                    </button>
                  </div>
                )}
              </div>
            )}

            {nowView === 'queue' && (
              <div className="w-full h-full overflow-y-auto kp-scroll space-y-1.5">
                {audioTracks.map((t) => {
                  const active = activeTrack?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onPlayTrack(t)}
                      style={{
                        backgroundColor: active ? theme.elevated : theme.panel,
                        border: `1px solid ${active ? rgbToRgba(theme.accent, 0.4) : subtleBorder}`,
                      }}
                      className="w-full min-h-[52px] px-3 rounded-2xl flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <div
                          className="text-[13px] font-bold truncate"
                          style={{ color: active ? theme.accent : theme.text }}
                        >
                          {t.title}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: theme.muted }}>
                          {t.artist}
                        </div>
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: theme.dim }}>
                        {formatTime(t.durationMs)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {nowView === 'eq' && (
              <div className="w-full h-full overflow-y-auto kp-scroll space-y-4 py-1">
                <div>
                  <div className="text-[12.5px] font-bold mb-2">Equalizador ({eqPreset})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {EQ_LIST.map((eq) => (
                      <button
                        key={eq}
                        type="button"
                        onClick={() => onSetEqPreset(eq)}
                        style={
                          eqPreset === eq
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { backgroundColor: theme.panel, color: theme.text }
                        }
                        className="min-h-[34px] px-2.5 rounded-xl text-[11.5px] font-semibold cursor-pointer"
                      >
                        {eq}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] font-bold mb-2">Velocidade ({playbackSpeed}x)</div>
                  <div className="flex gap-1.5">
                    {SPEED_LIST.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => onSetPlaybackSpeed(sp)}
                        style={
                          playbackSpeed === sp
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { backgroundColor: theme.panel, color: theme.text }
                        }
                        className="flex-1 min-h-[34px] rounded-xl text-[11.5px] font-bold tabular-nums cursor-pointer"
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] font-bold mb-2">
                    Timer de sono ({sleepMinutes === 0 ? 'Desligado' : `${sleepMinutes} min`})
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SLEEP_LIST.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onSetSleepMinutes(m)}
                        style={
                          sleepMinutes === m
                            ? { backgroundColor: theme.accent, color: theme.bg }
                            : { backgroundColor: theme.panel, color: theme.text }
                        }
                        className="min-h-[34px] rounded-xl text-[11.5px] font-semibold tabular-nums cursor-pointer"
                      >
                        {m === 0 ? 'Off' : `${m}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Track Title & Artist */}
          <div className="shrink-0">
            <h2 className="text-[20px] font-extrabold truncate leading-tight">
              {activeRadio?.name ?? activeTrack?.title ?? 'Nenhuma mídia selecionada'}
            </h2>
            <p className="text-[13px] truncate mt-0.5" style={{ color: theme.muted }}>
              {activeRadio
                ? `${activeRadio.country} · ${activeRadio.codec || 'Stream'} · ${activeRadio.bitrate || 128} kbps`
                : activeTrack
                ? `${activeTrack.artist} · ${activeTrack.album || activeTrack.folder}`
                : 'Escolha uma música ou estação'}
            </p>
          </div>

          {/* Interactive Scrubber */}
          {!activeRadio && (
            <div className="mt-3 shrink-0">
              <input
                type="range"
                min={0}
                max={Math.max(1000, durationMs)}
                value={Math.min(currentMs, Math.max(1000, durationMs))}
                onChange={(e) => onSeekMs(Number(e.target.value))}
                style={{ accentColor: theme.accent }}
                className="w-full h-1.5 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[11px] tabular-nums mt-1" style={{ color: theme.dim }}>
                <span>{formatTime(currentMs)}</span>
                <span>{formatTime(durationMs)}</span>
              </div>
            </div>
          )}

          {/* Thumb-Zone Transport Controls */}
          <div className="mt-3 flex items-center justify-between shrink-0">
            <button
              type="button"
              aria-label="Aleatório"
              onClick={onToggleShuffle}
              className="w-11 h-11 flex items-center justify-center cursor-pointer"
            >
              <Shuffle className="w-5 h-5" style={{ color: shuffle ? theme.accent : theme.muted }} />
            </button>
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => onStepTrack(-1)}
              className="w-12 h-12 flex items-center justify-center cursor-pointer"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            <button
              type="button"
              aria-label={isPlaying && !isPaused ? 'Pausar' : 'Tocar'}
              onClick={onTogglePlayPause}
              style={{
                backgroundColor: theme.accent,
                color: theme.bg,
                boxShadow: `0 12px 30px ${rgbToRgba(theme.accent, 0.4)}`,
              }}
              className="w-16 h-16 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
            >
              {isPlaying && !isPaused ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-0.5" />
              )}
            </button>
            <button
              type="button"
              aria-label="Próxima"
              onClick={() => onStepTrack(1)}
              className="w-12 h-12 flex items-center justify-center cursor-pointer"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
            <button
              type="button"
              aria-label="Repetição"
              onClick={onCycleRepeat}
              className="w-11 h-11 flex items-center justify-center cursor-pointer"
            >
              {repeatMode === 1 ? (
                <Repeat1 className="w-5 h-5" style={{ color: theme.accent }} />
              ) : (
                <Repeat className="w-5 h-5" style={{ color: repeatMode === 2 ? theme.accent : theme.muted }} />
              )}
            </button>
          </div>

          {/* 4-Way Bottom Utility Strip: Capa · Letras · Fila · EQ/Sono */}
          <div className="mt-4 grid grid-cols-4 gap-1.5 shrink-0">
            {[
              { id: 'art' as const, label: 'Disco', icon: Disc3 },
              { id: 'lyrics' as const, label: 'Letras', icon: Mic2 },
              { id: 'queue' as const, label: 'Fila', icon: ListMusic },
              { id: 'eq' as const, label: 'EQ · Sono', icon: sleepMinutes > 0 ? Timer : SlidersHorizontal },
            ].map((item) => {
              const Icon = item.icon;
              const active = nowView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNowView(item.id)}
                  style={{
                    backgroundColor: active ? rgbToRgba(theme.accent, 0.16) : theme.panel,
                    color: active ? theme.accent : theme.muted,
                  }}
                  className="min-h-[42px] rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-bold cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* ==================== VIDEO / IPTV FULL PORTRAIT PLAYER OVERLAY ==================== */}
      {activeVideoOverlay && (
        <div className="absolute inset-0 z-40 bg-black flex flex-col">
          <div
            className="pt-8 pb-2.5 px-3 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: theme.panel }}
          >
            <button
              type="button"
              aria-label="Fechar vídeo"
              onClick={() => setActiveVideoOverlay(null)}
              className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: theme.elevated }}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold truncate">{activeVideoOverlay.title}</div>
              <div className="text-[11px] truncate" style={{ color: theme.muted }}>
                {activeVideoOverlay.subtitle}
              </div>
            </div>
            {activeVideoOverlay.isLive && activeVideoOverlay.channel && (
              <button
                type="button"
                onClick={() => openEpgSheet(activeVideoOverlay.channel!)}
                style={{
                  backgroundColor: rgbToRgba(theme.accent, 0.16),
                  color: theme.accent,
                }}
                className="min-h-[36px] px-3 rounded-xl flex items-center gap-1.5 text-[11.5px] font-bold shrink-0 cursor-pointer"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Guia</span>
              </button>
            )}
          </div>

          <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
            <video
              ref={videoElRef}
              controls
              playsInline
              className={`w-full h-full ${
                videoFit === 1 ? 'object-cover' : videoFit === 2 ? 'object-fill' : 'object-contain'
              }`}
              onError={() => setVideoError('Não foi possível abrir este stream no navegador.')}
            />
            {videoError && (
              <div className="absolute inset-x-4 bottom-6 rounded-2xl bg-black/85 border border-white/15 p-3.5 text-center text-[12.5px] text-zinc-200">
                {videoError}
              </div>
            )}
          </div>

          <div
            className="px-3 py-3 flex items-center justify-between gap-2 shrink-0"
            style={{ backgroundColor: theme.panel }}
          >
            <button
              type="button"
              onClick={() => {
                if (videoElRef.current) videoElRef.current.currentTime = Math.max(0, videoElRef.current.currentTime - 10);
              }}
              style={{ backgroundColor: theme.elevated }}
              className="min-h-[40px] px-3 rounded-xl text-[12px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 10s
            </button>
            <button
              type="button"
              onClick={() => setVideoFit((f) => ((f + 1) % 3) as VideoFit)}
              style={{ backgroundColor: theme.elevated }}
              className="min-h-[40px] px-3 rounded-xl text-[12px] font-semibold cursor-pointer"
            >
              Ajuste: {videoFit === 0 ? 'Conter' : videoFit === 1 ? 'Preencher' : 'Esticar'}
            </button>
            <button
              type="button"
              onClick={() =>
                setVideoSpeed((s) => SPEED_LIST[(SPEED_LIST.indexOf(s) + 1) % SPEED_LIST.length])
              }
              style={{ backgroundColor: theme.elevated }}
              className="min-h-[40px] px-3 rounded-xl text-[12px] font-bold tabular-nums cursor-pointer"
            >
              {videoSpeed}x
            </button>
            <button
              type="button"
              onClick={() => {
                if (videoElRef.current) videoElRef.current.currentTime += 10;
              }}
              style={{ backgroundColor: theme.elevated }}
              className="min-h-[40px] px-3 rounded-xl text-[12px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              10s <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== LIVE IPTV EPG SCHEDULE ADAPTIVE SHEET ==================== */}
      {epgChannel && (
        <div
          className="absolute inset-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col justify-end @min-[680px]:justify-center @min-[680px]:p-6"
          onClick={() => setEpgChannel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: theme.bg, border: `1px solid ${subtleBorder}` }}
            className="h-[80%] @min-[680px]:h-[84%] max-w-2xl mx-auto w-full rounded-t-3xl @min-[680px]:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="w-10 h-1 rounded-full mx-auto my-2.5 bg-white/20" />
            <div className="px-4 pb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: theme.accent }}>
                  Guia de Programação (EPG) · Brasília
                </div>
                <div className="text-[16px] font-extrabold truncate mt-0.5">
                  {epgChannel.name}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {epgChannel.url && (
                  <button
                    type="button"
                    onClick={() => {
                      const ch = epgChannel;
                      setEpgChannel(null);
                      setActiveVideoOverlay({
                        title: ch.name,
                        subtitle: epgGuide?.now
                          ? `${epgGuide.now.title} · ${epgGuide.now.startLabel}–${epgGuide.now.stopLabel}`
                          : ch.group || 'TV ao Vivo',
                        url: ch.url,
                        fallbackUrls: ch.fallbackUrls,
                        isLive: true,
                        channel: ch,
                      });
                    }}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="min-h-[36px] px-3.5 rounded-xl text-[12px] font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Assistir</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEpgChannel(null)}
                  style={{ backgroundColor: theme.panel }}
                  className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto kp-scroll px-4 pb-5 space-y-3">
              {epgLoading ? (
                <div className="py-12 text-center text-[13px]" style={{ color: theme.muted }}>
                  Carregando grade ao vivo...
                </div>
              ) : !epgGuide || (!epgGuide.now && epgGuide.schedule.length === 0) ? (
                <div className="py-12 text-center space-y-1.5">
                  <div className="text-[14px] font-bold">Grade EPG indisponível para este canal</div>
                  <p className="text-[12px] max-w-sm mx-auto" style={{ color: theme.muted }}>
                    Este canal não possui correspondência no guia XMLTV aberto brasileiro no momento.
                  </p>
                </div>
              ) : (
                <>
                  {epgGuide.now && (
                    <div
                      style={{
                        backgroundColor: rgbToRgba(theme.accent, 0.12),
                        border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                      }}
                      className="p-3.5 rounded-2xl space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span style={{ color: theme.accent }}>NO AR AGORA</span>
                        <span className="tabular-nums">
                          {epgGuide.now.startLabel} – {epgGuide.now.stopLabel}
                        </span>
                      </div>
                      <div className="text-[15.5px] font-extrabold leading-snug">
                        {epgGuide.now.title}
                      </div>
                      {epgGuide.now.category && (
                        <div className="text-[11px] font-semibold" style={{ color: theme.accent }}>
                          {epgGuide.now.category}
                        </div>
                      )}
                      {epgGuide.now.desc && (
                        <p className="text-[12px] leading-relaxed" style={{ color: theme.muted }}>
                          {epgGuide.now.desc}
                        </p>
                      )}
                      <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: subtleBorder }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, Math.min(100, epgGuide.now.progressPct ?? 0))}%`,
                            backgroundColor: theme.accent,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {epgGuide.next && (
                    <div
                      style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                      className="p-3 rounded-2xl"
                    >
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span style={{ color: theme.muted }}>A SEGUIR</span>
                        <span className="tabular-nums" style={{ color: theme.accent }}>
                          {epgGuide.next.startLabel} – {epgGuide.next.stopLabel}
                        </span>
                      </div>
                      <div className="text-[13.5px] font-bold mt-0.5">{epgGuide.next.title}</div>
                    </div>
                  )}

                  {epgGuide.schedule.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: theme.muted }}>
                        Programação completa ({epgGuide.schedule.length})
                      </div>
                      {epgGuide.schedule.map((prog, i) => {
                        const isCurrent = epgGuide.now && prog.startMs === epgGuide.now.startMs;
                        return (
                          <div
                            key={`${prog.startMs}-${i}`}
                            style={{
                              backgroundColor: isCurrent ? rgbToRgba(theme.accent, 0.12) : theme.panel,
                              border: `1px solid ${isCurrent ? rgbToRgba(theme.accent, 0.35) : subtleBorder}`,
                            }}
                            className="px-3.5 py-2.5 rounded-2xl flex items-start gap-3"
                          >
                            <span
                              className="text-[11.5px] font-bold tabular-nums shrink-0 pt-0.5"
                              style={{ color: isCurrent ? theme.accent : theme.muted }}
                            >
                              {prog.startLabel}–{prog.stopLabel}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-bold leading-snug">{prog.title}</div>
                              {prog.desc && (
                                <p className="text-[11.5px] line-clamp-2 mt-0.5" style={{ color: theme.muted }}>
                                  {prog.desc}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== PLACAR DA BOLA MATCH DETAIL ADAPTIVE SHEET ==================== */}
      {selectedMatch && (
        <div
          className="absolute inset-0 z-40 bg-black/65 backdrop-blur-xs flex flex-col justify-end @min-[680px]:justify-center @min-[680px]:p-6"
          onClick={() => setSelectedMatch(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: theme.bg, border: `1px solid ${subtleBorder}` }}
            className="h-[80%] @min-[680px]:h-[84%] max-w-2xl mx-auto w-full rounded-t-3xl @min-[680px]:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="w-10 h-1 rounded-full mx-auto my-2.5 bg-white/20" />
            <div className="px-4 pb-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold" style={{ color: theme.accent }}>
                  {selectedMatch.league} · {selectedMatch.status}
                </div>
                <div className="text-[15.5px] font-extrabold truncate mt-0.5 tabular-nums">
                  {selectedMatch.home} {selectedMatch.score} {selectedMatch.away}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                style={{ backgroundColor: theme.panel }}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 grid grid-cols-3 gap-1 p-1 mx-4 rounded-xl" style={{ backgroundColor: theme.panel }}>
              {[
                { key: 'stats' as const, label: 'Estatísticas' },
                { key: 'events' as const, label: 'Eventos' },
                { key: 'lineups' as const, label: 'Escalações' },
              ].map((tItem) => (
                <button
                  key={tItem.key}
                  type="button"
                  onClick={() => setDetailTab(tItem.key)}
                  style={
                    detailTab === tItem.key
                      ? { backgroundColor: theme.accent, color: theme.bg }
                      : { color: theme.muted }
                  }
                  className="min-h-[34px] rounded-lg text-[11.5px] font-bold cursor-pointer"
                >
                  {tItem.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto kp-scroll px-4 py-3 space-y-2.5">
              {detailLoading ? (
                <div className="py-10 text-center text-[13px]" style={{ color: theme.muted }}>
                  Carregando detalhes da partida...
                </div>
              ) : !matchDetail ? (
                <div className="py-10 text-center text-[13px]" style={{ color: theme.muted }}>
                  Detalhes ainda indisponíveis para esta partida.
                </div>
              ) : detailTab === 'stats' ? (
                matchDetail.stats.length === 0 ? (
                  <div className="py-8 text-center text-[12.5px]" style={{ color: theme.muted }}>
                    Estatísticas ainda não disponíveis.
                  </div>
                ) : (
                  matchDetail.stats.map((st) => {
                    const total = Math.max(1, st.homeNum + st.awayNum);
                    const homePct = Math.round((st.homeNum / total) * 100);
                    return (
                      <div key={st.label} className="space-y-1">
                        <div className="flex justify-between text-[12px] tabular-nums">
                          <span className="font-bold">{st.home}</span>
                          <span style={{ color: theme.muted }}>{st.label}</span>
                          <span className="font-bold">{st.away}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden flex bg-white/10">
                          <div style={{ width: `${homePct}%`, backgroundColor: theme.accent }} />
                        </div>
                      </div>
                    );
                  })
                )
              ) : detailTab === 'events' ? (
                matchDetail.events.length === 0 ? (
                  <div className="py-8 text-center text-[12.5px]" style={{ color: theme.muted }}>
                    Nenhum evento registrado.
                  </div>
                ) : (
                  matchDetail.events.map((ev, i) => (
                    <div
                      key={i}
                      style={{ backgroundColor: theme.panel }}
                      className="px-3 py-2.5 rounded-xl flex items-center gap-3 text-[12.5px]"
                    >
                      <span className="font-extrabold tabular-nums w-9 shrink-0" style={{ color: theme.accent }}>
                        {ev.minute}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold truncate">{ev.desc}</div>
                        <div className="text-[11px]" style={{ color: theme.muted }}>
                          {ev.team}
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-[12px]">
                  <div className="space-y-1">
                    <div className="font-bold mb-1.5" style={{ color: theme.accent }}>
                      {selectedMatch.home}
                    </div>
                    {matchDetail.homeLineup.map((p, i) => (
                      <div key={i} className="truncate" style={{ color: theme.text }}>
                        <span className="tabular-nums mr-1.5" style={{ color: theme.muted }}>
                          {p.jersey}
                        </span>
                        {p.name}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold mb-1.5" style={{ color: theme.accent }}>
                      {selectedMatch.away}
                    </div>
                    {matchDetail.awayLineup.map((p, i) => (
                      <div key={i} className="truncate" style={{ color: theme.text }}>
                        <span className="tabular-nums mr-1.5" style={{ color: theme.muted }}>
                          {p.jersey}
                        </span>
                        {p.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TERMS & TRANSPARENCY MODAL ==================== */}
      {showTermsModal && (
        <div
          className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col justify-end @min-[680px]:justify-center @min-[680px]:p-6"
          onClick={() => setShowTermsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: theme.bg, border: `1px solid ${subtleBorder}` }}
            className="h-[84%] max-w-2xl mx-auto w-full rounded-t-3xl @min-[680px]:rounded-3xl flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3.5 flex items-center justify-between border-b" style={{ borderColor: subtleBorder }}>
              <h3 className="text-[16px] font-extrabold">Termos de Uso & Transparência</h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                style={{ backgroundColor: theme.panel }}
                className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto kp-scroll p-4 space-y-3">
              {TERMS_PAGES.map((page) => (
                <div
                  key={page.title}
                  style={{ backgroundColor: theme.panel, border: `1px solid ${subtleBorder}` }}
                  className="p-3.5 rounded-2xl space-y-1.5"
                >
                  <div className="text-[13.5px] font-bold" style={{ color: theme.accent }}>
                    {tr(page.title, language)}
                  </div>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: theme.muted }}>
                    {page.body[language] ?? page.body[0]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
