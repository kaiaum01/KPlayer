import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { KP_THEMES, type KpTheme } from '../themes';
import { LANGUAGE_NAMES, tr } from '../i18n';
import type {
  AppUpdateStatus,
  EqPresetName,
  LanguageCode,
  MediaTrack,
  PlaybackHistoryEntry,
  RepeatMode,
  VideoFit,
  WeatherLocation,
  WeatherMode,
} from '../types';
import { formatWeatherLocationShort } from '../utils/weather';
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

export interface OptionsMenuHandle {
  handleButton: (btn: R36SButton) => void;
  openSection: (sec: OptionSectionId) => void;
}

export type OptionSectionId =
  | 'root'
  | 'displayMode'
  | 'shortcuts'
  | 'library'
  | 'weather'
  | 'language'
  | 'playback'
  | 'playback_rate'
  | 'playback_eq'
  | 'playback_repeat'
  | 'playback_fit'
  | 'theme'
  | 'sleep'
  | 'update';

export interface OptionsMenuProps {
  theme: KpTheme;
  themeIndex: number;
  language: LanguageCode;
  locationLabel: string;
  toast: string | null;
  initialSection?: OptionSectionId;
  playbackRate: number;
  videoFit: VideoFit;
  repeatMode: RepeatMode;
  shuffle: boolean;
  eqIdx: number;
  eqPresets: Array<{ name: EqPresetName }>;
  sleepIdx: number;
  sleepOptions: readonly number[];
  r36sDisplayMode: 'auto' | 'r36s' | 'square' | 'wide';
  displayModes: Array<{ id: 'auto' | 'r36s' | 'square' | 'wide'; label: string }>;
  stageSize: { w: number; h: number };
  weatherMode: WeatherMode;
  weatherLocation: WeatherLocation | null;
  activeTrack: MediaTrack | null;
  favoriteTrackIds: string[];
  history: PlaybackHistoryEntry[];
  updateStatus: AppUpdateStatus | null;
  updateChecking: boolean;
  updateApplying: boolean;
  updateMessage: string | null;
  onSetThemeIndex: (idx: number) => void;
  onSetLanguage: (lang: LanguageCode) => void;
  onSetDisplayMode: (mode: 'auto' | 'r36s' | 'square' | 'wide') => void;
  onSetPlaybackRate: (rate: number) => void;
  onSetVideoFit: (fit: VideoFit) => void;
  onSetRepeatMode: (mode: RepeatMode) => void;
  onToggleShuffle: () => void;
  onSetEqIdx: (idx: number) => void;
  onSetSleepIdx: (idx: number) => void;
  onEnableIpWeather: () => Promise<void>;
  onOpenWeatherManual: () => void;
  onOpenWeatherScreen: () => void;
  onDisableWeather: () => void;
  onToggleFavTrack: () => void;
  onOpenFavorites: () => void;
  onResumeMedia: () => void;
  onOpenIptv: () => void;
  onOpenFootball: () => void;
  onOpenTerms: () => void;
  onExitApp: () => void;
  onCheckUpdate: (force?: boolean) => Promise<void>;
  onApplyUpdate: () => Promise<void>;
  onSaveUpdateRepo: (repo: string) => Promise<boolean>;
  onClose: () => void;
}

interface MenuEntry {
  id: string;
  label: string;
  value?: string;
  badge?: string;
  leadingTag?: string;
  accentDot?: string;
  selected?: boolean;
  hideChevron?: boolean;
  onSelect: () => void;
}

