export type LanguageCode = 0 | 1 | 2; // 0 = pt-BR, 1 = en, 2 = es

export type ScreenMode =
  | 'boot'
  | 'welcome'
  | 'tutorial'
  | 'changelog'
  | 'terms'
  | 'notice'
  | 'home'
  | 'library'
  | 'filemanager'
  | 'music'
  | 'video'
  | 'radio'
  | 'iptv'
  | 'news'
  | 'football'
  | 'weather'
  | 'options';

export type OptionsContext = 'general' | 'video' | 'music' | 'iptv' | 'radio';

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface MediaTrack {
  id: string;
  name: string;
  title: string;
  artist: string;
  album: string;
  kind: 'audio' | 'video';
  format: string;
  sizeBytes: number;
  durationMs: number;
  sampleRate?: number;
  channels?: number;
  bitrateKbps?: number;
  url?: string;
  isDemoSynth?: boolean;
  folder: string;
  coverUrl?: string;
  lyrics?: LyricLine[];
  plainLyrics?: string[];
}

export interface RadioStation {
  uuid: string;
  name: string;
  url: string;
  tags: string;
  country: string;
  codec: string;
  favicon: string;
  bitrate: number;
  isUser?: boolean;
}

export type IptvSourceKey = 'canais' | 'filmes' | 'series' | 'usuario' | 'adult18' | 'xvideos';

export interface IptvCategory {
  id: string;
  name: string;
  count: number;
  section: string;
}

export interface UserPlaylistSource {
  kind: 'url' | 'file';
  name: string;
  target: string;
}

export interface EpgProgram {
  title: string;
  desc?: string;
  category?: string;
  startMs: number;
  stopMs: number;
  startLabel: string;
  stopLabel: string;
  progressPct?: number;
}

export interface EpgChannelGuide {
  matchedChannel: string | null;
  now: EpgProgram | null;
  next: EpgProgram | null;
  schedule: EpgProgram[];
}

export interface IptvChannel {
  name: string;
  url: string;
  fallbackUrls?: string[];
  mediaType?: 'live' | 'movie' | 'series' | 'series-show';
  logo: string;
  group: string;
  id: string;
  letter?: string;
  shard?: string;
  year?: string;
  episodeCount?: number;
  season?: number;
  episode?: number;
  epgNow?: EpgProgram | null;
  epgNext?: EpgProgram | null;
}

export interface FootballMatch {
  id: string;
  leagueCode: string;
  league: string;
  region: 'br' | 'eu';
  state: 'in' | 'post' | 'pre';
  home: string;
  homeLogo: string;
  away: string;
  awayLogo: string;
  score: string;
  status: string;
  venue: string;
  preview: string;
}

export interface FootballStat {
  label: string;
  home: string;
  away: string;
  homeNum: number;
  awayNum: number;
}

export interface FootballEvent {
  minute: string;
  kind: 'goal' | 'yellow' | 'red' | 'sub' | 'other';
  team: string;
  desc: string;
}

export interface FootballPlayer {
  jersey: string;
  name: string;
  pos: string;
}

export interface FootballMatchDetail {
  venue: string;
  attendance: string;
  referee: string;
  homeForm: string;
  awayForm: string;
  homeFormation: string;
  awayFormation: string;
  stats: FootballStat[];
  events: FootballEvent[];
  homeLineup: FootballPlayer[];
  awayLineup: FootballPlayer[];
}

export type RepeatMode = 0 | 1 | 2; // 0 = off, 1 = track, 2 = queue
export type VideoFit = 0 | 1 | 2; // 0 = contain, 1 = cover, 2 = fill

export type EqPresetName =
  | 'Desativada'
  | 'Flat'
  | 'Bass Boost'
  | 'Rock'
  | 'Pop'
  | 'Jazz'
  | 'Classical'
  | 'Electronic';

export interface AppUpdateArtifact {
  filename: string;
  path: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion: string;
  nextExpectedVersion: string;
  updateAvailable: boolean;
  repository: string;
  branch: string;
  updatesFolderUrl: string;
  releasePageUrl?: string;
  releasedAt: string;
  notes: string[];
  preserveUserPaths: string[];
  source: 'github' | 'github-release' | 'local';
  remoteStatus?: 'ok' | 'unconfigured' | 'not_found' | 'network_error';
  lastError?: string;
  checkedAt: number;
  r36s?: AppUpdateArtifact;
  android?: AppUpdateArtifact;
}

export interface PlaybackHistoryEntry {
  kind: 'audio' | 'video' | 'radio' | 'iptv';
  title: string;
  subtitle?: string;
  playedAt: number;
}

export type WeatherMode = 'unset' | 'ip' | 'manual';

export interface WeatherLocation {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherHourlyPoint {
  time: string;
  hourLabel: string;
  temp: number;
  weatherCode: number;
  precipProb: number;
  isDay: boolean;
}

export interface WeatherDailyPoint {
  date: string;
  dayLabel: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProbMax: number;
  uvMax: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  location: WeatherLocation;
  fetchedAt: number;
  current: {
    temp: number;
    apparentTemp: number;
    humidity: number;
    windSpeed: number;
    pressure: number;
    precipitation: number;
    weatherCode: number;
    isDay: boolean;
  };
  hourly: WeatherHourlyPoint[];
  daily: WeatherDailyPoint[];
}

export type NewsCategoryKey = 'all' | 'breaking' | 'world' | 'crime' | 'entertainment' | 'sports';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  source: string;
  pubDate: string;
  category: Exclude<NewsCategoryKey, 'all'>;
  categoryLabel: string;
  imageUrl: string;
  videoUrl?: string;
  link: string;
}



