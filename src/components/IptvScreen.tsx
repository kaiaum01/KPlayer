import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  EpgChannelGuide,
  IptvCategory,
  IptvChannel,
  IptvSourceKey,
  LanguageCode,
  UserPlaylistSource,
} from '../types';
import type { KpTheme } from '../themes';
import { tr } from '../i18n';
import { HeaderBar } from './HeaderBar';
import {
  FooterBar,
  ModernBackdrop,
  modernCardStyle,
  modernPanelStyle,
  modernPillStyle,
  rgbToRgba,
  themeHairline,
} from './R36SIcons';
import type { R36SButton } from './R36SControls';

export interface IptvScreenHandle {
  handleButton: (btn: R36SButton) => void;
}

interface IptvScreenProps {
  theme: KpTheme;
  themeIndex: number;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  notify: (msg: string) => void;
  onBackHome: () => void;
  onPlayItem: (item: IptvChannel, sourceLabel: string) => void;
}

const SOURCES: Array<{ key: IptvSourceKey; label: string; subtitle: string }> = [
  { key: 'canais', label: 'Canais', subtitle: 'https://canais-saimo.pages.dev/' },
  { key: 'filmes', label: 'Filmes', subtitle: 'https://filmes-saimo.pages.dev/' },
  { key: 'series', label: 'Séries', subtitle: 'https://filmes-saimo.pages.dev/' },
  { key: 'usuario', label: 'Usuário', subtitle: 'ports/kplayer/iptv_usuario/ • Teclado' },
];

const VIRTUAL_KB_ROWS: string[][] = [
  ['https://', 'http://', '.m3u8', '.m3u', '.txt', '/', ':', '.', '-', '_'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '?'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '&', '=', '%'],
];

type IptvView = 'categories' | 'items' | 'episodes';

interface CategoriesPayload {
  source: IptvSourceKey;
  sourceUrl: string;
  totalCount: number;
  categories: IptvCategory[];
  userPlaylists?: UserPlaylistSource[];
}

