import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KpTheme } from '../themes';
import type { FootballMatch, FootballMatchDetail, LanguageCode } from '../types';
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
import type { R36SButton } from './R36SControls';

export interface PlacarDaBolaHandle {
  handleButton: (btn: R36SButton) => void;
}

interface PlacarDaBolaScreenProps {
  theme: KpTheme;
  themeIndex: number;
  lang: LanguageCode;
  location: string;
  toast: string | null;
  initialMatches?: FootballMatch[];
  onMatchesLoaded?: (matches: FootballMatch[]) => void;
  onBack: () => void;
}

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'live', label: 'Ao vivo' },
  { id: 'br', label: 'Brasil' },
  { id: 'eu', label: 'Europa' },
] as const;

const DETAIL_TABS = ['Estatísticas', 'Eventos', 'Escalações'] as const;

function FormDots({ form }: { form: string }) {
  if (!form) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {form
        .slice(-5)
        .split('')
        .map((ch, idx) => {
          const upper = ch.toUpperCase();
          const bg =
            upper === 'W'
              ? '#22c55e'
              : upper === 'L'
              ? '#ef4444'
              : upper === 'D'
              ? '#eab308'
              : '#64748b';
          const pt = upper === 'W' ? 'V' : upper === 'L' ? 'D' : upper === 'D' ? 'E' : upper;
          return (
            <span
              key={idx}
              style={{ backgroundColor: bg }}
              className="w-[12px] h-[12px] rounded-[3px] text-[8px] font-black text-black flex items-center justify-center leading-none"
            >
              {pt}
            </span>
          );
        })}
    </span>
  );
}

function EventBadge({ kind, accent }: { kind: 'goal' | 'yellow' | 'red' | 'sub' | 'other'; accent: string }) {
  if (kind === 'goal') {
    return (
      <span
        style={{ backgroundColor: accent, color: '#070a0f' }}
        className="w-[18px] h-[18px] rounded-full text-[9px] font-black flex items-center justify-center shrink-0"
      >
        GOL
      </span>
    );
  }
  if (kind === 'yellow') {
    return <span className="w-[11px] h-[15px] rounded-[2px] bg-[#facc15] shrink-0 shadow" />;
  }
  if (kind === 'red') {
    return <span className="w-[11px] h-[15px] rounded-[2px] bg-[#ef4444] shrink-0 shadow" />;
  }
  if (kind === 'sub') {
    return (
      <span className="w-[18px] h-[18px] rounded-full bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center shrink-0">
        ⇄
      </span>
    );
  }
  return <span className="w-[8px] h-[8px] rounded-full bg-zinc-400 shrink-0" />;
}

