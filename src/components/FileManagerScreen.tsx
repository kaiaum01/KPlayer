import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CheckSquare,
  ChevronLeft,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Folder,
  FolderPlus,
  HardDrive,
  Lock,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  RefreshCw,
  Scissors,
  Square,
  Trash2,
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

export interface FileManagerScreenHandle {
  handleButton: (btn: R36SButton) => void;
}

interface FileManagerScreenProps {
  theme: KpTheme;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  notify: (msg: string) => void;
  onBack: () => void;
}

interface FmEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
  isHidden: boolean;
  isArchive: boolean;
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
  | {
      kind: 'password';
      purpose: 'list' | 'extract';
      archivePath: string;
      extractDest?: string;
      error?: string;
    };

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v', '.ts']);
const TEXT_EXTS = new Set(['.txt', '.cfg', '.ini', '.json', '.md', '.log', '.sh', '.py', '.conf', '.pls', '.m3u', '.m3u8']);

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
  return name.replace(/\.(tar\.gz|tar\.xz|tar\.bz2|zip|7z|rar|tar|gz|tgz|xz|txz|bz2|tbz2|cbz|cbr|iso)$/i, '') || 'extraido';
}

export const FileManagerScreen = forwardRef<FileManagerScreenHandle, FileManagerScreenProps>(
  ({ theme, locationLabel, toast, notify, onBack }, ref) => {
    const [currentPath, setCurrentPath] = useState<string>('/');
    const [parentPath, setParentPath] = useState<string>('/');
    const [entries, setEntries] = useState<FmEntry[]>([]);
    const [quickRoots, setQuickRoots] = useState<QuickRoot[]>([
      { label: '/ (Raiz)', path: '/' },
      { label: '/roms', path: '/roms' },
      { label: '/roms2', path: '/roms2' },
      { label: '/roms/ports', path: '/roms/ports' },
      { label: '/home/ark/Downloads', path: '/home/ark/Downloads' },
    ]);
    const [showHidden, setShowHidden] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
    const [clipboard, setClipboard] = useState<FmClipboard | null>(null);

    // Archive viewer state
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

    // Modal state
    const [modal, setModal] = useState<ModalMode>(null);
    const [modalFocusIdx, setModalFocusIdx] = useState(0);
    const [textInput, setTextInput] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Live job progress state
    const [activeJob, setActiveJob] = useState<FmJobProgress | null>(null);
    const [jobMeta, setJobMeta] = useState<{
      action: string;
      archivePath?: string;
      extractDest?: string;
    } | null>(null);
    const pollTimerRef = useRef<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

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
      };
    }, []);

    // Keep focused row scrolled into view
    useEffect(() => {
      const container = listRef.current;
      if (!container) return;
      const el = container.querySelector<HTMLElement>(`[data-fm-row="${selectedIdx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx, archiveView]);

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
          desc: 'Ir para /, /roms, /roms2, /roms/ports ou Downloads',
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
      clipboard,
      currentPath,
      getEffectiveTargets,
      handlePaste,
      loadDirectory,
      modal,
      notify,
      openArchive,
      requestExtract,
      selectedPaths.size,
      showHidden,
    ]);

    const openEntry = useCallback(
      (entry: FmEntry) => {
        if (entry.isDir) {
          void loadDirectory(entry.path);
        } else if (entry.isArchive) {
          void openArchive(entry.path);
        } else {
          setModalFocusIdx(0);
          setModal({ kind: 'actions', target: entry });
        }
      },
      [loadDirectory, openArchive]
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
          if (btn === 'A') {
            setModal(null);
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
        actionMenuItems,
        activeJob,
        archiveView,
        cancelActiveJob,
        currentEntry,
        currentPath,
        entries.length,
        handleCompressSubmit,
        handleMkdirSubmit,
        handlePaste,
        handlePasswordSubmit,
        handleRenameSubmit,
        loadDirectory,
        modal,
        modalFocusIdx,
        onBack,
        openEntry,
        parentPath,
        quickRoots,
        requestExtract,
        selectedPaths.size,
        startJob,
        toggleSelectPath,
      ]
    );

    useImperativeHandle(ref, () => ({ handleButton }), [handleButton]);

    const renderEntryIcon = (entry: FmEntry, focused: boolean) => {
      const color = focused ? theme.accent : entry.isDir ? theme.accent : theme.muted;
      if (entry.isDir) return <Folder className="w-4 h-4 shrink-0" style={{ color }} />;
      if (entry.isArchive) return <Archive className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />;
      if (AUDIO_EXTS.has(entry.ext)) return <FileAudio className="w-4 h-4 shrink-0" style={{ color }} />;
      if (VIDEO_EXTS.has(entry.ext)) return <FileVideo className="w-4 h-4 shrink-0" style={{ color }} />;
      if (TEXT_EXTS.has(entry.ext)) return <FileText className="w-4 h-4 shrink-0" style={{ color }} />;
      return <FileIcon className="w-4 h-4 shrink-0" style={{ color }} />;
    };

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
                  if (archiveView) setArchiveView(null);
                  else if (currentPath !== '/') void loadDirectory(parentPath);
                  else onBack();
                }}
                className="p-1.5 rounded-lg cursor-pointer transition-colors shrink-0"
                style={{
                  backgroundColor: mixRgb(theme.elevated, theme.text, 0.06),
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                title={archiveView ? 'Fechar arquivo compactado' : currentPath === '/' ? 'Voltar para Home' : 'Subir pasta'}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: theme.muted }}>
                  {archiveView ? `7-Zip • ${archiveView.engine}` : 'Raiz do Console'}
                </div>
                <div className="text-[12px] font-bold truncate font-mono" style={{ color: theme.text }}>
                  {archiveView ? archiveView.path : currentPath}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!archiveView && (
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
          {!archiveView && (
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
          {!archiveView && (clipboard || selectedPaths.size > 0) && (
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

          {/* Main File / Archive List */}
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto kp-scroll rounded-xl p-1.5 space-y-1"
            style={modernPanelStyle(theme, 12)}
          >
            {loading && !archiveView ? (
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
                          : entry.isArchive
                          ? `7Z/ZIP • ${formatBytesShort(entry.size)}`
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

          {/* Compact Status Footer */}
          <div
            className="px-2 py-0.5 flex items-center justify-between text-[10px] shrink-0"
            style={{ color: theme.muted }}
          >
            <span className="tabular-nums">
              {archiveView
                ? `${archiveView.items.length} item(ns) no arquivo`
                : `${entries.length} item(ns) • B abrir • X ações • Y selecionar • L1 atalhos`}
            </span>
            <span className="font-mono">7-Zip • ZIP / 7Z / RAR</span>
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
              className="w-full max-w-[420px] rounded-2xl p-3.5 space-y-2.5 max-h-[88%] flex flex-col"
              style={{
                backgroundColor: theme.panel,
                border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
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