export const IptvScreen = forwardRef<IptvScreenHandle, IptvScreenProps>(function IptvScreen(
  { theme, themeIndex, language, locationLabel, toast, notify, onBackHome, onPlayItem },
  ref
) {
  const [sourceIdx, setSourceIdx] = useState<number>(0);
  const activeSource = SOURCES[sourceIdx] ?? SOURCES[0];

  const [view, setView] = useState<IptvView>('categories');

  // Categories per source (cached client-side to keep tab switches instant)
  const catCacheRef = useRef<Map<IptvSourceKey, CategoriesPayload>>(new Map());
  const [categories, setCategories] = useState<IptvCategory[]>([]);
  const [totalSourceCount, setTotalSourceCount] = useState<number>(0);
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylistSource[]>([]);
  const [catSelected, setCatSelected] = useState<number>(0);
  const [catLoading, setCatLoading] = useState<boolean>(false);

  // Active category items (loaded on demand category-by-category, zero cap)
  const itemsCacheRef = useRef<Map<string, IptvChannel[]>>(new Map());
  const [activeCategory, setActiveCategory] = useState<IptvCategory | null>(null);
  const [items, setItems] = useState<IptvChannel[]>([]);
  const [itemSelected, setItemSelected] = useState<number>(0);
  const [itemsLoading, setItemsLoading] = useState<boolean>(false);
  const [itemQuery, setItemQuery] = useState<string>('');
  const [visibleChunk, setVisibleChunk] = useState<number>(120);

  // Active series episodes (loaded on demand from shard, ALL seasons & ALL episodes)
  const [activeSeries, setActiveSeries] = useState<IptvChannel | null>(null);
  const [episodes, setEpisodes] = useState<IptvChannel[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<number>(0); // 0 = all seasons
  const [epSelected, setEpSelected] = useState<number>(0);
  const [epLoading, setEpLoading] = useState<boolean>(false);

  // User IPTV keyboard modal & file upload
  const [showKbModal, setShowKbModal] = useState<boolean>(false);
  const [kbName, setKbName] = useState<string>('');
  const [kbUrl, setKbUrl] = useState<string>('https://');
  const [kbSaving, setKbSaving] = useState<boolean>(false);
  const [kbError, setKbError] = useState<string | null>(null);
  const fileUploadRef = useRef<HTMLInputElement | null>(null);

  // Live EPG Guide modal
  const [epgModalChannel, setEpgModalChannel] = useState<IptvChannel | null>(null);
  const [epgGuide, setEpgGuide] = useState<EpgChannelGuide | null>(null);
  const [epgLoading, setEpgLoading] = useState<boolean>(false);

  const openEpgGuide = useCallback(async (ch: IptvChannel) => {
    setEpgModalChannel(ch);
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

  const loadCategories = useCallback(async (src: IptvSourceKey, force = false) => {
    const cached = catCacheRef.current.get(src);
    if (!force && cached) {
      setCategories(cached.categories);
      setTotalSourceCount(cached.totalCount);
      setUserPlaylists(cached.userPlaylists ?? []);
      setCatLoading(false);
      return;
    }
    setCatLoading(true);
    try {
      const r = await fetch(`/api/iptv/categories?source=${src}${force ? '&refresh=1' : ''}`);
      const d = (await r.json()) as CategoriesPayload;
      const payload: CategoriesPayload = {
        source: src,
        sourceUrl: d.sourceUrl || '',
        totalCount: Number(d.totalCount ?? 0),
        categories: Array.isArray(d.categories) ? d.categories : [],
        userPlaylists: Array.isArray(d.userPlaylists) ? d.userPlaylists : [],
      };
      catCacheRef.current.set(src, payload);
      setCategories(payload.categories);
      setTotalSourceCount(payload.totalCount);
      setUserPlaylists(payload.userPlaylists ?? []);
    } catch {
      setCategories([]);
      setTotalSourceCount(0);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    setView('categories');
    setCatSelected(0);
    setActiveCategory(null);
    setActiveSeries(null);
    setItemQuery('');
    loadCategories(activeSource.key, activeSource.key === 'usuario');
  }, [activeSource.key, loadCategories]);

  const openCategory = useCallback(
    async (cat: IptvCategory, force = false) => {
      const cacheKey = `${activeSource.key}:${cat.id}`;
      setActiveCategory(cat);
      setItemSelected(0);
      setItemQuery('');
      setVisibleChunk(120);
      setView('items');

      const cached = itemsCacheRef.current.get(cacheKey);
      if (!force && cached) {
        setItems(cached);
        setItemsLoading(false);
        return;
      }
      setItems([]);
      setItemsLoading(true);
      try {
        const r = await fetch(
          `/api/iptv/items?source=${activeSource.key}&category=${encodeURIComponent(cat.id)}${force ? '&refresh=1' : ''}`
        );
        const d = (await r.json()) as { items?: IptvChannel[] };
        const list = Array.isArray(d.items) ? d.items : [];
        itemsCacheRef.current.set(cacheKey, list);
        setItems(list);
      } catch {
        setItems([]);
      } finally {
        setItemsLoading(false);
      }
    },
    [activeSource.key]
  );

  const openSeriesEpisodes = useCallback(async (show: IptvChannel, force = false) => {
    if (!show.letter || !show.shard) return;
    setActiveSeries(show);
    setView('episodes');
    setEpisodes([]);
    setSeasons([]);
    setSeasonFilter(0);
    setEpSelected(0);
    setEpLoading(true);
    try {
      const url =
        `/api/iptv/episodes?letter=${encodeURIComponent(show.letter)}` +
        `&shard=${encodeURIComponent(show.shard)}` +
        `&title=${encodeURIComponent(show.name)}` +
        (force ? '&refresh=1' : '');
      const r = await fetch(url);
      const d = (await r.json()) as { seasons?: number[]; episodes?: IptvChannel[] };
      setSeasons(Array.isArray(d.seasons) ? d.seasons : []);
      setEpisodes(Array.isArray(d.episodes) ? d.episodes : []);
    } catch {
      setEpisodes([]);
      setSeasons([]);
    } finally {
      setEpLoading(false);
    }
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.group.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    );
  }, [items, itemQuery]);

  const filteredEpisodes = useMemo(() => {
    if (!seasonFilter) return episodes;
    return episodes.filter((ep) => ep.season === seasonFilter);
  }, [episodes, seasonFilter]);

  useEffect(() => {
    if (itemSelected >= filteredItems.length && filteredItems.length > 0) {
      setItemSelected(filteredItems.length - 1);
    }
    if (itemSelected >= visibleChunk - 20) {
      setVisibleChunk((c) => Math.max(c, itemSelected + 80));
    }
  }, [itemSelected, filteredItems.length, visibleChunk]);

  useEffect(() => {
    if (epSelected >= filteredEpisodes.length && filteredEpisodes.length > 0) {
      setEpSelected(filteredEpisodes.length - 1);
    }
  }, [epSelected, filteredEpisodes.length]);

  const activateItem = useCallback(
    (item: IptvChannel | undefined) => {
      if (!item) return;
      if (item.mediaType === 'series-show') {
        openSeriesEpisodes(item, false);
        return;
      }
      if (!item.url) {
        notify(tr('Nenhum item encontrado', language));
        return;
      }
      onPlayItem(item, tr(activeSource.label, language));
    },
    [activeSource.label, language, notify, onPlayItem, openSeriesEpisodes]
  );

  // User IPTV URL save via keyboard
  const handleSaveUserUrl = useCallback(async () => {
    const trimmed = kbUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      setKbError('Informe uma URL válida começando com http:// ou https://');
      return;
    }
    setKbSaving(true);
    setKbError(null);
    try {
      const r = await fetch('/api/iptv/user/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: kbName.trim(), url: trimmed }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) {
        setKbError(d.error || 'Não foi possível salvar a URL.');
        return;
      }
      setShowKbModal(false);
      setKbName('');
      setKbUrl('https://');
      itemsCacheRef.current.clear();
      catCacheRef.current.delete('usuario');
      notify(tr('Lista salva com sucesso', language));
      await loadCategories('usuario', true);
    } catch {
      setKbError('Erro de conexão ao salvar.');
    } finally {
      setKbSaving(false);
    }
  }, [kbName, kbUrl, language, loadCategories, notify]);

  const handleUploadUserFile = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      try {
        const content = await file.text();
        const r = await fetch('/api/iptv/user/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, content }),
        });
        const d = (await r.json()) as { ok?: boolean; error?: string };
        if (!r.ok || !d.ok) {
          notify(d.error || 'Falha ao importar arquivo');
          return;
        }
        itemsCacheRef.current.clear();
        catCacheRef.current.delete('usuario');
        notify(tr('Lista salva com sucesso', language));
        await loadCategories('usuario', true);
      } catch {
        notify('Falha ao ler arquivo');
      } finally {
        if (fileUploadRef.current) fileUploadRef.current.value = '';
      }
    },
    [language, loadCategories, notify]
  );

  const handleRemoveUserPlaylist = useCallback(
    async (pl: UserPlaylistSource) => {
      try {
        const r = await fetch('/api/iptv/user', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: pl.kind, target: pl.target }),
        });
        if (r.ok) {
          itemsCacheRef.current.clear();
          catCacheRef.current.delete('usuario');
          notify(tr('Lista removida', language));
          await loadCategories('usuario', true);
        }
      } catch {
        // Ignore
      }
    },
    [language, loadCategories, notify]
  );

  // R36S D-pad / button navigation handler
  useImperativeHandle(
    ref,
    () => ({
      handleButton: (btn: R36SButton) => {
        if (epgModalChannel) {
          if (btn === 'A') setEpgModalChannel(null);
          return;
        }
        if (showKbModal) {
          if (btn === 'A') setShowKbModal(false);
          return;
        }

        if (btn === 'X') {
          setSourceIdx((s) => (s + 1) % SOURCES.length);
          return;
        }

        if (view === 'categories') {
          if (btn === 'A') {
            onBackHome();
          } else if (btn === 'LEFT') {
            setSourceIdx((s) => (s + SOURCES.length - 1) % SOURCES.length);
          } else if (btn === 'RIGHT') {
            setSourceIdx((s) => (s + 1) % SOURCES.length);
          } else if (btn === 'UP' && categories.length > 0) {
            setCatSelected((i) => (i + categories.length - 1) % categories.length);
          } else if (btn === 'DOWN' && categories.length > 0) {
            setCatSelected((i) => (i + 1) % categories.length);
          } else if (btn === 'B' && categories[catSelected]) {
            openCategory(categories[catSelected], false);
          } else if (btn === 'Y') {
            itemsCacheRef.current.clear();
            loadCategories(activeSource.key, true);
          }
          return;
        }

        if (view === 'items') {
          const len = filteredItems.length;
          if (btn === 'A') {
            setView('categories');
          } else if (btn === 'LEFT') {
            setSourceIdx((s) => (s + SOURCES.length - 1) % SOURCES.length);
          } else if (btn === 'RIGHT') {
            setSourceIdx((s) => (s + 1) % SOURCES.length);
          } else if (btn === 'UP' && len > 0) {
            setItemSelected((i) => (i + len - 1) % len);
          } else if (btn === 'DOWN' && len > 0) {
            setItemSelected((i) => (i + 1) % len);
          } else if (btn === 'B' && len > 0) {
            activateItem(filteredItems[itemSelected]);
          } else if (btn === 'Y' && activeCategory) {
            openCategory(activeCategory, true);
          }
          return;
        }

        // view === 'episodes'
        const len = filteredEpisodes.length;
        if (btn === 'A') {
          setView('items');
        } else if (btn === 'LEFT' && seasons.length > 1) {
          const opts = [0, ...seasons];
          const cur = opts.indexOf(seasonFilter);
          setSeasonFilter(opts[(cur + opts.length - 1) % opts.length]);
          setEpSelected(0);
        } else if (btn === 'RIGHT' && seasons.length > 1) {
          const opts = [0, ...seasons];
          const cur = opts.indexOf(seasonFilter);
          setSeasonFilter(opts[(cur + 1) % opts.length]);
          setEpSelected(0);
        } else if (btn === 'UP' && len > 0) {
          setEpSelected((i) => (i + len - 1) % len);
        } else if (btn === 'DOWN' && len > 0) {
          setEpSelected((i) => (i + 1) % len);
        } else if (btn === 'B' && len > 0) {
          const ep = filteredEpisodes[epSelected];
          if (ep) onPlayItem(ep, tr('Séries', language));
        } else if (btn === 'Y' && activeSeries) {
          openSeriesEpisodes(activeSeries, true);
        }
      },
    }),
    [
      epgModalChannel,
      showKbModal,
      view,
      categories,
      catSelected,
      activeSource.key,
      filteredItems,
      itemSelected,
      activeCategory,
      filteredEpisodes,
      epSelected,
      seasons,
      seasonFilter,
      activeSeries,
      language,
      onBackHome,
      openCategory,
      loadCategories,
      activateItem,
      onPlayItem,
      openSeriesEpisodes,
    ]
  );

  const selectedItem = filteredItems[itemSelected];
  const selectedEp = filteredEpisodes[epSelected];
  const visibleItems = filteredItems.slice(0, visibleChunk);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section={tr('IPTV', language)} location={locationLabel} />

      <input
        ref={fileUploadRef}
        type="file"
        accept=".m3u,.m3u8,.txt"
        className="hidden"
        onChange={(e) => handleUploadUserFile(e.target.files)}
      />

      {/* Responsive Title + Source Tabs Header */}
      <div className="relative z-10 px-4 pt-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-col leading-tight min-w-0">
          <div className="flex items-baseline gap-2">
            <span style={{ color: theme.text }} className="text-[17px] @min-[520px]:text-[19px] font-extrabold truncate">
              {tr(activeSource.label, language)}
            </span>
            {totalSourceCount > 0 && (
              <span style={{ color: theme.accent }} className="text-[11px] font-bold shrink-0">
                {totalSourceCount.toLocaleString('pt-BR')}
              </span>
            )}
          </div>
          <span style={{ color: theme.dim }} className="text-[9.5px] truncate mt-0.5 hidden @min-[480px]:block">
            {activeSource.subtitle}
          </span>
        </div>

        {/* 4 Source Tabs: Canais | Filmes | Séries | Usuário */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {SOURCES.map((src, idx) => {
            const active = idx === sourceIdx;
            return (
              <button
                key={src.key}
                type="button"
                onClick={() => setSourceIdx(idx)}
                style={{
                  ...modernPillStyle(theme, active),
                  height: 24,
                  paddingLeft: 10,
                  paddingRight: 10,
                }}
                className="text-[10.5px] @min-[520px]:text-[11px] font-bold cursor-pointer transition-all"
              >
                {tr(src.label, language)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== STEP 1: CATEGORIES VIEW ==================== */}
      {view === 'categories' && (
        <div className="relative z-10 flex-1 min-h-0 px-4 pt-2 pb-[52px] flex flex-col">
          {/* User IPTV actions bar (Keyboard URL + Local folder upload) */}
          {activeSource.key === 'usuario' ? (
            <div className="mb-2 space-y-1.5 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setKbError(null);
                    setShowKbModal(true);
                  }}
                  style={{
                    ...modernPillStyle(theme, true),
                    height: 30,
                    paddingLeft: 12,
                    paddingRight: 12,
                  }}
                  className="text-[11px] font-extrabold cursor-pointer shrink-0"
                >
                  + {tr('Adicionar URL (Teclado)', language)}
                </button>
                <button
                  type="button"
                  onClick={() => fileUploadRef.current?.click()}
                  style={{
                    ...modernCardStyle(theme, false, 10),
                    height: 30,
                    paddingLeft: 12,
                    paddingRight: 12,
                    color: theme.text,
                  }}
                  className="text-[11px] font-bold cursor-pointer shrink-0"
                >
                  + {tr('Arquivo (.m3u)', language)}
                </button>
                <div style={{ color: theme.muted }} className="text-[10px] truncate flex-1 text-right hidden @min-[560px]:block">
                  Pasta: ports/kplayer/iptv_usuario/
                </div>
              </div>

              {userPlaylists.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {userPlaylists.map((pl) => (
                    <div
                      key={`${pl.kind}:${pl.target}`}
                      style={{
                        backgroundColor: rgbToRgba(theme.elevated, 0.9),
                        border: `1px solid ${themeHairline(theme)}`,
                        color: theme.text,
                      }}
                      className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] shrink-0"
                    >
                      <span style={{ color: theme.accent }} className="font-bold uppercase text-[9px]">
                        {pl.kind === 'url' ? 'URL' : 'M3U'}
                      </span>
                      <span className="max-w-[140px] truncate">{pl.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUserPlaylist(pl)}
                        style={{ color: theme.muted }}
                        className="hover:opacity-100 opacity-70 font-bold cursor-pointer pl-0.5"
                        title="Remover"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between mb-1.5 shrink-0 gap-2">
              <span style={{ color: theme.muted }} className="text-[12px] font-semibold truncate">
                {tr('Escolha a categoria', language)} ({categories.length})
              </span>
              <span style={{ color: theme.dim }} className="text-[10px] shrink-0 hidden @min-[480px]:inline">
                Carregamento sob demanda • Sem limite
              </span>
            </div>
          )}

          {catLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div style={{ color: theme.accent }} className="text-[16px] font-bold">
                {tr('Carregando categorias...', language)}
              </div>
            </div>
          ) : categories.length === 0 || (activeSource.key === 'usuario' && totalSourceCount === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div style={{ color: theme.text }} className="text-[16px] font-bold">
                {activeSource.key === 'usuario'
                  ? 'Nenhuma lista do usuário carregada'
                  : tr('Nenhum item encontrado', language)}
              </div>
              <div style={{ color: theme.muted }} className="text-[12px] mt-1.5 max-w-[440px]">
                {activeSource.key === 'usuario'
                  ? 'Use "+ Adicionar URL (Teclado)" acima ou coloque arquivos .m3u / .m3u8 na pasta ports/kplayer/iptv_usuario/.'
                  : tr('Pressione Y para atualizar', language)}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 grid grid-cols-1 @min-[480px]:grid-cols-2 @min-[860px]:grid-cols-3 gap-2 content-start">
              {categories.map((cat, idx) => {
                const focus = idx === catSelected;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onMouseEnter={() => setCatSelected(idx)}
                    onClick={() => openCategory(cat, false)}
                    style={{
                      ...modernCardStyle(theme, focus, 10),
                      height: 44,
                    }}
                    className="w-full px-3 flex items-center justify-between text-left cursor-pointer transition-all"
                  >
                    <div className="min-w-0 pr-2">
                      <div
                        style={{ color: focus ? theme.accent : theme.text }}
                        className="text-[13px] font-bold truncate"
                      >
                        {cat.name}
                      </div>
                      <div style={{ color: theme.muted }} className="text-[9.5px] truncate">
                        {cat.section}
                      </div>
                    </div>
                    <span
                      style={{
                        color: focus ? theme.bg : theme.accent,
                        backgroundColor: focus ? theme.accent : rgbToRgba(theme.accent, 0.14),
                      }}
                      className="text-[11px] font-extrabold px-2 py-0.5 rounded-md shrink-0"
                    >
                      {cat.count.toLocaleString('pt-BR')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== STEP 2: ITEMS IN CATEGORY ==================== */}
      {view === 'items' && (
        <div className="relative z-10 flex-1 min-h-0 px-4 pt-2 pb-[52px] flex flex-col">
          {/* Breadcrumb + Search bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setView('categories')}
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.9),
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer shrink-0"
              >
                ← {tr('Categorias', language)}
              </button>
              <span style={{ color: theme.accent }} className="text-[13px] font-extrabold truncate">
                {activeCategory?.name}
              </span>
              <span style={{ color: theme.muted }} className="text-[11px] shrink-0">
                ({filteredItems.length.toLocaleString('pt-BR')})
              </span>
            </div>
            <input
              type="text"
              value={itemQuery}
              onChange={(e) => {
                setItemQuery(e.target.value);
                setItemSelected(0);
                setVisibleChunk(120);
              }}
              placeholder={tr('Buscar nesta categoria...', language)}
              style={{
                backgroundColor: rgbToRgba(theme.elevated, 0.95),
                color: theme.text,
                border: `1px solid ${themeHairline(theme)}`,
              }}
              className="w-full @min-[480px]:w-[196px] @min-[760px]:w-[240px] px-2.5 py-1 rounded-md text-[11px] outline-none"
            />
          </div>

          {itemsLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div style={{ color: theme.accent }} className="text-[16px] font-bold">
                {tr('Carregando lista...', language)}
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div style={{ color: theme.muted }} className="text-[16px] font-bold">
                {tr('Nenhum item encontrado', language)}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col @min-[540px]:flex-row gap-2.5 overflow-hidden">
              {/* Detail Card: compact horizontal bar on narrow screens, sidebar on wider screens */}
              <div
                style={{
                  ...modernPanelStyle(theme, 14),
                }}
                className="p-2.5 @min-[540px]:p-3 flex flex-row @min-[540px]:flex-col items-center gap-2.5 @min-[540px]:gap-0 @min-[540px]:w-[196px] @min-[820px]:w-[230px] @min-[540px]:h-full shrink-0"
              >
                <div
                  style={{ backgroundColor: theme.elevated }}
                  className="w-[62px] h-[48px] @min-[540px]:w-full @min-[540px]:max-w-[164px] @min-[540px]:h-[112px] rounded-lg flex items-center justify-center overflow-hidden p-1 shrink-0"
                >
                  {selectedItem?.logo ? (
                    <img
                      src={selectedItem.logo}
                      alt=""
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  ) : (
                    <span style={{ color: theme.muted }} className="text-[10px] @min-[540px]:text-[12px] text-center">
                      {tr('Sem imagem', language)}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 @min-[540px]:flex-none @min-[540px]:w-full @min-[540px]:mt-2.5">
                  <div
                    style={{ color: theme.text }}
                    className="text-[12.5px] @min-[540px]:text-[13.5px] font-extrabold @min-[540px]:text-center leading-tight line-clamp-2 @min-[540px]:line-clamp-3 w-full"
                  >
                    {selectedItem?.name}
                  </div>
                  <div style={{ color: theme.accent }} className="text-[10.5px] font-bold truncate @min-[540px]:hidden mt-0.5">
                    {selectedItem?.group || selectedItem?.id || '--'}
                  </div>
                </div>

                <div className="hidden @min-[540px]:block mt-auto w-full space-y-1.5 pt-2">
                  {selectedItem?.epgNow ? (
                    <div
                      style={{
                        backgroundColor: rgbToRgba(theme.elevated, 0.8),
                        border: `1px solid ${themeHairline(theme)}`,
                      }}
                      className="p-2 rounded-lg space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1 text-[9.5px] font-bold">
                        <span style={{ color: theme.accent }}>AGORA</span>
                        <span style={{ color: theme.muted }} className="tabular-nums">
                          {selectedItem.epgNow.startLabel}–{selectedItem.epgNow.stopLabel}
                        </span>
                      </div>
                      <div style={{ color: theme.text }} className="text-[11px] font-bold leading-snug line-clamp-2">
                        {selectedItem.epgNow.title}
                      </div>
                      <div
                        style={{ backgroundColor: rgbToRgba(theme.muted, 0.22) }}
                        className="h-1 rounded-full overflow-hidden"
                      >
                        <div
                          style={{
                            width: `${Math.max(4, Math.min(100, selectedItem.epgNow.progressPct ?? 0))}%`,
                            backgroundColor: theme.accent,
                          }}
                          className="h-full rounded-full"
                        />
                      </div>
                      {selectedItem.epgNext && (
                        <div style={{ color: theme.muted }} className="text-[9.5px] truncate pt-0.5 tabular-nums">
                          A seguir {selectedItem.epgNext.startLabel}: {selectedItem.epgNext.title}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <div style={{ color: theme.muted }} className="text-[10px]">
                          {tr('Categoria', language)}
                        </div>
                        <div style={{ color: theme.text }} className="text-[11.5px] font-semibold truncate">
                          {selectedItem?.group || '--'}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: theme.muted }} className="text-[10px]">
                          {tr('Detalhes', language)}
                        </div>
                        <div style={{ color: theme.accent }} className="text-[11px] font-bold truncate">
                          {selectedItem?.id || '--'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex @min-[540px]:flex-col gap-1.5 shrink-0 @min-[540px]:w-full @min-[540px]:mt-2">
                  <button
                    type="button"
                    onClick={() => activateItem(selectedItem)}
                    style={{
                      ...modernPillStyle(theme, true),
                      height: 28,
                    }}
                    className="px-3 @min-[540px]:w-full text-[11px] font-extrabold cursor-pointer shrink-0"
                  >
                    {selectedItem?.mediaType === 'series-show'
                      ? tr('Episódios', language)
                      : tr('Assistir', language)}
                  </button>
                  {selectedItem &&
                    (selectedItem.mediaType === 'live' ||
                      activeSource.key === 'canais' ||
                      activeSource.key === 'usuario') && (
                      <button
                        type="button"
                        onClick={() => openEpgGuide(selectedItem)}
                        style={{
                          ...modernCardStyle(theme, false, 8),
                          height: 26,
                          color: theme.accent,
                        }}
                        className="px-2.5 @min-[540px]:w-full text-[10.5px] font-bold cursor-pointer shrink-0"
                      >
                        Guia EPG
                      </button>
                    )}
                </div>
              </div>

              {/* Right Unlimited Scrollable List */}
              <div className="flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 space-y-1.5">
                {visibleItems.map((ch, idx) => {
                  const focus = idx === itemSelected;
                  const canShowEpg =
                    ch.mediaType === 'live' ||
                    activeSource.key === 'canais' ||
                    activeSource.key === 'usuario';
                  return (
                    <div
                      key={`${ch.name}-${idx}`}
                      onMouseEnter={() => setItemSelected(idx)}
                      onClick={() => activateItem(ch)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          activateItem(ch);
                        }
                      }}
                      style={{
                        ...modernCardStyle(theme, focus, 10),
                        minHeight: ch.epgNow ? 50 : 40,
                      }}
                      className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left cursor-pointer transition-all"
                    >
                      <span
                        style={{ color: focus ? theme.accent : theme.muted }}
                        className="text-[11px] font-bold w-7 shrink-0 tabular-nums"
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ color: theme.text }} className="text-[13px] font-bold truncate">
                            {ch.name}
                          </div>
                          {ch.epgNow && (
                            <span
                              style={{ color: theme.accent }}
                              className="text-[9.5px] font-bold shrink-0 tabular-nums"
                            >
                              {ch.epgNow.startLabel}–{ch.epgNow.stopLabel}
                            </span>
                          )}
                        </div>
                        {ch.epgNow ? (
                          <div className="mt-0.5 space-y-1">
                            <div style={{ color: theme.muted }} className="text-[10px] truncate">
                              Agora: {ch.epgNow.title}
                            </div>
                            <div
                              style={{ backgroundColor: rgbToRgba(theme.muted, 0.2) }}
                              className="h-[2.5px] rounded-full overflow-hidden"
                            >
                              <div
                                style={{
                                  width: `${Math.max(4, Math.min(100, ch.epgNow.progressPct ?? 0))}%`,
                                  backgroundColor: theme.accent,
                                }}
                                className="h-full rounded-full"
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: theme.muted }} className="text-[9.5px] truncate">
                            {ch.id || ch.group}
                          </div>
                        )}
                      </div>
                      {ch.mediaType === 'series-show' ? (
                        <span
                          style={{
                            color: theme.accent,
                            backgroundColor: rgbToRgba(theme.accent, 0.14),
                          }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded shrink-0"
                        >
                          {ch.episodeCount ? `${ch.episodeCount} eps` : 'Ver'}
                        </span>
                      ) : canShowEpg ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEpgGuide(ch);
                          }}
                          style={{
                            color: theme.accent,
                            backgroundColor: rgbToRgba(theme.accent, 0.12),
                            border: `1px solid ${rgbToRgba(theme.accent, 0.28)}`,
                          }}
                          className="text-[9.5px] font-bold px-2 py-1 rounded-md shrink-0 cursor-pointer"
                          title="Abrir Guia de Programação (EPG)"
                        >
                          EPG
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {visibleItems.length < filteredItems.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleChunk((c) => c + 200)}
                    style={{
                      ...modernCardStyle(theme, false, 10),
                      height: 36,
                      color: theme.accent,
                    }}
                    className="w-full text-[11px] font-bold cursor-pointer"
                  >
                    Carregar mais ({visibleItems.length.toLocaleString('pt-BR')} de{' '}
                    {filteredItems.length.toLocaleString('pt-BR')})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== STEP 3: SERIES EPISODES VIEW ==================== */}
      {view === 'episodes' && (
        <div className="relative z-10 flex-1 min-h-0 px-4 pt-2 pb-[52px] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setView('items')}
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.9),
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer shrink-0"
              >
                ← {tr('Séries', language)}
              </button>
              <span style={{ color: theme.accent }} className="text-[13px] font-extrabold truncate">
                {activeSeries?.name}
              </span>
              <span style={{ color: theme.muted }} className="text-[11px] shrink-0">
                ({filteredEpisodes.length} eps)
              </span>
            </div>
          </div>

          {/* Season selector pills */}
          {seasons.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSeasonFilter(0);
                  setEpSelected(0);
                }}
                style={{
                  ...modernPillStyle(theme, seasonFilter === 0),
                  height: 22,
                  paddingLeft: 10,
                  paddingRight: 10,
                }}
                className="text-[10.5px] font-bold cursor-pointer shrink-0"
              >
                {tr('Todas', language)} ({episodes.length})
              </button>
              {seasons.map((sea) => (
                <button
                  key={sea}
                  type="button"
                  onClick={() => {
                    setSeasonFilter(sea);
                    setEpSelected(0);
                  }}
                  style={{
                    ...modernPillStyle(theme, seasonFilter === sea),
                    height: 22,
                    paddingLeft: 10,
                    paddingRight: 10,
                  }}
                  className="text-[10.5px] font-bold cursor-pointer shrink-0"
                >
                  T{sea}
                </button>
              ))}
            </div>
          )}

          {epLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div style={{ color: theme.accent }} className="text-[16px] font-bold">
                {tr('Carregando episódios...', language)}
              </div>
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div style={{ color: theme.muted }} className="text-[15px] font-bold">
                {tr('Nenhum episódio encontrado', language)}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col @min-[540px]:flex-row gap-2.5 overflow-hidden">
              <div
                style={{
                  ...modernPanelStyle(theme, 14),
                }}
                className="p-2.5 @min-[540px]:p-3 flex flex-row @min-[540px]:flex-col items-center gap-2.5 @min-[540px]:gap-0 @min-[540px]:w-[186px] @min-[820px]:w-[220px] @min-[540px]:h-full shrink-0"
              >
                <div
                  style={{ backgroundColor: theme.elevated }}
                  className="w-[56px] h-[44px] @min-[540px]:w-full @min-[540px]:max-w-[152px] @min-[540px]:h-[112px] rounded-lg flex items-center justify-center overflow-hidden p-1 shrink-0"
                >
                  {activeSeries?.logo ? (
                    <img
                      src={activeSeries.logo}
                      alt=""
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  ) : (
                    <span style={{ color: theme.muted }} className="text-[10px] @min-[540px]:text-[12px] text-center">
                      {tr('Sem imagem', language)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 @min-[540px]:flex-none @min-[540px]:w-full @min-[540px]:mt-2.5">
                  <div
                    style={{ color: theme.text }}
                    className="text-[12.5px] @min-[540px]:text-[13px] font-extrabold @min-[540px]:text-center line-clamp-2 w-full"
                  >
                    {activeSeries?.name}
                  </div>
                  <div style={{ color: theme.accent }} className="mt-0.5 text-[11px] font-bold @min-[540px]:text-center">
                    {selectedEp?.id || '--'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => selectedEp && onPlayItem(selectedEp, tr('Séries', language))}
                  style={{
                    ...modernPillStyle(theme, true),
                    height: 28,
                  }}
                  className="px-3 @min-[540px]:w-full text-[11px] font-extrabold cursor-pointer shrink-0 @min-[540px]:mt-auto"
                >
                  {tr('Assistir', language)}
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 space-y-1.5">
                {filteredEpisodes.map((ep, idx) => {
                  const focus = idx === epSelected;
                  return (
                    <button
                      key={`${ep.id}-${idx}`}
                      type="button"
                      onMouseEnter={() => setEpSelected(idx)}
                      onClick={() => onPlayItem(ep, tr('Séries', language))}
                      style={{
                        ...modernCardStyle(theme, focus, 10),
                        height: 38,
                      }}
                      className="w-full px-3 flex items-center justify-between gap-2 text-left cursor-pointer transition-all"
                    >
                      <div className="min-w-0 flex items-center gap-2.5">
                        <span
                          style={{ color: focus ? theme.accent : theme.muted }}
                          className="text-[11px] font-bold w-8 shrink-0"
                        >
                          {idx + 1}
                        </span>
                        <span style={{ color: theme.text }} className="text-[12.5px] font-bold truncate">
                          {ep.name}
                        </span>
                      </div>
                      <span style={{ color: theme.accent }} className="text-[10px] font-bold shrink-0">
                        {ep.id.replace(/^Série\s*•\s*/i, '')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== VIRTUAL KEYBOARD MODAL (IPTV DO USUÁRIO) ==================== */}
      {showKbModal && (
        <div
          style={{ backgroundColor: 'rgba(6, 9, 13, 0.88)' }}
          className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-4"
        >
          <div
            style={{
              ...modernPanelStyle(theme, 14),
            }}
            className="w-full max-w-[600px] max-h-full overflow-y-auto p-3.5 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div style={{ color: theme.text }} className="text-[14px] @min-[520px]:text-[15px] font-extrabold truncate">
                  {tr('Teclado IPTV', language)} — {tr('IPTV do Usuário', language)}
                </div>
                <div style={{ color: theme.muted }} className="text-[10.5px]">
                  Digite pelo teclado físico ou clique nas teclas abaixo (salva em iptv_usuario/playlists.txt)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowKbModal(false)}
                style={{ color: theme.muted }}
                className="text-[16px] font-bold px-2 cursor-pointer shrink-0"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 @min-[460px]:grid-cols-3 gap-2">
              <input
                type="text"
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                placeholder="Nome (opcional)"
                style={{
                  backgroundColor: theme.elevated,
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11.5px] outline-none"
              />
              <input
                type="text"
                value={kbUrl}
                onChange={(e) => setKbUrl(e.target.value)}
                placeholder="https://exemplo.com/lista.m3u8"
                autoFocus
                style={{
                  backgroundColor: theme.elevated,
                  color: theme.accent,
                  border: `1px solid ${rgbToRgba(theme.accent, 0.5)}`,
                }}
                className="@min-[460px]:col-span-2 px-2.5 py-1.5 rounded-lg text-[11.5px] font-mono outline-none"
              />
            </div>

            {kbError && <div className="text-[11px] font-semibold text-red-400">{kbError}</div>}

            {/* Interactive Virtual Keyboard */}
            <div className="space-y-1">
              {VIRTUAL_KB_ROWS.map((row, rIdx) => (
                <div key={rIdx} className="grid grid-cols-10 gap-1">
                  {row.map((keyVal) => (
                    <button
                      key={keyVal}
                      type="button"
                      onClick={() => setKbUrl((prev) => prev + keyVal)}
                      style={{
                        backgroundColor: theme.elevated,
                        color: theme.text,
                        border: `1px solid ${themeHairline(theme)}`,
                        height: 27,
                      }}
                      className="rounded-md text-[9.5px] @min-[520px]:text-[10.5px] font-bold cursor-pointer hover:opacity-90 active:scale-95 transition-transform truncate px-0.5"
                    >
                      {keyVal}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setKbUrl((prev) => prev.slice(0, -1))}
                  style={{
                    ...modernCardStyle(theme, false, 8),
                    height: 30,
                    color: theme.text,
                  }}
                  className="px-3 text-[11px] font-bold cursor-pointer"
                >
                  ⌫ {tr('Apagar', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setKbUrl('https://')}
                  style={{
                    ...modernCardStyle(theme, false, 8),
                    height: 30,
                    color: theme.muted,
                  }}
                  className="px-3 text-[11px] font-bold cursor-pointer"
                >
                  {tr('Limpar', language)}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowKbModal(false)}
                  style={{
                    ...modernCardStyle(theme, false, 8),
                    height: 30,
                    color: theme.muted,
                  }}
                  className="px-3 text-[11px] font-bold cursor-pointer"
                >
                  {tr('Cancelar', language)}
                </button>
                <button
                  type="button"
                  disabled={kbSaving}
                  onClick={handleSaveUserUrl}
                  style={{
                    ...modernPillStyle(theme, true),
                    height: 30,
                  }}
                  className="px-4 text-[11.5px] font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {kbSaving ? '...' : tr('Salvar', language)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LIVE EPG GUIDE MODAL ==================== */}
      {epgModalChannel && (
        <div
          style={{ backgroundColor: 'rgba(6, 9, 13, 0.86)' }}
          className="absolute inset-0 z-30 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setEpgModalChannel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...modernPanelStyle(theme, 14) }}
            className="w-full max-w-[580px] max-h-[86%] flex flex-col overflow-hidden"
          >
            <div
              className="px-3.5 py-2.5 flex items-center justify-between gap-2 shrink-0"
              style={{ borderBottom: `1px solid ${themeHairline(theme)}` }}
            >
              <div className="min-w-0">
                <div style={{ color: theme.accent }} className="text-[10px] font-bold uppercase tracking-wide">
                  Guia de Programação (EPG) · Horário de Brasília
                </div>
                <div style={{ color: theme.text }} className="text-[14px] font-extrabold truncate">
                  {epgModalChannel.name}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const ch = epgModalChannel;
                    setEpgModalChannel(null);
                    activateItem(ch);
                  }}
                  style={{ ...modernPillStyle(theme, true), height: 26, paddingLeft: 10, paddingRight: 10 }}
                  className="text-[10.5px] font-extrabold cursor-pointer"
                >
                  {tr('Assistir', language)}
                </button>
                <button
                  type="button"
                  onClick={() => setEpgModalChannel(null)}
                  style={{ color: theme.muted }}
                  className="text-[17px] font-bold px-2 cursor-pointer"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto kp-scroll p-3.5 space-y-2.5">
              {epgLoading ? (
                <div className="py-10 text-center text-[12.5px] font-bold" style={{ color: theme.accent }}>
                  Carregando grade ao vivo...
                </div>
              ) : !epgGuide || (!epgGuide.now && epgGuide.schedule.length === 0) ? (
                <div className="py-10 text-center space-y-1">
                  <div style={{ color: theme.text }} className="text-[13px] font-bold">
                    Grade EPG não encontrada para este canal
                  </div>
                  <div style={{ color: theme.muted }} className="text-[11px]">
                    Nem todos os canais regionais ou internacionais possuem guia XMLTV aberto no momento.
                  </div>
                </div>
              ) : (
                <>
                  {epgGuide.now && (
                    <div
                      style={{
                        backgroundColor: rgbToRgba(theme.accent, 0.1),
                        border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                      }}
                      className="p-3 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold">
                        <span style={{ color: theme.accent }}>NO AR AGORA</span>
                        <span style={{ color: theme.text }} className="tabular-nums">
                          {epgGuide.now.startLabel} – {epgGuide.now.stopLabel}
                        </span>
                      </div>
                      <div style={{ color: theme.text }} className="text-[14px] font-extrabold leading-snug">
                        {epgGuide.now.title}
                      </div>
                      {epgGuide.now.category && (
                        <div style={{ color: theme.accent }} className="text-[10px] font-semibold">
                          {epgGuide.now.category}
                        </div>
                      )}
                      {epgGuide.now.desc && (
                        <p style={{ color: theme.muted }} className="text-[11px] leading-relaxed">
                          {epgGuide.now.desc}
                        </p>
                      )}
                      <div
                        style={{ backgroundColor: rgbToRgba(theme.muted, 0.22) }}
                        className="h-1.5 rounded-full overflow-hidden"
                      >
                        <div
                          style={{
                            width: `${Math.max(4, Math.min(100, epgGuide.now.progressPct ?? 0))}%`,
                            backgroundColor: theme.accent,
                          }}
                          className="h-full rounded-full"
                        />
                      </div>
                    </div>
                  )}

                  {epgGuide.schedule.length > 0 && (
                    <div className="space-y-1.5">
                      <div style={{ color: theme.muted }} className="text-[10.5px] font-bold uppercase tracking-wide">
                        Programação do dia ({epgGuide.schedule.length})
                      </div>
                      {epgGuide.schedule.map((prog, i) => {
                        const isCurrent = epgGuide.now && prog.startMs === epgGuide.now.startMs;
                        return (
                          <div
                            key={`${prog.startMs}-${i}`}
                            style={{
                              backgroundColor: isCurrent
                                ? rgbToRgba(theme.accent, 0.12)
                                : rgbToRgba(theme.elevated, 0.85),
                              border: `1px solid ${isCurrent ? rgbToRgba(theme.accent, 0.35) : themeHairline(theme)}`,
                            }}
                            className="px-3 py-2 rounded-lg flex items-start gap-2.5"
                          >
                            <span
                              style={{ color: isCurrent ? theme.accent : theme.muted }}
                              className="text-[11px] font-bold tabular-nums shrink-0 pt-0.5"
                            >
                              {prog.startLabel}–{prog.stopLabel}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div style={{ color: theme.text }} className="text-[12px] font-bold leading-snug">
                                {prog.title}
                              </div>
                              {prog.desc && (
                                <div style={{ color: theme.muted }} className="text-[10.5px] line-clamp-2 mt-0.5">
                                  {prog.desc}
                                </div>
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

      <FooterBar
        theme={theme}
        themeIndex={themeIndex}
        toast={toast}
        hints={[
          { key: 'DIR', label: tr('Navegar', language) },
          {
            key: 'B',
            label:
              view === 'categories'
                ? tr('Abrir', language)
                : view === 'items' && activeSource.key === 'series'
                  ? tr('Episódios', language)
                  : tr('Assistir', language),
          },
          { key: 'X', label: tr('Alternar', language) },
          { key: 'Y', label: tr('Atualizar', language) },
          {
            key: 'A',
            label:
              view === 'episodes'
                ? tr('Séries', language)
                : view === 'items'
                  ? tr('Categorias', language)
                  : tr('Voltar', language),
          },
        ]}
      />
    </div>
  );
});
