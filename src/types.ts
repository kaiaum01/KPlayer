export type LanguageCode = 0 | 1 | 2; // 0 = pt-BR, 1 = en, 2 = es

export type ScreenMode =
  | 'welcome'
  | 'terms'
  | 'home'
  | 'library'
  | 'music'
  | 'video'
  | 'radio'
  | 'iptv'
  | 'football'
  | 'youtube'
  | 'options';

export interface YoutubeItem {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

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

export interface IptvChannel {
  name: string;
  url: string;
  logo: string;
  group: string;
  id: string;
}

export interface FootballMatch {
  league: string;
  home: string;
  score: string;
  away: string;
  status: string;
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
