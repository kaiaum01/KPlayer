import React, { useCallback, useEffect, useImperativeHandle, useState } from 'react';
import type { KpTheme } from '../themes';
import type { LanguageCode, YoutubeItem } from '../types';
import { tr } from '../i18n';
import type { R36SButton } from './R36SControls';
import { HeaderBar } from './HeaderBar';
import {
  FooterBar,
  ModernBackdrop,
  modernCardStyle,
  modernPanelStyle,
  rgbToRgba,
} from './R36SIcons';

// Exact 40-key layout from source/youtube.h line 9
const YOUTUBE_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 <OO'.split('');

export interface YoutubeScreenHandle {
  handleButton: (btn: R36SButton) => void;
}

export const YoutubeScreen = React.forwardRef<
  YoutubeScreenHandle,
  {
    theme: KpTheme;
    themeIndex: number;
    lang: LanguageCode;
    location: string;
    toast: string | null;
    onBack: () => void;
    onNotify: (msg: string) => void;
  }
>(function YoutubeScreen({ theme, themeIndex, lang, location, toast, onBack, onNotify }, ref) {
  const [query, setQuery] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [items, setItems] = useState<YoutubeItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(() => tr('Digite uma busca', lang));
  const [playingItem, setPlayingItem] = useState<YoutubeItem | null>(null);
  const [downloadMenu, setDownloadMenu] = useState(false);
  const [downloadSelection, setDownloadSelection] = useState(0);

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (!q) return;
      setLoading(true);
      setKeyboardOpen(false);
      setMessage(tr('Carregando... aguarde', lang));
      try {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { items?: YoutubeItem[]; error?: string };
        const found = data.items ?? [];
        setItems(found);
        setSelected(0);
        setMessage(
          found.length > 0
            ? `${found.length} resultados`
            : data.error
            ? 'Falha. Verifique internet e tente novamente.'
            : 'Nenhum resultado'
        );
      } catch {
        setItems([]);
        setMessage('Falha. Verifique internet e tente novamente.');
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  const triggerDownloadChoice = useCallback(
    (choiceIdx: number) => {
      const target = playingItem ?? items[selected];
      setDownloadMenu(false);
      if (!target) return;
      const modeLabel = choiceIdx === 0 ? 'Vídeo com som' : 'Somente áudio';
      onNotify(`${modeLabel}: no R36S salva em midias/Downloads`);
      setMessage(`R36S (yt-dlp): ${modeLabel} → midias/Downloads`);
    },
    [playingItem, items, selected, onNotify]
  );

  const activateKey = useCallback(
    (idx: number) => {
      if (idx === 38 || idx === 39) {
        if (query.trim().length > 0) runSearch(query);
      } else if (idx === 37) {
        setQuery((prev) => prev.slice(0, -1));
      } else if (idx === 36) {
        setQuery((prev) => (prev.length < 80 ? `${prev} ` : prev));
      } else {
        const ch = YOUTUBE_KEYS[idx];
        setQuery((prev) => (prev.length < 80 ? `${prev}${ch}` : prev));
      }
    },
    [query, runSearch]
  );

  const handleButton = useCallback(
    (btn: R36SButton) => {
      if (downloadMenu) {
        if (btn === 'A') setDownloadMenu(false);
        else if (btn === 'UP' || btn === 'DOWN') setDownloadSelection((s) => 1 - s);
        else if (btn === 'B') triggerDownloadChoice(downloadSelection);
        return;
      }

      if (playingItem) {
        if (btn === 'A') {
          setPlayingItem(null);
        } else if (btn === 'Y' || btn === 'X') {
          setDownloadSelection(0);
          setDownloadMenu(true);
        }
        return;
      }

      if (btn === 'A') {
        if (!keyboardOpen) setKeyboardOpen(true);
        else onBack();
        return;
      }

      if (loading) return;

      if (btn === 'Y') {
        setKeyboardOpen((v) => !v);
        return;
      }

      if (keyboardOpen) {
        if (btn === 'LEFT') setCursor((c) => (c + 39) % 40);
        else if (btn === 'RIGHT') setCursor((c) => (c + 1) % 40);
        else if (btn === 'UP') setCursor((c) => (c + 30) % 40);
        else if (btn === 'DOWN') setCursor((c) => (c + 10) % 40);
        else if (btn === 'B') activateKey(cursor);
      } else {
        if (btn === 'UP' && selected >= 3) setSelected((s) => s - 3);
        else if (btn === 'DOWN' && selected + 3 < items.length) setSelected((s) => s + 3);
        else if (btn === 'LEFT' && selected > 0) setSelected((s) => s - 1);
        else if (btn === 'RIGHT' && selected + 1 < items.length) setSelected((s) => s + 1);
        else if (btn === 'X' && items.length > 0) {
          setDownloadSelection(0);
          setDownloadMenu(true);
        } else if (btn === 'B' && items[selected]) {
          setPlayingItem(items[selected]);
        }
      }
    },
    [
      downloadMenu,
      downloadSelection,
      triggerDownloadChoice,
      playingItem,
      keyboardOpen,
      onBack,
      loading,
      activateKey,
      cursor,
      selected,
      items,
    ]
  );

  useImperativeHandle(ref, () => ({ handleButton }), [handleButton]);

  // Allow direct Enter submit when typing in search input
  useEffect(() => {
    if (!query && items.length === 0 && !loading) {
      setMessage(tr('Digite uma busca', lang));
    }
  }, [query, items.length, loading, lang]);

  const pageOffset = Math.floor(selected / 6) * 6;

  // Embedded YouTube player view inside the 640x480 R36S screen
  if (playingItem) {
    return (
      <div className="w-full h-full relative bg-black overflow-hidden">
        <HeaderBar theme={theme} section={tr('VÍDEOS ONLINE', lang)} location={location} />
        <div className="absolute left-0 right-0 top-[32px] bottom-[44px] bg-black">
          <iframe
            title={playingItem.title}
            src={`https://www.youtube.com/embed/${playingItem.id}?autoplay=1&rel=0`}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
          <button
            type="button"
            onClick={() => setPlayingItem(null)}
            style={{
              backgroundColor: rgbToRgba(theme.panel, 0.88),
              color: theme.text,
              border: `1px solid ${rgbToRgba(theme.accent, 0.4)}`,
            }}
            className="absolute left-3 top-2.5 h-[26px] px-3 rounded-full text-[11.5px] font-semibold cursor-pointer hover:brightness-110 z-20"
          >
            {tr('A  Voltar', lang)}
          </button>
        </div>

        <FooterBar
          theme={theme}
          themeIndex={themeIndex}
          toast={toast}
          hints={[
            { key: 'A', label: tr('Voltar', lang) },
            { key: 'Y', label: tr('Baixar', lang) },
          ]}
        />

        {downloadMenu && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center z-40">
            <div style={{ ...modernPanelStyle(theme, 16), width: 400 }} className="p-4.5">
              <div style={{ color: theme.text }} className="text-[18px] font-bold mb-3">
                Baixar conteúdo
              </div>
              <div className="space-y-2.5">
                {['Vídeo com som', 'Somente áudio'].map((label, i) => {
                  const chosen = i === downloadSelection;
                  return (
                    <button
                      key={label}
                      type="button"
                      onMouseEnter={() => setDownloadSelection(i)}
                      onClick={() => triggerDownloadChoice(i)}
                      style={{
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: chosen ? theme.accent : theme.elevated,
                        color: chosen ? theme.bg : theme.text,
                      }}
                      className="w-full px-3.5 text-left text-[14px] font-semibold cursor-pointer"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div style={{ color: theme.muted }} className="text-[11px] mt-3">
                A: cancelar • B: confirmar
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section={tr('VÍDEOS ONLINE', lang)} location={location} />

      <div className="relative z-10 px-6 pt-3">
        <div className="flex items-center justify-between">
          <h2 style={{ color: theme.text }} className="text-[22px] font-bold leading-tight">
            {tr('Busca no YouTube', lang)}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setKeyboardOpen((v) => !v)}
              style={{
                backgroundColor: theme.elevated,
                color: theme.accent,
              }}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer hover:brightness-110"
            >
              {keyboardOpen ? 'Ver resultados' : 'Teclado R36S'}
            </button>
          </div>
        </div>

        {/* Search Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) runSearch(query);
          }}
          style={{
            ...modernPanelStyle(theme, 8),
            height: 38,
          }}
          className="mt-2.5 px-3 flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 80))}
            placeholder={tr('Digite uma busca...', lang)}
            style={{ color: theme.text }}
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:opacity-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ color: theme.muted }}
              className="text-xs px-1.5 cursor-pointer hover:opacity-80"
            >
              ✕
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              backgroundColor: theme.accent,
              color: theme.bg,
            }}
            className="px-3 h-[24px] rounded-full text-[11px] font-bold cursor-pointer disabled:opacity-40 shrink-0"
          >
            OK
          </button>
        </form>

        {/* On-Screen 10x4 R36S Keyboard OR 3x2 Results Grid */}
        {keyboardOpen ? (
          <div className="mt-4">
            <div className="grid grid-cols-10 gap-[5px]">
              {YOUTUBE_KEYS.map((keyChar, idx) => {
                const active = idx === cursor;
                const display =
                  idx === 36 ? '_' : idx === 37 ? '<' : idx >= 38 ? 'OK' : keyChar;
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => activateKey(idx)}
                    style={{
                      height: 43,
                      borderRadius: 6,
                      backgroundColor: active ? theme.accent : theme.elevated,
                      color: active ? theme.bg : theme.text,
                      boxShadow: active
                        ? `0 0 12px ${rgbToRgba(theme.accent, 0.4)}`
                        : undefined,
                    }}
                    className="flex items-center justify-center text-[15px] font-bold cursor-pointer transition-colors"
                  >
                    {display}
                  </button>
                );
              })}
            </div>
            <div style={{ color: theme.muted }} className="mt-3 text-[12px]">
              _ espaço &nbsp;&nbsp; &lt; apagar &nbsp;&nbsp; OK pesquisar &nbsp;&nbsp; (ou digite no teclado)
            </div>
          </div>
        ) : loading ? (
          <div
            style={{ color: theme.accent }}
            className="h-[252px] flex items-center justify-center text-[15px] font-semibold"
          >
            {tr('Carregando... aguarde', lang)}
          </div>
        ) : items.length === 0 ? (
          <div className="h-[252px] flex flex-col items-center justify-center text-center px-6">
            <div style={{ color: theme.text }} className="text-[16px] font-semibold">
              {message}
            </div>
            <button
              type="button"
              onClick={() => setKeyboardOpen(true)}
              style={{ backgroundColor: theme.accent, color: theme.bg }}
              className="mt-3 px-4 py-1.5 rounded-full text-[12px] font-bold cursor-pointer"
            >
              Nova busca
            </button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-x-[9px] gap-y-2">
            {items.slice(pageOffset, pageOffset + 6).map((item, cellIdx) => {
              const realIdx = pageOffset + cellIdx;
              const focus = realIdx === selected;
              return (
                <button
                  key={item.id + realIdx}
                  type="button"
                  onMouseEnter={() => setSelected(realIdx)}
                  onClick={() => setPlayingItem(item)}
                  style={{
                    ...modernCardStyle(theme, focus, 10, theme.panel),
                    height: 120,
                  }}
                  className="p-[5px] flex flex-col text-left cursor-pointer overflow-hidden"
                >
                  <div
                    style={{ backgroundColor: theme.elevated }}
                    className="w-full h-[74px] rounded-[5px] overflow-hidden flex items-center justify-center shrink-0"
                  >
                    {item.thumb ? (
                      <img
                        src={item.thumb}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span style={{ color: theme.muted }} className="text-lg">
                        ▶
                      </span>
                    )}
                  </div>
                  <div
                    style={{ color: theme.text }}
                    className="mt-1 px-0.5 text-[11px] font-semibold truncate w-full"
                  >
                    {item.title}
                  </div>
                  <div
                    style={{ color: theme.muted }}
                    className="px-0.5 text-[9.5px] truncate w-full"
                  >
                    {item.channel}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Line (y=407) */}
      <div
        style={{ left: 24, top: 407, color: theme.accent }}
        className="absolute right-6 z-10 text-[11.5px] font-medium truncate"
      >
        {loading ? tr('Carregando... aguarde', lang) : message}
      </div>

      <FooterBar
        theme={theme}
        themeIndex={themeIndex}
        toast={toast}
        hints={[
          { key: 'DIR', label: tr('Navegar', lang) },
          { key: 'B', label: tr('Abrir', lang) },
          { key: 'X', label: tr('Baixar', lang) },
          { key: 'Y', label: tr('Busca', lang) },
          { key: 'A', label: tr('Voltar', lang) },
        ]}
      />

      {downloadMenu && (
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center z-40">
          <div style={{ ...modernPanelStyle(theme, 16), width: 400 }} className="p-5">
            <div style={{ color: theme.text }} className="text-[19px] font-bold mb-3">
              Baixar conteúdo
            </div>
            <div className="space-y-2.5">
              {['Vídeo com som', 'Somente áudio'].map((label, i) => {
                const chosen = i === downloadSelection;
                return (
                  <button
                    key={label}
                    type="button"
                    onMouseEnter={() => setDownloadSelection(i)}
                    onClick={() => triggerDownloadChoice(i)}
                    style={{
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: chosen ? theme.accent : theme.elevated,
                      color: chosen ? theme.bg : theme.text,
                    }}
                    className="w-full px-3.5 text-left text-[14px] font-semibold cursor-pointer"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ color: theme.muted }} className="text-[11px] mt-3">
              A: cancelar • B: confirmar
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
