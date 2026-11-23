import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Newspaper, RefreshCw, Clock, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { KpTheme } from '../themes';
import type { LanguageCode, NewsArticle, NewsCategoryKey } from '../types';
import type { R36SButton } from './R36SControls';
import { tr } from '../i18n';
import { HeaderBar } from './HeaderBar';
import {
  FooterBar,
  ModernBackdrop,
  mixRgb,
  modernCardStyle,
  modernPanelStyle,
  modernPillStyle,
  rgbToRgba,
  themeHairline,
} from './R36SIcons';

export interface NewsScreenHandle {
  handleButton: (btn: R36SButton) => void;
}

interface NewsScreenProps {
  theme: KpTheme;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  onBack: () => void;
  onPlayVideo?: (videoUrl: string, title: string, source: string) => void;
}

const NEWS_FILTERS: Array<{ key: NewsCategoryKey; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'breaking', label: 'Urgente' },
  { key: 'world', label: 'Mundo' },
  { key: 'crime', label: 'Polícia' },
  { key: 'entertainment', label: 'Entretenimento' },
  { key: 'sports', label: 'Esportes' },
];

export const NewsScreen = forwardRef<NewsScreenHandle, NewsScreenProps>(
  ({ theme, language, locationLabel, toast, onBack, onPlayVideo }, ref) => {
    const [filterIdx, setFilterIdx] = useState(0);
    const [articles, setArticles] = useState<NewsArticle[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [provider, setProvider] = useState<'newsdata' | 'rss'>('newsdata');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [detailOpen, setDetailOpen] = useState(false);

    const listRef = useRef<HTMLDivElement>(null);
    const readerRef = useRef<HTMLDivElement>(null);
    const cacheRef = useRef<Map<NewsCategoryKey, { provider: 'newsdata' | 'rss'; articles: NewsArticle[] }>>(
      new Map()
    );

    const activeCategory = NEWS_FILTERS[filterIdx].key;

    const loadNews = useCallback(async (cat: NewsCategoryKey, force = false) => {
      if (!force) {
        const cached = cacheRef.current.get(cat);
        if (cached && cached.articles.length > 0) {
          setArticles(cached.articles);
          setProvider(cached.provider);
          setError(null);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/news?category=${encodeURIComponent(cat)}${force ? '&refresh=1' : ''}`);
        const data = (await res.json()) as {
          ok?: boolean;
          provider?: 'newsdata' | 'rss';
          articles?: NewsArticle[];
        };
        const list = Array.isArray(data.articles) ? data.articles : [];
        if (list.length > 0) {
          const prov = data.provider === 'newsdata' ? 'newsdata' : 'rss';
          cacheRef.current.set(cat, { provider: prov, articles: list });
          setArticles(list);
          setProvider(prov);
          setSelectedIdx(0);
        } else {
          setArticles([]);
          setError('Nenhuma notícia disponível nesta categoria.');
        }
      } catch {
        setError('Não foi possível atualizar notícias agora.');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      loadNews(activeCategory, false);
    }, [activeCategory, loadNews]);

    const visibleArticles = useMemo(() => articles, [articles]);

    useEffect(() => {
      if (selectedIdx >= visibleArticles.length && visibleArticles.length > 0) {
        setSelectedIdx(visibleArticles.length - 1);
      }
    }, [selectedIdx, visibleArticles.length]);

    useEffect(() => {
      if (detailOpen) return;
      const el = listRef.current?.querySelector<HTMLElement>(`[data-news-idx="${selectedIdx}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIdx, detailOpen]);

    const selectedArticle = visibleArticles[selectedIdx] ?? null;

    useImperativeHandle(
      ref,
      () => ({
        handleButton: (btn: R36SButton) => {
          if (detailOpen) {
            if (btn === 'A') {
              setDetailOpen(false);
              return;
            }
            if (btn === 'UP') {
              readerRef.current?.scrollBy({ top: -90, behavior: 'smooth' });
              return;
            }
            if (btn === 'DOWN') {
              readerRef.current?.scrollBy({ top: 90, behavior: 'smooth' });
              return;
            }
            if ((btn === 'LEFT' || btn === 'L1') && visibleArticles.length > 1) {
              setSelectedIdx((i) => (i + visibleArticles.length - 1) % visibleArticles.length);
              if (readerRef.current) readerRef.current.scrollTop = 0;
              return;
            }
            if ((btn === 'RIGHT' || btn === 'R1') && visibleArticles.length > 1) {
              setSelectedIdx((i) => (i + 1) % visibleArticles.length);
              if (readerRef.current) readerRef.current.scrollTop = 0;
              return;
            }
            if (btn === 'X' && selectedArticle?.videoUrl && onPlayVideo) {
              onPlayVideo(selectedArticle.videoUrl, selectedArticle.title, selectedArticle.source);
              return;
            }
            if (btn === 'Y') {
              loadNews(activeCategory, true);
              return;
            }
            return;
          }

          if (btn === 'A') {
            onBack();
            return;
          }
          if (btn === 'Y') {
            loadNews(activeCategory, true);
            return;
          }
          if (btn === 'LEFT') {
            setFilterIdx((f) => (f + NEWS_FILTERS.length - 1) % NEWS_FILTERS.length);
            setSelectedIdx(0);
            return;
          }
          if (btn === 'RIGHT' || btn === 'X') {
            setFilterIdx((f) => (f + 1) % NEWS_FILTERS.length);
            setSelectedIdx(0);
            return;
          }
          if (btn === 'UP' && visibleArticles.length > 0) {
            setSelectedIdx((i) => (i + visibleArticles.length - 1) % visibleArticles.length);
            return;
          }
          if (btn === 'DOWN' && visibleArticles.length > 0) {
            setSelectedIdx((i) => (i + 1) % visibleArticles.length);
            return;
          }
          if (btn === 'START' && selectedArticle?.videoUrl && onPlayVideo) {
            onPlayVideo(selectedArticle.videoUrl, selectedArticle.title, selectedArticle.source);
            return;
          }
          if (btn === 'B' && visibleArticles.length > 0) {
            setDetailOpen(true);
            if (readerRef.current) readerRef.current.scrollTop = 0;
          }
        },
      }),
      [detailOpen, visibleArticles.length, activeCategory, loadNews, onBack, onPlayVideo, selectedArticle]
    );

    return (
      <div className="relative h-full w-full flex flex-col overflow-hidden">
        <ModernBackdrop theme={theme} />
        <HeaderBar
          theme={theme}
          section={tr('NOTÍCIAS', language)}
          location={locationLabel}
        />

        {detailOpen && selectedArticle ? (
          <div className="relative z-10 flex-1 min-h-0 flex flex-col px-3.5 py-2.5 gap-2">
            <div
              style={modernPanelStyle(theme, 16)}
              className="flex-1 min-h-0 flex flex-col overflow-hidden p-3.5"
            >
              {/* Meta row */}
              <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{
                      background: `linear-gradient(180deg, ${rgbToRgba(theme.accent, 0.24)} 0%, ${rgbToRgba(
                        theme.accent,
                        0.1
                      )} 100%)`,
                      border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                      color: theme.accent,
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold shrink-0"
                  >
                    {selectedArticle.categoryLabel}
                  </span>
                  <span style={{ color: theme.muted }} className="text-[11.5px] font-medium truncate">
                    {selectedArticle.source}
                  </span>
                  {selectedArticle.pubDate && (
                    <span
                      style={{ color: theme.dim }}
                      className="inline-flex items-center gap-1 text-[11px] shrink-0"
                    >
                      <Clock className="w-3 h-3" />
                      {selectedArticle.pubDate}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (visibleArticles.length > 1) {
                        setSelectedIdx((i) => (i + visibleArticles.length - 1) % visibleArticles.length);
                        if (readerRef.current) readerRef.current.scrollTop = 0;
                      }
                    }}
                    style={{ backgroundColor: theme.elevated, color: theme.text }}
                    className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                    aria-label="Anterior"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span style={{ color: theme.dim }} className="text-[11px] tabular-nums">
                    {selectedIdx + 1}/{visibleArticles.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (visibleArticles.length > 1) {
                        setSelectedIdx((i) => (i + 1) % visibleArticles.length);
                        if (readerRef.current) readerRef.current.scrollTop = 0;
                      }
                    }}
                    style={{ backgroundColor: theme.elevated, color: theme.text }}
                    className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer"
                    aria-label="Próxima"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Headline */}
              <h2
                style={{ color: theme.text }}
                className="text-[17px] @min-[520px]:text-[19px] font-extrabold leading-snug mb-2.5 shrink-0"
              >
                {selectedArticle.title}
              </h2>

              <div style={{ backgroundColor: themeHairline(theme) }} className="h-[1px] w-full mb-2.5 shrink-0" />

              {/* Scrollable body + optional thumbnail / video button */}
              <div ref={readerRef} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                {selectedArticle.imageUrl && (
                  <div
                    style={{ border: `1px solid ${themeHairline(theme)}` }}
                    className="relative w-full max-h-[160px] rounded-xl overflow-hidden bg-black/30"
                  >
                    <img
                      src={selectedArticle.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[160px] object-cover"
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement | null)?.classList.add('hidden');
                      }}
                    />
                    {selectedArticle.videoUrl && onPlayVideo && (
                      <button
                        type="button"
                        onClick={() =>
                          onPlayVideo(selectedArticle.videoUrl!, selectedArticle.title, selectedArticle.source)
                        }
                        style={{
                          backgroundColor: rgbToRgba(theme.bg, 0.85),
                          border: `1px solid ${theme.accent}`,
                          color: theme.accent,
                        }}
                        className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>X: Assistir vídeo</span>
                      </button>
                    )}
                  </div>
                )}
                {!selectedArticle.imageUrl && selectedArticle.videoUrl && onPlayVideo && (
                  <button
                    type="button"
                    onClick={() =>
                      onPlayVideo(selectedArticle.videoUrl!, selectedArticle.title, selectedArticle.source)
                    }
                    style={{
                      backgroundColor: theme.accent,
                      color: theme.bg,
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-extrabold cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>X: Assistir vídeo da notícia</span>
                  </button>
                )}
                <p style={{ color: theme.text }} className="text-[13px] leading-relaxed font-medium">
                  {selectedArticle.description}
                </p>
                {selectedArticle.content &&
                  selectedArticle.content.length > selectedArticle.description.length + 12 && (
                    <p style={{ color: theme.muted }} className="text-[12.5px] leading-relaxed">
                      {selectedArticle.content}
                    </p>
                  )}
              </div>

              {/* Bottom bar */}
              <div
                style={{ borderTop: `1px solid ${themeHairline(theme)}`, color: theme.dim }}
                className="pt-2 mt-2 flex items-center justify-between text-[10.5px] shrink-0"
              >
                <span>
                  {selectedArticle.videoUrl
                    ? 'A: Voltar • X: Assistir vídeo • Cima/Baixo: Rolar • L1/R1: Próxima'
                    : 'A: Voltar à lista • Cima/Baixo: Rolar • L1/R1: Próxima'}
                </span>
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  style={{ color: theme.accent }}
                  className="font-bold cursor-pointer"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 flex-1 min-h-0 flex flex-col px-3.5 pt-2 pb-2 gap-2">
            {/* Top header + filter pills */}
            <div className="flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  style={{
                    backgroundColor: rgbToRgba(theme.accent, 0.16),
                    border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                    color: theme.accent,
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                >
                  <Newspaper className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h1 style={{ color: theme.text }} className="text-[16px] font-extrabold leading-none">
                    {tr('Notícias', language)}
                  </h1>
                  <div style={{ color: theme.muted }} className="text-[10.5px] leading-tight mt-0.5">
                    {provider === 'newsdata' ? 'NewsData.io • Brasil (PT-BR)' : 'Feed Brasil • Ao vivo'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => loadNews(activeCategory, true)}
                  style={{
                    backgroundColor: theme.elevated,
                    border: `1px solid ${themeHairline(theme)}`,
                    color: loading ? theme.accent : theme.muted,
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Y Atualizar</span>
                </button>
                <button
                  type="button"
                  onClick={onBack}
                  style={{
                    backgroundColor: theme.elevated,
                    border: `1px solid ${themeHairline(theme)}`,
                    color: theme.muted,
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  <span>A Voltar</span>
                </button>
              </div>
            </div>

            {/* Category filter strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 shrink-0 no-scrollbar">
              {NEWS_FILTERS.map((f, idx) => {
                const active = idx === filterIdx;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setFilterIdx(idx);
                      setSelectedIdx(0);
                    }}
                    style={modernPillStyle(theme, active)}
                    className="px-3 py-1 text-[11px] font-bold whitespace-nowrap cursor-pointer transition-transform active:scale-95"
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* News list */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
              {loading && visibleArticles.length === 0 ? (
                <div
                  style={modernPanelStyle(theme, 16)}
                  className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 p-6 text-center"
                >
                  <RefreshCw style={{ color: theme.accent }} className="w-6 h-6 animate-spin" />
                  <div style={{ color: theme.text }} className="text-[14px] font-bold">
                    Carregando notícias do Brasil...
                  </div>
                  <div style={{ color: theme.muted }} className="text-[11.5px]">
                    Buscando manchetes em Urgente, Mundo, Polícia, Entretenimento e Esportes
                  </div>
                </div>
              ) : error && visibleArticles.length === 0 ? (
                <div
                  style={modernPanelStyle(theme, 16)}
                  className="h-full min-h-[160px] flex flex-col items-center justify-center gap-2 p-6 text-center"
                >
                  <div style={{ color: theme.text }} className="text-[14px] font-bold">
                    {error}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadNews(activeCategory, true)}
                    style={{ backgroundColor: theme.accent, color: theme.bg }}
                    className="px-4 py-1.5 rounded-full text-[12px] font-bold cursor-pointer mt-1"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                visibleArticles.map((art, idx) => {
                  const focused = idx === selectedIdx;
                  return (
                    <button
                      key={art.id}
                      data-news-idx={idx}
                      type="button"
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => {
                        setSelectedIdx(idx);
                        setDetailOpen(true);
                      }}
                      style={{
                        ...modernCardStyle(theme, focused, 13),
                        background: focused
                          ? `linear-gradient(180deg, ${mixRgb(theme.elevated, theme.accent, 0.16)} 0%, ${mixRgb(
                              theme.panel,
                              theme.accent,
                              0.04
                            )} 100%)`
                          : `linear-gradient(180deg, ${mixRgb(theme.panel, theme.text, 0.025)} 0%, ${
                              theme.panel
                            } 100%)`,
                      }}
                      className="w-full text-left p-2.5 flex items-start gap-2.5 cursor-pointer transition-all"
                    >
                      {art.imageUrl ? (
                        <div
                          style={{ border: `1px solid ${themeHairline(theme)}` }}
                          className="relative w-20 h-14 rounded-lg overflow-hidden shrink-0 bg-black/30"
                        >
                          <img
                            src={art.imageUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget.parentElement as HTMLElement | null)?.classList.add('hidden');
                            }}
                          />
                          {art.videoUrl && (
                            <span
                              style={{ backgroundColor: rgbToRgba(theme.bg, 0.85), color: theme.accent }}
                              className="absolute bottom-0.5 left-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8.5px] font-extrabold"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              VID
                            </span>
                          )}
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              style={{
                                backgroundColor: focused ? theme.accent : rgbToRgba(theme.accent, 0.18),
                                color: focused ? theme.bg : theme.accent,
                              }}
                              className="px-2 py-0.5 rounded-md text-[9.5px] font-extrabold shrink-0"
                            >
                              {art.categoryLabel}
                            </span>
                            {art.videoUrl && !art.imageUrl && (
                              <span
                                style={{ backgroundColor: rgbToRgba(theme.accent, 0.2), color: theme.accent }}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold shrink-0"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                VÍDEO
                              </span>
                            )}
                            <span style={{ color: theme.muted }} className="text-[10.5px] font-medium truncate">
                              {art.source}
                            </span>
                          </div>
                          {art.pubDate && (
                            <span style={{ color: theme.dim }} className="text-[10px] shrink-0 tabular-nums">
                              {art.pubDate}
                            </span>
                          )}
                        </div>
                        <div
                          style={{ color: theme.text }}
                          className="text-[13px] font-bold leading-snug line-clamp-2"
                        >
                          {art.title}
                        </div>
                        {art.description && (
                          <div
                            style={{ color: theme.muted }}
                            className="text-[11px] leading-snug line-clamp-1 mt-0.5"
                          >
                            {art.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <FooterBar theme={theme} toast={toast} />
      </div>
    );
  }
);

NewsScreen.displayName = 'NewsScreen';
