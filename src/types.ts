export type LanguageCode = 0 | 1 | 2; // 0 = pt-BR, 1 = en, 2 = es

export type ScreenMode =
  | 'boot'
  | 'welcome'
  | 'terms'
  | 'notice'
  | 'home'
  | 'library'
  | 'music'
  | 'video'
  | 'radio'
  | 'iptv'
  | 'football'
  | 'options';

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

export type IptvSourceKey = 'canais' | 'filmes' | 'series' | 'usuario';

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
