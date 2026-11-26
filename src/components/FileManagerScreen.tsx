import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  File as FileIcon,
  FileAudio,
  FileCode2,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  ListMusic,
  Lock,
  MoreHorizontal,
  Music,
  PackageOpen,
  Pause,
  Pencil,
  Play,
  Radio,
  RefreshCw,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  Square,
  Terminal,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { KpTheme } from '../themes';
import type { LanguageCode } from '../types';
import type { R36SButton } from './R36SControls';
import { HeaderBar } from './HeaderBar';
import {
  FooterBar,
  ModernBackdrop,
  mixRgb,
  modernCardStyle,
  modernPanelStyle,
  rgbToRgba,
  themeHairline,
} from './R36SIcons';
import { GameTrainerHud, TRAINER_ROW_COUNT } from './GameTrainerOverlay';

export interface FileManagerScreenHandle {
  handleButton: (btn: R36SButton) => void;
  isInGameLaunch: () => boolean;
}

export interface FmPlayMediaPayload {
  path: string;
  name: string;
  kind: 'audio' | 'video';
  url: string;
}

export interface FmPlayRadioPayload {
  name: string;
  url: string;
  group?: string;
}

export interface FmPlayPlaylistStreamPayload {
  name: string;
  url: string;
  group?: string;
  isVideo: boolean;
}

export interface ActiveBgAudioInfo {
  title: string;
  kind: 'music' | 'radio';
  isPlaying: boolean;
  index: number;
  total: number;
}

interface FileManagerScreenProps {
  theme: KpTheme;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  notify: (msg: string) => void;
  bgAudioPreview?: boolean;
  activeBackgroundAudio?: ActiveBgAudioInfo | null;
  bgAudioVolume?: number;
  onChangeBgAudioVolume?: (delta: number) => void;
  onBgPrevTrack?: () => void;
  onBgNextTrack?: () => void;
  onBgTogglePause?: () => void;
  onSetGameAudioDucking?: (ducked: boolean) => void;
  onBack: () => void;
  onPlayMedia?: (item: FmPlayMediaPayload) => void;
  onPlayRadio?: (item: FmPlayRadioPayload) => void;
  onPlayPlaylistStream?: (item: FmPlayPlaylistStreamPayload) => void;
}

interface FmEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
  isHidden: boolean;
  isArchive: boolean;
  isPdf?: boolean;
  isText?: boolean;
  isScript?: boolean;
  isExecutable?: boolean;
  isPlaylist?: boolean;
  isRadio?: boolean;
  isAudio?: boolean;
  isVideo?: boolean;
  ext: string;
}

interface QuickRoot {
  label: string;
  path: string;
}

interface ArchiveEntry {
  path: string;
  size: number;
  is_dir: boolean;
  encrypted: boolean;
}

interface ParsedMediaItem {
  title: string;
  url: string;
  isLocal: boolean;
  isVideo: boolean;
  group: string;
}

interface EditorState {
  path: string;
  name: string;
  ext: string;
  content: string;
  savedContent: string;
  saving: boolean;
  isScript: boolean;
}

interface MediaListState {
  path: string;
  name: string;
  kind: 'playlist' | 'radio';
  items: ParsedMediaItem[];
  selectedIdx: number;
}

interface LaunchPreviewState {
  path: string;
  name: string;
  kind: 'script' | 'executable';
  interpreter: string;
  targetDir: string;
  logLines: string[];
  bgAudioActive?: boolean;
  bgAudioLabel?: string;
}

interface PdfViewState {
  path: string;
  name: string;
  title: string;
  pageCount: number;
  currentPage: number;
  zoom: number;
  mode: 'document' | 'text';
  encrypted: boolean;
  pageTexts: string[];
  engine: string;
  pdfcraftRepo: string;
}

interface FmClipboard {
  mode: 'copy' | 'move';
  items: string[];
}

interface FmJobProgress {
  id: string;
  op: string;
  status: 'running' | 'done' | 'error' | 'cancelled' | 'bad_password';
  percent: number;
  bytesDone: number;
  bytesTotal: number;
  speedBps: number;
  etaSec: number;
  itemsDone: number;
  itemsTotal: number;
  currentFile: string;
  message: string;
  badPassword: boolean;
}

type ModalMode =
  | null
  | { kind: 'actions'; target: FmEntry | null }
  | { kind: 'roots' }
  | { kind: 'mkdir' }
  | { kind: 'rename'; target: FmEntry }
  | { kind: 'compress'; sources: string[] }
  | { kind: 'confirm_delete'; targets: string[]; label: string }
  | { kind: 'exec_choice'; target: FmEntry }
  | { kind: 'exec_console'; preview: LaunchPreviewState }
  | { kind: 'editor_unsaved' }
  | {
      kind: 'password';
      purpose: 'list' | 'extract';
      archivePath: string;
      extractDest?: string;
      error?: string;
    };

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ts']);
const TEXT_EXTS = new Set([
  '.txt',
  '.xml',
  '.html',
  '.htm',
  '.sh',
  '.cfg',
  '.conf',
  '.ini',
  '.json',
  '.md',
  '.log',
  '.py',
  '.css',
  '.js',
  '.pls',
  '.m3u',
  '.m3u8',
  '.xspf',
  '.tsv',
  '.csv',
  '.yaml',
  '.yml',
  '.nfo',
  '.lrc',
]);
const PLAYLIST_EXTS = new Set(['.m3u', '.m3u8', '.xspf']);
const RADIO_EXTS = new Set(['.pls']);

function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  if (bps < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
  return `${(bps / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
}

function formatEta(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return 'Calculando...';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${String(remS).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${String(remM).padStart(2, '0')}m`;
}

function opLabelPt(op: string): string {
  switch (op) {
    case 'copy':
      return 'Copiando arquivos';
    case 'move':
      return 'Movendo arquivos';
    case 'delete':
      return 'Apagando itens';
    case 'extract':
      return 'Descompactando (7-Zip)';
    case 'compress':
      return 'Compactando ZIP';
    default:
      return 'Processando';
  }
}

