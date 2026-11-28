import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  ListMusic,
  Lock,
  Moon,
  Plus,
  Trash2,
  Upload,
  Volume2,
  Wifi,
} from 'lucide-react';
import type { KpTheme } from '../themes';
import type { MediaTrack } from '../types';
import { HeaderBar } from './HeaderBar';
import { FooterBar, ModernBackdrop, modernCardStyle, modernPanelStyle, rgbToRgba, themeHairline } from './R36SIcons';

export interface SavedM3uPlaylist {
  id: string;
  name: string;
  createdAt: number;
  trackIds: string[];
  trackTitles: string[];
}

export type PinDir = 1 | 2 | 3 | 4; // 1=UP, 2=DOWN, 3=LEFT, 4=RIGHT

/** Salted 64-bit FNV-1a hash matching native source/r36s_hw.h */
export function hashPinCode(code: PinDir[]): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const salt = 'KP217_ADULT_PIN_SALT_';
  for (let i = 0; i < salt.length; i++) {
    h ^= BigInt(salt.charCodeAt(i));
    h = (h * prime) & mask;
  }
  for (let i = 0; i < 4; i++) {
    h ^= BigInt(code[i] ?? 0);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, '0');
}

export const DEFAULT_ADULT_PIN_HASH = hashPinCode([1, 1, 2, 2]); // ↑ ↑ ↓ ↓

function dirSymbol(d: PinDir): string {
  return d === 1 ? '↑' : d === 2 ? '↓' : d === 3 ? '←' : '→';
}

/* ==================== 1. 4-DIRECTION GAMEPAD PIN MODAL ==================== */