export const PlacarDaBolaScreen = forwardRef<PlacarDaBolaHandle, PlacarDaBolaScreenProps>(
  function PlacarDaBolaScreen(
    { theme, themeIndex, lang, location, toast, initialMatches, onMatchesLoaded, onBack },
    ref
  ) {
    const [matches, setMatches] = useState<FootballMatch[]>(() => initialMatches ?? []);
    const [loading, setLoading] = useState<boolean>(() => !initialMatches || initialMatches.length === 0);
    const [filterIdx, setFilterIdx] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState(0);

    const [activeMatch, setActiveMatch] = useState<FootballMatch | null>(null);
    const [detail, setDetail] = useState<FootballMatchDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState<0 | 1 | 2>(0);
    const detailScrollRef = useRef<HTMLDivElement | null>(null);

    const loadMatches = useCallback(
      async (force = false) => {
        if (force || matches.length === 0) setLoading(true);
        try {
          const r = await fetch(`/api/football${force ? '?refresh=1' : ''}`);
          const d = (await r.json()) as { matches?: FootballMatch[] };
          const list = d.matches ?? [];
          setMatches(list);
          onMatchesLoaded?.(list);
          setSelectedIdx(0);
        } catch {
          if (matches.length === 0) setMatches([]);
        } finally {
          setLoading(false);
        }
      },
      [matches.length, onMatchesLoaded]
    );

    useEffect(() => {
      if (initialMatches && initialMatches.length > 0) {
        setMatches(initialMatches);
        setLoading(false);
        return;
      }
      loadMatches(false);
    }, [initialMatches, loadMatches]);

    const loadMatchDetail = useCallback(async (match: FootballMatch, force = false) => {
      setActiveMatch(match);
      setDetailTab(0);
      setDetailLoading(true);
      setDetail(null);
      if (!match.id || !match.leagueCode) {
        setDetailLoading(false);
        return;
      }
      try {
        const r = await fetch(
          `/api/football/match?league=${encodeURIComponent(match.leagueCode)}&id=${encodeURIComponent(match.id)}${
            force ? '&refresh=1' : ''
          }`
        );
        if (r.ok) {
          const data = (await r.json()) as FootballMatchDetail;
          setDetail(data);
        }
      } catch {
        // Leave detail null
      } finally {
        setDetailLoading(false);
      }
    }, []);

    const filteredMatches = useMemo(() => {
      const f = FILTERS[filterIdx].id;
      if (f === 'live') return matches.filter((m) => m.state === 'in');
      if (f === 'br') return matches.filter((m) => m.region === 'br');
      if (f === 'eu') return matches.filter((m) => m.region === 'eu');
      return matches;
    }, [matches, filterIdx]);

    const liveCount = useMemo(() => matches.filter((m) => m.state === 'in').length, [matches]);

    useEffect(() => {
      if (selectedIdx >= filteredMatches.length) {
        setSelectedIdx(Math.max(0, filteredMatches.length - 1));
      }
    }, [filteredMatches.length, selectedIdx]);

    useImperativeHandle(
      ref,
      () => ({
        handleButton: (btn: R36SButton) => {
          if (activeMatch) {
            if (btn === 'A') {
              setActiveMatch(null);
              setDetail(null);
              return;
            }
            if (btn === 'LEFT') {
              setDetailTab((t) => ((t + 2) % 3) as 0 | 1 | 2);
              if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
              return;
            }
            if (btn === 'RIGHT' || btn === 'X') {
              setDetailTab((t) => ((t + 1) % 3) as 0 | 1 | 2);
              if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
              return;
            }
            if (btn === 'UP') {
              detailScrollRef.current?.scrollBy({ top: -64, behavior: 'smooth' });
              return;
            }
            if (btn === 'DOWN') {
              detailScrollRef.current?.scrollBy({ top: 64, behavior: 'smooth' });
              return;
            }
            if (btn === 'Y') {
              loadMatchDetail(activeMatch, true);
            }
            return;
          }

          const len = filteredMatches.length;
          if (btn === 'A') {
            onBack();
          } else if (btn === 'UP' && len) {
            setSelectedIdx((i) => (i + len - 1) % len);
          } else if (btn === 'DOWN' && len) {
            setSelectedIdx((i) => (i + 1) % len);
          } else if (btn === 'LEFT') {
            setFilterIdx((f) => (f + FILTERS.length - 1) % FILTERS.length);
            setSelectedIdx(0);
          } else if (btn === 'RIGHT' || btn === 'X') {
            setFilterIdx((f) => (f + 1) % FILTERS.length);
            setSelectedIdx(0);
          } else if (btn === 'Y') {
            loadMatches(true);
          } else if (btn === 'B' && len) {
            const m = filteredMatches[selectedIdx];
            if (m) loadMatchDetail(m, false);
          }
        },
      }),
      [activeMatch, filteredMatches, selectedIdx, onBack, loadMatches, loadMatchDetail]
    );

    const windowStart = Math.max(0, Math.min(selectedIdx - 2, Math.max(0, filteredMatches.length - 5)));

    return (
      <div className="w-full h-full relative overflow-hidden">
        <ModernBackdrop theme={theme} />
        <HeaderBar theme={theme} section={tr('PLACAR DA BOLA', lang)} location={location} />

        {!activeMatch ? (
          /* ==================== MATCH LIST VIEW ==================== */
          <div className="relative z-10 px-4 pt-2.5 flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 style={{ color: theme.text }} className="text-[20px] font-extrabold leading-none">
                  {tr('Placar da Bola', lang)}
                </h2>
                {liveCount > 0 && (
                  <span
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.18),
                      color: theme.accent,
                      border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                    }}
                    className="px-2 py-0.5 rounded-full text-[9.5px] font-extrabold inline-flex items-center gap-1"
                  >
                    <span
                      style={{ backgroundColor: theme.accent }}
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                    />
                    {liveCount} {tr('Ao vivo', lang).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {FILTERS.map((f, idx) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFilterIdx(idx);
                      setSelectedIdx(0);
                    }}
                    style={modernPillStyle(theme, filterIdx === idx)}
                    className="px-2.5 h-[22px] text-[10.5px] font-bold cursor-pointer transition-all"
                  >
                    {tr(f.label, lang)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2.5 space-y-[6px]">
              {loading ? (
                <div
                  style={{ color: theme.accent }}
                  className="h-[320px] flex items-center justify-center text-[16px] font-bold"
                >
                  {tr('Carregando placares...', lang)}
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="h-[320px] flex flex-col items-center justify-center text-center">
                  <div style={{ color: theme.muted }} className="text-[16px] font-semibold">
                    {tr('Nenhum jogo ao vivo', lang)}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMatches(true)}
                    style={modernPillStyle(theme, true)}
                    className="mt-3 px-4 py-1.5 text-[12px] font-bold cursor-pointer"
                  >
                    Y {tr('Atualizar', lang)}
                  </button>
                </div>
              ) : (
                filteredMatches.slice(windowStart, windowStart + 5).map((m, idx) => {
                  const realIdx = windowStart + idx;
                  const focus = realIdx === selectedIdx;
                  const isLive = m.state === 'in';
                  return (
                    <button
                      key={`${m.leagueCode}-${m.id || realIdx}`}
                      type="button"
                      onMouseEnter={() => setSelectedIdx(realIdx)}
                      onClick={() => loadMatchDetail(m, false)}
                      style={{
                        ...modernCardStyle(theme, focus, 11, theme.panel),
                        height: 60,
                      }}
                      className="w-full px-3 py-1.5 flex flex-col justify-between text-left cursor-pointer transition-all"
                    >
                      {/* Row 1: League + Venue + Status Pill */}
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span style={{ color: theme.accent }} className="text-[9.5px] font-extrabold truncate">
                            {m.league}
                          </span>
                          {m.venue && (
                            <span style={{ color: theme.dim }} className="text-[9.5px] truncate">
                              • {m.venue}
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            backgroundColor: isLive ? theme.accent : mixRgb(theme.elevated, theme.bg, 0.2),
                            color: isLive ? theme.bg : theme.muted,
                          }}
                          className="px-2 py-0.5 rounded-full text-[9px] font-extrabold shrink-0 inline-flex items-center gap-1"
                        >
                          {isLive && (
                            <span
                              style={{ backgroundColor: theme.bg }}
                              className="w-1.5 h-1.5 rounded-full animate-pulse"
                            />
                          )}
                          {m.status}
                        </span>
                      </div>

                      {/* Row 2: Teams + Crests + Score Badge */}
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center justify-end gap-1.5 flex-1 min-w-0">
                          <span style={{ color: theme.text }} className="text-[13px] font-bold truncate">
                            {m.home}
                          </span>
                          {m.homeLogo && (
                            <img
                              src={m.homeLogo}
                              alt=""
                              className="w-[17px] h-[17px] object-contain shrink-0"
                            />
                          )}
                        </div>

                        <div
                          style={{
                            backgroundColor: mixRgb(theme.bg, theme.elevated, 0.55),
                            border: `1px solid ${isLive ? rgbToRgba(theme.accent, 0.55) : themeHairline(theme)}`,
                            color: isLive ? theme.accent : theme.text,
                          }}
                          className="px-2.5 py-0.5 rounded-[7px] text-[13.5px] font-black tabular-nums min-w-[66px] text-center shrink-0"
                        >
                          {m.score}
                        </div>

                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {m.awayLogo && (
                            <img
                              src={m.awayLogo}
                              alt=""
                              className="w-[17px] h-[17px] object-contain shrink-0"
                            />
                          )}
                          <span style={{ color: theme.text }} className="text-[13px] font-bold truncate">
                            {m.away}
                          </span>
                        </div>
                      </div>

                      {/* Row 3: Quick Stats / Goals Preview */}
                      <div style={{ color: theme.muted }} className="text-[9.5px] truncate w-full">
                        {m.preview || tr('B para estatísticas, eventos e escalações', lang)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {filteredMatches.length > 0 && (
              <div
                style={{ color: theme.dim }}
                className="text-[10px] mt-1 flex items-center justify-between px-0.5"
              >
                <span>
                  {selectedIdx + 1} / {filteredMatches.length}
                </span>
                <span>{tr('B para estatísticas, eventos e escalações', lang)}</span>
              </div>
            )}
          </div>
        ) : (
          /* ==================== SOFASCORE-STYLE MATCH CENTER DETAIL ==================== */
          <div className="relative z-10 px-4 pt-2 flex flex-col">
            {/* Top Match Scoreboard Card */}
            <div
              style={{ ...modernPanelStyle(theme, 14), height: 102 }}
              className="px-3.5 py-2 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 text-[9.5px]">
                <span style={{ color: theme.accent }} className="font-extrabold truncate">
                  {activeMatch.league}
                  {(detail?.venue || activeMatch.venue) ? ` • ${detail?.venue || activeMatch.venue}` : ''}
                </span>
                <span style={{ color: theme.dim }} className="truncate shrink-0">
                  {[detail?.referee, detail?.attendance].filter(Boolean).join(' • ') || activeMatch.status}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                {/* Home Team */}
                <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
                  <div className="min-w-0 text-right">
                    <div style={{ color: theme.text }} className="text-[14px] font-extrabold truncate">
                      {activeMatch.home}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {detail?.homeFormation && (
                        <span style={{ color: theme.muted }} className="text-[9.5px] font-bold">
                          {detail.homeFormation}
                        </span>
                      )}
                      {detail?.homeForm && <FormDots form={detail.homeForm} />}
                    </div>
                  </div>
                  {activeMatch.homeLogo && (
                    <img
                      src={activeMatch.homeLogo}
                      alt=""
                      className="w-[30px] h-[30px] object-contain shrink-0"
                    />
                  )}
                </div>

                {/* Center Score + Status */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    style={{
                      backgroundColor: mixRgb(theme.bg, theme.elevated, 0.55),
                      border: `1px solid ${
                        activeMatch.state === 'in' ? theme.accent : themeHairline(theme)
                      }`,
                      color: activeMatch.state === 'in' ? theme.accent : theme.text,
                    }}
                    className="px-3.5 py-0.5 rounded-[10px] text-[20px] font-black tabular-nums leading-tight"
                  >
                    {activeMatch.score}
                  </div>
                  <span
                    style={{
                      color: activeMatch.state === 'in' ? theme.accent : theme.muted,
                    }}
                    className="text-[9.5px] font-extrabold mt-0.5"
                  >
                    {activeMatch.status}
                  </span>
                </div>

                {/* Away Team */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {activeMatch.awayLogo && (
                    <img
                      src={activeMatch.awayLogo}
                      alt=""
                      className="w-[30px] h-[30px] object-contain shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div style={{ color: theme.text }} className="text-[14px] font-extrabold truncate">
                      {activeMatch.away}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {detail?.awayForm && <FormDots form={detail.awayForm} />}
                      {detail?.awayFormation && (
                        <span style={{ color: theme.muted }} className="text-[9.5px] font-bold">
                          {detail.awayFormation}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Glowing Pill Tabs: Estatísticas | Eventos | Escalações */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              {DETAIL_TABS.map((tab, idx) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setDetailTab(idx as 0 | 1 | 2);
                    if (detailScrollRef.current) detailScrollRef.current.scrollTop = 0;
                  }}
                  style={{ ...modernPillStyle(theme, detailTab === idx), height: 26 }}
                  className="text-[11.5px] font-extrabold cursor-pointer transition-all"
                >
                  {tr(tab, lang)}
                  {idx === 1 && detail?.events.length ? ` (${detail.events.length})` : ''}
                </button>
              ))}
            </div>

            {/* Detail Tab Body Panel */}
            <div
              ref={detailScrollRef}
              style={{ ...modernPanelStyle(theme, 14), height: 244 }}
              className="mt-2 px-3.5 py-2.5 overflow-y-auto kp-scroll"
            >
              {detailLoading ? (
                <div
                  style={{ color: theme.accent }}
                  className="h-full flex items-center justify-center text-[14px] font-bold"
                >
                  {tr('Carregando estatísticas...', lang)}
                </div>
              ) : detailTab === 0 ? (
                /* ---- TAB 0: ESTATÍSTICAS (Dual Proportional SofaScore Bars) ---- */
                !detail || detail.stats.length === 0 ? (
                  <div
                    style={{ color: theme.muted }}
                    className="h-full flex items-center justify-center text-[13px] text-center px-6"
                  >
                    {tr('Estatísticas disponíveis quando a partida iniciar', lang)}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {detail.stats.map((st) => {
                      const sum = st.homeNum + st.awayNum;
                      const homePct = sum > 0 ? Math.max(4, Math.round((st.homeNum / sum) * 100)) : 50;
                      const awayPct = sum > 0 ? Math.max(4, 100 - homePct) : 50;
                      const homeLeads = st.homeNum > st.awayNum;
                      const awayLeads = st.awayNum > st.homeNum;
                      return (
                        <div key={st.label}>
                          <div className="flex items-center justify-between text-[11.5px] mb-1">
                            <span
                              style={{ color: homeLeads ? theme.accent : theme.text }}
                              className="font-extrabold tabular-nums w-14"
                            >
                              {st.home}
                            </span>
                            <span style={{ color: theme.muted }} className="font-semibold text-[11px] text-center">
                              {st.label}
                            </span>
                            <span
                              style={{ color: awayLeads ? theme.accent : theme.text }}
                              className="font-extrabold tabular-nums w-14 text-right"
                            >
                              {st.away}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 h-[6px]">
                            <div
                              style={{ backgroundColor: mixRgb(theme.elevated, theme.bg, 0.25) }}
                              className="flex-1 h-full rounded-l-full overflow-hidden flex justify-end"
                            >
                              <div
                                style={{
                                  width: `${homePct}%`,
                                  backgroundColor: homeLeads
                                    ? theme.accent
                                    : mixRgb(theme.muted, theme.text, 0.35),
                                }}
                                className="h-full rounded-l-full transition-all"
                              />
                            </div>
                            <div
                              style={{ backgroundColor: mixRgb(theme.elevated, theme.bg, 0.25) }}
                              className="flex-1 h-full rounded-r-full overflow-hidden flex justify-start"
                            >
                              <div
                                style={{
                                  width: `${awayPct}%`,
                                  backgroundColor: awayLeads
                                    ? theme.accent
                                    : mixRgb(theme.muted, theme.text, 0.35),
                                }}
                                className="h-full rounded-r-full transition-all"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : detailTab === 1 ? (
                /* ---- TAB 1: EVENTOS (Minute-by-Minute Timeline) ---- */
                !detail || detail.events.length === 0 ? (
                  <div
                    style={{ color: theme.muted }}
                    className="h-full flex items-center justify-center text-[13px] text-center px-6"
                  >
                    {tr('Nenhum evento registrado ainda', lang)}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {detail.events.map((ev, idx) => (
                      <div
                        key={`${ev.minute}-${idx}`}
                        style={{
                          backgroundColor: mixRgb(theme.bg, theme.elevated, 0.35),
                          border: `1px solid ${themeHairline(theme)}`,
                        }}
                        className="px-2.5 py-1.5 rounded-[9px] flex items-center gap-2.5"
                      >
                        <span
                          style={{ color: theme.accent }}
                          className="text-[11px] font-black tabular-nums w-9 shrink-0"
                        >
                          {ev.minute || '--'}
                        </span>
                        <EventBadge kind={ev.kind} accent={theme.accent} />
                        <div className="min-w-0 flex-1">
                          <div style={{ color: theme.text }} className="text-[11.5px] font-bold truncate">
                            {ev.desc}
                          </div>
                          {ev.team && (
                            <div style={{ color: theme.muted }} className="text-[9.5px] truncate">
                              {ev.team}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : /* ---- TAB 2: ESCALAÇÕES (Side-by-Side Starting XI) ---- */
              !detail || (detail.homeLineup.length === 0 && detail.awayLineup.length === 0) ? (
                <div
                  style={{ color: theme.muted }}
                  className="h-full flex items-center justify-center text-[13px] text-center px-6"
                >
                  {tr('Escalações ainda não divulgadas', lang)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { team: activeMatch.home, formation: detail.homeFormation, players: detail.homeLineup },
                    { team: activeMatch.away, formation: detail.awayFormation, players: detail.awayLineup },
                  ].map((side) => (
                    <div key={side.team}>
                      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-white/10">
                        <span style={{ color: theme.accent }} className="text-[11px] font-extrabold truncate">
                          {side.team}
                        </span>
                        {side.formation && (
                          <span style={{ color: theme.muted }} className="text-[10px] font-bold shrink-0">
                            {side.formation}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {side.players.map((p, idx) => (
                          <div key={`${p.jersey}-${idx}`} className="flex items-center gap-1.5 text-[11px]">
                            <span
                              style={{
                                backgroundColor: mixRgb(theme.elevated, theme.accent, 0.16),
                                color: theme.accent,
                              }}
                              className="w-[20px] h-[17px] rounded-[5px] text-[9.5px] font-extrabold flex items-center justify-center tabular-nums shrink-0"
                            >
                              {p.jersey}
                            </span>
                            <span style={{ color: theme.text }} className="font-semibold truncate flex-1">
                              {p.name}
                            </span>
                            {p.pos && (
                              <span style={{ color: theme.dim }} className="text-[9px] font-bold shrink-0">
                                {p.pos}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <FooterBar
          theme={theme}
          themeIndex={themeIndex}
          toast={toast}
          hints={
            activeMatch
              ? [
                  { key: 'DIR', label: tr('Abas / Rolar', lang) },
                  { key: 'Y', label: tr('Atualizar', lang) },
                  { key: 'A', label: tr('Voltar', lang) },
                ]
              : [
                  { key: 'DIR', label: tr('Navegar', lang) },
                  { key: 'B', label: tr('Detalhes', lang) },
                  { key: 'X', label: tr('Filtro', lang) },
                  { key: 'Y', label: tr('Atualizar', lang) },
                  { key: 'A', label: tr('Voltar', lang) },
                ]
          }
        />
      </div>
    );
  }
);
