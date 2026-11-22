import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  MapPin,
  Moon,
  Navigation,
  RefreshCw,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from 'lucide-react';
import type { KpTheme } from '../themes';
import type { LanguageCode, WeatherData, WeatherLocation, WeatherMode } from '../types';
import { describeWeatherCode, formatWeatherLocationShort, type WeatherIconKind } from '../utils/weather';
import { HeaderBar } from './HeaderBar';
import { FooterBar, ModernBackdrop, modernCardStyle, modernPanelStyle, rgbToRgba, themeHairline } from './R36SIcons';
import type { R36SButton } from './R36SControls';

export interface WeatherScreenHandle {
  handleButton: (btn: R36SButton) => void;
  openSetup: (mode?: 'choose' | 'manual') => void;
}

export interface WeatherScreenProps {
  theme: KpTheme;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  weatherMode: WeatherMode;
  weatherLocation: WeatherLocation | null;
  weatherData: WeatherData | null;
  weatherLoading: boolean;
  weatherError: string | null;
  initialSetupView?: 'auto' | 'choose' | 'manual';
  onChooseIpLocation: () => Promise<void>;
  onSelectManualLocation: (loc: WeatherLocation) => Promise<void>;
  onRefreshWeather: () => Promise<void>;
  onBack: () => void;
}

const QUICK_CITIES: WeatherLocation[] = [
  { name: 'São Paulo', region: 'São Paulo', country: 'Brasil', latitude: -23.5475, longitude: -46.6361 },
  { name: 'Rio de Janeiro', region: 'Rio de Janeiro', country: 'Brasil', latitude: -22.9068, longitude: -43.1729 },
  { name: 'Belo Horizonte', region: 'Minas Gerais', country: 'Brasil', latitude: -19.9167, longitude: -43.9345 },
  { name: 'Brasília', region: 'Distrito Federal', country: 'Brasil', latitude: -15.7939, longitude: -47.8828 },
  { name: 'Curitiba', region: 'Paraná', country: 'Brasil', latitude: -25.4284, longitude: -49.2733 },
  { name: 'Salvador', region: 'Bahia', country: 'Brasil', latitude: -12.9714, longitude: -38.5014 },
];

export function WeatherGlyph({
  kind,
  size = 24,
  color,
}: {
  kind: WeatherIconKind;
  size?: number;
  color?: string;
}) {
  const style = { width: size, height: size, color };
  switch (kind) {
    case 'sun':
      return <Sun style={style} />;
    case 'moon':
      return <Moon style={style} />;
    case 'partly-day':
      return <CloudSun style={style} />;
    case 'partly-night':
      return <CloudMoon style={style} />;
    case 'fog':
      return <CloudFog style={style} />;
    case 'drizzle':
      return <CloudDrizzle style={style} />;
    case 'rain':
      return <CloudRain style={style} />;
    case 'snow':
      return <CloudSnow style={style} />;
    case 'storm':
      return <CloudLightning style={style} />;
    default:
      return <Cloud style={style} />;
  }
}