function baseNamePosix(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function stripArchiveExt(name: string): string {
  return (
    name.replace(/\.(tar\.gz|tar\.xz|tar\.bz2|zip|7z|rar|tar|gz|tgz|xz|txz|bz2|tbz2|cbz|cbr|iso)$/i, '') ||
    'extraido'
  );
}

function isEntryAudio(e: FmEntry): boolean {
  return Boolean(e.isAudio ?? AUDIO_EXTS.has(e.ext));
}

function isEntryVideo(e: FmEntry): boolean {
  return Boolean(e.isVideo ?? VIDEO_EXTS.has(e.ext));
}

function isEntryScript(e: FmEntry): boolean {
  return Boolean(e.isScript ?? e.ext === '.sh');
}

function isEntryExecutable(e: FmEntry): boolean {
  return Boolean(e.isExecutable ?? false);
}

function isEntryRadio(e: FmEntry): boolean {
  return Boolean(e.isRadio ?? RADIO_EXTS.has(e.ext));
}

function isEntryPlaylist(e: FmEntry): boolean {
  return Boolean(e.isPlaylist ?? PLAYLIST_EXTS.has(e.ext));
}

function isEntryText(e: FmEntry): boolean {
  return Boolean(e.isText ?? TEXT_EXTS.has(e.ext));
}

function isEntryPdf(e: FmEntry): boolean {
  return Boolean(e.isPdf ?? e.ext === '.pdf');
}

function formatEntryTag(entry: FmEntry): string {
  if (entry.isDir) return 'PASTA';
  if (isEntryScript(entry)) return 'SH';
  if (isEntryExecutable(entry)) return 'EXEC';
  if (isEntryPdf(entry)) return 'PDF';
  if (entry.isArchive) return '7Z/ZIP';
  if (isEntryRadio(entry)) return 'RÁDIO';
  if (isEntryPlaylist(entry)) return entry.ext === '.m3u8' ? 'M3U8' : 'PLAYLIST';
  if (isEntryVideo(entry)) return 'VÍDEO';
  if (isEntryAudio(entry)) return 'ÁUDIO';
  if (entry.ext === '.xml') return 'XML';
  if (entry.ext === '.html' || entry.ext === '.htm') return 'HTML';
  if (entry.ext === '.txt') return 'TXT';
  if (isEntryText(entry)) return entry.ext ? entry.ext.slice(1).toUpperCase() : 'TXT';
  return '';
}

function formatEditorBadge(ext: string): string {
  if (!ext) return 'TXT';
  return ext.replace(/^\./, '').toUpperCase();
}

export const FileManagerScreen = forwardRef<FileManagerScreenHandle, FileManagerScreenProps>(
  (
    {
      theme,
      locationLabel,
      toast,
      notify,
      bgAudioPreview = false,
      activeBackgroundAudio = null,
      bgAudioVolume = 55,
      onChangeBgAudioVolume,
      onBgPrevTrack,
      onBgNextTrack,
      onBgTogglePause,
      onSetGameAudioDucking,
      onBack,
      onPlayMedia,
      onPlayRadio,
      onPlayPlaylistStream,
    },
    ref
  ) => {
    const [currentPath, setCurrentPath] = useState<string>('/');
    const [parentPath, setParentPath] = useState<string>('/');
    const [entries, setEntries] = useState<FmEntry[]>([]);
    const [quickRoots, setQuickRoots] = useState<QuickRoot[]>([
      { label: '/ (Raiz)', path: '/' },
      { label: '/roms', path: '/roms' },
      { label: '/roms/ports', path: '/roms/ports' },
      { label: '/roms/iptv', path: '/roms/iptv' },
      { label: '/roms/radios', path: '/roms/radios' },
      { label: '/home/ark/Downloads', path: '/home/ark/Downloads' },
    ]);
    const [showHidden, setShowHidden] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [clipboard, setClipboard] = useState<FmClipboard | null>(null);

    // Subviews (Archive, Text Editor, Playlist / Radio List)
    const [archiveView, setArchiveView] = useState<{
      path: string;
      name: string;
      engine: string;
      encrypted: boolean;
      password: string;
      totalSize: number;
      items: ArchiveEntry[];
      selectedIdx: number;
    } | null>(null);
    const [editorView, setEditorView] = useState<EditorState | null>(null);
    const [mediaListView, setMediaListView] = useState<MediaListState | null>(null);
    const [pdfView, setPdfView] = useState<PdfViewState | null>(null);

    // Modal state
    const [modal, setModal] = useState<ModalMode>(null);
    const [modalFocusIdx, setModalFocusIdx] = useState(0);
    const [textInput, setTextInput] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    // In-Game GTA Trainer Mini-Player: strictly hidden until L3 + R3 is triggered
    const [inGameMiniPlayerOpen, setInGameMiniPlayerOpen] = useState(false);
    const [trainerRow, setTrainerRow] = useState(0);
    const [l3Armed, setL3Armed] = useState(false);
    const l3ArmTimerRef = useRef<number | null>(null);

    // Live job progress state
    const [activeJob, setActiveJob] = useState<FmJobProgress | null>(null);
    const [jobMeta, setJobMeta] = useState<{
      action: string;
      archivePath?: string;
      extractDest?: string;
    } | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const editorGutterRef = useRef<HTMLDivElement>(null);

    const loadDirectory = useCallback(
      async (targetPath: string, hiddenFlag?: boolean) => {
        const useHidden = hiddenFlag ?? showHidden;
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(
            `/api/fm/list?path=${encodeURIComponent(targetPath)}&hidden=${useHidden ? '1' : '0'}`
          );
          const data = (await res.json()) as {
            ok?: boolean;
            path?: string;
            parentPath?: string;
            entries?: FmEntry[];
            quickRoots?: QuickRoot[];
            error?: string;
          };
          if (!res.ok || !data.ok) {
            setError(data.error || 'Falha ao abrir pasta');
            setLoading(false);
            return;
          }
          setCurrentPath(data.path || '/');
          setParentPath(data.parentPath || '/');
          setEntries(Array.isArray(data.entries) ? data.entries : []);
          if (Array.isArray(data.quickRoots) && data.quickRoots.length > 0) {
            setQuickRoots(data.quickRoots);
          }
          setSelectedIdx(0);
          setSelectedPaths(new Set());
        } catch {
          setError('Não foi possível conectar ao gerenciador de arquivos');
        } finally {
          setLoading(false);
        }
      },
      [showHidden]
    );

    useEffect(() => {
      void loadDirectory('/', false);
    }, [loadDirectory]);

    useEffect(() => {
      return () => {
        if (pollTimerRef.current !== null) {
          window.clearInterval(pollTimerRef.current);
        }
        if (l3ArmTimerRef.current !== null) {
          window.clearTimeout(l3ArmTimerRef.current);
        }
        onSetGameAudioDucking?.(false);
      };
    }, [onSetGameAudioDucking]);

    // v2.1.5 Teste prévio: duck active music/radio smoothly while a game launch preview console is open
    useEffect(() => {
      const shouldDuck = Boolean(
        modal?.kind === 'exec_console' && bgAudioPreview && activeBackgroundAudio
      );
      onSetGameAudioDucking?.(shouldDuck);
      if (modal?.kind !== 'exec_console') {
        setInGameMiniPlayerOpen(false);
        setL3Armed(false);
        setTrainerRow(0);
      }
    }, [activeBackgroundAudio, bgAudioPreview, modal, onSetGameAudioDucking]);

    const toggleInGameMiniPlayer = useCallback(() => {
      if (!bgAudioPreview) {
        notify('Ative "Áudio em jogos (Teste prévio)" em Opções primeiro');
        return;
      }
      setInGameMiniPlayerOpen((open) => {
        const next = !open;
        if (next && activeBackgroundAudio && !activeBackgroundAudio.isPlaying) {
          onBgTogglePause?.();
        }
        return next;
      });
    }, [activeBackgroundAudio, bgAudioPreview, notify, onBgTogglePause]);

    const activateTrainerRow = useCallback(
      (row: number) => {
        if (row === 0) {
          onBgTogglePause?.();
        } else if (row === 1) {
          onBgNextTrack?.();
        } else if (row === 2) {
          onBgPrevTrack?.();
        } else if (row === 3) {
          onChangeBgAudioVolume?.(bgAudioVolume >= 100 ? -80 : 10);
        } else if (row === 4) {
          setInGameMiniPlayerOpen(false);
        }
      },
      [bgAudioVolume, onBgNextTrack, onBgPrevTrack, onBgTogglePause, onChangeBgAudioVolume]
    );

    // Keep focused row scrolled into view
    useEffect(() => {
      const container = listRef.current;
      if (!container) return;
      const idx = archiveView
        ? archiveView.selectedIdx
        : mediaListView
        ? mediaListView.selectedIdx
        : selectedIdx;
      const el = container.querySelector<HTMLElement>(`[data-fm-row="${idx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx, archiveView, mediaListView]);

    const currentEntry = entries[selectedIdx] ?? null;

    const getEffectiveTargets = useCallback(
      (explicitTarget?: FmEntry | null): string[] => {
        if (selectedPaths.size > 0) return Array.from(selectedPaths);
        const item = explicitTarget ?? currentEntry;
        return item ? [item.path] : [];
      },
      [selectedPaths, currentEntry]
    );

    const stopJobPolling = useCallback(() => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }, []);

    const startJob = useCallback(
      async (payload: {
        action: 'copy' | 'move' | 'delete' | 'extract' | 'compress';
        sources: string[];
        dest?: string;
        password?: string;
        outputName?: string;
      }) => {
        stopJobPolling();
        setModal(null);
        setJobMeta({
          action: payload.action,
          archivePath: payload.action === 'extract' ? payload.sources[0] : undefined,
          extractDest: payload.action === 'extract' ? payload.dest : undefined,
        });
        setActiveJob({
          id: 'starting',
          op: payload.action,
          status: 'running',
          percent: 0,
          bytesDone: 0,
          bytesTotal: 0,
          speedBps: 0,
          etaSec: -1,
          itemsDone: 0,
          itemsTotal: payload.sources.length,
          currentFile: baseNamePosix(payload.sources[0] || ''),
          message: 'Preparando operação...',
          badPassword: false,
        });

        try {
          const res = await fetch('/api/fm/job/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = (await res.json()) as { ok?: boolean; jobId?: string; error?: string };
          if (!res.ok || !data.ok || !data.jobId) {
            setActiveJob(null);
            notify(data.error || 'Falha ao iniciar operação');
            return;
          }

          const jobId = data.jobId;
          const pollOnce = async () => {
            try {
              const jr = await fetch(`/api/fm/job/${encodeURIComponent(jobId)}`);
              const jd = (await jr.json()) as { ok?: boolean; job?: FmJobProgress };
              if (!jr.ok || !jd.ok || !jd.job) return;
              const job = jd.job;
              setActiveJob(job);

              if (job.status !== 'running') {
                stopJobPolling();
                if (job.status === 'bad_password' || job.badPassword) {
                  setActiveJob(null);
                  setTextInput('');
                  setShowPassword(false);
                  setModal({
                    kind: 'password',
                    purpose: 'extract',
                    archivePath: payload.sources[0],
                    extractDest: payload.dest,
                    error: payload.password
                      ? 'Senha incorreta. Tente novamente.'
                      : 'Este arquivo é protegido por senha.',
                  });
                  return;
                }
                window.setTimeout(() => {
                  setActiveJob(null);
                  if (job.status === 'done') {
                    if (payload.action === 'move') setClipboard(null);
                    setArchiveView(null);
                    notify(job.message || 'Operação concluída com sucesso');
                  } else if (job.status === 'cancelled') {
                    notify('Operação cancelada');
                  } else {
                    notify(job.message || 'Erro na operação de arquivo');
                  }
                  void loadDirectory(currentPath);
                }, 420);
              }
            } catch {
              // ignore transient poll error
            }
          };

          void pollOnce();
          pollTimerRef.current = window.setInterval(() => {
            void pollOnce();
          }, 140);
        } catch {
          setActiveJob(null);
          notify('Erro ao comunicar com o gerenciador de arquivos');
        }
      },
      [currentPath, loadDirectory, notify, stopJobPolling]
    );

    const cancelActiveJob = useCallback(async () => {
      if (!activeJob || activeJob.id === 'starting' || activeJob.status !== 'running') return;
      try {
        await fetch(`/api/fm/job/${encodeURIComponent(activeJob.id)}/cancel`, { method: 'POST' });
        notify('Cancelando operação...');
      } catch {
        // ignore
      }
    }, [activeJob, notify]);

    const openArchive = useCallback(
      async (archivePath: string, password = '') => {
        setLoading(true);
        try {
          const res = await fetch('/api/fm/archive/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: archivePath, password }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            engine?: string;
            encrypted?: boolean;
            badPassword?: boolean;
            totalSize?: number;
            items?: ArchiveEntry[];
            error?: string;
          };
          if (data.badPassword) {
            setTextInput('');
            setShowPassword(false);
            setModal({
              kind: 'password',
              purpose: 'list',
              archivePath,
              error: password ? 'Senha incorreta. Tente novamente.' : 'Arquivo protegido por senha.',
            });
            return;
          }
          if (!data.ok) {
            notify(data.error || 'Não foi possível abrir o arquivo compactado');
            return;
          }
          setModal(null);
          setEditorView(null);
          setMediaListView(null);
          setArchiveView({
            path: archivePath,
            name: baseNamePosix(archivePath),
            engine: data.engine || '7-Zip',
            encrypted: Boolean(data.encrypted),
            password,
            totalSize: Number(data.totalSize) || 0,
            items: Array.isArray(data.items) ? data.items : [],
            selectedIdx: 0,
          });
        } catch {
          notify('Falha ao inspecionar arquivo compactado');
        } finally {
          setLoading(false);
        }
      },
      [notify]
    );

    // ==================== v2.1.3 TEXT EDITOR ====================
    const openTextEditor = useCallback(
      async (filePath: string) => {
        setLoading(true);
        try {
          const res = await fetch(`/api/fm/text?path=${encodeURIComponent(filePath)}`);
          const data = (await res.json()) as {
            ok?: boolean;
            path?: string;
            name?: string;
            ext?: string;
            content?: string;
            error?: string;
          };
          if (!res.ok || !data.ok) {
            notify(data.error || 'Não foi possível abrir no editor de texto');
            return;
          }
          setModal(null);
          setArchiveView(null);
          setMediaListView(null);
          const content = data.content ?? '';
          const ext = data.ext || '';
          setEditorView({
            path: data.path || filePath,
            name: data.name || baseNamePosix(filePath),
            ext,
            content,
            savedContent: content,
            saving: false,
            isScript: ext === '.sh',
          });
        } catch {
          notify('Erro ao carregar arquivo de texto');
        } finally {
          setLoading(false);
        }
      },
      [notify]
    );

    const saveEditorFile = useCallback(async () => {
      if (!editorView || editorView.saving) return false;
      setEditorView((prev) => (prev ? { ...prev, saving: true } : prev));
      try {
        const res = await fetch('/api/fm/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: editorView.path, content: editorView.content }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          notify(data.error || 'Falha ao salvar arquivo');
          setEditorView((prev) => (prev ? { ...prev, saving: false } : prev));
          return false;
        }
        setEditorView((prev) => (prev ? { ...prev, savedContent: prev.content, saving: false } : prev));
        notify(`Arquivo "${editorView.name}" salvo`);
        void loadDirectory(currentPath);
        return true;
      } catch {
        notify('Erro ao salvar arquivo');
        setEditorView((prev) => (prev ? { ...prev, saving: false } : prev));
        return false;
      }
    }, [currentPath, editorView, loadDirectory, notify]);

    const requestCloseEditor = useCallback(() => {
      if (!editorView) return;
      if (editorView.content !== editorView.savedContent) {
        setModalFocusIdx(0);
        setModal({ kind: 'editor_unsaved' });
      } else {
        setEditorView(null);
      }
    }, [editorView]);

    // ==================== v2.1.3 PLAYLIST / RADIO PARSER ====================
    const openMediaList = useCallback(
      async (filePath: string) => {
        setLoading(true);
        try {
          const res = await fetch('/api/fm/parse-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            path?: string;
            name?: string;
            kind?: 'playlist' | 'radio';
            items?: ParsedMediaItem[];
            error?: string;
          };
          if (!res.ok || !data.ok) {
            notify(data.error || 'Não foi possível ler esta lista');
            return;
          }
          setModal(null);
          setArchiveView(null);
          setEditorView(null);
          setMediaListView({
            path: data.path || filePath,
            name: data.name || baseNamePosix(filePath),
            kind: data.kind === 'radio' ? 'radio' : 'playlist',
            items: Array.isArray(data.items) ? data.items : [],
            selectedIdx: 0,
          });
        } catch {
          notify('Falha ao abrir playlist ou arquivo de rádio');
        } finally {
          setLoading(false);
        }
      },
      [notify]
    );

    const playParsedMediaItem = useCallback(
      (item: ParsedMediaItem, listKind: 'playlist' | 'radio') => {
        if (item.isLocal) {
          const mediaUrl = `/api/fm/raw?path=${encodeURIComponent(item.url)}`;
          onPlayMedia?.({
            path: item.url,
            name: item.title || baseNamePosix(item.url),
            kind: item.isVideo ? 'video' : 'audio',
            url: mediaUrl,
          });
          return;
        }
        if (listKind === 'radio' || !item.isVideo) {
          onPlayRadio?.({
            name: item.title,
            url: item.url,
            group: item.group || 'Arquivo de Rádio',
          });
          return;
        }
        onPlayPlaylistStream?.({
          name: item.title,
          url: item.url,
          group: item.group || 'Playlist M3U8',
          isVideo: item.isVideo,
        });
      },
      [onPlayMedia, onPlayPlaylistStream, onPlayRadio]
    );

    // ==================== v2.1.4 PDF VIEWER (PdfCraft R36S COMPATIBLE) ====================
    const openPdfDocument = useCallback(
      async (filePath: string) => {
        setLoading(true);
        try {
          const res = await fetch('/api/fm/pdf/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            path?: string;
            name?: string;
            title?: string;
            pageCount?: number;
            encrypted?: boolean;
            pageTexts?: string[];
            engine?: string;
            pdfcraftCompat?: { repo?: string };
            error?: string;
          };
          if (!res.ok || !data.ok) {
            notify(data.error || 'Não foi possível abrir o arquivo PDF');
            return;
          }
          setModal(null);
          setArchiveView(null);
          setEditorView(null);
          setMediaListView(null);
          const pageTexts = Array.isArray(data.pageTexts) ? data.pageTexts : [];
          setPdfView({
            path: data.path || filePath,
            name: data.name || baseNamePosix(filePath),
            title: data.title || baseNamePosix(filePath),
            pageCount: Math.max(1, Number(data.pageCount) || 1),
            currentPage: 1,
            zoom: 100,
            mode: 'document',
            encrypted: Boolean(data.encrypted),
            pageTexts,
            engine: data.engine || 'KPlayer PDF + PdfCraft R36S',
            pdfcraftRepo: data.pdfcraftCompat?.repo || 'kaiaum01/PdfReader-R36s',
          });
        } catch {
          notify('Falha ao abrir documento PDF');
        } finally {
          setLoading(false);
        }
      },
      [notify]
    );

    // ==================== v2.1.3 / v2.1.4 .SH & EMULATIONSTATION LAUNCHER ====================
    const launchR36sTarget = useCallback(
      async (filePath: string) => {
        setLoading(true);
        try {
          const res = await fetch('/api/fm/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: filePath,
              bgAudioPreview,
              activeMediaTitle: activeBackgroundAudio?.title || '',
              activeMediaKind: activeBackgroundAudio?.kind || null,
            }),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            path?: string;
            name?: string;
            kind?: 'script' | 'executable';
            interpreter?: string;
            targetDir?: string;
            logLines?: string[];
            bgAudioActive?: boolean;
            error?: string;
          };
          if (!res.ok || !data.ok) {
            notify(data.error || 'Não foi possível executar este arquivo');
            return;
          }
          const bgActive = Boolean(
            (data.bgAudioActive ?? (bgAudioPreview && Boolean(activeBackgroundAudio))) && bgAudioPreview
          );
          setModal({
            kind: 'exec_console',
            preview: {
              path: data.path || filePath,
              name: data.name || baseNamePosix(filePath),
              kind: data.kind === 'executable' ? 'executable' : 'script',
              interpreter: data.interpreter || '/bin/bash',
              targetDir: data.targetDir || '/',
              logLines: Array.isArray(data.logLines) ? data.logLines : [],
              bgAudioActive: bgActive,
              bgAudioLabel: activeBackgroundAudio
                ? `${activeBackgroundAudio.kind === 'radio' ? 'Rádio' : 'Música'}: ${activeBackgroundAudio.title}`
                : undefined,
            },
          });
        } catch {
          notify('Falha ao iniciar script ou executável');
        } finally {
          setLoading(false);
        }
      },
      [activeBackgroundAudio, bgAudioPreview, notify]
    );

    const playDirectMediaEntry = useCallback(
      (entry: FmEntry) => {
        const kind: 'audio' | 'video' = isEntryVideo(entry) ? 'video' : 'audio';
        onPlayMedia?.({
          path: entry.path,
          name: entry.name,
          kind,
          url: `/api/fm/raw?path=${encodeURIComponent(entry.path)}`,
        });
      },
      [onPlayMedia]
    );

    const requestExtract = useCallback(
      (archivePath: string, intoSubfolder: boolean, knownPassword = '', knownEncrypted = false) => {
        const name = baseNamePosix(archivePath);
        const dest = intoSubfolder
          ? currentPath === '/'
            ? `/${stripArchiveExt(name)}`
            : `${currentPath}/${stripArchiveExt(name)}`
          : currentPath;
        if (knownEncrypted && !knownPassword) {
          setTextInput('');
          setShowPassword(false);
          setModal({
            kind: 'password',
            purpose: 'extract',
            archivePath,
            extractDest: dest,
            error: 'Informe a senha para descompactar este arquivo.',
          });
          return;
        }
        void startJob({
          action: 'extract',
          sources: [archivePath],
          dest,
          password: knownPassword || undefined,
        });
      },
      [currentPath, startJob]
    );

    const handleMkdirSubmit = useCallback(async () => {
      const name = textInput.trim();
      if (!name) return;
      try {
        const res = await fetch('/api/fm/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parent: currentPath, name }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          notify(data.error || 'Não foi possível criar a pasta');
          return;
        }
        setModal(null);
        setTextInput('');
        notify(`Pasta "${name}" criada`);
        void loadDirectory(currentPath);
      } catch {
        notify('Erro ao criar pasta');
      }
    }, [currentPath, loadDirectory, notify, textInput]);

    const handleRenameSubmit = useCallback(async () => {
      if (modal?.kind !== 'rename') return;
      const newName = textInput.trim();
      if (!newName || newName === modal.target.name) {
        setModal(null);
        return;
      }
      try {
        const res = await fetch('/api/fm/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: modal.target.path, newName }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          notify(data.error || 'Não foi possível renomear');
          return;
        }
        setModal(null);
        setTextInput('');
        notify(`Renomeado para "${newName}"`);
        void loadDirectory(currentPath);
      } catch {
        notify('Erro ao renomear item');
      }
    }, [currentPath, loadDirectory, modal, notify, textInput]);

    const handleCompressSubmit = useCallback(() => {
      if (modal?.kind !== 'compress') return;
      const outName = textInput.trim() || 'arquivo.zip';
      void startJob({
        action: 'compress',
        sources: modal.sources,
        dest: currentPath,
        outputName: outName,
      });
    }, [currentPath, modal, startJob, textInput]);

    const handlePasswordSubmit = useCallback(() => {
      if (modal?.kind !== 'password') return;
      const pwd = textInput;
      if (!pwd) return;
      if (modal.purpose === 'list') {
        void openArchive(modal.archivePath, pwd);
      } else {
        void startJob({
          action: 'extract',
          sources: [modal.archivePath],
          dest: modal.extractDest || currentPath,
          password: pwd,
        });
      }
    }, [currentPath, modal, openArchive, startJob, textInput]);

    const handlePaste = useCallback(() => {
      if (!clipboard || clipboard.items.length === 0) {
        notify('Área de transferência vazia');
        return;
      }
      void startJob({
        action: clipboard.mode,
        sources: clipboard.items,
        dest: currentPath,
      });
    }, [clipboard, currentPath, notify, startJob]);

    const toggleSelectPath = useCallback((p: string) => {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p);
        else next.add(p);
        return next;
      });
    }, []);

    const execChoiceOptions = useMemo(() => {
      if (modal?.kind !== 'exec_choice') return [];
      const target = modal.target;
      const runDesc = bgAudioPreview
        ? activeBackgroundAudio
          ? `Teste prévio ATIVO: ${activeBackgroundAudio.kind === 'radio' ? 'rádio' : 'música'} "${activeBackgroundAudio.title}" • Aperte L3 + R3 no jogo para abrir o Trainer`
          : 'Teste prévio ATIVO: aperte L3 + R3 no jogo para abrir o Trainer de Música'
        : 'Encerra SDL2/libVLC e entrega controle direto ao script/executável (ative Teste prévio em Opções para áudio em jogos)';
      const opts: Array<{ id: string; label: string; desc: string; run: () => void }> = [
        {
          id: 'run',
          label: isEntryScript(target)
            ? 'Executar script .sh no console (R36S)'
            : 'Executar binário / EmulationStation',
          desc: runDesc,
          run: () => void launchR36sTarget(target.path),
        },
      ];
      if (isEntryScript(target) || isEntryText(target)) {
        opts.push({
          id: 'edit',
          label: 'Abrir no Editor de Texto',
          desc: 'Visualizar ou editar comandos do script antes de executar',
          run: () => void openTextEditor(target.path),
        });
      }
      opts.push({
        id: 'cancel',
        label: 'Cancelar',
        desc: 'Voltar para a lista de arquivos',
        run: () => setModal(null),
      });
      return opts;
    }, [activeBackgroundAudio, bgAudioPreview, launchR36sTarget, modal, openTextEditor]);

    const actionMenuItems = useMemo(() => {
      if (modal?.kind !== 'actions') return [];
      const target = modal.target;
      const targets = getEffectiveTargets(target);
      const countLabel = targets.length > 1 ? ` (${targets.length} itens)` : '';
      const list: Array<{
        id: string;
        label: string;
        desc: string;
        danger?: boolean;
        run: () => void;
      }> = [];

      if (target && !target.isDir) {
        if (isEntryPdf(target)) {
          list.push({
            id: 'open-pdf',
            label: 'Abrir documento PDF (PdfCraft R36S)',
            desc: 'Leitor integrado compatível com kaiaum01/PdfReader-R36s',
            run: () => void openPdfDocument(target.path),
          });
        }
        if (isEntryAudio(target) || isEntryVideo(target)) {
          list.push({
            id: 'play-media',
            label: isEntryVideo(target) ? 'Reproduzir vídeo' : 'Tocar música',
            desc: `Abrir ${target.name} direto no KPlayer`,
            run: () => {
              setModal(null);
              playDirectMediaEntry(target);
            },
          });
        }
        if (isEntryPlaylist(target) || isEntryRadio(target)) {
          list.push({
            id: 'open-playlist',
            label: isEntryRadio(target) ? 'Abrir estações de rádio' : 'Abrir playlist (.m3u8 / .m3u)',
            desc: 'Listar e reproduzir canais, faixas ou estações',
            run: () => void openMediaList(target.path),
          });
        }
        if (isEntryScript(target) || isEntryExecutable(target)) {
          list.push({
            id: 'launch-sh',
            label: isEntryScript(target) ? 'Executar script .sh (R36S)' : 'Executar binário / EmulationStation',
            desc: bgAudioPreview
              ? 'Iniciar jogo mantendo áudio em segundo plano (Teste prévio)'
              : 'Iniciar jogo ou executável no console',
            run: () => void launchR36sTarget(target.path),
          });
        }
        if (
          isEntryText(target) ||
          (!target.isArchive &&
            !isEntryPdf(target) &&
            !isEntryAudio(target) &&
            !isEntryVideo(target) &&
            !isEntryExecutable(target))
        ) {
          list.push({
            id: 'edit-text',
            label: 'Editar no Editor de Texto',
            desc: 'TXT, XML, HTML, SH, CFG, M3U8, PLS e mais',
            run: () => void openTextEditor(target.path),
          });
        }
      }

      if (target?.isArchive) {
        list.push(
          {
            id: 'open-arc',
            label: 'Abrir arquivo compactado',
            desc: 'Visualizar conteúdo com motor 7-Zip',
            run: () => void openArchive(target.path),
          },
          {
            id: 'extract-here',
            label: 'Descompactar aqui',
            desc: `Extrair direto em ${currentPath}`,
            run: () => requestExtract(target.path, false),
          },
          {
            id: 'extract-sub',
            label: 'Descompactar em subpasta',
            desc: `Criar pasta ${stripArchiveExt(target.name)}/`,
            run: () => requestExtract(target.path, true),
          }
        );
      }

      if (targets.length > 0) {
        list.push(
          {
            id: 'copy',
            label: `Copiar${countLabel}`,
            desc: 'Guardar na área de transferência para colar',
            run: () => {
              setClipboard({ mode: 'copy', items: targets });
              setSelectedPaths(new Set());
              setModal(null);
              notify(`${targets.length} item(ns) pronto(s) para copiar`);
            },
          },
          {
            id: 'move',
            label: `Mover / Recortar${countLabel}`,
            desc: 'Mover para outra pasta do console',
            run: () => {
              setClipboard({ mode: 'move', items: targets });
              setSelectedPaths(new Set());
              setModal(null);
              notify(`${targets.length} item(ns) pronto(s) para mover`);
            },
          }
        );
      }

      if (clipboard && clipboard.items.length > 0) {
        list.push({
          id: 'paste',
          label: `Colar aqui (${clipboard.items.length})`,
          desc: clipboard.mode === 'move' ? 'Mover itens selecionados para esta pasta' : 'Copiar itens para esta pasta',
          run: () => handlePaste(),
        });
      }

      if (targets.length > 0) {
        list.push({
          id: 'compress',
          label: `Compactar em .zip${countLabel}`,
          desc: 'Criar pacote ZIP nesta pasta',
          run: () => {
            const defaultZip =
              targets.length === 1 ? `${baseNamePosix(targets[0])}.zip` : 'pacote-r36s.zip';
            setTextInput(defaultZip);
            setModal({ kind: 'compress', sources: targets });
          },
        });
      }

      list.push({
        id: 'mkdir',
        label: 'Nova pasta',
        desc: `Criar diretório em ${currentPath}`,
        run: () => {
          setTextInput('NovaPasta');
          setModal({ kind: 'mkdir' });
        },
      });

      if (target && selectedPaths.size === 0) {
        list.push({
          id: 'rename',
          label: 'Renomear',
          desc: target.name,
          run: () => {
            setTextInput(target.name);
            setModal({ kind: 'rename', target });
          },
        });
      }

      if (targets.length > 0) {
        list.push({
          id: 'delete',
          label: `Apagar${countLabel}`,
          desc: 'Remover permanentemente (com confirmação)',
          danger: true,
          run: () => {
            setModalFocusIdx(0);
            setModal({
              kind: 'confirm_delete',
              targets,
              label: targets.length === 1 ? baseNamePosix(targets[0]) : `${targets.length} itens selecionados`,
            });
          },
        });
      }

      list.push(
        {
          id: 'roots',
          label: 'Atalhos de pastas (Raiz / SD)',
          desc: 'Ir para /, /roms, /roms/ports, /roms/iptv ou /roms/radios',
          run: () => {
            setModalFocusIdx(0);
            setModal({ kind: 'roots' });
          },
        },
        {
          id: 'hidden',
          label: showHidden ? 'Ocultar arquivos iniciados com ponto' : 'Mostrar arquivos ocultos',
          desc: showHidden ? 'Atualmente visíveis' : 'Exibir dotfiles (.config, .cache...)',
          run: () => {
            const next = !showHidden;
            setShowHidden(next);
            setModal(null);
            void loadDirectory(currentPath, next);
          },
        }
      );

      return list;
    }, [
      bgAudioPreview,
      clipboard,
      currentPath,
      getEffectiveTargets,
      handlePaste,
      launchR36sTarget,
      loadDirectory,
      modal,
      notify,
      openArchive,
      openMediaList,
      openPdfDocument,
      openTextEditor,
      playDirectMediaEntry,
      requestExtract,
      selectedPaths.size,
      showHidden,
    ]);

    const openEntry = useCallback(
      (entry: FmEntry) => {
        if (entry.isDir) {
          void loadDirectory(entry.path);
        } else if (isEntryPdf(entry)) {
          void openPdfDocument(entry.path);
        } else if (entry.isArchive) {
          void openArchive(entry.path);
        } else if (isEntryAudio(entry) || isEntryVideo(entry)) {
          playDirectMediaEntry(entry);
        } else if (isEntryPlaylist(entry) || isEntryRadio(entry)) {
          void openMediaList(entry.path);
        } else if (isEntryScript(entry) || isEntryExecutable(entry)) {
          setModalFocusIdx(0);
          setModal({ kind: 'exec_choice', target: entry });
        } else if (isEntryText(entry)) {
          void openTextEditor(entry.path);
        } else {
          setModalFocusIdx(0);
          setModal({ kind: 'actions', target: entry });
        }
      },
      [loadDirectory, openArchive, openMediaList, openPdfDocument, openTextEditor, playDirectMediaEntry]
    );

    const handleButton = useCallback(
      (btn: R36SButton) => {
        // Active transfer / extraction job modal
        if (activeJob) {
          if (btn === 'A' && activeJob.status === 'running') {
            void cancelActiveJob();
          }
          return;
        }

        // Modals
        if (modal) {
          if (modal.kind === 'exec_console') {
            if (btn === 'L3_R3') {
              setL3Armed(false);
              toggleInGameMiniPlayer();
              return;
            }
            if (btn === 'L3') {
              if (bgAudioPreview) {
                setL3Armed(true);
                if (l3ArmTimerRef.current !== null) {
                  window.clearTimeout(l3ArmTimerRef.current);
                }
                l3ArmTimerRef.current = window.setTimeout(() => {
                  setL3Armed(false);
                }, 2200);
                notify('L3 pressionado — aperte R3 agora para abrir/fechar o Trainer');
              }
              return;
            }
            if (btn === 'R3') {
              if (l3Armed) {
                setL3Armed(false);
                toggleInGameMiniPlayer();
              } else if (bgAudioPreview) {
                setL3Armed(true);
                if (l3ArmTimerRef.current !== null) {
                  window.clearTimeout(l3ArmTimerRef.current);
                }
                l3ArmTimerRef.current = window.setTimeout(() => {
                  setL3Armed(false);
                }, 2200);
                notify('R3 pressionado — aperte L3 agora para abrir/fechar o Trainer');
              }
              return;
            }
            if (inGameMiniPlayerOpen) {
              if (btn === 'UP') {
                setTrainerRow((r) => (r + TRAINER_ROW_COUNT - 1) % TRAINER_ROW_COUNT);
              } else if (btn === 'DOWN') {
                setTrainerRow((r) => (r + 1) % TRAINER_ROW_COUNT);
              } else if (btn === 'LEFT') {
                if (trainerRow === 3) onChangeBgAudioVolume?.(-10);
                else if (trainerRow === 1 || trainerRow === 2) onBgPrevTrack?.();
                else if (trainerRow === 0) onBgTogglePause?.();
              } else if (btn === 'RIGHT') {
                if (trainerRow === 3) onChangeBgAudioVolume?.(10);
                else if (trainerRow === 1 || trainerRow === 2) onBgNextTrack?.();
                else if (trainerRow === 0) onBgTogglePause?.();
              } else if (btn === 'B' || btn === 'START') {
                activateTrainerRow(trainerRow);
              } else if (btn === 'R2') {
                setTrainerRow(1);
                onBgNextTrack?.();
              } else if (btn === 'L2') {
                setTrainerRow(2);
                onBgPrevTrack?.();
              } else if (btn === 'A') {
                setInGameMiniPlayerOpen(false);
              }
              return;
            }
            if (btn === 'A' || btn === 'B') {
              setInGameMiniPlayerOpen(false);
              setL3Armed(false);
              setModal(null);
            }
            return;
          }
          if (btn === 'A') {
            setModal(null);
            return;
          }
          if (modal.kind === 'exec_choice') {
            if (btn === 'UP') {
              setModalFocusIdx((i) => (i + execChoiceOptions.length - 1) % Math.max(1, execChoiceOptions.length));
            } else if (btn === 'DOWN') {
              setModalFocusIdx((i) => (i + 1) % Math.max(1, execChoiceOptions.length));
            } else if (btn === 'B') {
              execChoiceOptions[modalFocusIdx]?.run();
            }
            return;
          }
          if (modal.kind === 'editor_unsaved') {
            if (btn === 'LEFT' || btn === 'RIGHT') {
              setModalFocusIdx((i) => (i === 0 ? 1 : 0));
            } else if (btn === 'B') {
              if (modalFocusIdx === 0) {
                setModal(null);
                void saveEditorFile().then((ok) => {
                  if (ok) setEditorView(null);
                });
              } else {
                setModal(null);
                setEditorView(null);
              }
            }
            return;
          }
          if (modal.kind === 'actions') {
            if (btn === 'UP') {
              setModalFocusIdx((i) => (i + actionMenuItems.length - 1) % Math.max(1, actionMenuItems.length));
            } else if (btn === 'DOWN') {
              setModalFocusIdx((i) => (i + 1) % Math.max(1, actionMenuItems.length));
            } else if (btn === 'B') {
              actionMenuItems[modalFocusIdx]?.run();
            }
            return;
          }
          if (modal.kind === 'roots') {
            if (btn === 'UP') {
              setModalFocusIdx((i) => (i + quickRoots.length - 1) % Math.max(1, quickRoots.length));
            } else if (btn === 'DOWN') {
              setModalFocusIdx((i) => (i + 1) % Math.max(1, quickRoots.length));
            } else if (btn === 'B') {
              const target = quickRoots[modalFocusIdx];
              if (target) {
                setModal(null);
                setArchiveView(null);
                setEditorView(null);
                setMediaListView(null);
                setPdfView(null);
                void loadDirectory(target.path);
              }
            }
            return;
          }
          if (modal.kind === 'confirm_delete') {
            if (btn === 'LEFT' || btn === 'RIGHT') {
              setModalFocusIdx((i) => (i === 0 ? 1 : 0));
            } else if (btn === 'B') {
              if (modalFocusIdx === 1) {
                void startJob({ action: 'delete', sources: modal.targets });
              } else {
                setModal(null);
              }
            }
            return;
          }
          if (modal.kind === 'mkdir' && btn === 'B') {
            void handleMkdirSubmit();
            return;
          }
          if (modal.kind === 'rename' && btn === 'B') {
            void handleRenameSubmit();
            return;
          }
          if (modal.kind === 'compress' && btn === 'B') {
            handleCompressSubmit();
            return;
          }
          if (modal.kind === 'password') {
            if (btn === 'Y') setShowPassword((v) => !v);
            else if (btn === 'B') handlePasswordSubmit();
            return;
          }
          return;
        }

        // PDF Viewer navigation (v2.1.4 — PdfCraft R36S compatible)
        if (pdfView) {
          if (btn === 'A') {
            setPdfView(null);
            return;
          }
          if (btn === 'L1' || btn === 'LEFT') {
            setPdfView((prev) =>
              prev ? { ...prev, currentPage: Math.max(1, prev.currentPage - 1) } : prev
            );
            return;
          }
          if (btn === 'R1' || btn === 'RIGHT') {
            setPdfView((prev) =>
              prev ? { ...prev, currentPage: Math.min(prev.pageCount, prev.currentPage + 1) } : prev
            );
            return;
          }
          if (btn === 'X') {
            setPdfView((prev) =>
              prev
                ? { ...prev, zoom: prev.zoom === 100 ? 130 : prev.zoom === 130 ? 160 : 100 }
                : prev
            );
            return;
          }
          if (btn === 'Y') {
            setPdfView((prev) =>
              prev ? { ...prev, mode: prev.mode === 'document' ? 'text' : 'document' } : prev
            );
            return;
          }
          return;
        }

        // Text Editor navigation
        if (editorView) {
          if (btn === 'A') {
            requestCloseEditor();
            return;
          }
          if (btn === 'START') {
            void saveEditorFile();
            return;
          }
          return;
        }

        // Playlist / Radio List viewer navigation
        if (mediaListView) {
          if (btn === 'A') {
            setMediaListView(null);
            return;
          }
          if (btn === 'X') {
            void openTextEditor(mediaListView.path);
            return;
          }
          if (btn === 'UP' && mediaListView.items.length > 0) {
            setMediaListView((prev) =>
              prev
                ? { ...prev, selectedIdx: (prev.selectedIdx + prev.items.length - 1) % prev.items.length }
                : prev
            );
            return;
          }
          if (btn === 'DOWN' && mediaListView.items.length > 0) {
            setMediaListView((prev) =>
              prev ? { ...prev, selectedIdx: (prev.selectedIdx + 1) % prev.items.length } : prev
            );
            return;
          }
          if (btn === 'B' && mediaListView.items[mediaListView.selectedIdx]) {
            playParsedMediaItem(mediaListView.items[mediaListView.selectedIdx], mediaListView.kind);
            return;
          }
          return;
        }

        // Archive viewer navigation
        if (archiveView) {
          if (btn === 'A') {
            setArchiveView(null);
            return;
          }
          if (btn === 'UP' && archiveView.items.length > 0) {
            setArchiveView((prev) =>
              prev
                ? { ...prev, selectedIdx: (prev.selectedIdx + prev.items.length - 1) % prev.items.length }
                : prev
            );
            return;
          }
          if (btn === 'DOWN' && archiveView.items.length > 0) {
            setArchiveView((prev) =>
              prev ? { ...prev, selectedIdx: (prev.selectedIdx + 1) % prev.items.length } : prev
            );
            return;
          }
          if (btn === 'B' || btn === 'X') {
            requestExtract(archiveView.path, btn === 'X', archiveView.password, archiveView.encrypted);
            return;
          }
          return;
        }

        // Main directory browser navigation
        if (btn === 'A') {
          if (selectedPaths.size > 0) {
            setSelectedPaths(new Set());
          } else if (currentPath !== '/') {
            void loadDirectory(parentPath);
          } else {
            onBack();
          }
          return;
        }
        if (btn === 'L1') {
          setModalFocusIdx(0);
          setModal({ kind: 'roots' });
          return;
        }
        if (btn === 'R1') {
          handlePaste();
          return;
        }
        if (btn === 'UP' && entries.length > 0) {
          setSelectedIdx((i) => (i + entries.length - 1) % entries.length);
          return;
        }
        if (btn === 'DOWN' && entries.length > 0) {
          setSelectedIdx((i) => (i + 1) % entries.length);
          return;
        }
        if (btn === 'Y' && currentEntry) {
          toggleSelectPath(currentEntry.path);
          return;
        }
        if (btn === 'X') {
          setModalFocusIdx(0);
          setModal({ kind: 'actions', target: currentEntry });
          return;
        }
        if (btn === 'B' && currentEntry) {
          openEntry(currentEntry);
        }
      },
      [
        activateTrainerRow,
        actionMenuItems,
        activeJob,
        archiveView,
        bgAudioPreview,
        cancelActiveJob,
        currentEntry,
        currentPath,
        editorView,
        entries.length,
        execChoiceOptions,
        handleCompressSubmit,
        handleMkdirSubmit,
        handlePaste,
        handlePasswordSubmit,
        handleRenameSubmit,
        inGameMiniPlayerOpen,
        l3Armed,
        loadDirectory,
        mediaListView,
        modal,
        modalFocusIdx,
        notify,
        onBack,
        onBgNextTrack,
        onBgPrevTrack,
        onBgTogglePause,
        onChangeBgAudioVolume,
        openEntry,
        openTextEditor,
        parentPath,
        pdfView,
        playParsedMediaItem,
        quickRoots,
        requestCloseEditor,
        requestExtract,
        saveEditorFile,
        selectedPaths.size,
        startJob,
        toggleInGameMiniPlayer,
        toggleSelectPath,
        trainerRow,
      ]
    );

    useImperativeHandle(
      ref,
      () => ({
        handleButton,
        isInGameLaunch: () => modal?.kind === 'exec_console',
      }),
      [handleButton, modal?.kind]
    );

    const renderEntryIcon = (entry: FmEntry, focused: boolean) => {
      const color = focused ? theme.accent : entry.isDir ? theme.accent : theme.muted;
      if (entry.isDir) return <Folder className="w-4 h-4 shrink-0" style={{ color }} />;
      if (isEntryPdf(entry)) return <BookOpen className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      if (entry.isArchive) return <Archive className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      if (isEntryScript(entry) || isEntryExecutable(entry)) {
        return <Terminal className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      }
      if (isEntryRadio(entry)) return <Radio className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      if (isEntryPlaylist(entry)) return <ListMusic className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      if (isEntryAudio(entry)) return <FileAudio className="w-4 h-4 shrink-0" style={{ color }} />;
      if (isEntryVideo(entry)) return <FileVideo className="w-4 h-4 shrink-0" style={{ color }} />;
      if (entry.ext === '.xml' || entry.ext === '.html' || entry.ext === '.htm' || entry.ext === '.json') {
        return <FileCode2 className="w-4 h-4 shrink-0" style={{ color }} />;
      }
      if (isEntryText(entry)) return <FileText className="w-4 h-4 shrink-0" style={{ color }} />;
      return <FileIcon className="w-4 h-4 shrink-0" style={{ color }} />;
    };

    const isSubView = Boolean(archiveView || editorView || mediaListView || pdfView);
    const editorDirty = Boolean(editorView && editorView.content !== editorView.savedContent);
    const editorLines = useMemo(
      () => (editorView ? editorView.content.split('\n') : []),
      [editorView]
    );

    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col kp-screen-enter">
        <ModernBackdrop theme={theme} />
        <HeaderBar theme={theme} section="ARQUIVOS" location={locationLabel} />

        <div className="relative z-10 flex-1 min-h-0 flex flex-col px-3.5 pt-2 pb-2 gap-2">
          {/* Top Path & Quick Actions Bar */}
          <div
            className="rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 shrink-0"
            style={modernPanelStyle(theme, 12)}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (pdfView) setPdfView(null);
                  else if (editorView) requestCloseEditor();
                  else if (mediaListView) setMediaListView(null);
                  else if (archiveView) setArchiveView(null);
                  else if (currentPath !== '/') void loadDirectory(parentPath);
                  else onBack();
                }}
                className="p-1.5 rounded-lg cursor-pointer transition-colors shrink-0"
                style={{
                  backgroundColor: mixRgb(theme.elevated, theme.text, 0.06),
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                title={
                  pdfView
                    ? 'Fechar leitor PDF'
                    : editorView
                    ? 'Fechar editor de texto'
                    : mediaListView
                    ? 'Fechar lista'
                    : archiveView
                    ? 'Fechar arquivo compactado'
                    : currentPath === '/'
                    ? 'Voltar para Home'
                    : 'Subir pasta'
                }
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5" style={{ color: theme.muted }}>
                  <span>
                    {pdfView
                      ? `Leitor PDF • PdfCraft R36S • Pág. ${pdfView.currentPage}/${pdfView.pageCount}`
                      : editorView
                      ? `Editor de Texto • ${formatEditorBadge(editorView.ext)}${editorDirty ? ' • Alterado' : ''}`
                      : mediaListView
                      ? mediaListView.kind === 'radio'
                        ? 'Arquivo de Rádio'
                        : 'Playlist M3U8 / M3U'
                      : archiveView
                      ? `7-Zip • ${archiveView.engine}`
                      : 'Raiz do Console'}
                  </span>
                </div>
                <div className="text-[12px] font-bold truncate font-mono" style={{ color: theme.text }}>
                  {pdfView
                    ? pdfView.path
                    : editorView
                    ? editorView.path
                    : mediaListView
                    ? mediaListView.path
                    : archiveView
                    ? archiveView.path
                    : currentPath}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isSubView && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTextInput('NovaPasta');
                      setModal({ kind: 'mkdir' });
                    }}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.06),
                      color: theme.text,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                    title="Criar nova pasta"
                  >
                    <FolderPlus className="w-3 h-3" style={{ color: theme.accent }} />
                    <span>Pasta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showHidden;
                      setShowHidden(next);
                      void loadDirectory(currentPath, next);
                    }}
                    className="p-1.5 rounded-lg cursor-pointer"
                    style={{
                      backgroundColor: showHidden
                        ? rgbToRgba(theme.accent, 0.18)
                        : mixRgb(theme.elevated, theme.text, 0.06),
                      color: showHidden ? theme.accent : theme.muted,
                      border: `1px solid ${showHidden ? rgbToRgba(theme.accent, 0.5) : themeHairline(theme)}`,
                    }}
                    title={showHidden ? 'Ocultar arquivos ocultos' : 'Mostrar arquivos ocultos'}
                  >
                    {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadDirectory(currentPath)}
                    className="p-1.5 rounded-lg cursor-pointer"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.06),
                      color: theme.muted,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                    title="Atualizar pasta"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalFocusIdx(0);
                      setModal({ kind: 'actions', target: currentEntry });
                    }}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.18),
                      color: theme.accent,
                      border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                    }}
                    title="Menu completo de ações (X)"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    <span>Ações (X)</span>
                  </button>
                </>
              )}

              {editorView && (
                <>
                  {editorView.isScript && (
                    <button
                      type="button"
                      onClick={() => void launchR36sTarget(editorView.path)}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      style={{
                        backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                        color: theme.text,
                        border: `1px solid ${themeHairline(theme)}`,
                      }}
                      title="Executar script .sh no console"
                    >
                      <Terminal className="w-3 h-3" style={{ color: theme.accent }} />
                      <span>Executar</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={editorView.saving}
                    onClick={() => void saveEditorFile()}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.bg,
                    }}
                    title="Salvar alterações (START)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{editorView.saving ? 'Salvando...' : 'Salvar (START)'}</span>
                  </button>
                </>
              )}

              {mediaListView && (
                <button
                  type="button"
                  onClick={() => void openTextEditor(mediaListView.path)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                    color: theme.text,
                    border: `1px solid ${themeHairline(theme)}`,
                  }}
                >
                  <FileText className="w-3 h-3" style={{ color: theme.accent }} />
                  <span>Editar texto (X)</span>
                </button>
              )}

              {pdfView && (
                <>
                  <button
                    type="button"
                    disabled={pdfView.currentPage <= 1}
                    onClick={() =>
                      setPdfView((prev) =>
                        prev ? { ...prev, currentPage: Math.max(1, prev.currentPage - 1) } : prev
                      )
                    }
                    className="p-1.5 rounded-lg cursor-pointer disabled:opacity-40"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                      color: theme.text,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                    title="Página anterior (L1)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={pdfView.currentPage >= pdfView.pageCount}
                    onClick={() =>
                      setPdfView((prev) =>
                        prev
                          ? { ...prev, currentPage: Math.min(prev.pageCount, prev.currentPage + 1) }
                          : prev
                      )
                    }
                    className="p-1.5 rounded-lg cursor-pointer disabled:opacity-40"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                      color: theme.text,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                    title="Próxima página (R1)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPdfView((prev) =>
                        prev
                          ? { ...prev, zoom: prev.zoom === 100 ? 130 : prev.zoom === 130 ? 160 : 100 }
                          : prev
                      )
                    }
                    className="px-2 py-1 rounded-lg text-[10px] font-bold tabular-nums cursor-pointer"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                      color: theme.text,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                    title="Alternar zoom (X)"
                  >
                    {pdfView.zoom}%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPdfView((prev) =>
                        prev
                          ? { ...prev, mode: prev.mode === 'document' ? 'text' : 'document' }
                          : prev
                      )
                    }
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer"
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.bg,
                    }}
                    title="Alternar modo Documento / Texto (Y)"
                  >
                    {pdfView.mode === 'document' ? 'Texto (Y)' : 'PDF (Y)'}
                  </button>
                </>
              )}

              {archiveView && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      requestExtract(archiveView.path, false, archiveView.password, archiveView.encrypted)
                    }
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.bg,
                    }}
                  >
                    <PackageOpen className="w-3.5 h-3.5" />
                    <span>Extrair aqui (B)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      requestExtract(archiveView.path, true, archiveView.password, archiveView.encrypted)
                    }
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer"
                    style={{
                      backgroundColor: mixRgb(theme.elevated, theme.text, 0.08),
                      color: theme.text,
                      border: `1px solid ${themeHairline(theme)}`,
                    }}
                  >
                    Em subpasta (X)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Roots Navigation Strip */}
          {!isSubView && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {quickRoots.map((root) => {
                const active = currentPath === root.path;
                return (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() => void loadDirectory(root.path)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap cursor-pointer transition-colors flex items-center gap-1"
                    style={{
                      backgroundColor: active
                        ? rgbToRgba(theme.accent, 0.2)
                        : mixRgb(theme.panel, theme.elevated, 0.55),
                      color: active ? theme.accent : theme.muted,
                      border: `1px solid ${active ? rgbToRgba(theme.accent, 0.55) : themeHairline(theme)}`,
                    }}
                  >
                    <HardDrive className="w-3 h-3" />
                    <span>{root.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Clipboard / Selection Context Bar */}
          {!isSubView && (clipboard || selectedPaths.size > 0) && (
            <div
              className="rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0"
              style={{
                backgroundColor: rgbToRgba(theme.accent, 0.14),
                border: `1px solid ${rgbToRgba(theme.accent, 0.4)}`,
              }}
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold min-w-0" style={{ color: theme.text }}>
                {selectedPaths.size > 0 ? (
                  <span>{selectedPaths.size} item(ns) selecionado(s)</span>
                ) : clipboard ? (
                  <span>
                    {clipboard.mode === 'move' ? 'Mover' : 'Copiar'}: {clipboard.items.length} item(ns)
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedPaths.size > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setClipboard({ mode: 'copy', items: Array.from(selectedPaths) });
                        setSelectedPaths(new Set());
                        notify('Itens copiados para área de transferência');
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      style={{ backgroundColor: theme.elevated, color: theme.text }}
                    >
                      <Copy className="w-3 h-3" /> Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClipboard({ mode: 'move', items: Array.from(selectedPaths) });
                        setSelectedPaths(new Set());
                        notify('Itens marcados para mover');
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                      style={{ backgroundColor: theme.elevated, color: theme.text }}
                    >
                      <Scissors className="w-3 h-3" /> Mover
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targets = Array.from(selectedPaths);
                        setModalFocusIdx(0);
                        setModal({
                          kind: 'confirm_delete',
                          targets,
                          label: `${targets.length} itens selecionados`,
                        });
                      }}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 cursor-pointer bg-red-500/20 text-red-300 border border-red-400/40"
                    >
                      <Trash2 className="w-3 h-3" /> Apagar
                    </button>
                  </>
                )}
                {clipboard && (
                  <>
                    <button
                      type="button"
                      onClick={handlePaste}
                      className="px-2.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                    >
                      <ClipboardPaste className="w-3 h-3" /> Colar aqui (R1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setClipboard(null)}
                      className="p-1 rounded cursor-pointer"
                      style={{ color: theme.muted }}
                      title="Limpar área de transferência"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area: PDF Viewer OR Text Editor OR Media/Radio List OR Archive Viewer OR Directory List */}
          {pdfView ? (
            <div
              className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden"
              style={modernPanelStyle(theme, 12)}
            >
              <div
                className="px-3 py-1.5 flex items-center justify-between text-[10px] shrink-0 gap-2"
                style={{
                  color: theme.muted,
                  borderBottom: `1px solid ${themeHairline(theme)}`,
                  backgroundColor: mixRgb(theme.panel, theme.bg, 0.35),
                }}
              >
                <span className="truncate font-semibold" style={{ color: theme.text }}>
                  {pdfView.title}
                </span>
                <span className="tabular-nums font-mono shrink-0">
                  Pág. {pdfView.currentPage}/{pdfView.pageCount} • {pdfView.zoom}% • {pdfView.pdfcraftRepo}
                </span>
              </div>

              {pdfView.mode === 'text' ? (
                <div
                  className="flex-1 min-h-0 overflow-y-auto kp-scroll p-3.5 font-mono leading-relaxed whitespace-pre-wrap"
                  style={{
                    backgroundColor: mixRgb(theme.bg, theme.panel, 0.2),
                    color: theme.text,
                    fontSize: pdfView.zoom === 160 ? '14px' : pdfView.zoom === 130 ? '12.5px' : '11.5px',
                  }}
                >
                  {pdfView.encrypted
                    ? 'Documento protegido por senha. No R36S nativo, o PdfCraft R36S solicita a senha pelo teclado na tela.'
                    : pdfView.pageTexts[pdfView.currentPage - 1] ||
                      pdfView.pageTexts[0] ||
                      'Esta página não contém texto selecionável (use o modo PDF para visualizar).'}
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col bg-[#0d1016] relative">
                  <iframe
                    key={`${pdfView.path}-${pdfView.currentPage}-${pdfView.zoom}`}
                    src={`/api/fm/pdf?path=${encodeURIComponent(pdfView.path)}#page=${pdfView.currentPage}&zoom=${pdfView.zoom}`}
                    title={pdfView.title}
                    className="w-full h-full border-0 flex-1"
                  />
                  {pdfView.pageTexts.length > 0 && (
                    <div
                      className="px-3 py-1 text-[10px] flex items-center justify-between border-t shrink-0"
                      style={{
                        backgroundColor: mixRgb(theme.panel, theme.bg, 0.5),
                        borderColor: themeHairline(theme),
                        color: theme.muted,
                      }}
                    >
                      <span className="truncate">
                        Compatível com PdfCraft R36S (pdfcraft-core.aarch64)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPdfView((prev) => (prev ? { ...prev, mode: 'text' } : prev))
                        }
                        className="font-semibold cursor-pointer shrink-0 ml-2"
                        style={{ color: theme.accent }}
                      >
                        Ler texto extraído (Y)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : editorView ? (
            <div
              className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden"
              style={modernPanelStyle(theme, 12)}
            >
              <div
                className="px-3 py-1.5 flex items-center justify-between text-[10px] font-mono shrink-0"
                style={{
                  color: theme.muted,
                  borderBottom: `1px solid ${themeHairline(theme)}`,
                  backgroundColor: mixRgb(theme.panel, theme.bg, 0.35),
                }}
              >
                <span className="truncate font-semibold" style={{ color: theme.text }}>
                  {editorView.name}
                  {editorDirty ? ' *' : ''}
                </span>
                <span className="tabular-nums shrink-0">
                  {editorLines.length} linha(s) • {editorView.content.length} caracteres • UTF-8
                </span>
              </div>

              <div className="flex-1 min-h-0 flex overflow-hidden">
                <div
                  ref={editorGutterRef}
                  aria-hidden="true"
                  className="w-10 py-2.5 pr-2 text-right font-mono text-[11px] leading-[18px] select-none overflow-hidden shrink-0 tabular-nums"
                  style={{
                    color: theme.dim,
                    backgroundColor: mixRgb(theme.bg, theme.panel, 0.35),
                    borderRight: `1px solid ${themeHairline(theme)}`,
                  }}
                >
                  {editorLines.map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <textarea
                  value={editorView.content}
                  onChange={(e) =>
                    setEditorView((prev) => (prev ? { ...prev, content: e.target.value } : prev))
                  }
                  onScroll={(e) => {
                    if (editorGutterRef.current) {
                      editorGutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                      e.preventDefault();
                      void saveEditorFile();
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 min-w-0 h-full resize-none outline-none p-2.5 font-mono text-[11.5px] leading-[18px] kp-scroll"
                  style={{
                    backgroundColor: mixRgb(theme.bg, theme.panel, 0.18),
                    color: theme.text,
                    tabSize: 2,
                  }}
                />
              </div>
            </div>
          ) : (
            <div
              ref={listRef}
              className="flex-1 min-h-0 overflow-y-auto kp-scroll rounded-xl p-1.5 space-y-1"
              style={modernPanelStyle(theme, 12)}
            >
              {loading && !archiveView && !mediaListView ? (
                <div className="h-full flex items-center justify-center text-[12px]" style={{ color: theme.muted }}>
                  Carregando arquivos...
                </div>
              ) : error ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="text-[12px] font-semibold text-red-300">{error}</div>
                  <button
                    type="button"
                    onClick={() => void loadDirectory('/')}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                  >
                    Voltar à Raiz (/)
                  </button>
                </div>
              ) : mediaListView ? (
                mediaListView.items.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-[12px]" style={{ color: theme.muted }}>
                    <span>Nenhuma faixa, canal ou estação encontrada neste arquivo</span>
                    <button
                      type="button"
                      onClick={() => void openTextEditor(mediaListView.path)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                    >
                      Abrir no Editor de Texto
                    </button>
                  </div>
                ) : (
                  <>
                    <div
                      className="px-2.5 py-1.5 text-[10px] flex items-center justify-between border-b"
                      style={{ color: theme.muted, borderColor: themeHairline(theme) }}
                    >
                      <span className="tabular-nums">
                        {mediaListView.items.length}{' '}
                        {mediaListView.kind === 'radio' ? 'estação(ões) de rádio' : 'item(ns) na playlist'}
                      </span>
                      <span>B reproduzir • X editar texto • A voltar</span>
                    </div>
                    {mediaListView.items.map((item, idx) => {
                      const focused = idx === mediaListView.selectedIdx;
                      return (
                        <div
                          key={`${item.url}-${idx}`}
                          data-fm-row={idx}
                          onClick={() => {
                            setMediaListView((prev) => (prev ? { ...prev, selectedIdx: idx } : prev));
                            playParsedMediaItem(item, mediaListView.kind);
                          }}
                          className="px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer"
                          style={modernCardStyle(theme, focused, 8)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {mediaListView.kind === 'radio' ? (
                              <Radio className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                            ) : item.isVideo ? (
                              <FileVideo className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                            ) : (
                              <FileAudio className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[11.5px] font-semibold truncate" style={{ color: theme.text }}>
                                {item.title}
                              </div>
                              <div className="text-[9.5px] font-mono truncate" style={{ color: theme.muted }}>
                                {item.group} • {item.url}
                              </div>
                            </div>
                          </div>
                          <span
                            className="text-[10px] font-bold flex items-center gap-1 shrink-0"
                            style={{ color: focused ? theme.accent : theme.muted }}
                          >
                            <Play className="w-3 h-3" />
                            <span>{item.isLocal ? 'LOCAL' : item.isVideo ? 'HLS' : 'RÁDIO'}</span>
                          </span>
                        </div>
                      );
                    })}
                  </>
                )
              ) : archiveView ? (
                archiveView.items.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[12px]" style={{ color: theme.muted }}>
                    Arquivo compactado vazio
                  </div>
                ) : (
                  <>
                    <div
                      className="px-2.5 py-1.5 text-[10px] flex items-center justify-between border-b"
                      style={{ color: theme.muted, borderColor: themeHairline(theme) }}
                    >
                      <span className="flex items-center gap-1.5">
                        {archiveView.encrypted && <Lock className="w-3 h-3" style={{ color: theme.accent }} />}
                        <span>
                          {archiveView.items.length} item(ns) • Total descompactado:{' '}
                          <strong className="tabular-nums" style={{ color: theme.text }}>
                            {formatBytesShort(archiveView.totalSize)}
                          </strong>
                        </span>
                      </span>
                      <span>A voltar • B extrair</span>
                    </div>
                    {archiveView.items.map((item, idx) => {
                      const focused = idx === archiveView.selectedIdx;
                      return (
                        <div
                          key={`${item.path}-${idx}`}
                          data-fm-row={idx}
                          onClick={() => setArchiveView((prev) => (prev ? { ...prev, selectedIdx: idx } : prev))}
                          className="px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer"
                          style={modernCardStyle(theme, focused, 8)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.is_dir ? (
                              <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                            ) : (
                              <FileIcon className="w-3.5 h-3.5 shrink-0" style={{ color: theme.muted }} />
                            )}
                            <span className="text-[11px] font-medium truncate font-mono" style={{ color: theme.text }}>
                              {item.path}
                            </span>
                            {item.encrypted && <Lock className="w-3 h-3 shrink-0" style={{ color: theme.accent }} />}
                          </div>
                          <span
                            className="text-[10px] tabular-nums shrink-0 font-mono"
                            style={{ color: theme.muted }}
                          >
                            {item.is_dir ? 'PASTA' : formatBytesShort(item.size)}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )
              ) : entries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-1.5 text-[12px]" style={{ color: theme.muted }}>
                  <Folder className="w-6 h-6 opacity-50" />
                  <span>Pasta vazia</span>
                  <span className="text-[10px]">Pressione X para criar uma pasta ou colar itens</span>
                </div>
              ) : (
                entries.map((entry, idx) => {
                  const focused = idx === selectedIdx;
                  const checked = selectedPaths.has(entry.path);
                  const typeTag = formatEntryTag(entry);
                  return (
                    <div
                      key={entry.path}
                      data-fm-row={idx}
                      onClick={() => setSelectedIdx(idx)}
                      onDoubleClick={() => openEntry(entry)}
                      className="px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      style={modernCardStyle(theme, focused, 9)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectPath(entry.path);
                          }}
                          className="p-0.5 cursor-pointer shrink-0"
                          style={{ color: checked ? theme.accent : theme.dim }}
                          title="Selecionar item (Y)"
                        >
                          {checked ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        </button>
                        {renderEntryIcon(entry, focused)}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIdx(idx);
                            openEntry(entry);
                          }}
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="text-[12px] font-semibold truncate" style={{ color: theme.text }}>
                            {entry.name}
                          </div>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono tabular-nums" style={{ color: theme.muted }}>
                          {entry.isDir
                            ? 'PASTA'
                            : typeTag
                            ? `${typeTag} • ${formatBytesShort(entry.size)}`
                            : formatBytesShort(entry.size)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {entry.isArchive && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestExtract(entry.path, true);
                              }}
                              className="p-1 rounded hover:bg-white/10 cursor-pointer"
                              style={{ color: theme.accent }}
                              title="Descompactar em subpasta"
                            >
                              <PackageOpen className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(isEntryScript(entry) || isEntryExecutable(entry)) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setModalFocusIdx(0);
                                setModal({ kind: 'exec_choice', target: entry });
                              }}
                              className="p-1 rounded hover:bg-white/10 cursor-pointer"
                              style={{ color: theme.accent }}
                              title="Executar script .sh / EmulationStation"
                            >
                              <Terminal className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!entry.isDir && isEntryText(entry) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openTextEditor(entry.path);
                              }}
                              className="p-1 rounded hover:bg-white/10 cursor-pointer"
                              style={{ color: theme.muted }}
                              title="Editar no Editor de Texto"
                            >
                              <FileText className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setClipboard({ mode: 'copy', items: [entry.path] });
                              notify(`"${entry.name}" copiado`);
                            }}
                            className="p-1 rounded hover:bg-white/10 cursor-pointer"
                            style={{ color: theme.muted }}
                            title="Copiar"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTextInput(entry.name);
                              setModal({ kind: 'rename', target: entry });
                            }}
                            className="p-1 rounded hover:bg-white/10 cursor-pointer"
                            style={{ color: theme.muted }}
                            title="Renomear"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalFocusIdx(0);
                              setModal({ kind: 'actions', target: entry });
                            }}
                            className="p-1 rounded hover:bg-white/10 cursor-pointer"
                            style={{ color: theme.muted }}
                            title="Mais ações"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Compact Status Footer */}
          <div
            className="px-2 py-0.5 flex items-center justify-between text-[10px] shrink-0"
            style={{ color: theme.muted }}
          >
            <span className="tabular-nums truncate">
              {pdfView
                ? `Pág. ${pdfView.currentPage}/${pdfView.pageCount} • L1/R1 páginas • X zoom • Y texto/PDF • A voltar`
                : editorView
                ? 'START / Ctrl+S salvar • A sair do editor'
                : mediaListView
                ? `${mediaListView.items.length} item(ns) • B reproduzir • X editar • A voltar`
                : archiveView
                ? `${archiveView.items.length} item(ns) no arquivo`
                : `${entries.length} item(ns) • B abrir/tocar • X ações • Y selecionar • L1 atalhos`}
            </span>
            <span className="font-mono shrink-0">PDF • Editor • .sh • M3U8 • 7-Zip</span>
          </div>
        </div>

        {/* ==================== MODALS ==================== */}
        {modal && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(6, 8, 12, 0.78)', backdropFilter: 'blur(4px)' }}
            onClick={() => setModal(null)}
          >
            <div
              className="w-full max-w-[440px] rounded-2xl p-3.5 space-y-2.5 max-h-[88%] flex flex-col"
              style={{
                backgroundColor: theme.panel,
                border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {modal.kind === 'exec_choice' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold truncate" style={{ color: theme.text }}>
                          {isEntryScript(modal.target) ? 'Script de Jogo R36S (.sh)' : 'Executável / EmulationStation'}
                        </div>
                        <div className="text-[10px] font-mono truncate" style={{ color: theme.muted }}>
                          {modal.target.path}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="p-1 rounded-lg cursor-pointer"
                      style={{ color: theme.muted }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {execChoiceOptions.map((opt, idx) => {
                      const focused = idx === modalFocusIdx;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={opt.run}
                          onMouseEnter={() => setModalFocusIdx(idx)}
                          className="w-full text-left px-3 py-2 rounded-xl cursor-pointer transition-colors"
                          style={modernCardStyle(theme, focused, 10)}
                        >
                          <div className="text-[12px] font-semibold" style={{ color: theme.text }}>
                            {opt.label}
                          </div>
                          <div className="text-[10px]" style={{ color: theme.muted }}>
                            {opt.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {modal.kind === 'exec_console' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Terminal className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold truncate" style={{ color: theme.text }}>
                          Lançador R36S • {modal.preview.name}
                        </div>
                        <div className="text-[10px] font-mono truncate" style={{ color: theme.muted }}>
                          {modal.preview.interpreter} • {modal.preview.targetDir}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setInGameMiniPlayerOpen(false);
                        setL3Armed(false);
                        setModal(null);
                      }}
                      className="p-1 rounded-lg cursor-pointer"
                      style={{ color: theme.muted }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {bgAudioPreview && !inGameMiniPlayerOpen && (
                    <div
                      className="rounded-lg px-2.5 py-1.5 text-[10.5px] flex items-center justify-between gap-2"
                      style={{
                        backgroundColor: rgbToRgba(theme.accent, l3Armed ? 0.24 : 0.12),
                        border: `1px solid ${rgbToRgba(theme.accent, l3Armed ? 0.75 : 0.4)}`,
                        color: theme.text,
                      }}
                    >
                      <span className="truncate font-semibold">
                        {l3Armed
                          ? 'Combine L3 + R3 agora para abrir o Trainer de Música'
                          : 'Trainer oculto no jogo • Aperte L3 + R3 (ou F8) para abrir'}
                      </span>
                      <button
                        type="button"
                        onClick={toggleInGameMiniPlayer}
                        className="px-2 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 cursor-pointer"
                        style={{ backgroundColor: theme.accent, color: theme.bg }}
                      >
                        L3 + R3
                      </button>
                    </div>
                  )}

                  {!inGameMiniPlayerOpen && (
                    <div
                      className="rounded-xl p-2.5 font-mono text-[10.5px] leading-relaxed space-y-1 max-h-[190px] overflow-y-auto kp-scroll"
                      style={{
                        backgroundColor: mixRgb(theme.bg, '#000000', 0.45),
                        border: `1px solid ${themeHairline(theme)}`,
                        color: theme.text,
                      }}
                    >
                      {modal.preview.logLines.map((line, i) => (
                        <div key={i} className="break-words">
                          <span style={{ color: theme.accent }}>$ </span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {inGameMiniPlayerOpen && (
                    <div className="flex justify-start">
                      <GameTrainerHud
                        theme={theme}
                        audio={{
                          kind: activeBackgroundAudio?.kind ?? 'music',
                          title: activeBackgroundAudio?.title ?? 'Nenhuma música ou rádio na fila',
                          index: activeBackgroundAudio?.index ?? 0,
                          total: activeBackgroundAudio?.total ?? 0,
                          isPlaying: Boolean(activeBackgroundAudio?.isPlaying),
                        }}
                        volumePct={bgAudioVolume}
                        selectedRow={trainerRow}
                        onSelectRow={setTrainerRow}
                        onActivateRow={activateTrainerRow}
                        onVolumeDelta={(d) => onChangeBgAudioVolume?.(d)}
                        onClose={() => setInGameMiniPlayerOpen(false)}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    {modal.preview.kind === 'script' && !inGameMiniPlayerOpen && (
                      <button
                        type="button"
                        onClick={() => void openTextEditor(modal.preview.path)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                        style={{ backgroundColor: theme.elevated, color: theme.text }}
                      >
                        Editar script
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (inGameMiniPlayerOpen) {
                          setInGameMiniPlayerOpen(false);
                        } else {
                          setL3Armed(false);
                          setModal(null);
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                    >
                      {inGameMiniPlayerOpen ? 'Voltar ao jogo (A)' : 'Sair do jogo (B)'}
                    </button>
                  </div>
                </div>
              )}

              {modal.kind === 'editor_unsaved' && (
                <div className="space-y-3">
                  <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                    Alterações não salvas
                  </div>
                  <div className="text-[12px]" style={{ color: theme.muted }}>
                    Deseja salvar as alterações em <strong style={{ color: theme.text }}>{editorView?.name}</strong> antes de sair do editor?
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModal(null);
                        setEditorView(null);
                      }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{
                        backgroundColor: theme.elevated,
                        color: theme.text,
                        border: modalFocusIdx === 1 ? `1px solid ${theme.accent}` : `1px solid ${themeHairline(theme)}`,
                      }}
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModal(null);
                        void saveEditorFile().then((ok) => {
                          if (ok) setEditorView(null);
                        });
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{
                        backgroundColor: theme.accent,
                        color: theme.bg,
                        boxShadow: modalFocusIdx === 0 ? `0 0 0 2px ${rgbToRgba(theme.accent, 0.55)}` : undefined,
                      }}
                    >
                      Salvar e Sair
                    </button>
                  </div>
                </div>
              )}

              {modal.kind === 'actions' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                        Ações do Gerenciador
                      </div>
                      <div className="text-[10px] truncate max-w-[320px]" style={{ color: theme.muted }}>
                        {selectedPaths.size > 0
                          ? `${selectedPaths.size} item(ns) selecionado(s)`
                          : modal.target?.name || currentPath}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="p-1 rounded-lg cursor-pointer"
                      style={{ color: theme.muted }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="overflow-y-auto kp-scroll space-y-1 pr-0.5">
                    {actionMenuItems.map((act, idx) => {
                      const focused = idx === modalFocusIdx;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onClick={act.run}
                          onMouseEnter={() => setModalFocusIdx(idx)}
                          className="w-full text-left px-3 py-2 rounded-xl cursor-pointer transition-colors"
                          style={modernCardStyle(theme, focused, 10)}
                        >
                          <div
                            className="text-[12px] font-semibold"
                            style={{ color: act.danger ? '#f87171' : theme.text }}
                          >
                            {act.label}
                          </div>
                          <div className="text-[10px]" style={{ color: theme.muted }}>
                            {act.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {modal.kind === 'roots' && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                      Ir para Pasta do Console
                    </div>
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="p-1 rounded-lg cursor-pointer"
                      style={{ color: theme.muted }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {quickRoots.map((root, idx) => {
                      const focused = idx === modalFocusIdx;
                      return (
                        <button
                          key={root.path}
                          type="button"
                          onClick={() => {
                            setModal(null);
                            setArchiveView(null);
                            setEditorView(null);
                            setMediaListView(null);
                            void loadDirectory(root.path);
                          }}
                          onMouseEnter={() => setModalFocusIdx(idx)}
                          className="w-full text-left px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between"
                          style={modernCardStyle(theme, focused, 10)}
                        >
                          <span className="text-[12px] font-semibold" style={{ color: theme.text }}>
                            {root.label}
                          </span>
                          <span className="text-[10px] font-mono" style={{ color: theme.muted }}>
                            {root.path}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {(modal.kind === 'mkdir' || modal.kind === 'rename' || modal.kind === 'compress') && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (modal.kind === 'mkdir') void handleMkdirSubmit();
                    else if (modal.kind === 'rename') void handleRenameSubmit();
                    else handleCompressSubmit();
                  }}
                >
                  <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                    {modal.kind === 'mkdir'
                      ? 'Criar Nova Pasta'
                      : modal.kind === 'rename'
                      ? 'Renomear Item'
                      : 'Compactar em ZIP'}
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={
                      modal.kind === 'mkdir'
                        ? 'Nome da pasta'
                        : modal.kind === 'rename'
                        ? 'Novo nome'
                        : 'nome-do-pacote.zip'
                    }
                    className="w-full px-3 py-2 rounded-xl text-[12px] outline-none font-mono"
                    style={{
                      backgroundColor: theme.bg,
                      color: theme.text,
                      border: `1px solid ${rgbToRgba(theme.accent, 0.5)}`,
                    }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{ backgroundColor: theme.elevated, color: theme.muted }}
                    >
                      Cancelar (A)
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                    >
                      Confirmar (B)
                    </button>
                  </div>
                </form>
              )}

              {modal.kind === 'confirm_delete' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <div className="text-[13px] font-bold">Confirmar Exclusão</div>
                  </div>
                  <div className="text-[12px]" style={{ color: theme.text }}>
                    Apagar permanentemente <strong>{modal.label}</strong>? Esta ação não pode ser desfeita.
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{
                        backgroundColor: theme.elevated,
                        color: theme.text,
                        border: modalFocusIdx === 0 ? `1px solid ${theme.accent}` : `1px solid ${themeHairline(theme)}`,
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void startJob({ action: 'delete', sources: modal.targets })}
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer bg-red-500 text-white"
                      style={{
                        boxShadow: modalFocusIdx === 1 ? '0 0 0 2px rgba(248,113,113,0.75)' : undefined,
                      }}
                    >
                      Apagar Agora
                    </button>
                  </div>
                </div>
              )}

              {modal.kind === 'password' && (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handlePasswordSubmit();
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                    <div>
                      <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                        Arquivo Protegido por Senha
                      </div>
                      <div className="text-[10px] truncate max-w-[320px]" style={{ color: theme.muted }}>
                        {baseNamePosix(modal.archivePath)}
                      </div>
                    </div>
                  </div>

                  {modal.error && (
                    <div className="text-[11px] px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-400/35">
                      {modal.error}
                    </div>
                  )}

                  <div className="relative">
                    <input
                      autoFocus
                      type={showPassword ? 'text' : 'password'}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Digite a senha do arquivo..."
                      className="w-full pl-3 pr-9 py-2 rounded-xl text-[12px] outline-none font-mono"
                      style={{
                        backgroundColor: theme.bg,
                        color: theme.text,
                        border: `1px solid ${rgbToRgba(theme.accent, 0.55)}`,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                      style={{ color: theme.muted }}
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModal(null)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer"
                      style={{ backgroundColor: theme.elevated, color: theme.muted }}
                    >
                      Cancelar (A)
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                    >
                      {modal.purpose === 'list' ? 'Abrir Arquivo' : 'Descompactar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ==================== LIVE PROGRESS / SPEED / ETA OVERLAY ==================== */}
        {activeJob && (
          <div
            className="absolute inset-0 z-40 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(6, 8, 12, 0.82)', backdropFilter: 'blur(5px)' }}
          >
            <div
              className="w-full max-w-[440px] rounded-2xl p-4 space-y-3"
              style={{
                backgroundColor: theme.panel,
                border: `1px solid ${rgbToRgba(theme.accent, 0.55)}`,
                boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-bold" style={{ color: theme.text }}>
                    {opLabelPt(activeJob.op || jobMeta?.action || '')}
                  </div>
                  <div className="text-[11px] truncate max-w-[300px]" style={{ color: theme.muted }}>
                    {activeJob.currentFile || activeJob.message}
                  </div>
                </div>
                <div
                  className="text-[18px] font-extrabold tabular-nums font-mono"
                  style={{ color: theme.accent }}
                >
                  {Math.round(activeJob.percent)}%
                </div>
              </div>

              {/* Progress Bar */}
              <div
                className="w-full h-3 rounded-full overflow-hidden"
                style={{ backgroundColor: mixRgb(theme.bg, theme.elevated, 0.7) }}
              >
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(2, Math.min(100, activeJob.percent))}%`,
                    backgroundColor: theme.accent,
                  }}
                />
              </div>

              {/* Live Telemetry: Speed, ETA, Bytes, Items */}
              <div className="grid grid-cols-3 gap-2">
                <div
                  className="rounded-xl px-2.5 py-2"
                  style={{
                    backgroundColor: mixRgb(theme.bg, theme.elevated, 0.45),
                    border: `1px solid ${themeHairline(theme)}`,
                  }}
                >
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: theme.muted }}>
                    Velocidade
                  </div>
                  <div className="text-[12px] font-bold tabular-nums font-mono" style={{ color: theme.text }}>
                    {formatSpeed(activeJob.speedBps)}
                  </div>
                </div>

                <div
                  className="rounded-xl px-2.5 py-2"
                  style={{
                    backgroundColor: mixRgb(theme.bg, theme.elevated, 0.45),
                    border: `1px solid ${themeHairline(theme)}`,
                  }}
                >
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: theme.muted }}>
                    Tempo restante
                  </div>
                  <div className="text-[12px] font-bold tabular-nums font-mono" style={{ color: theme.accent }}>
                    {formatEta(activeJob.etaSec)}
                  </div>
                </div>

                <div
                  className="rounded-xl px-2.5 py-2"
                  style={{
                    backgroundColor: mixRgb(theme.bg, theme.elevated, 0.45),
                    border: `1px solid ${themeHairline(theme)}`,
                  }}
                >
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: theme.muted }}>
                    Progresso
                  </div>
                  <div className="text-[11px] font-bold tabular-nums font-mono truncate" style={{ color: theme.text }}>
                    {activeJob.bytesTotal > 0
                      ? `${formatBytesShort(activeJob.bytesDone)} / ${formatBytesShort(activeJob.bytesTotal)}`
                      : `${activeJob.itemsDone} / ${Math.max(1, activeJob.itemsTotal)} itens`}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] truncate max-w-[260px]" style={{ color: theme.muted }}>
                  {activeJob.message}
                </div>
                {activeJob.status === 'running' && (
                  <button
                    type="button"
                    onClick={() => void cancelActiveJob()}
                    className="px-3 py-1 rounded-lg text-[11px] font-semibold cursor-pointer bg-red-500/20 text-red-300 border border-red-400/40"
                  >
                    Cancelar (A)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <FooterBar theme={theme} toast={toast} />
      </div>
    );
  }
);

FileManagerScreen.displayName = 'FileManagerScreen';