export function GamepadPinModal({
  theme,
  mode,
  expectedHash,
  onSuccess,
  onCancel,
}: {
  theme: KpTheme;
  mode: 'verify' | 'set';
  expectedHash: string;
  onSuccess: (newHash?: string) => void;
  onCancel: () => void;
}) {
  const [buf, setBuf] = useState<PinDir[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pushDir = (d: PinDir) => {
    setError(null);
    const next = [...buf, d].slice(0, 4) as PinDir[];
    setBuf(next);
    if (next.length === 4) {
      const h = hashPinCode(next);
      if (mode === 'set') {
        onSuccess(h);
      } else if (h === expectedHash) {
        onSuccess();
      } else {
        setError('PIN incorreto · Tente novamente (padrão: ↑ ↑ ↓ ↓)');
        setBuf([]);
      }
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        style={{ ...modernPanelStyle(theme, 16), border: `1.5px solid ${rgbToRgba(theme.accent, 0.55)}` }}
        className="w-full max-w-[380px] p-5 flex flex-col items-center gap-4 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4" style={{ color: theme.accent }} />
          <h3 style={{ color: theme.text }} className="text-[16px] font-extrabold">
            {mode === 'set' ? 'Definir PIN da Seção +18' : 'PIN da Seção +18'}
          </h3>
        </div>
        <p style={{ color: theme.muted }} className="text-[11.5px] text-center leading-snug">
          {mode === 'set'
            ? 'Escolha uma sequência de 4 direções no D-Pad para proteger o acesso à Seção +18.'
            : 'Insira a sequência de 4 direções do controle para desbloquear (padrão: ↑ ↑ ↓ ↓).'}
        </p>

        {/* 4 PIN Slots */}
        <div className="flex items-center gap-3">
          {[0, 1, 2, 3].map((slot) => {
            const filled = slot < buf.length;
            return (
              <div
                key={slot}
                style={{
                  backgroundColor: filled ? rgbToRgba(theme.accent, 0.18) : rgbToRgba(theme.elevated, 0.8),
                  border: `1.5px solid ${filled ? theme.accent : themeHairline(theme)}`,
                  color: filled ? theme.accent : theme.muted,
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-[18px] font-black"
              >
                {filled ? (mode === 'set' ? dirSymbol(buf[slot]) : '●') : '·'}
              </div>
            );
          })}
        </div>

        {error && <div className="text-[11px] font-semibold text-amber-400 text-center">{error}</div>}

        {/* Interactive D-Pad Buttons */}
        <div className="grid grid-cols-4 gap-2 w-full">
          {(
            [
              { d: 1 as PinDir, label: 'Cima', icon: <ArrowUp className="w-4 h-4" /> },
              { d: 2 as PinDir, label: 'Baixo', icon: <ArrowDown className="w-4 h-4" /> },
              { d: 3 as PinDir, label: 'Esq.', icon: <ArrowLeft className="w-4 h-4" /> },
              { d: 4 as PinDir, label: 'Dir.', icon: <ArrowRight className="w-4 h-4" /> },
            ] as const
          ).map((btn) => (
            <button
              key={btn.d}
              type="button"
              onClick={() => pushDir(btn.d)}
              style={{ ...modernCardStyle(theme, false, 10), height: 44 }}
              className="flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:brightness-110"
            >
              <span style={{ color: theme.accent }}>{btn.icon}</span>
              <span style={{ color: theme.muted }} className="text-[9.5px] font-bold">
                {btn.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between w-full pt-1">
          <button
            type="button"
            onClick={() => setBuf([])}
            style={{ color: theme.muted }}
            className="text-[11px] font-semibold hover:underline cursor-pointer"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ color: theme.accent }}
            className="text-[11.5px] font-bold hover:underline cursor-pointer"
          >
            A · Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== 2. SCREEN-OFF ("TELA APAGADA" / MODO BOLSO) ==================== */

export function ScreenOffCurtain({
  trackTitle,
  isPlaying,
  onWake,
}: {
  trackTitle: string;
  isPlaying: boolean;
  onWake: () => void;
}) {
  return (
    <div
      onClick={onWake}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        e.preventDefault();
        onWake();
      }}
      className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center cursor-pointer select-none px-6 text-center"
    >
      <Moon className="w-6 h-6 text-white/15 mb-3" />
      <div className="text-[12px] font-medium text-white/20 max-w-[320px] truncate">
        {isPlaying ? trackTitle : 'Áudio pausado'}
      </div>
      <div className="text-[10.5px] text-white/15 mt-2">
        Tela apagada (Modo Bolso) · Pressione qualquer botão ou toque para acordar
      </div>
    </div>
  );
}

/* ==================== 3. WI-FI FILE TRANSFER SCREEN ==================== */

function buildDeterministicQrGrid(seedText: string): number[][] {
  const n = 21;
  const g: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const finder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        g[r0 + r][c0 + c] = edge || inner ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 16777619) >>> 0;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c >= n - 8) || (r >= n - 8 && c < 8);
      if (inFinder) continue;
      if (r === 6 || c === 6) {
        g[r][c] = (r + c) % 2 === 0 ? 1 : 0;
      } else {
        h = Math.imul(h ^ (r * 31 + c * 17 + 1), 16777619) >>> 0;
        g[r][c] = (h >>> 24) & 1;
      }
    }
  }
  return g;
}

export function WifiTransferScreen({
  theme,
  themeIndex,
  locationLabel,
  onUploadFiles,
  onBack,
}: {
  theme: KpTheme;
  themeIndex: number;
  locationLabel: string;
  onUploadFiles: (files: FileList | null) => void;
  onBack: () => void;
}) {
  const [pin] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [category, setCategory] = useState<'music' | 'video' | 'iptv' | 'radio'>('music');
  const [uploadedCount, setUploadedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.hostname || '192.168.1.42' : '192.168.1.42';
  const transferUrl = `http://${origin}:8088/?pin=${pin}`;
  const qr = useMemo(() => buildDeterministicQrGrid(transferUrl), [transferUrl]);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section="WI-FI TRANSFER" location={locationLabel} />

      <div className="relative z-10 flex-1 min-h-0 px-4 pt-3 pb-[52px] grid grid-cols-1 @min-[540px]:grid-cols-[200px_1fr] gap-3 max-w-[820px] mx-auto w-full overflow-y-auto kp-scroll">
        {/* QR Code Card */}
        <div
          style={{ ...modernPanelStyle(theme, 16) }}
          className="p-3.5 flex flex-col items-center justify-center gap-2.5"
        >
          <div className="bg-white p-2.5 rounded-xl shadow-md">
            <svg width={132} height={132} viewBox="0 0 21 21" shapeRendering="crispEdges">
              {qr.map((row, r) =>
                row.map((cell, c) =>
                  cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#090c12" /> : null
                )
              )}
            </svg>
          </div>
          <div className="text-center">
            <div style={{ color: theme.muted }} className="text-[10px]">
              PIN da sessão
            </div>
            <div style={{ color: theme.accent }} className="text-[20px] font-black font-mono tracking-widest tabular-nums">
              {pin}
            </div>
          </div>
        </div>

        {/* Details & Upload */}
        <div style={{ ...modernPanelStyle(theme, 16) }} className="p-4 flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4" style={{ color: theme.accent }} />
              <h2 style={{ color: theme.text }} className="text-[16px] font-extrabold">
                Transferir arquivos via Wi-Fi
              </h2>
            </div>
            <p style={{ color: theme.muted }} className="text-[11.5px] leading-snug">
              No R36S, abra o endereço abaixo no celular ou PC na mesma rede Wi-Fi para enviar músicas, vídeos, listas IPTV (.m3u) ou rádios (.pls) sem retirar o cartão SD.
            </p>
            <div
              style={{
                backgroundColor: rgbToRgba(theme.elevated, 0.9),
                border: `1px solid ${themeHairline(theme)}`,
                color: theme.text,
              }}
              className="px-3 py-2 rounded-lg font-mono text-[11.5px] truncate"
            >
              {transferUrl}
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              {(
                [
                  { id: 'music', label: 'Músicas' },
                  { id: 'video', label: 'Vídeos' },
                  { id: 'iptv', label: 'IPTV' },
                  { id: 'radio', label: 'Rádio' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={{
                    backgroundColor: category === cat.id ? theme.accent : rgbToRgba(theme.elevated, 0.8),
                    color: category === cat.id ? (theme.isLight ? '#fff' : '#090c12') : theme.muted,
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer"
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: themeHairline(theme) }}>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const count = e.target.files?.length ?? 0;
                if (count > 0) {
                  setUploadedCount((c) => c + count);
                  onUploadFiles(e.target.files);
                }
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{ backgroundColor: theme.accent, color: theme.isLight ? '#fff' : '#090c12' }}
              className="px-3.5 py-2 rounded-lg text-[11.5px] font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Enviar arquivos agora ({uploadedCount})
            </button>
            <button
              type="button"
              onClick={onBack}
              style={{ color: theme.muted }}
              className="text-[11.5px] font-bold hover:underline cursor-pointer"
            >
              A · Encerrar servidor
            </button>
          </div>
        </div>
      </div>

      <FooterBar
        theme={theme}
        themeIndex={themeIndex}
        hints={[
          { key: 'A', label: 'Encerrar e voltar' },
          { key: 'B', label: 'Enviar arquivo' },
        ]}
      />
    </div>
  );
}

/* ==================== 4. DIAGNOSTICS & BACKUP/RESTORE SCREEN ==================== */

export function DiagnosticsScreen({
  theme,
  themeIndex,
  locationLabel,
  systemMiniPlayerActive,
  brightnessPct,
  trackCount,
  favCount,
  playlistCount,
  onExportBackup,
  onImportBackup,
  onSoundTest,
  onBack,
}: {
  theme: KpTheme;
  themeIndex: number;
  locationLabel: string;
  systemMiniPlayerActive: boolean;
  brightnessPct: number;
  trackCount: number;
  favCount: number;
  playlistCount: number;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onSoundTest: () => void;
  onBack: () => void;
}) {
  const importRef = useRef<HTMLInputElement | null>(null);
  const rows = [
    { label: 'Mini-Player (L3 + R3)', value: systemMiniPlayerActive ? 'Injetado no sistema' : 'Modo port sob demanda' },
    { label: 'Backend de áudio', value: 'Web Audio / PipeWire · ALSA dmix' },
    { label: 'Brilho atual da tela', value: `${brightnessPct}%` },
    { label: 'Biblioteca indexada', value: `${trackCount} mídias · ${favCount} favoritos · ${playlistCount} playlists` },
    { label: 'Versão instalada', value: 'KPlayer v2.1.7' },
  ];

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section="DIAGNÓSTICO" location={locationLabel} />

      <div className="relative z-10 flex-1 min-h-0 px-4 pt-3 pb-[52px] flex flex-col gap-3 max-w-[780px] mx-auto w-full overflow-y-auto kp-scroll">
        <div style={{ ...modernPanelStyle(theme, 16) }} className="p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: theme.accent }} />
            <h2 style={{ color: theme.text }} className="text-[16px] font-extrabold">
              Diagnóstico do Sistema & Backup
            </h2>
          </div>

          <div className="divide-y" style={{ borderColor: themeHairline(theme) }}>
            {rows.map((r) => (
              <div key={r.label} className="py-2 flex items-center justify-between gap-3 text-[12px]">
                <span style={{ color: theme.muted }}>{r.label}</span>
                <span style={{ color: theme.text }} className="font-semibold text-right tabular-nums">
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 @min-[520px]:grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onSoundTest}
            style={{ ...modernCardStyle(theme, false, 12), minHeight: 46 }}
            className="px-3 py-2 flex items-center justify-center gap-2 text-[12px] font-bold cursor-pointer hover:brightness-110"
          >
            <Volume2 className="w-4 h-4" style={{ color: theme.accent }} />
            <span style={{ color: theme.text }}>Teste de som rápido</span>
          </button>

          <button
            type="button"
            onClick={onExportBackup}
            style={{ ...modernCardStyle(theme, false, 12), minHeight: 46 }}
            className="px-3 py-2 flex items-center justify-center gap-2 text-[12px] font-bold cursor-pointer hover:brightness-110"
          >
            <Download className="w-4 h-4" style={{ color: theme.accent }} />
            <span style={{ color: theme.text }}>Criar backup (.json)</span>
          </button>

          <button
            type="button"
            onClick={() => importRef.current?.click()}
            style={{ ...modernCardStyle(theme, false, 12), minHeight: 46 }}
            className="px-3 py-2 flex items-center justify-center gap-2 text-[12px] font-bold cursor-pointer hover:brightness-110"
          >
            <Upload className="w-4 h-4" style={{ color: theme.accent }} />
            <span style={{ color: theme.text }}>Restaurar backup</span>
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportBackup(f);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onBack}
            style={{ color: theme.accent }}
            className="text-[12px] font-bold hover:underline cursor-pointer"
          >
            A · Voltar às Opções
          </button>
        </div>
      </div>

      <FooterBar
        theme={theme}
        themeIndex={themeIndex}
        hints={[
          { key: 'A', label: 'Voltar' },
          { key: 'B', label: 'Selecionar ação' },
        ]}
      />
    </div>
  );
}

/* ==================== 5. SAVED .M3U PLAYLISTS MODAL ==================== */

export function SavedPlaylistsModal({
  theme,
  playlists,
  currentQueue,
  onSaveCurrent,
  onLoadPlaylist,
  onDeletePlaylist,
  onExportM3u,
  onClose,
}: {
  theme: KpTheme;
  playlists: SavedM3uPlaylist[];
  currentQueue: MediaTrack[];
  onSaveCurrent: (name: string) => void;
  onLoadPlaylist: (pl: SavedM3uPlaylist) => void;
  onDeletePlaylist: (id: string) => void;
  onExportM3u: (pl: SavedM3uPlaylist) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState('');

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        style={{ ...modernPanelStyle(theme, 16), border: `1.5px solid ${rgbToRgba(theme.accent, 0.45)}` }}
        className="w-full max-w-[480px] max-h-[88%] p-4 flex flex-col gap-3 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4" style={{ color: theme.accent }} />
            <h3 style={{ color: theme.text }} className="text-[15px] font-extrabold">
              Playlists salvas (.m3u)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ color: theme.muted }}
            className="text-[11.5px] font-bold hover:underline cursor-pointer"
          >
            A · Fechar
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = newName.trim() || `Playlist ${playlists.length + 1}`;
            onSaveCurrent(clean);
            setNewName('');
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Salvar fila atual (${currentQueue.length} faixas)...`}
            style={{
              backgroundColor: theme.elevated,
              color: theme.text,
              border: `1px solid ${themeHairline(theme)}`,
            }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[12px] outline-none"
          />
          <button
            type="submit"
            disabled={currentQueue.length === 0}
            style={{ backgroundColor: theme.accent, color: theme.isLight ? '#fff' : '#090c12' }}
            className="px-3 py-1.5 rounded-lg text-[11.5px] font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> Salvar
          </button>
        </form>

        <div className="flex-1 min-h-0 overflow-y-auto kp-scroll space-y-1.5 pr-1">
          {playlists.length === 0 ? (
            <div style={{ color: theme.muted }} className="py-8 text-center text-[12px]">
              Nenhuma playlist salva ainda. Salve a fila atual acima para criar seu primeiro arquivo .m3u.
            </div>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                style={{ ...modernCardStyle(theme, false, 10) }}
                className="px-3 py-2 flex items-center justify-between gap-2"
              >
                <button
                  type="button"
                  onClick={() => onLoadPlaylist(pl)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div style={{ color: theme.text }} className="text-[13px] font-bold truncate">
                    {pl.name}.m3u
                  </div>
                  <div style={{ color: theme.muted }} className="text-[10.5px] tabular-nums">
                    {pl.trackIds.length} faixas · Carregar na fila
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onExportM3u(pl)}
                    style={{ color: theme.accent }}
                    className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                    title="Baixar arquivo .m3u"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePlaylist(pl.id)}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-white/10 cursor-pointer"
                    title="Excluir playlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