export const WeatherScreen = forwardRef<WeatherScreenHandle, WeatherScreenProps>(
  function WeatherScreen(props, ref) {
    const {
      theme,
      locationLabel,
      toast,
      weatherMode,
      weatherLocation,
      weatherData,
      weatherLoading,
      weatherError,
      initialSetupView = 'auto',
      onChooseIpLocation,
      onSelectManualLocation,
      onRefreshWeather,
      onBack,
    } = props;

    const needsSetup = weatherMode === 'unset' || !weatherLocation;
    const [viewMode, setViewMode] = useState<'choose' | 'manual' | 'forecast'>(() => {
      if (initialSetupView === 'choose') return 'choose';
      if (initialSetupView === 'manual') return 'manual';
      return needsSetup ? 'choose' : 'forecast';
    });

    const [choiceCursor, setChoiceCursor] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchResults, setSearchResults] = useState<WeatherLocation[]>([]);
    const [searching, setSearching] = useState<boolean>(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [resultCursor, setResultCursor] = useState<number>(0);
    const [ipBusy, setIpBusy] = useState<boolean>(false);

    useEffect(() => {
      if (initialSetupView === 'choose') {
        setViewMode('choose');
      } else if (initialSetupView === 'manual') {
        setViewMode('manual');
      } else if (weatherMode === 'unset' || !weatherLocation) {
        setViewMode('choose');
      }
    }, [initialSetupView, weatherMode, weatherLocation]);

    const runCitySearch = useCallback(async (rawQuery: string) => {
      const q = rawQuery.trim();
      if (q.length < 2) {
        setSearchResults([]);
        setSearchError('Digite pelo menos 2 letras para pesquisar.');
        return;
      }
      setSearching(true);
      setSearchError(null);
      try {
        const r = await fetch(`/api/weather/search?q=${encodeURIComponent(q)}`);
        const d = (await r.json()) as { results?: WeatherLocation[]; error?: string };
        const list = d.results ?? [];
        setSearchResults(list);
        setResultCursor(0);
        if (list.length === 0) {
          setSearchError('Nenhuma cidade encontrada. Tente outro nome.');
        }
      } catch {
        setSearchError('Não foi possível pesquisar agora.');
      } finally {
        setSearching(false);
      }
    }, []);

    const handlePickIp = useCallback(async () => {
      if (ipBusy) return;
      setIpBusy(true);
      try {
        await onChooseIpLocation();
        setViewMode('forecast');
      } finally {
        setIpBusy(false);
      }
    }, [ipBusy, onChooseIpLocation]);

    const handlePickCity = useCallback(
      async (loc: WeatherLocation) => {
        await onSelectManualLocation(loc);
        setViewMode('forecast');
      },
      [onSelectManualLocation]
    );

    const activeList = searchResults.length > 0 ? searchResults : QUICK_CITIES;

    useImperativeHandle(
      ref,
      () => ({
        openSetup: (mode = 'choose') => {
          setViewMode(mode);
          setChoiceCursor(0);
          setResultCursor(0);
        },
        handleButton: (btn: R36SButton) => {
          if (viewMode === 'choose') {
            if (btn === 'A') {
              if (!needsSetup && weatherData) setViewMode('forecast');
              else onBack();
              return;
            }
            if (btn === 'UP' || btn === 'DOWN') {
              setChoiceCursor((c) => (c === 0 ? 1 : 0));
              return;
            }
            if (btn === 'B') {
              if (choiceCursor === 0) void handlePickIp();
              else setViewMode('manual');
            }
            return;
          }

          if (viewMode === 'manual') {
            if (btn === 'A') {
              setViewMode(needsSetup ? 'choose' : 'forecast');
              return;
            }
            if (btn === 'UP' && activeList.length > 0) {
              setResultCursor((c) => (c + activeList.length - 1) % activeList.length);
              return;
            }
            if (btn === 'DOWN' && activeList.length > 0) {
              setResultCursor((c) => (c + 1) % activeList.length);
              return;
            }
            if (btn === 'B' && activeList[resultCursor]) {
              void handlePickCity(activeList[resultCursor]);
            }
            return;
          }

          // forecast view
          if (btn === 'A') {
            onBack();
          } else if (btn === 'Y') {
            setViewMode('choose');
            setChoiceCursor(0);
          } else if (btn === 'X') {
            void onRefreshWeather();
          }
        },
      }),
      [
        viewMode,
        needsSetup,
        weatherData,
        onBack,
        choiceCursor,
        handlePickIp,
        activeList,
        resultCursor,
        handlePickCity,
        onRefreshWeather,
      ]
    );

    const currentInfo = weatherData
      ? describeWeatherCode(weatherData.current.weatherCode, weatherData.current.isDay)
      : null;

    const todayDaily = weatherData?.daily?.[0] ?? null;
    const weeklyMin = weatherData?.daily?.length
      ? Math.min(...weatherData.daily.map((d) => d.tempMin))
      : 0;
    const weeklyMax = weatherData?.daily?.length
      ? Math.max(...weatherData.daily.map((d) => d.tempMax))
      : 40;
    const weeklySpan = Math.max(1, weeklyMax - weeklyMin);

    return (
      <div className="w-full h-full relative overflow-hidden flex flex-col">
        <ModernBackdrop theme={theme} />
        <HeaderBar theme={theme} section="CLIMA" location={locationLabel} />

        <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-4 flex flex-col w-full max-w-[920px] mx-auto overflow-y-auto kp-scroll">
          {/* ==================== STEP 1: LOCATION PERMISSION / MODE CHOOSER ==================== */}
          {viewMode === 'choose' && (
            <div className="flex-1 flex flex-col justify-center max-w-[560px] mx-auto w-full py-2">
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => (!needsSetup && weatherData ? setViewMode('forecast') : onBack())}
                  style={{
                    backgroundColor: rgbToRgba(theme.elevated, 0.9),
                    border: `1px solid ${themeHairline(theme)}`,
                    color: theme.text,
                  }}
                  className="h-[34px] px-3 rounded-xl text-[12px] font-bold cursor-pointer"
                >
                  ← Voltar
                </button>
                <span style={{ color: theme.muted }} className="text-[11px] font-medium">
                  Open-Meteo
                </span>
              </div>

              <div
                style={{ ...modernPanelStyle(theme, 18) }}
                className="p-5 @min-[520px]:p-6 space-y-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.14),
                      color: theme.accent,
                    }}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                  >
                    <CloudSun className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h2
                      style={{ color: theme.text, textWrap: 'balance' }}
                      className="text-[19px] @min-[520px]:text-[22px] font-extrabold leading-tight"
                    >
                      Como deseja definir sua localização para o clima?
                    </h2>
                    <p style={{ color: theme.muted }} className="text-[12.5px] mt-1 leading-relaxed">
                      Podemos detectar sua cidade automaticamente usando seu IP ou você pode pesquisar qualquer cidade manualmente.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={ipBusy}
                    onMouseEnter={() => setChoiceCursor(0)}
                    onClick={() => void handlePickIp()}
                    style={{
                      ...modernCardStyle(theme, choiceCursor === 0, 14, theme.elevated),
                      minHeight: 58,
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Navigation
                        className="w-5 h-5 shrink-0"
                        style={{ color: choiceCursor === 0 ? theme.accent : theme.muted }}
                      />
                      <div className="min-w-0">
                        <div
                          style={{ color: choiceCursor === 0 ? theme.accent : theme.text }}
                          className="text-[14px] font-extrabold truncate"
                        >
                          {ipBusy ? 'Detectando localização pelo IP...' : 'Usar localização do meu IP'}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[11.5px] truncate">
                          Detecta sua cidade automaticamente e mantém o clima atualizado
                        </div>
                      </div>
                    </div>
                    <span style={{ color: choiceCursor === 0 ? theme.accent : theme.dim }} className="text-[15px] font-bold">
                      ›
                    </span>
                  </button>

                  <button
                    type="button"
                    onMouseEnter={() => setChoiceCursor(1)}
                    onClick={() => setViewMode('manual')}
                    style={{
                      ...modernCardStyle(theme, choiceCursor === 1, 14, theme.elevated),
                      minHeight: 58,
                    }}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Search
                        className="w-5 h-5 shrink-0"
                        style={{ color: choiceCursor === 1 ? theme.accent : theme.muted }}
                      />
                      <div className="min-w-0">
                        <div
                          style={{ color: choiceCursor === 1 ? theme.accent : theme.text }}
                          className="text-[14px] font-extrabold truncate"
                        >
                          Pesquisar cidade manualmente
                        </div>
                        <div style={{ color: theme.muted }} className="text-[11.5px] truncate">
                          Digite o nome da sua cidade sem usar localização por IP
                        </div>
                      </div>
                    </div>
                    <span style={{ color: choiceCursor === 1 ? theme.accent : theme.dim }} className="text-[15px] font-bold">
                      ›
                    </span>
                  </button>
                </div>

                {weatherError && (
                  <p style={{ color: theme.accent }} className="text-[12px] font-semibold">
                    {weatherError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ==================== STEP 2: MANUAL CITY SEARCH ==================== */}
          {viewMode === 'manual' && (
            <div className="flex flex-col flex-1 min-h-0 max-w-[640px] mx-auto w-full gap-3">
              <div className="flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setViewMode(needsSetup ? 'choose' : 'forecast')}
                    style={{
                      backgroundColor: rgbToRgba(theme.elevated, 0.9),
                      border: `1px solid ${themeHairline(theme)}`,
                      color: theme.text,
                    }}
                    className="h-[34px] px-3 rounded-xl text-[12px] font-bold cursor-pointer shrink-0"
                  >
                    ← Voltar
                  </button>
                  <div className="min-w-0">
                    <h2 style={{ color: theme.text }} className="text-[18px] font-extrabold truncate">
                      Pesquisar cidade
                    </h2>
                    <p style={{ color: theme.muted }} className="text-[11px] truncate">
                      Escolha uma cidade para exibir na tela inicial e no Clima
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handlePickIp()}
                  style={{
                    backgroundColor: rgbToRgba(theme.accent, 0.14),
                    color: theme.accent,
                  }}
                  className="h-[34px] px-3 rounded-xl text-[11.5px] font-bold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Usar IP
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runCitySearch(searchQuery);
                }}
                className="flex items-center gap-2 shrink-0"
              >
                <div
                  style={{
                    backgroundColor: theme.panel,
                    border: `1px solid ${themeHairline(theme)}`,
                  }}
                  className="flex-1 flex items-center gap-2 px-3 rounded-xl h-[44px]"
                >
                  <Search className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ex: São Paulo, Recife, Porto Alegre, Lisboa..."
                    style={{ color: theme.text }}
                    className="flex-1 bg-transparent text-[13.5px] outline-none min-w-0"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  style={{ backgroundColor: theme.accent, color: theme.bg }}
                  className="h-[44px] px-4 rounded-xl text-[13px] font-extrabold cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </form>

              {searchError && (
                <div style={{ color: theme.accent }} className="text-[12px] font-semibold shrink-0">
                  {searchError}
                </div>
              )}

              <div className="text-[11.5px] font-semibold shrink-0" style={{ color: theme.muted }}>
                {searchResults.length > 0 ? 'Resultados encontrados' : 'Sugestões rápidas'}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto kp-scroll space-y-1.5 pr-1">
                {activeList.map((city, idx) => {
                  const focused = idx === resultCursor;
                  return (
                    <button
                      key={`${city.name}-${city.latitude}-${city.longitude}`}
                      type="button"
                      onMouseEnter={() => setResultCursor(idx)}
                      onClick={() => void handlePickCity(city)}
                      style={{
                        ...modernCardStyle(theme, focused, 12, theme.panel),
                        minHeight: 48,
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MapPin
                          className="w-4 h-4 shrink-0"
                          style={{ color: focused ? theme.accent : theme.muted }}
                        />
                        <div className="min-w-0">
                          <div
                            style={{ color: focused ? theme.accent : theme.text }}
                            className="text-[14px] font-bold truncate"
                          >
                            {city.name}
                          </div>
                          <div style={{ color: theme.muted }} className="text-[11.5px] truncate">
                            {[city.region, city.country].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                      <span style={{ color: theme.dim }} className="text-[11px] tabular-nums shrink-0">
                        {city.latitude.toFixed(2)}, {city.longitude.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== STEP 3: FULL WEATHER APP DASHBOARD ==================== */}
          {viewMode === 'forecast' && (
            <div className="space-y-3.5 pb-2">
              {/* Top Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={onBack}
                    style={{
                      backgroundColor: rgbToRgba(theme.elevated, 0.9),
                      border: `1px solid ${themeHairline(theme)}`,
                      color: theme.text,
                    }}
                    className="h-[34px] px-3 rounded-xl text-[12px] font-bold cursor-pointer shrink-0"
                  >
                    ← Início
                  </button>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                      <h2 style={{ color: theme.text }} className="text-[16px] @min-[520px]:text-[18px] font-extrabold truncate">
                        {formatWeatherLocationShort(weatherData?.location ?? weatherLocation) || 'Clima'}
                      </h2>
                    </div>
                    <div style={{ color: theme.muted }} className="text-[11px] truncate">
                      {weatherMode === 'ip' ? 'Localização automática via IP' : 'Cidade definida manualmente'} · Open-Meteo
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewMode('choose')}
                    style={{
                      backgroundColor: theme.panel,
                      border: `1px solid ${themeHairline(theme)}`,
                      color: theme.text,
                    }}
                    className="h-[34px] px-3 rounded-xl text-[11.5px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Trocar local
                  </button>
                  <button
                    type="button"
                    disabled={weatherLoading}
                    onClick={() => void onRefreshWeather()}
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.16),
                      color: theme.accent,
                    }}
                    className="h-[34px] px-3 rounded-xl text-[11.5px] font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
                    {weatherLoading ? 'Atualizando' : 'Atualizar'}
                  </button>
                </div>
              </div>

              {weatherLoading && !weatherData ? (
                <div
                  style={{ ...modernPanelStyle(theme, 18) }}
                  className="p-8 text-center space-y-2"
                >
                  <CloudSun className="w-9 h-9 mx-auto animate-pulse" style={{ color: theme.accent }} />
                  <div style={{ color: theme.text }} className="text-[14px] font-bold">
                    Carregando previsão do tempo...
                  </div>
                  <div style={{ color: theme.muted }} className="text-[12px]">
                    Consultando Open-Meteo para sua localização
                  </div>
                </div>
              ) : weatherError && !weatherData ? (
                <div
                  style={{ ...modernPanelStyle(theme, 18) }}
                  className="p-6 text-center space-y-3"
                >
                  <div style={{ color: theme.text }} className="text-[14px] font-bold">
                    {weatherError}
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onRefreshWeather()}
                      style={{ backgroundColor: theme.accent, color: theme.bg }}
                      className="h-[38px] px-4 rounded-xl text-[12.5px] font-extrabold cursor-pointer"
                    >
                      Tentar novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('manual')}
                      style={{
                        backgroundColor: theme.elevated,
                        color: theme.text,
                      }}
                      className="h-[38px] px-4 rounded-xl text-[12.5px] font-bold cursor-pointer"
                    >
                      Escolher outra cidade
                    </button>
                  </div>
                </div>
              ) : weatherData && currentInfo ? (
                <>
                  {/* Hero Current Conditions */}
                  <div
                    style={{
                      ...modernPanelStyle(theme, 20),
                      background: `linear-gradient(135deg, ${rgbToRgba(theme.accent, 0.16)} 0%, ${theme.panel} 62%)`,
                    }}
                    className="p-4 @min-[520px]:p-5 flex flex-col @min-[520px]:flex-row @min-[520px]:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        style={{
                          backgroundColor: rgbToRgba(theme.bg, 0.45),
                          border: `1px solid ${themeHairline(theme)}`,
                        }}
                        className="w-16 h-16 @min-[520px]:w-20 @min-[520px]:h-20 rounded-2xl flex items-center justify-center shrink-0"
                      >
                        <WeatherGlyph kind={currentInfo.icon} size={42} color={theme.accent} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span
                            style={{ color: theme.text }}
                            className="text-[44px] @min-[520px]:text-[54px] font-extrabold leading-none tabular-nums tracking-tight"
                          >
                            {Math.round(weatherData.current.temp)}°
                          </span>
                          <span style={{ color: theme.muted }} className="text-[13px] font-semibold">
                            C
                          </span>
                        </div>
                        <div style={{ color: theme.text }} className="text-[15px] font-bold mt-1 truncate">
                          {currentInfo.label}
                        </div>
                        <div style={{ color: theme.muted }} className="text-[12px] tabular-nums mt-0.5">
                          Sensação {Math.round(weatherData.current.apparentTemp)}°
                          {todayDaily && (
                            <>
                              {' '}· Máx {Math.round(todayDaily.tempMax)}° / Mín {Math.round(todayDaily.tempMin)}°
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Atmospheric Summary Metrics */}
                    <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 shrink-0 border-t @min-[520px]:border-t-0 @min-[520px]:border-l pt-3 @min-[520px]:pt-0 @min-[520px]:pl-5" style={{ borderColor: themeHairline(theme) }}>
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                        <div>
                          <div style={{ color: theme.muted }} className="text-[10.5px]">Umidade</div>
                          <div style={{ color: theme.text }} className="text-[13.5px] font-bold tabular-nums">
                            {Math.round(weatherData.current.humidity)}%
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wind className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                        <div>
                          <div style={{ color: theme.muted }} className="text-[10.5px]">Vento</div>
                          <div style={{ color: theme.text }} className="text-[13.5px] font-bold tabular-nums">
                            {Math.round(weatherData.current.windSpeed)} km/h
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                        <div>
                          <div style={{ color: theme.muted }} className="text-[10.5px]">Pressão</div>
                          <div style={{ color: theme.text }} className="text-[13.5px] font-bold tabular-nums">
                            {Math.round(weatherData.current.pressure)} hPa
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                        <div>
                          <div style={{ color: theme.muted }} className="text-[10.5px]">UV Máx</div>
                          <div style={{ color: theme.text }} className="text-[13.5px] font-bold tabular-nums">
                            {todayDaily ? todayDaily.uvMax.toFixed(1) : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hourly Forecast (Next 12 Hours) */}
                  {weatherData.hourly.length > 0 && (
                    <section style={{ ...modernPanelStyle(theme, 16) }} className="p-3.5">
                      <div className="flex items-center justify-between mb-2.5">
                        <h3 style={{ color: theme.text }} className="text-[13px] font-extrabold">
                          Próximas horas
                        </h3>
                        {todayDaily && (
                          <div className="flex items-center gap-3 text-[11px] tabular-nums" style={{ color: theme.muted }}>
                            <span className="inline-flex items-center gap-1">
                              <Sunrise className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                              {todayDaily.sunrise}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Sunset className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                              {todayDaily.sunset}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-stretch gap-2 overflow-x-auto kp-scroll pb-1">
                        {weatherData.hourly.map((h) => {
                          const info = describeWeatherCode(h.weatherCode, h.isDay);
                          return (
                            <div
                              key={h.time}
                              style={{
                                backgroundColor: rgbToRgba(theme.elevated, 0.72),
                                border: `1px solid ${themeHairline(theme)}`,
                              }}
                              className="min-w-[68px] rounded-xl px-2 py-2.5 flex flex-col items-center justify-between gap-1.5 shrink-0"
                            >
                              <span style={{ color: theme.muted }} className="text-[11px] font-semibold tabular-nums">
                                {h.hourLabel}
                              </span>
                              <WeatherGlyph kind={info.icon} size={20} color={theme.accent} />
                              <span style={{ color: theme.text }} className="text-[14px] font-extrabold tabular-nums">
                                {Math.round(h.temp)}°
                              </span>
                              <span style={{ color: theme.muted }} className="text-[10px] tabular-nums">
                                {h.precipProb > 0 ? `${h.precipProb}%` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* 7-Day Forecast */}
                  {weatherData.daily.length > 0 && (
                    <section style={{ ...modernPanelStyle(theme, 16) }} className="p-3.5">
                      <h3 style={{ color: theme.text }} className="text-[13px] font-extrabold mb-2">
                        Previsão para 7 dias
                      </h3>
                      <div className="divide-y" style={{ borderColor: themeHairline(theme) }}>
                        {weatherData.daily.map((day, idx) => {
                          const info = describeWeatherCode(day.weatherCode, true);
                          const leftPct = Math.max(0, Math.min(100, ((day.tempMin - weeklyMin) / weeklySpan) * 100));
                          const widthPct = Math.max(8, Math.min(100 - leftPct, ((day.tempMax - day.tempMin) / weeklySpan) * 100));
                          return (
                            <div
                              key={day.date}
                              style={{ borderColor: themeHairline(theme) }}
                              className="py-2 flex items-center justify-between gap-3"
                            >
                              <div className="w-[74px] shrink-0">
                                <div style={{ color: idx === 0 ? theme.accent : theme.text }} className="text-[12.5px] font-bold truncate">
                                  {idx === 0 ? 'Hoje' : day.dayLabel}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <WeatherGlyph kind={info.icon} size={18} color={theme.accent} />
                                <span style={{ color: theme.muted }} className="text-[11.5px] truncate">
                                  {info.label}
                                </span>
                              </div>

                              <span style={{ color: theme.muted }} className="text-[11px] tabular-nums w-[36px] text-right shrink-0">
                                {day.precipProbMax > 0 ? `${day.precipProbMax}%` : ''}
                              </span>

                              <div className="flex items-center gap-2 shrink-0">
                                <span style={{ color: theme.muted }} className="text-[12px] font-semibold tabular-nums w-[28px] text-right">
                                  {Math.round(day.tempMin)}°
                                </span>
                                <div
                                  style={{ backgroundColor: rgbToRgba(theme.elevated, 0.9) }}
                                  className="hidden @min-[460px]:block w-[64px] h-[5px] rounded-full relative overflow-hidden"
                                >
                                  <div
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${widthPct}%`,
                                      backgroundColor: theme.accent,
                                    }}
                                    className="absolute top-0 bottom-0 rounded-full"
                                  />
                                </div>
                                <span style={{ color: theme.text }} className="text-[12.5px] font-extrabold tabular-nums w-[28px] text-right">
                                  {Math.round(day.tempMax)}°
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>

        <FooterBar theme={theme} toast={toast} />
      </div>
    );
  }
);