const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const SHORTCUT_ITEMS: Array<{ keyLabel: string; keyboard: string; action: string }> = [
  { keyLabel: '↑ ↓ ← →', keyboard: 'Setas / WASD', action: 'Navegar nos menus, listas e grade inicial' },
  { keyLabel: 'B', keyboard: 'Enter / Z', action: 'Abrir item, selecionar opção ou reproduzir' },
  { keyLabel: 'A', keyboard: 'Backspace / Esc / X', action: 'Voltar para a tela ou etapa anterior' },
  { keyLabel: 'X', keyboard: 'Espaço / C', action: 'Abrir Clima (no início) · Favoritar rádio · Fila/Pastas' },
  { keyLabel: 'Y', keyboard: 'M / V', action: 'Abrir Opções (no início) · Atualizar listas / Trocar cidade' },
  { keyLabel: 'SELECT', keyboard: 'Tab / O', action: 'Abrir ou fechar este menu de Opções em qualquer tela' },
  { keyLabel: 'START', keyboard: 'P', action: 'Reproduzir ou pausar áudio / vídeo atual' },
  { keyLabel: 'L1 / R1', keyboard: '[ / ] ou Q / E', action: 'Faixa ou estação anterior / próxima' },
];

export const OptionsMenu = forwardRef<OptionsMenuHandle, OptionsMenuProps>(function OptionsMenu(
  props,
  ref
) {
  const {
    theme,
    themeIndex,
    language,
    locationLabel,
    toast,
    initialSection = 'root',
    playbackRate,
    videoFit,
    repeatMode,
    shuffle,
    eqIdx,
    eqPresets,
    sleepIdx,
    sleepOptions,
    r36sDisplayMode,
    displayModes,
    stageSize,
    weatherMode,
    weatherLocation,
    activeTrack,
    favoriteTrackIds,
    history,
    updateStatus,
    updateChecking,
    updateApplying,
    updateMessage,
    onSetThemeIndex,
    onSetLanguage,
    onSetDisplayMode,
    onSetPlaybackRate,
    onSetVideoFit,
    onSetRepeatMode,
    onToggleShuffle,
    onSetEqIdx,
    onSetSleepIdx,
    onEnableIpWeather,
    onOpenWeatherManual,
    onOpenWeatherScreen,
    onDisableWeather,
    onToggleFavTrack,
    onOpenFavorites,
    onResumeMedia,
    onOpenIptv,
    onOpenFootball,
    onOpenTerms,
    onExitApp,
    onCheckUpdate,
    onApplyUpdate,
    onSaveUpdateRepo,
    onClose,
  } = props;

  const [section, setSection] = useState<OptionSectionId>(initialSection);
  const [cursor, setCursor] = useState<number>(0);
  const [repoInput, setRepoInput] = useState<string>(updateStatus?.repository ?? '');
  const [repoSaving, setRepoSaving] = useState<boolean>(false);

  useEffect(() => {
    setSection(initialSection);
    setCursor(0);
  }, [initialSection]);

  useEffect(() => {
    if (updateStatus?.repository) {
      setRepoInput((prev) => prev || updateStatus.repository);
    }
  }, [updateStatus?.repository]);

  const goSection = useCallback((next: OptionSectionId) => {
    setSection(next);
    setCursor(0);
  }, []);

  const goBack = useCallback(() => {
    if (section === 'root') {
      onClose();
    } else if (
      section === 'playback_rate' ||
      section === 'playback_eq' ||
      section === 'playback_repeat' ||
      section === 'playback_fit'
    ) {
      goSection('playback');
    } else {
      goSection('root');
    }
  }, [section, onClose, goSection]);

  const activeDisplayLabel = useMemo(() => {
    if (r36sDisplayMode === 'auto') {
      return `${tr('Auto (Adaptativo)', language)} (${stageSize.w}×${stageSize.h})`;
    }
    return displayModes.find((m) => m.id === r36sDisplayMode)?.label ?? 'Auto';
  }, [r36sDisplayMode, displayModes, language, stageSize.w, stageSize.h]);

  const repeatLabel =
    repeatMode === 1
      ? tr('Repetir faixa', language)
      : repeatMode === 2
      ? tr('Repetir fila', language)
      : tr('Desativada', language);

  const fitLabel =
    videoFit === 0
      ? tr('Proporção original', language)
      : videoFit === 1
      ? tr('Preencher (corte)', language)
      : tr('Esticar', language);

  const weatherSummary = useMemo(() => {
    const locStr = formatWeatherLocationShort(weatherLocation);
    if (weatherMode === 'ip') return locStr ? `IP · ${locStr}` : 'Localização por IP';
    if (weatherMode === 'manual') return locStr ? `Manual · ${locStr}` : 'Cidade manual';
    return 'Não configurado';
  }, [weatherMode, weatherLocation]);

  const sectionTitle = useMemo(() => {
    const titles: Record<OptionSectionId, string> = {
      root: tr('Opções', language),
      displayMode: tr('Adaptação de tela', language),
      shortcuts: 'Atalhos',
      library: 'Biblioteca & Histórico',
      weather: 'Clima e Localização',
      language: tr('Idioma', language),
      playback: 'Reprodução & Áudio',
      playback_rate: tr('Velocidade', language),
      playback_eq: tr('Equalizador', language),
      playback_repeat: tr('Modo de repetição', language),
      playback_fit: tr('Formato da imagem', language),
      theme: tr('Tema', language),
      sleep: tr('Timer de sono', language),
      update: 'Verificar atualizações',
    };
    return titles[section];
  }, [section, language]);

  const entries: MenuEntry[] = useMemo(() => {
    if (section === 'root') {
      // Strictly alphabetical (A–Z), followed by penultimate "Verificar atualizações" (marker A) and last "Sair"
      const updBadge = updateStatus?.updateAvailable
        ? `v${updateStatus.latestVersion}`
        : undefined;
      const updValue = updateStatus?.updateAvailable
        ? `Nova v${updateStatus.latestVersion}`
        : `v${updateStatus?.currentVersion ?? '2.0.5'}`;

      return [
        {
          id: 'displayMode',
          label: tr('Adaptação de tela', language),
          value: activeDisplayLabel,
          onSelect: () => goSection('displayMode'),
        },
        {
          id: 'shortcuts',
          label: 'Atalhos',
          value: `${SHORTCUT_ITEMS.length} controles`,
          onSelect: () => goSection('shortcuts'),
        },
        {
          id: 'library',
          label: 'Biblioteca & Histórico',
          value: `${history.length} recentes · ${favoriteTrackIds.length} favs`,
          onSelect: () => goSection('library'),
        },
        {
          id: 'weather',
          label: 'Clima e Localização',
          value: weatherSummary,
          onSelect: () => goSection('weather'),
        },
        {
          id: 'language',
          label: tr('Idioma', language),
          value: LANGUAGE_NAMES[language],
          onSelect: () => goSection('language'),
        },
        {
          id: 'playback',
          label: 'Reprodução & Áudio',
          value: `${playbackRate.toFixed(2)}x · ${eqIdx === 0 ? 'EQ Off' : eqPresets[eqIdx]?.name ?? 'EQ'}`,
          onSelect: () => goSection('playback'),
        },
        {
          id: 'theme',
          label: tr('Tema', language),
          value: tr(theme.name, language),
          accentDot: theme.accent,
          onSelect: () => goSection('theme'),
        },
        {
          id: 'terms',
          label: tr('Termos de uso', language),
          value: tr('Abrir', language),
          onSelect: onOpenTerms,
        },
        {
          id: 'sleep',
          label: tr('Timer de sono', language),
          value: sleepIdx === 0 ? tr('Desativada', language) : `${sleepOptions[sleepIdx]} min`,
          onSelect: () => goSection('sleep'),
        },
        // Penultimate: ONLY "A" marker + "Verificar atualizações"
        {
          id: 'update',
          leadingTag: 'A',
          label: 'Verificar atualizações',
          value: updValue,
          badge: updBadge,
          onSelect: () => goSection('update'),
        },
        // Last: ONLY "Sair"
        {
          id: 'exit',
          label: 'Sair',
          hideChevron: true,
          onSelect: onExitApp,
        },
      ];
    }

    if (section === 'shortcuts') {
      return [
        {
          id: 'back-root-shortcuts',
          label: '← Voltar ao menu de Opções',
          hideChevron: true,
          onSelect: () => goSection('root'),
        },
      ];
    }

    if (section === 'weather') {
      return [
        {
          id: 'wx-open',
          label: 'Abrir aplicativo de Clima',
          value: 'Previsão Open-Meteo (botão X no início)',
          onSelect: onOpenWeatherScreen,
        },
        {
          id: 'wx-ip',
          label: 'Usar localização do meu IP',
          selected: weatherMode === 'ip',
          value: weatherMode === 'ip' ? 'Ativo' : 'Automático',
          onSelect: () => {
            void onEnableIpWeather();
          },
        },
        {
          id: 'wx-manual',
          label: 'Pesquisar cidade manualmente',
          selected: weatherMode === 'manual',
          value:
            weatherMode === 'manual' && weatherLocation
              ? formatWeatherLocationShort(weatherLocation)
              : 'Escolher cidade',
          onSelect: onOpenWeatherManual,
        },
        {
          id: 'wx-off',
          label: 'Limpar localização configurada',
          selected: weatherMode === 'unset',
          value: weatherMode === 'unset' ? 'Sem local' : undefined,
          onSelect: onDisableWeather,
        },
      ];
    }

    if (section === 'update') {
      return [
        {
          id: 'check-now',
          label: updateChecking ? 'Verificando pasta updates/ no GitHub...' : 'Verificar nova versão agora',
          value: `Canal ${updateStatus?.updatesFolderUrl ?? 'updates/'}`,
          onSelect: () => {
            if (!updateChecking && !updateApplying) void onCheckUpdate(true);
          },
        },
        {
          id: 'apply-now',
          label: updateApplying
            ? 'Atualizando e reiniciando (mantendo dados)...'
            : updateStatus?.updateAvailable
            ? `Baixar e atualizar para v${updateStatus.latestVersion}`
            : 'Sincronizar e reiniciar mantendo dados',
          badge: updateStatus?.updateAvailable ? 'PRONTO' : undefined,
          value: 'Preserva histórico, favoritos e listas',
          onSelect: () => {
            if (!updateApplying) void onApplyUpdate();
          },
        },
        {
          id: 'back-root',
          label: '← Voltar ao menu de Opções',
          hideChevron: true,
          onSelect: () => goSection('root'),
        },
      ];
    }

    if (section === 'theme') {
      return KP_THEMES.map((t, idx) => ({
        id: `theme-${idx}`,
        label: tr(t.name, language),
        accentDot: t.accent,
        selected: idx === themeIndex,
        value: idx === themeIndex ? 'Ativo' : undefined,
        onSelect: () => onSetThemeIndex(idx),
      }));
    }

    if (section === 'language') {
      return ([0, 1, 2] as LanguageCode[]).map((code) => ({
        id: `lang-${code}`,
        label: LANGUAGE_NAMES[code],
        selected: code === language,
        value: code === language ? 'Ativo' : undefined,
        onSelect: () => onSetLanguage(code),
      }));
    }

    if (section === 'displayMode') {
      return displayModes.map((m) => ({
        id: `disp-${m.id}`,
        label: tr(m.label, language),
        selected: m.id === r36sDisplayMode,
        value: m.id === r36sDisplayMode ? 'Ativo' : undefined,
        onSelect: () => onSetDisplayMode(m.id),
      }));
    }

    if (section === 'playback') {
      return [
        {
          id: 'shuffle',
          label: tr('Aleatório', language),
          value: tr(shuffle ? 'Ativada' : 'Desativada', language),
          selected: shuffle,
          onSelect: onToggleShuffle,
        },
        {
          id: 'eq',
          label: tr('Equalizador', language),
          value: eqIdx === 0 ? tr('Desativada', language) : eqPresets[eqIdx]?.name ?? 'Flat',
          onSelect: () => goSection('playback_eq'),
        },
        {
          id: 'fit',
          label: tr('Formato da imagem', language),
          value: fitLabel,
          onSelect: () => goSection('playback_fit'),
        },
        {
          id: 'repeat',
          label: tr('Modo de repetição', language),
          value: repeatLabel,
          onSelect: () => goSection('playback_repeat'),
        },
        {
          id: 'rate',
          label: tr('Velocidade', language),
          value: `${playbackRate.toFixed(2)}x`,
          onSelect: () => goSection('playback_rate'),
        },
      ];
    }

    if (section === 'playback_rate') {
      return SPEED_STEPS.map((sp) => ({
        id: `sp-${sp}`,
        label: `${sp.toFixed(2)}x`,
        selected: Math.abs(sp - playbackRate) < 0.01,
        value: Math.abs(sp - playbackRate) < 0.01 ? 'Ativo' : undefined,
        onSelect: () => onSetPlaybackRate(sp),
      }));
    }

    if (section === 'playback_eq') {
      return eqPresets.map((p, idx) => ({
        id: `eq-${idx}`,
        label: idx === 0 ? tr('Desativada', language) : p.name,
        selected: idx === eqIdx,
        value: idx === eqIdx ? 'Ativo' : undefined,
        onSelect: () => onSetEqIdx(idx),
      }));
    }

    if (section === 'playback_repeat') {
      return (
        [
          { mode: 0 as RepeatMode, label: tr('Desativada', language) },
          { mode: 1 as RepeatMode, label: tr('Repetir faixa', language) },
          { mode: 2 as RepeatMode, label: tr('Repetir fila', language) },
        ] as const
      ).map((item) => ({
        id: `rep-${item.mode}`,
        label: item.label,
        selected: repeatMode === item.mode,
        value: repeatMode === item.mode ? 'Ativo' : undefined,
        onSelect: () => onSetRepeatMode(item.mode),
      }));
    }

    if (section === 'playback_fit') {
      return (
        [
          { fit: 0 as VideoFit, label: tr('Proporção original', language) },
          { fit: 1 as VideoFit, label: tr('Preencher (corte)', language) },
          { fit: 2 as VideoFit, label: tr('Esticar', language) },
        ] as const
      ).map((item) => ({
        id: `fit-${item.fit}`,
        label: item.label,
        selected: videoFit === item.fit,
        value: videoFit === item.fit ? 'Ativo' : undefined,
        onSelect: () => onSetVideoFit(item.fit),
      }));
    }

    if (section === 'sleep') {
      return sleepOptions.map((mins, idx) => ({
        id: `sleep-${mins}`,
        label: mins === 0 ? tr('Desativada', language) : `${mins} minutos`,
        selected: idx === sleepIdx,
        value: idx === sleepIdx ? 'Ativo' : undefined,
        onSelect: () => onSetSleepIdx(idx),
      }));
    }

    // library & history shortcuts
    return [
      {
        id: 'fav-track',
        label: tr('Favoritar faixa', language),
        value: activeTrack
          ? tr(favoriteTrackIds.includes(activeTrack.id) ? 'Favoritada' : 'Adicionar', language)
          : tr('Abra uma mídia', language),
        onSelect: onToggleFavTrack,
      },
      {
        id: 'iptv',
        label: tr('IPTV', language),
        value: tr('Abrir', language),
        onSelect: onOpenIptv,
      },
      {
        id: 'my-favs',
        label: tr('Minhas favoritas', language),
        value: `${favoriteTrackIds.length}`,
        onSelect: onOpenFavorites,
      },
      {
        id: 'football',
        label: tr('Placar da Bola', language),
        value: tr('Abrir', language),
        onSelect: onOpenFootball,
      },
      {
        id: 'resume',
        label: tr('Retomar mídia', language),
        value: activeTrack?.title ?? tr('Abra uma mídia', language),
        onSelect: onResumeMedia,
      },
    ];
  }, [
    section,
    updateStatus,
    updateChecking,
    updateApplying,
    theme.name,
    theme.accent,
    themeIndex,
    language,
    activeDisplayLabel,
    weatherSummary,
    weatherMode,
    weatherLocation,
    playbackRate,
    eqIdx,
    eqPresets,
    sleepIdx,
    sleepOptions,
    history.length,
    favoriteTrackIds,
    displayModes,
    r36sDisplayMode,
    repeatLabel,
    shuffle,
    fitLabel,
    repeatMode,
    videoFit,
    activeTrack,
    goSection,
    onOpenTerms,
    onExitApp,
    onCheckUpdate,
    onApplyUpdate,
    onSetThemeIndex,
    onSetLanguage,
    onSetDisplayMode,
    onSetPlaybackRate,
    onSetEqIdx,
    onSetRepeatMode,
    onToggleShuffle,
    onSetVideoFit,
    onSetSleepIdx,
    onEnableIpWeather,
    onOpenWeatherManual,
    onOpenWeatherScreen,
    onDisableWeather,
    onToggleFavTrack,
    onOpenFavorites,
    onResumeMedia,
    onOpenIptv,
    onOpenFootball,
  ]);

  useEffect(() => {
    if (cursor >= entries.length && entries.length > 0) {
      setCursor(entries.length - 1);
    }
  }, [cursor, entries.length]);

  useImperativeHandle(
    ref,
    () => ({
      openSection: (sec: OptionSectionId) => {
        setSection(sec);
        setCursor(0);
      },
      handleButton: (btn: R36SButton) => {
        if (btn === 'A') {
          goBack();
          return;
        }
        if (btn === 'UP' && entries.length > 0) {
          setCursor((c) => (c + entries.length - 1) % entries.length);
          return;
        }
        if (btn === 'DOWN' && entries.length > 0) {
          setCursor((c) => (c + 1) % entries.length);
          return;
        }
        if (btn === 'B' && entries[cursor]) {
          entries[cursor].onSelect();
        }
      },
    }),
    [entries, cursor, goBack]
  );

  const handleRepoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoInput.trim() || repoSaving) return;
    setRepoSaving(true);
    try {
      await onSaveUpdateRepo(repoInput.trim());
    } finally {
      setRepoSaving(false);
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section={tr('OPÇÕES', language)} location={locationLabel} />

      <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-4 flex flex-col w-full max-w-[760px] mx-auto">
        {/* Clean Selection-First Header (NO horizontal side tabs) */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {section !== 'root' && (
              <button
                type="button"
                onClick={goBack}
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.9),
                  border: `1px solid ${themeHairline(theme)}`,
                  color: theme.text,
                }}
                className="h-[30px] px-2.5 rounded-lg text-[11.5px] font-bold cursor-pointer shrink-0"
              >
                ← Voltar
              </button>
            )}
            <div className="min-w-0">
              <h2
                style={{ color: theme.text }}
                className="text-[19px] @min-[540px]:text-[22px] font-extrabold leading-tight truncate"
              >
                {sectionTitle}
              </h2>
              <p style={{ color: theme.muted }} className="text-[10.5px] truncate">
                {section === 'root'
                  ? 'Lista em ordem alfabética · Pressione B para abrir ou SELECT para fechar'
                  : section === 'shortcuts'
                  ? 'Todos os controles do R36S e atalhos do teclado'
                  : 'Escolha uma opção na lista e pressione B para confirmar'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              ...modernCardStyle(theme, false, 8),
              height: 30,
              color: theme.muted,
            }}
            className="px-2.5 text-[11px] font-bold cursor-pointer shrink-0"
          >
            SELECT · Fechar
          </button>
        </div>

        {/* Dedicated Shortcuts List Panel when 'shortcuts' is selected */}
        {section === 'shortcuts' && (
          <div
            style={{ ...modernPanelStyle(theme, 14) }}
            className="mt-2.5 p-3 space-y-1.5 overflow-y-auto kp-scroll flex-1 min-h-0"
          >
            {SHORTCUT_ITEMS.map((item) => (
              <div
                key={item.keyLabel}
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.72),
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="px-3 py-2 rounded-xl flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    style={{
                      backgroundColor: rgbToRgba(theme.accent, 0.16),
                      color: theme.accent,
                      border: `1px solid ${rgbToRgba(theme.accent, 0.35)}`,
                    }}
                    className="px-2 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums shrink-0 min-w-[54px] text-center"
                  >
                    {item.keyLabel}
                  </span>
                  <div className="min-w-0">
                    <div style={{ color: theme.text }} className="text-[12.5px] font-bold leading-snug">
                      {item.action}
                    </div>
                    <div style={{ color: theme.muted }} className="text-[10.5px]">
                      Teclado: {item.keyboard}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dedicated Auto-Update Info Panel when 'update' is selected */}
        {section === 'update' && (
          <div
            style={{ ...modernPanelStyle(theme, 12) }}
            className="mt-2.5 p-3 space-y-2 shrink-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div style={{ color: theme.accent }} className="text-[11px] font-extrabold">
                  {updateStatus?.updateAvailable
                    ? `Nova versão disponível: v${updateStatus.latestVersion}`
                    : `Versão instalada: v${updateStatus?.currentVersion ?? '2.0.5'}`}
                </div>
                <div style={{ color: theme.muted }} className="text-[11px] mt-0.5">
                  {updateStatus?.updateAvailable
                    ? 'Pronta para baixar da pasta updates/ do GitHub e reiniciar automaticamente.'
                    : `Monitorando automaticamente v${updateStatus?.nextExpectedVersion ?? '2.0.6'} e próximas versões na pasta updates/.`}
                </div>
              </div>
              <span
                style={{ color: updateStatus?.updateAvailable ? theme.accent : theme.muted }}
                className="text-[11px] font-bold tabular-nums shrink-0"
              >
                {updateStatus?.source === 'github'
                  ? 'GitHub Online'
                  : updateStatus?.source === 'github-release'
                    ? 'GitHub Releases'
                    : 'Manifesto Local'}
              </span>
            </div>

            {updateStatus?.remoteStatus && updateStatus.remoteStatus !== 'ok' && updateStatus.lastError && (
              <div
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.7),
                  border: `1px solid ${themeHairline(theme)}`,
                  color: theme.muted,
                }}
                className="px-2.5 py-1.5 rounded-lg text-[10.5px] leading-snug"
              >
                Usando manifesto local: {updateStatus.lastError}
              </div>
            )}

            {updateStatus?.notes && updateStatus.notes.length > 0 && (
              <div
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.65),
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="p-2 rounded-lg space-y-0.5"
              >
                {updateStatus.notes.slice(0, 3).map((note, idx) => (
                  <div key={idx} style={{ color: theme.text }} className="text-[10.5px] leading-snug">
                    • {note}
                  </div>
                ))}
              </div>
            )}

            <div style={{ color: theme.muted }} className="text-[10.5px] leading-snug">
              Dados protegidos no update: favoritos ({favoriteTrackIds.length}), histórico ({history.length}), listas IPTV/Rádio do usuário, clima, idioma e tema.
            </div>

            {updateMessage && (
              <div
                style={{
                  backgroundColor: rgbToRgba(theme.accent, 0.14),
                  color: theme.accent,
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              >
                {updateMessage}
              </div>
            )}

            <form onSubmit={handleRepoSubmit} className="flex items-center gap-1.5 pt-0.5">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="GitHub: usuario/KPlayer (pasta updates/)"
                style={{
                  backgroundColor: theme.elevated,
                  color: theme.text,
                  border: `1px solid ${themeHairline(theme)}`,
                }}
                className="flex-1 min-w-0 px-2.5 py-1 rounded-lg text-[11px] outline-none"
              />
              <button
                type="submit"
                disabled={repoSaving}
                style={{ ...modernPillStyle(theme, true), height: 28, paddingLeft: 10, paddingRight: 10 }}
                className="text-[10.5px] font-extrabold cursor-pointer shrink-0 disabled:opacity-60"
              >
                {repoSaving ? '...' : 'Salvar repo'}
              </button>
            </form>
          </div>
        )}

        {/* Recent preserved playback history preview when 'library' is selected */}
        {section === 'library' && history.length > 0 && (
          <div
            style={{ ...modernPanelStyle(theme, 12) }}
            className="mt-2.5 p-2.5 space-y-1 shrink-0"
          >
            <div style={{ color: theme.accent }} className="text-[10.5px] font-extrabold">
              Histórico recente preservado ({history.length})
            </div>
            {history.slice(0, 3).map((item, idx) => (
              <div
                key={`${item.playedAt}-${idx}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span style={{ color: theme.text }} className="truncate font-semibold">
                  {item.title}
                </span>
                <span style={{ color: theme.muted }} className="text-[10px] shrink-0">
                  {item.kind}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pure Vertical Select-First Menu List (Zero Horizontal Side Bars) */}
        <div
          className={`mt-2.5 ${section === 'shortcuts' ? 'shrink-0' : 'flex-1 min-h-0 overflow-y-auto kp-scroll pr-1'} space-y-1.5`}
        >
          {entries.map((entry, idx) => {
            const focused = idx === cursor;
            return (
              <button
                key={entry.id}
                type="button"
                onMouseEnter={() => setCursor(idx)}
                onClick={entry.onSelect}
                style={{
                  ...modernCardStyle(theme, focused, 11, theme.panel),
                  minHeight: 42,
                }}
                className="w-full px-3.5 @min-[520px]:px-4 py-2 flex items-center justify-between gap-3 text-left cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {entry.leadingTag && (
                    <span
                      style={{
                        backgroundColor: rgbToRgba(theme.accent, focused ? 0.25 : 0.14),
                        color: theme.accent,
                        border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                      }}
                      className="w-6 h-6 rounded-md text-[12px] font-extrabold flex items-center justify-center shrink-0"
                    >
                      {entry.leadingTag}
                    </span>
                  )}
                  {entry.accentDot && (
                    <span
                      style={{ backgroundColor: entry.accentDot }}
                      className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                    />
                  )}
                  <span
                    style={{ color: focused || entry.selected ? theme.accent : theme.text }}
                    className="text-[13.5px] @min-[520px]:text-[14.5px] font-bold truncate"
                  >
                    {entry.label}
                  </span>
                  {entry.badge && (
                    <span
                      style={{
                        backgroundColor: theme.accent,
                        color: theme.bg,
                      }}
                      className="px-2 py-0.5 rounded-md text-[9.5px] font-extrabold shrink-0"
                    >
                      {entry.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 max-w-[46%]">
                  {entry.value && (
                    <span
                      style={{ color: entry.selected ? theme.accent : theme.muted }}
                      className="text-[12px] @min-[520px]:text-[13px] font-medium truncate text-right"
                    >
                      {entry.value}
                    </span>
                  )}
                  {!entry.hideChevron && (
                    <span style={{ color: focused ? theme.accent : theme.dim }} className="text-[14px] font-bold shrink-0">
                      {entry.selected ? '✓' : section === 'root' || section === 'playback' ? '›' : ''}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <FooterBar theme={theme} toast={toast} />
    </div>
  );
});
