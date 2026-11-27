import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { KP_THEMES, type KpTheme } from '../themes';
import { LANGUAGE_NAMES, tr } from '../i18n';
import type {
  AppUpdateStatus,
  EqPresetName,
  LanguageCode,
  MediaTrack,
  OptionsContext,
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

import {
  formatScreensaverTimeout,
  SCREENSAVER_TIMEOUT_OPTIONS,
  SCREENSAVER_VIZ_LABELS,
} from './ScreensaverOverlay';

export interface OptionsMenuHandle {
  handleButton: (btn: R36SButton) => void;
  openSection: (sec: OptionSectionId) => void;
}

export type OptionSectionId =
  | 'root'
  | 'video_opts'
  | 'music_opts'
  | 'iptv_opts'
  | 'radio_opts'
  | 'displayMode'
  | 'weather'
  | 'screensaver'
  | 'language'
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
  context: OptionsContext;
  initialSection?: OptionSectionId;
  homeLayoutInverted: boolean;
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
  radioCategoryLabel?: string;
  updateStatus: AppUpdateStatus | null;
  updateChecking: boolean;
  updateApplying: boolean;
  updateMessage: string | null;
  updateProgress: number;
  updateStage: string | null;
  updateDetail: string | null;
  screensaverTimeoutSec: number;
  screensaverVizStyle: number;
  screensaverShowClock: boolean;
  screensaverShowLyrics: boolean;
  uiSfxEnabled: boolean;
  bgAudioPreview: boolean;
  adultSectionUnlocked: boolean;
  onSetThemeIndex: (idx: number) => void;
  onSetLanguage: (lang: LanguageCode) => void;
  onSetDisplayMode: (mode: 'auto' | 'r36s' | 'square' | 'wide') => void;
  onToggleHomeLayout: () => void;
  onToggleUiSfx: () => void;
  onToggleBgAudioPreview: () => void;
  onToggleAdultSection: () => void;
  onCycleScreensaverTimeout: () => void;
  onCycleScreensaverViz: () => void;
  onToggleScreensaverClock: () => void;
  onToggleScreensaverLyrics: () => void;
  onStartScreensaverNow: () => void;
  onOpenCommandsTutorial: () => void;
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
  onIptvSearch?: () => void;
  onIptvCycleSource?: () => void;
  onIptvRefresh?: () => void;
  onIptvAddUrl?: () => void;
  onRadioToggleFav?: () => void;
  onRadioCycleCategory?: () => void;
  onRadioRefresh?: () => void;
  onOpenTerms: () => void;
  onExitApp: () => void;
  onCheckUpdate: (force?: boolean) => Promise<void>;
  onApplyUpdate: (force?: boolean) => Promise<void>;
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

function contextToSection(ctx: OptionsContext): OptionSectionId {
  if (ctx === 'video') return 'video_opts';
  if (ctx === 'music') return 'music_opts';
  if (ctx === 'iptv') return 'iptv_opts';
  if (ctx === 'radio') return 'radio_opts';
  return 'root';
}

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
    context,
    initialSection,
    homeLayoutInverted,
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
    radioCategoryLabel,
    updateStatus,
    updateChecking,
    updateApplying,
    updateMessage,
    updateProgress,
    updateStage,
    updateDetail,
    screensaverTimeoutSec,
    screensaverVizStyle,
    screensaverShowClock,
    screensaverShowLyrics,
    uiSfxEnabled,
    bgAudioPreview,
    adultSectionUnlocked,
    onSetThemeIndex,
    onSetLanguage,
    onSetDisplayMode,
    onToggleHomeLayout,
    onToggleUiSfx,
    onToggleBgAudioPreview,
    onToggleAdultSection,
    onCycleScreensaverTimeout,
    onCycleScreensaverViz,
    onToggleScreensaverClock,
    onToggleScreensaverLyrics,
    onStartScreensaverNow,
    onOpenCommandsTutorial,
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
    onIptvSearch,
    onIptvCycleSource,
    onIptvRefresh,
    onIptvAddUrl,
    onRadioToggleFav,
    onRadioCycleCategory,
    onRadioRefresh,
    onOpenTerms,
    onExitApp,
    onCheckUpdate,
    onApplyUpdate,
    onSaveUpdateRepo,
    onClose,
  } = props;

  const entrySection = useMemo<OptionSectionId>(
    () => initialSection ?? contextToSection(context),
    [initialSection, context]
  );

  const [section, setSection] = useState<OptionSectionId>(entrySection);
  const [returnSection, setReturnSection] = useState<OptionSectionId>(entrySection);
  const [cursor, setCursor] = useState<number>(0);
  const [repoInput, setRepoInput] = useState<string>(updateStatus?.repository ?? '');
  const [repoSaving, setRepoSaving] = useState<boolean>(false);
  const [reinstallArmed, setReinstallArmed] = useState<boolean>(false);

  useEffect(() => {
    setSection(entrySection);
    setReturnSection(entrySection);
    setCursor(0);
    setReinstallArmed(false);
  }, [entrySection]);

  useEffect(() => {
    if (section !== 'update' || updateStatus?.updateAvailable) {
      setReinstallArmed(false);
    }
  }, [section, updateStatus?.updateAvailable]);

  useEffect(() => {
    if (updateStatus?.repository) {
      setRepoInput((prev) => prev || updateStatus.repository);
    }
  }, [updateStatus?.repository]);

  const goSection = useCallback(
    (next: OptionSectionId, parent?: OptionSectionId) => {
      if (parent) setReturnSection(parent);
      setSection(next);
      setCursor(0);
    },
    []
  );

  const goBack = useCallback(() => {
    if (section === entrySection) {
      onClose();
      return;
    }
    if (
      section === 'playback_rate' ||
      section === 'playback_eq' ||
      section === 'playback_repeat' ||
      section === 'playback_fit'
    ) {
      goSection(returnSection);
      return;
    }
    if (
      (section === 'sleep' || section === 'screensaver') &&
      (returnSection === 'music_opts' || returnSection === 'radio_opts')
    ) {
      goSection(returnSection);
      return;
    }
    if (section === 'root' && entrySection !== 'root') {
      goSection(entrySection);
      return;
    }
    goSection('root');
  }, [section, entrySection, returnSection, onClose, goSection]);

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
      video_opts: 'Opções do Player de Vídeo',
      music_opts: 'Opções de Música',
      iptv_opts: 'Opções de TV e Séries',
      radio_opts: 'Opções de Rádio Online',
      displayMode: tr('Adaptação de tela', language),
      weather: 'Clima e Localização',
      screensaver: 'Protetor de Tela',
      language: tr('Idioma', language),
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

  const sectionSubtitle = useMemo(() => {
    if (section === 'root') return 'Configurações gerais (ordem alfabética) · SELECT fecha';
    if (section === 'video_opts') return 'Controles exclusivos do player de vídeo';
    if (section === 'music_opts') return 'Controles exclusivos do player de música';
    if (section === 'iptv_opts') return 'Pesquisa digitada, abas, EPG e links M3U';
    if (section === 'radio_opts') return 'Estações favoritas, categorias, protetor de tela e timer';
    if (section === 'screensaver')
      return 'Visualizadores estilo Windows Media Player, relógio/data/clima e letras (.LRC)';
    return 'Escolha uma opção na lista e pressione B para confirmar';
  }, [section]);

  const entries: MenuEntry[] = useMemo(() => {
    // 1. Contextual Video Player Options ONLY
    if (section === 'video_opts') {
      return [
        {
          id: 'vid-rate',
          label: tr('Velocidade', language),
          value: `${playbackRate.toFixed(2)}x`,
          onSelect: () => goSection('playback_rate', 'video_opts'),
        },
        {
          id: 'vid-fit',
          label: tr('Formato da imagem', language),
          value: fitLabel,
          onSelect: () => goSection('playback_fit', 'video_opts'),
        },
        {
          id: 'vid-repeat',
          label: tr('Modo de repetição', language),
          value: repeatLabel,
          onSelect: () => goSection('playback_repeat', 'video_opts'),
        },
        {
          id: 'vid-resume',
          label: tr('Retomar mídia', language),
          value: activeTrack?.title ?? tr('Abra uma mídia', language),
          onSelect: onResumeMedia,
        },
        {
          id: 'vid-general',
          label: 'Configurações gerais',
          value: 'Tema, Clima, Atualizações',
          onSelect: () => goSection('root', 'video_opts'),
        },
      ];
    }

    // 2. Contextual Music Player Options ONLY
    if (section === 'music_opts') {
      return [
        {
          id: 'mus-shuffle',
          label: tr('Aleatório', language),
          value: tr(shuffle ? 'Ativada' : 'Desativada', language),
          selected: shuffle,
          onSelect: onToggleShuffle,
        },
        {
          id: 'mus-eq',
          label: tr('Equalizador', language),
          value: eqIdx === 0 ? tr('Desativada', language) : eqPresets[eqIdx]?.name ?? 'Flat',
          onSelect: () => goSection('playback_eq', 'music_opts'),
        },
        {
          id: 'mus-fav',
          label: tr('Favoritar faixa', language),
          value: activeTrack
            ? tr(favoriteTrackIds.includes(activeTrack.id) ? 'Favoritada' : 'Adicionar', language)
            : tr('Abra uma mídia', language),
          onSelect: onToggleFavTrack,
        },
        {
          id: 'mus-myfavs',
          label: tr('Minhas favoritas', language),
          value: `${favoriteTrackIds.length}`,
          onSelect: onOpenFavorites,
        },
        {
          id: 'mus-repeat',
          label: tr('Modo de repetição', language),
          value: repeatLabel,
          onSelect: () => goSection('playback_repeat', 'music_opts'),
        },
        {
          id: 'mus-resume',
          label: tr('Retomar mídia', language),
          value: activeTrack?.title ?? tr('Abra uma mídia', language),
          onSelect: onResumeMedia,
        },
        {
          id: 'mus-rate',
          label: tr('Velocidade', language),
          value: `${playbackRate.toFixed(2)}x`,
          onSelect: () => goSection('playback_rate', 'music_opts'),
        },
        {
          id: 'mus-screensaver',
          label: 'Protetor de tela',
          value: formatScreensaverTimeout(screensaverTimeoutSec),
          onSelect: () => goSection('screensaver', 'music_opts'),
        },
        {
          id: 'mus-sleep',
          label: tr('Timer de sono', language),
          value: sleepIdx === 0 ? tr('Desativada', language) : `${sleepOptions[sleepIdx]} min`,
          onSelect: () => goSection('sleep', 'music_opts'),
        },
        {
          id: 'mus-general',
          label: 'Configurações gerais',
          value: 'Tema, Clima, Atualizações',
          onSelect: () => goSection('root', 'music_opts'),
        },
      ];
    }

    // 3. Contextual TV / IPTV Options ONLY
    if (section === 'iptv_opts') {
      return [
        {
          id: 'iptv-search',
          label: 'Pesquisar canais / séries / filmes',
          value: 'Digitar busca',
          onSelect: () => {
            onClose();
            onIptvSearch?.();
          },
        },
        {
          id: 'iptv-tab',
          label: adultSectionUnlocked
            ? 'Alternar aba (Canais / Filmes / Séries / Usuário / +18)'
            : 'Alternar aba (Canais / Filmes / Séries / Usuário)',
          value: 'Trocar',
          onSelect: () => {
            onClose();
            onIptvCycleSource?.();
          },
        },
        {
          id: 'iptv-refresh',
          label: 'Atualizar listas e EPG',
          value: 'Recarregar',
          onSelect: () => {
            onClose();
            onIptvRefresh?.();
          },
        },
        {
          id: 'iptv-add',
          label: 'Adicionar URL M3U (Usuário)',
          value: 'Teclado',
          onSelect: () => {
            onClose();
            onIptvAddUrl?.();
          },
        },
        {
          id: 'iptv-adult-18',
          label: tr('Seção +18', language),
          value: adultSectionUnlocked ? tr('Desbloqueado', language) : tr('Bloqueado', language),
          badge: adultSectionUnlocked ? '+18' : undefined,
          onSelect: onToggleAdultSection,
        },
        {
          id: 'iptv-terms',
          label: tr('Termos de uso', language),
          value: tr('Abrir', language),
          onSelect: onOpenTerms,
        },
        {
          id: 'iptv-general',
          label: 'Configurações gerais',
          value: 'Tema, Clima, Atualizações',
          onSelect: () => goSection('root', 'iptv_opts'),
        },
      ];
    }

    // 4. Contextual Radio Options ONLY
    if (section === 'radio_opts') {
      return [
        {
          id: 'rad-fav',
          label: 'Favoritar estação atual',
          value: 'Alternar',
          onSelect: () => {
            onRadioToggleFav?.();
          },
        },
        {
          id: 'rad-cat',
          label: 'Categoria de rádio',
          value: radioCategoryLabel ?? 'Alternar',
          onSelect: () => {
            onRadioCycleCategory?.();
          },
        },
        {
          id: 'rad-refresh',
          label: 'Atualizar estações',
          value: 'Recarregar',
          onSelect: () => {
            onClose();
            onRadioRefresh?.();
          },
        },
        {
          id: 'rad-screensaver',
          label: 'Protetor de tela',
          value: formatScreensaverTimeout(screensaverTimeoutSec),
          onSelect: () => goSection('screensaver', 'radio_opts'),
        },
        {
          id: 'rad-sleep',
          label: tr('Timer de sono', language),
          value: sleepIdx === 0 ? tr('Desativada', language) : `${sleepOptions[sleepIdx]} min`,
          onSelect: () => goSection('sleep', 'radio_opts'),
        },
        {
          id: 'rad-terms',
          label: tr('Termos de uso', language),
          value: tr('Abrir', language),
          onSelect: onOpenTerms,
        },
        {
          id: 'rad-general',
          label: 'Configurações gerais',
          value: 'Tema, Clima, Atualizações',
          onSelect: () => goSection('root', 'radio_opts'),
        },
      ];
    }

    // 5. General Root Options (strictly A–Z, NO video/music/TV/radio playback clutter!)
    // Penultimate: ONLY [A] Verificar atualizações · Last: ONLY Sair
    if (section === 'root') {
      const updBadge = updateStatus?.updateAvailable
        ? `v${updateStatus.latestVersion}`
        : undefined;
      const updValue = updateStatus?.updateAvailable
        ? `Nova v${updateStatus.latestVersion}`
        : `v${updateStatus?.currentVersion ?? '2.1.7'}`;

      return [
        {
          id: 'displayMode',
          label: tr('Adaptação de tela', language),
          value: activeDisplayLabel,
          onSelect: () => goSection('displayMode', 'root'),
        },
        {
          id: 'weather',
          label: 'Clima e Localização',
          value: weatherSummary,
          onSelect: () => goSection('weather', 'root'),
        },
        {
          id: 'language',
          label: tr('Idioma', language),
          value: LANGUAGE_NAMES[language],
          onSelect: () => goSection('language', 'root'),
        },
        {
          id: 'home-layout',
          label: 'Layout da tela inicial',
          value: homeLayoutInverted ? 'Invertido (Clima topo)' : 'Clima grande embaixo',
          onSelect: onToggleHomeLayout,
        },
        {
          id: 'bg-audio-preview',
          label: 'Mini-Player no Sistema Inteiro',
          value: bgAudioPreview ? 'Injetado no R36S' : 'Desativado',
          badge: bgAudioPreview ? 'SISTEMA' : undefined,
          selected: bgAudioPreview,
          onSelect: onToggleBgAudioPreview,
        },
        {
          id: 'screensaver',
          label: 'Protetor de tela',
          value: formatScreensaverTimeout(screensaverTimeoutSec),
          onSelect: () => goSection('screensaver', 'root'),
        },
        {
          id: 'commands',
          label: 'Rever comandos',
          value: 'Tutorial do controle',
          onSelect: onOpenCommandsTutorial,
        },
        {
          id: 'ui-sfx',
          label: tr('Sons das teclas', language),
          value: tr(uiSfxEnabled ? 'Ativada' : 'Desativada', language),
          selected: uiSfxEnabled,
          onSelect: onToggleUiSfx,
        },
        {
          id: 'theme',
          label: tr('Tema', language),
          value: tr(theme.name, language),
          accentDot: theme.accent,
          onSelect: () => goSection('theme', 'root'),
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
          onSelect: () => goSection('sleep', 'root'),
        },
        // Penultimate: ONLY "A" marker + "Verificar atualizações"
        {
          id: 'update',
          leadingTag: 'A',
          label: 'Verificar atualizações',
          value: updValue,
          badge: updBadge,
          onSelect: () => goSection('update', 'root'),
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

    if (section === 'screensaver') {
      const nextTimeoutLabel = formatScreensaverTimeout(
        SCREENSAVER_TIMEOUT_OPTIONS[
          (SCREENSAVER_TIMEOUT_OPTIONS.indexOf(
            screensaverTimeoutSec as (typeof SCREENSAVER_TIMEOUT_OPTIONS)[number]
          ) +
            1) %
            SCREENSAVER_TIMEOUT_OPTIONS.length
        ] ?? 30
      );
      void nextTimeoutLabel;
      return [
        {
          id: 'ss-timeout',
          label: 'Tempo para ativar (música / rádio)',
          value: formatScreensaverTimeout(screensaverTimeoutSec),
          selected: screensaverTimeoutSec > 0,
          onSelect: onCycleScreensaverTimeout,
        },
        {
          id: 'ss-viz',
          label: 'Visualizador (estilo WMP)',
          value: SCREENSAVER_VIZ_LABELS[screensaverVizStyle % SCREENSAVER_VIZ_LABELS.length],
          onSelect: onCycleScreensaverViz,
        },
        {
          id: 'ss-clock',
          label: 'Relógio, data e clima',
          value: screensaverShowClock ? 'Ativado' : 'Desativado',
          selected: screensaverShowClock,
          onSelect: onToggleScreensaverClock,
        },
        {
          id: 'ss-lyrics',
          label: 'Letras sobre visualizador',
          value: screensaverShowLyrics ? 'Ativado' : 'Desativado',
          selected: screensaverShowLyrics,
          onSelect: onToggleScreensaverLyrics,
        },
        {
          id: 'ss-now',
          label: 'Iniciar protetor de tela agora',
          badge: 'WMP',
          value: 'Testar ao vivo',
          onSelect: () => {
            onClose();
            onStartScreensaverNow();
          },
        },
        {
          id: 'ss-back',
          label: '← Voltar às Opções',
          hideChevron: true,
          onSelect: goBack,
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
            : reinstallArmed
            ? `CONFIRMAR: Reinstalar v${updateStatus?.currentVersion ?? '2.1.7'} mesmo assim`
            : `Reinstalar mesma versão v${updateStatus?.currentVersion ?? '2.1.7'} (com aviso)`,
          badge: updateStatus?.updateAvailable
            ? 'PRONTO'
            : reinstallArmed
            ? 'CONFIRMAR'
            : 'AVISO',
          value: updateStatus?.updateAvailable
            ? 'Preserva histórico, favoritos e listas'
            : reinstallArmed
            ? 'Pressione B novamente para confirmar'
            : 'Você já está nesta versão · preserva dados',
          onSelect: () => {
            if (updateApplying || updateChecking) return;
            if (updateStatus?.updateAvailable) {
              void onApplyUpdate(false);
            } else if (!reinstallArmed) {
              setReinstallArmed(true);
            } else {
              setReinstallArmed(false);
              void onApplyUpdate(true);
            }
          },
        },
        {
          id: 'back-root',
          label: '← Voltar às Opções',
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

    return sleepOptions.map((mins, idx) => ({
      id: `sleep-${mins}`,
      label: mins === 0 ? tr('Desativada', language) : `${mins} minutos`,
      selected: idx === sleepIdx,
      value: idx === sleepIdx ? 'Ativo' : undefined,
      onSelect: () => onSetSleepIdx(idx),
    }));
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
    homeLayoutInverted,
    playbackRate,
    eqIdx,
    eqPresets,
    sleepIdx,
    sleepOptions,
    favoriteTrackIds,
    displayModes,
    r36sDisplayMode,
    repeatLabel,
    shuffle,
    fitLabel,
    repeatMode,
    videoFit,
    activeTrack,
    radioCategoryLabel,
    goSection,
    onClose,
    onOpenTerms,
    onExitApp,
    onCheckUpdate,
    onApplyUpdate,
    reinstallArmed,
    onSetThemeIndex,
    onSetLanguage,
    onSetDisplayMode,
    onToggleHomeLayout,
    onOpenCommandsTutorial,
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
    onIptvSearch,
    onIptvCycleSource,
    onIptvRefresh,
    onIptvAddUrl,
    onRadioToggleFav,
    onRadioCycleCategory,
    onRadioRefresh,
    screensaverTimeoutSec,
    screensaverVizStyle,
    screensaverShowClock,
    screensaverShowLyrics,
    onCycleScreensaverTimeout,
    onCycleScreensaverViz,
    onToggleScreensaverClock,
    onToggleScreensaverLyrics,
    onStartScreensaverNow,
    uiSfxEnabled,
    bgAudioPreview,
    adultSectionUnlocked,
    onToggleUiSfx,
    onToggleBgAudioPreview,
    onToggleAdultSection,
    goBack,
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
    <div className="w-full h-full relative overflow-hidden flex flex-col kp-screen-enter">
      <ModernBackdrop theme={theme} />
      <HeaderBar theme={theme} section={tr('OPÇÕES', language)} location={locationLabel} />

      <div className="relative z-10 flex-1 min-h-0 px-4 @min-[540px]:px-6 pt-3 pb-3 flex flex-col w-full max-w-[780px] mx-auto">
        {/* Clean Contextual Selection-First Header */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {section !== entrySection && (
              <button
                type="button"
                onClick={goBack}
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.9),
                  border: `1px solid ${themeHairline(theme)}`,
                  color: theme.text,
                }}
                className="h-[32px] px-3 rounded-lg text-[12px] font-bold cursor-pointer shrink-0"
              >
                ← Voltar
              </button>
            )}
            <div className="min-w-0">
              <h2
                style={{ color: theme.text }}
                className="text-[20px] @min-[540px]:text-[23px] font-extrabold leading-tight truncate"
              >
                {sectionTitle}
              </h2>
              <p style={{ color: theme.muted }} className="text-[11.5px] truncate">
                {sectionSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              ...modernCardStyle(theme, false, 8),
              height: 32,
              color: theme.muted,
            }}
            className="px-3 text-[11.5px] font-bold cursor-pointer shrink-0"
          >
            SELECT · Fechar
          </button>
        </div>

        {/* Dedicated Auto-Update Info Panel when 'update' is selected */}
        {section === 'update' && (
          <div
            style={{ ...modernPanelStyle(theme, 12) }}
            className="mt-2.5 p-3 space-y-2 shrink-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div style={{ color: theme.accent }} className="text-[12.5px] font-extrabold">
                  {updateStatus?.updateAvailable
                    ? `Nova versão disponível: v${updateStatus.latestVersion}`
                    : `Versão instalada: v${updateStatus?.currentVersion ?? '2.1.7'} (mesma versão mais recente)`}
                </div>
                <div style={{ color: theme.muted }} className="text-[11.5px] mt-0.5">
                  {updateStatus?.updateAvailable
                    ? 'Pronta para baixar da pasta updates/ do GitHub e reiniciar automaticamente.'
                    : `Monitorando automaticamente v${updateStatus?.nextExpectedVersion ?? '2.1.8'} e próximas versões na pasta updates/.`}
                </div>
              </div>
              <span
                style={{ color: updateStatus?.updateAvailable ? theme.accent : theme.muted }}
                className="text-[11.5px] font-bold tabular-nums shrink-0"
              >
                {updateStatus?.source === 'github'
                  ? 'GitHub Online'
                  : updateStatus?.source === 'github-release'
                    ? 'GitHub Releases'
                    : 'Manifesto Local'}
              </span>
            </div>

            {!updateStatus?.updateAvailable && !updateApplying && (
              <div
                style={{
                  backgroundColor: reinstallArmed
                    ? 'rgba(245, 158, 11, 0.22)'
                    : 'rgba(245, 158, 11, 0.12)',
                  border: `1px solid ${
                    reinstallArmed
                      ? 'rgba(251, 191, 36, 0.85)'
                      : 'rgba(245, 158, 11, 0.42)'
                  }`,
                  color: '#fde68a',
                }}
                className="px-2.5 py-2 rounded-lg text-[11px] leading-snug font-semibold"
              >
                {reinstallArmed
                  ? `AVISO: Você já está na v${updateStatus?.currentVersion ?? '2.1.7'}. Pressione B novamente em "CONFIRMAR" para baixar e reinstalar a mesma versão (favoritos, histórico e listas serão preservados).`
                  : `Aviso: você já está na versão mais recente (v${updateStatus?.currentVersion ?? '2.1.7'}). Atualizar novamente irá reinstalar esta mesma versão preservando seus dados.`}
              </div>
            )}

            {updateStatus?.remoteStatus && updateStatus.remoteStatus !== 'ok' && updateStatus.lastError && (
              <div
                style={{
                  backgroundColor: rgbToRgba(theme.elevated, 0.7),
                  border: `1px solid ${themeHairline(theme)}`,
                  color: theme.muted,
                }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] leading-snug"
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
                className="p-2.5 rounded-lg space-y-0.5"
              >
                {updateStatus.notes.slice(0, 3).map((note, idx) => (
                  <div key={idx} style={{ color: theme.text }} className="text-[11px] leading-snug">
                    • {note}
                  </div>
                ))}
              </div>
            )}

            {/* Live KPlayer Update Loading Progress Bar */}
            <div
              style={{
                backgroundColor: rgbToRgba(theme.elevated, 0.72),
                border: `1px solid ${
                  updateChecking || updateApplying
                    ? rgbToRgba(theme.accent, 0.48)
                    : themeHairline(theme)
                }`,
              }}
              className="p-2.5 rounded-xl space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-bold">
                <span
                  style={{
                    color:
                      updateChecking || updateApplying || updateStatus?.updateAvailable
                        ? theme.accent
                        : theme.text,
                  }}
                  className="truncate"
                >
                  {updateStage ||
                    (updateApplying
                      ? 'Atualizando KPlayer...'
                      : updateChecking
                      ? 'Verificando atualizações...'
                      : updateStatus?.updateAvailable
                      ? `Atualização v${updateStatus.latestVersion} pronta para baixar`
                      : 'Sistema pronto para atualizar')}
                </span>
                <span
                  style={{
                    color:
                      updateChecking || updateApplying || updateProgress === 100
                        ? theme.accent
                        : theme.muted,
                  }}
                  className="tabular-nums shrink-0 font-extrabold"
                >
                  {Math.max(0, Math.min(100, Math.round(updateProgress)))}%
                </span>
              </div>

              <div
                style={{ backgroundColor: rgbToRgba(theme.bg, 0.9) }}
                className="w-full h-3 rounded-full overflow-hidden relative border border-white/10"
              >
                <div
                  style={{
                    width: `${Math.max(
                      updateChecking || updateApplying ? 8 : 0,
                      Math.min(100, updateProgress)
                    )}%`,
                    background: `linear-gradient(90deg, ${theme.accent}, ${rgbToRgba(theme.accent, 0.72)})`,
                    boxShadow: `0 0 14px ${rgbToRgba(theme.accent, 0.65)}`,
                  }}
                  className="h-full rounded-full transition-all duration-300 relative overflow-hidden"
                >
                  {(updateChecking || updateApplying) && (
                    <div
                      className="absolute inset-0 animate-pulse"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.42) 50%, transparent 100%)',
                      }}
                    />
                  )}
                </div>
              </div>

              <div style={{ color: theme.muted }} className="text-[11px] leading-snug truncate">
                {updateDetail ||
                  updateMessage ||
                  `Dados protegidos no update: favoritos (${favoriteTrackIds.length}), histórico (${history.length}), listas IPTV/Rádio, clima, idioma e tema.`}
              </div>
            </div>

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
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11.5px] outline-none"
              />
              <button
                type="submit"
                disabled={repoSaving}
                style={{ ...modernPillStyle(theme, true), height: 30, paddingLeft: 12, paddingRight: 12 }}
                className="text-[11px] font-extrabold cursor-pointer shrink-0 disabled:opacity-60"
              >
                {repoSaving ? '...' : 'Salvar repo'}
              </button>
            </form>
          </div>
        )}

        {/* Pure Vertical Select-First Menu List */}
        <div key={section} className="mt-2.5 flex-1 min-h-0 overflow-y-auto kp-scroll pr-1 space-y-2 kp-screen-enter">
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
                  minHeight: 46,
                }}
                className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer kp-tile-anim active:scale-[0.985] ${
                  focused ? 'translate-x-[2px]' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {entry.leadingTag && (
                    <span
                      style={{
                        backgroundColor: rgbToRgba(theme.accent, focused ? 0.25 : 0.14),
                        color: theme.accent,
                        border: `1px solid ${rgbToRgba(theme.accent, 0.45)}`,
                      }}
                      className="w-6 h-6 rounded-md text-[13px] font-extrabold flex items-center justify-center shrink-0"
                    >
                      {entry.leadingTag}
                    </span>
                  )}
                  {entry.accentDot && (
                    <span
                      style={{ backgroundColor: entry.accentDot }}
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                    />
                  )}
                  <span
                    style={{ color: focused || entry.selected ? theme.accent : theme.text }}
                    className="text-[15px] @min-[520px]:text-[16px] font-bold truncate"
                  >
                    {entry.label}
                  </span>
                  {entry.badge && (
                    <span
                      style={{
                        backgroundColor: theme.accent,
                        color: theme.bg,
                      }}
                      className="px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0"
                    >
                      {entry.badge}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 max-w-[46%]">
                  {entry.value && (
                    <span
                      style={{ color: entry.selected ? theme.accent : theme.muted }}
                      className="text-[13px] @min-[520px]:text-[14px] font-medium truncate text-right"
                    >
                      {entry.value}
                    </span>
                  )}
                  {!entry.hideChevron && (
                    <span style={{ color: focused ? theme.accent : theme.dim }} className="text-[15px] font-bold shrink-0">
                      {entry.selected ? '✓' : '›'}
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
