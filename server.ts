import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { gunzipSync, inflateSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const HOST = '0.0.0.0';

interface RadioStation {
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

interface EpgProgram {
  title: string;
  desc?: string;
  category?: string;
  startMs: number;
  stopMs: number;
  startLabel: string;
  stopLabel: string;
  progressPct?: number;
}

interface IptvChannel {
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

interface IptvCategory {
  id: string;
  name: string;
  count: number;
  section: string;
}

interface UserPlaylistSource {
  kind: 'url' | 'file';
  name: string;
  target: string;
}

interface FootballMatch {
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

interface FootballMatchDetail {
  venue: string;
  attendance: string;
  referee: string;
  homeForm: string;
  awayForm: string;
  homeFormation: string;
  awayFormation: string;
  stats: Array<{ label: string; home: string; away: string; homeNum: number; awayNum: number }>;
  events: Array<{ minute: string; kind: 'goal' | 'yellow' | 'red' | 'sub' | 'other'; team: string; desc: string }>;
  homeLineup: Array<{ jersey: string; name: string; pos: string }>;
  awayLineup: Array<{ jersey: string; name: string; pos: string }>;
}

const radioCache = new Map<string, { ts: number; data: RadioStation[] }>();
const iptvCache = new Map<string, { ts: number; data: IptvChannel[] }>();
let footballCache: { ts: number; data: FootballMatch[] } | null = null;
const footballDetailCache = new Map<string, { ts: number; data: FootballMatchDetail }>();

function isSafeExternalUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function parsePlsOrM3u(filename: string, content: string): RadioStation[] {
  const baseName = filename.replace(/\.(pls|m3u8?|asx)$/i, '').replace(/_/g, ' ');
  const lines = content.split(/\r?\n/);
  const urls: { name: string; url: string }[] = [];
  let pendingTitle = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const fileMatch = line.match(/^File\d+\s*=\s*(https?:\/\/\S+)/i);
    if (fileMatch) {
      urls.push({ name: pendingTitle || baseName, url: fileMatch[1].trim() });
      pendingTitle = '';
      continue;
    }
    const titleMatch = line.match(/^Title\d+\s*=\s*(.+)$/i);
    if (titleMatch) {
      pendingTitle = titleMatch[1].trim();
      continue;
    }
    if (line.toUpperCase().startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      if (comma >= 0) pendingTitle = line.slice(comma + 1).trim();
      continue;
    }
    if (/^https?:\/\/\S+$/i.test(line)) {
      urls.push({ name: pendingTitle || baseName, url: line });
      pendingTitle = '';
    }
  }

  return urls.map((u, i) => ({
    uuid: `user-${filename}-${i}`,
    name: u.name || baseName,
    url: u.url,
    tags: 'Rádio do Usuário',
    country: 'Internet',
    codec: 'STREAM',
    favicon: '',
    bitrate: 0,
    isUser: true,
  }));
}

function parseIptvM3u(content: string, defaultGroup = ''): IptvChannel[] {
  const lines = content.split(/\r?\n/);
  const out: IptvChannel[] = [];
  let name = '';
  let logo = '';
  let group = '';
  let id = '';

  const attr = (line: string, key: string) => {
    const m = line.match(new RegExp(`${key}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\ufeff/, '').trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith('#EXTINF:')) {
      const comma = line.indexOf(',');
      name = comma >= 0 ? line.slice(comma + 1).trim() : '';
      logo = attr(line, 'tvg-logo');
      group = attr(line, 'group-title');
      id = attr(line, 'tvg-id');
    } else if (!line.startsWith('#') && /^https?:\/\/\S+$/i.test(line)) {
      out.push({
        name: name || `Canal ${out.length + 1}`,
        url: line,
        mediaType: 'live',
        logo,
        group: group || defaultGroup,
        id,
      });
      name = '';
      logo = '';
      group = '';
      id = '';
    }
  }
  return out;
}

const SAIMO_CANAIS_BASE = 'https://canais-saimo.pages.dev/';
const SAIMO_FILMES_BASE = 'https://filmes-saimo.pages.dev/';

async function fetchTextTimeout(url: string, timeoutMs = 14_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'KPlayer-R36S/2.1.5' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function resolveSaimoToken(token: string, bases: Map<string, string>): string {
  const t = token.trim();
  if (!t) return '';
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return t.includes('desativado.invalid') ? '' : t;
  }
  const colon = t.indexOf(':');
  if (colon <= 0) return '';
  const bid = t.slice(0, colon).trim();
  let rest = t.slice(colon + 1).trim();
  const base = bases.get(bid);
  if (!base || !rest || base.includes('desativado.invalid')) return '';
  const low = rest.toLowerCase();
  if (!low.includes('.mp4') && !low.includes('.m3u8') && !low.includes('.mkv') && !low.includes('.ts') && !low.includes('?')) {
    rest += '.mp4';
  }
  return base + rest;
}

function rankSaimoUrls(tokens: string[], bases: Map<string, string>): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const tok of tokens) {
    const u = resolveSaimoToken(tok, bases);
    if (u && !seen.has(u)) {
      seen.add(u);
      resolved.push(u);
    }
  }
  resolved.sort((a, b) => {
    const score = (u: string) => {
      let s = 0;
      if (u.startsWith('https://')) s += 4;
      if (u.includes('nixplay')) s += 3;
      if (u.toLowerCase().endsWith('.mp4') || u.toLowerCase().includes('.m3u8')) s += 2;
      return s;
    };
    return score(b) - score(a);
  });
  return resolved;
}

function parseSaimoMovieUrls(cols: string[], bases: Map<string, string>): { urls: string[]; lang: string } {
  const dubTokens: string[] = [];
  const legTokens: string[] = [];
  for (const raw of cols) {
    const col = raw.trim();
    if (col.startsWith('dub=')) dubTokens.push(...col.slice(4).split(','));
    else if (col.startsWith('leg=')) legTokens.push(...col.slice(4).split(','));
  }
  const dub = rankSaimoUrls(dubTokens, bases);
  const leg = rankSaimoUrls(legTokens, bases);
  if (dub.length > 0) {
    const merged = [...dub, ...leg.filter((u) => !dub.includes(u))];
    return { urls: merged, lang: 'DUB' };
  }
  if (leg.length > 0) return { urls: leg, lang: 'LEG' };
  return { urls: [], lang: '' };
}

function saimoLetterSlug(letter: string): string {
  const ch = letter.trim().toUpperCase();
  return ch.length === 1 && ch >= 'A' && ch <= 'Z' ? ch : '%23';
}

function saimoLetterForTitle(title: string): string {
  const s = title.trim();
  if (!s) return '#';
  const ch = s[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return ch >= 'A' && ch <= 'Z' ? ch : '#';
}

function saimoNormTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s*\(\d{4}\)\s*$/, '');
}

const SAIMO_CAT_LABELS: Record<string, string> = {
  anime: 'Animes',
  dorama: 'Doramas',
  kids: 'Kids',
  novela: 'Novelas',
};

interface SaimoMeta {
  ts: number;
  bases: Map<string, string>;
  letters: Array<{ letter: string; movieCount: number; seriesCount: number }>;
  featured: Array<{
    kind: 'f' | 's';
    title: string;
    letter: string;
    year: string;
    logo: string;
    shelf: string;
  }>;
  posterByMovie: Map<string, string>;
  yearByMovie: Map<string, string>;
  posterBySeries: Map<string, string>;
  categories: Array<{ kind: 'f' | 's'; title: string; cats: string[] }>;
  genres: Array<{ kind: 'f' | 's'; title: string; gens: string[] }>;
}

let saimoMetaCache: SaimoMeta | null = null;
const saimoMovieLetterCache = new Map<
  string,
  { ts: number; items: Array<{ title: string; urls: string[]; lang: string }> }
>();
const saimoSeriesLetterCache = new Map<
  string,
  { ts: number; items: Array<{ title: string; year: string; shard: string; episodeCount: number }> }
>();
const saimoSeriesShardCache = new Map<
  string,
  {
    ts: number;
    blocks: Map<string, Array<{ season: number; ep: number; lang: string; urls: string[] }>>;
  }
>();

const USER_IPTV_DIR = path.resolve(__dirname, 'ports', 'kplayer', 'iptv_usuario');
const LEGACY_IPTV_DIR = path.resolve(__dirname, 'ports', 'kplayer', 'iptv');
const USER_IPTV_PLAYLISTS_FILE = path.join(USER_IPTV_DIR, 'playlists.txt');
let userIptvCache: { ts: number; channels: IptvChannel[]; playlists: UserPlaylistSource[] } | null = null;

function sanitizeUserFilename(raw: string): string {
  const base = path.basename(raw || 'lista.m3u').replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  const noLeadingDots = base.replace(/^\.+/, '') || 'lista';
  const hasExt = /\.(m3u8?|txt)$/i.test(noLeadingDots);
  const withExt = hasExt ? noLeadingDots : `${noLeadingDots}.m3u`;
  const low = withExt.toLowerCase();
  if (low === 'playlists.txt' || low === 'readme.txt') {
    return `usuario_${withExt}`;
  }
  return withExt.slice(0, 96);
}

async function readUserPlaylistUrls(): Promise<Array<{ name: string; url: string }>> {
  await fs.mkdir(USER_IPTV_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(USER_IPTV_PLAYLISTS_FILE, 'utf8');
    const out: Array<{ name: string; url: string }> = [];
    const seen = new Set<string>();
    for (const lineRaw of raw.split(/\r?\n/)) {
      const line = lineRaw.trim();
      if (!line || line.startsWith('#')) continue;
      let name = '';
      let url = line;
      const tabIdx = line.indexOf('\t');
      if (tabIdx >= 0) {
        name = line.slice(0, tabIdx).trim();
        url = line.slice(tabIdx + 1).trim();
      }
      if (!isSafeExternalUrl(url) || seen.has(url)) continue;
      seen.add(url);
      if (!name) {
        try {
          name = new URL(url).hostname || 'Lista IPTV';
        } catch {
          name = 'Lista IPTV';
        }
      }
      out.push({ name, url });
    }
    return out;
  } catch {
    return [];
  }
}

async function writeUserPlaylistUrls(list: Array<{ name: string; url: string }>): Promise<void> {
  await fs.mkdir(USER_IPTV_DIR, { recursive: true });
  const content = list.map((item) => `${item.name.replace(/[\r\n\t]/g, ' ').trim()}\t${item.url.trim()}`).join('\n');
  await fs.writeFile(USER_IPTV_PLAYLISTS_FILE, content ? `${content}\n` : '', 'utf8');
}

async function loadUserIptvAll(force = false): Promise<{
  channels: IptvChannel[];
  playlists: UserPlaylistSource[];
}> {
  if (!force && userIptvCache && Date.now() - userIptvCache.ts < 5 * 60_000) {
    return { channels: userIptvCache.channels, playlists: userIptvCache.playlists };
  }
  await fs.mkdir(USER_IPTV_DIR, { recursive: true });

  const channels: IptvChannel[] = [];
  const seenUrls = new Set<string>();
  const playlists: UserPlaylistSource[] = [];

  // 1) Local playlist files from ports/kplayer/iptv_usuario/ and non-hidden files in ports/kplayer/iptv/
  const scanDirs = [
    { dir: USER_IPTV_DIR, trackInUi: true },
    { dir: LEGACY_IPTV_DIR, trackInUi: false },
  ];
  for (const { dir, trackInUi } of scanDirs) {
    try {
      const files = (await fs.readdir(dir)).sort();
      for (const file of files) {
        if (file.startsWith('.')) continue;
        const low = file.toLowerCase();
        if (low === 'readme.txt' || low === 'playlists.txt') continue;
        if (!/\.(m3u8?|txt)$/i.test(low)) continue;
        const full = path.resolve(dir, file);
        if (!full.startsWith(dir + path.sep)) continue;
        const stat = await fs.stat(full);
        if (!stat.isFile()) continue;
        if (trackInUi) {
          playlists.push({ kind: 'file', name: file, target: file });
        }
        const content = await fs.readFile(full, 'utf8');
        const defaultGroup = file.replace(/\.(m3u8?|txt)$/i, '').replace(/_/g, ' ').trim() || 'Minha Lista';
        for (const ch of parseIptvM3u(content, defaultGroup)) {
          if (!seenUrls.has(ch.url)) {
            seenUrls.add(ch.url);
            channels.push(ch);
          }
        }
      }
    } catch {
      // Directory missing
    }
  }

  // 2) Remote playlist URLs persisted in ports/kplayer/iptv_usuario/playlists.txt
  const urlItems = await readUserPlaylistUrls();
  for (const item of urlItems) {
    playlists.push({ kind: 'url', name: item.name, target: item.url });
  }
  await Promise.all(
    urlItems.map(async (item) => {
      try {
        const content = await fetchTextTimeout(item.url, 18_000);
        for (const ch of parseIptvM3u(content, item.name)) {
          if (!seenUrls.has(ch.url)) {
            seenUrls.add(ch.url);
            channels.push(ch);
          }
        }
      } catch {
        // Skip unreachable playlist
      }
    })
  );

  userIptvCache = { ts: Date.now(), channels, playlists };
  return { channels, playlists };
}

interface StreamHeadersMeta {
  referer?: string;
  userAgent?: string;
}

const streamHeaderMap = new Map<string, StreamHeadersMeta>();
const streamHostHeaderMap = new Map<string, StreamHeadersMeta>();

function normalizeCanaisKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\bchannel\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeReserveGroup(raw: string): string {
  const low = raw.trim().toLowerCase();
  if (!low) return 'Canais';
  if (low === 'esportes' || low === 'espn') return 'Esportes';
  if (low === 'filmes e séries' || low === 'filmes e series') return 'Filmes e Séries';
  return raw.trim();
}

function parseSaimoCatalogo(text: string): IptvChannel[] {
  interface RawSource {
    url: string;
    referer: string;
    agent: string;
    key: string;
    quality: string;
    order: number;
  }
  interface RawChannel {
    name: string;
    group: string;
    logo: string;
    sources: RawSource[];
  }

  const parsed: RawChannel[] = [];
  let cur: RawChannel | null = null;
  let curSrc: RawSource | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === 'canal') {
      if (cur && cur.sources.length > 0) parsed.push(cur);
      cur = { name: val || 'Canal', group: 'Canais', logo: '', sources: [] };
      curSrc = null;
    } else if (cur) {
      if (key === 'categoria' && val) {
        cur.group = val;
      } else if (key === 'logo' && val) {
        cur.logo = val;
      } else if (key === 'fonte' && (val.startsWith('http://') || val.startsWith('https://'))) {
        curSrc = {
          url: val,
          referer: '',
          agent: '',
          key: '',
          quality: '',
          order: cur.sources.length,
        };
        cur.sources.push(curSrc);
      } else if (curSrc) {
        if (key === 'referer' && val) curSrc.referer = val;
        else if (key === 'agente' && val) curSrc.agent = val;
        else if (key === 'chave' && val) curSrc.key = val;
        else if (key === 'qualidade' && val) curSrc.quality = val;
      }
    }
  }
  if (cur && cur.sources.length > 0) parsed.push(cur);

  const scoreSource = (s: RawSource): number => {
    const low = s.url.toLowerCase();
    const hasKey = s.key.length > 0;
    const isMpd = low.includes('.mpd');
    const isM3u8 = low.includes('.m3u8');
    const isErrorTxt = low.endsWith('/error.txt');
    let score = 0;
    if (hasKey || isMpd) score -= 50;
    else if (isM3u8 && !s.referer) score += 30;
    else if (isM3u8 && s.referer) score += 24;
    else if (isErrorTxt) score += 12;
    else score += 16;
    if (s.url.startsWith('https://')) score += 2;
    return score;
  };

  const out: IptvChannel[] = [];
  for (const ch of parsed) {
    const ranked = [...ch.sources].sort((a, b) => scoreSource(b) - scoreSource(a) || a.order - b.order);
    const urls: string[] = [];
    let bestQuality = '';
    for (const s of ranked) {
      if (!urls.includes(s.url)) urls.push(s.url);
      if (!bestQuality && s.quality) bestQuality = s.quality;
      if (s.referer || s.agent) {
        const meta: StreamHeadersMeta = {
          ...(s.referer ? { referer: s.referer } : {}),
          ...(s.agent ? { userAgent: s.agent } : {}),
        };
        streamHeaderMap.set(s.url, meta);
        try {
          const host = new URL(s.url).host;
          if (host) streamHostHeaderMap.set(host, meta);
        } catch {
          // ignore malformed URL
        }
      }
    }
    if (urls.length === 0) continue;
    out.push({
      name: ch.name,
      url: urls[0],
      fallbackUrls: urls.slice(1),
      mediaType: 'live',
      logo: ch.logo,
      group: ch.group || 'Canais',
      id: bestQuality || `${urls.length} fontes`,
    });
  }
  return out;
}

const RAMYS_IPTV_BR_URL =
  'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Canais.m3u8';

function cleanRamysGroup(raw: string): string {
  const stripped = raw
    .replace(/^CANAIS\s*:\s*/i, '')
    .replace(/[^\p{L}\p{N}\s+&-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return 'IPTV Brasil 2026';
  const low = stripped.toLowerCase();
  const map: Record<string, string> = {
    'filmes e series': 'Filmes e Séries',
    'filmes e séries': 'Filmes e Séries',
    'documentarios': 'Documentários',
    'documentários': 'Documentários',
    'esportes': 'Esportes',
    'noticias': 'Notícias',
    'notícias': 'Notícias',
    'infantis': 'Infantil',
    'variedades': 'Variedades',
    'abertos': 'TV Aberta',
    'musica': 'Música',
    'música': 'Música',
    'religiosos': 'Religiosos',
    'band': 'TV Aberta',
    'record': 'TV Aberta',
    'sbt': 'TV Aberta',
    'redetv': 'TV Aberta',
    'sportv': 'Esportes',
    'espn': 'Esportes',
    'premiere': 'Esportes',
    'ppv / esportes': 'Esportes',
    'paramount + libertadores': 'Esportes',
    'prime video': 'Esportes',
    'hbo': 'Filmes e Séries',
    'telecine': 'Filmes e Séries',
    'cine sky': 'Filmes e Séries',
    'discovery': 'Documentários',
    'novelas globoplay': 'Novelas',
  };
  return map[low] ?? stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanRamysChannelName(raw: string): string {
  return (
    raw
      .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+/g, ' ')
      .replace(/\b(FHD|UHD|4K|HD|SD|H\.?265|HEVC)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || raw.trim()
  );
}

async function loadSaimoCanais(force = false): Promise<IptvChannel[]> {
  const cached = iptvCache.get('canais');
  if (!force && cached && Date.now() - cached.ts < 10 * 60_000) {
    return cached.data;
  }
  const [catalogoText, reserveText, ramysText] = await Promise.all([
    fetchTextTimeout(`${SAIMO_CANAIS_BASE}catalogo.txt`, 18_000).catch(() => ''),
    fetchTextTimeout(`${SAIMO_CANAIS_BASE}canais.txt`, 12_000).catch(() => ''),
    fetchTextTimeout(RAMYS_IPTV_BR_URL, 14_000).catch(() => ''),
  ]);

  const channels = catalogoText ? parseSaimoCatalogo(catalogoText) : [];
  const byNorm = new Map<string, IptvChannel>();
  for (const ch of channels) {
    byNorm.set(normalizeCanaisKey(ch.name), ch);
  }

  if (reserveText) {
    const reserves = parseIptvM3u(reserveText, 'Canais');
    for (const r of reserves) {
      const nk = normalizeCanaisKey(r.name);
      const existing = byNorm.get(nk);
      if (existing) {
        const allUrls = [existing.url, ...(existing.fallbackUrls ?? [])];
        if (!allUrls.includes(r.url)) {
          existing.fallbackUrls = [...(existing.fallbackUrls ?? []), r.url];
        }
        if (!existing.logo && r.logo) existing.logo = r.logo;
      } else {
        const added: IptvChannel = {
          ...r,
          mediaType: 'live',
          group: normalizeReserveGroup(r.group),
        };
        channels.push(added);
        byNorm.set(nk, added);
      }
    }
  }

  // Merge verified Ramys/Iptv-Brasil-2026 Canais.m3u8 alongside existing channels
  if (ramysText) {
    const ramysRaw = parseIptvM3u(ramysText, 'IPTV Brasil 2026');
    // Prefer standard H.264 streams over H.265 for widest browser & R36S compatibility
    ramysRaw.sort((a, b) => {
      const aHevc = /265|hevc/i.test(a.name) ? 1 : 0;
      const bHevc = /265|hevc/i.test(b.name) ? 1 : 0;
      return aHevc - bHevc;
    });
    for (const r of ramysRaw) {
      const cleanName = cleanRamysChannelName(r.name);
      const nk = normalizeCanaisKey(cleanName);
      if (!nk) continue;
      const existing = byNorm.get(nk);
      if (existing) {
        const allUrls = [existing.url, ...(existing.fallbackUrls ?? [])];
        if (!allUrls.includes(r.url) && allUrls.length < 8) {
          existing.fallbackUrls = [...(existing.fallbackUrls ?? []), r.url];
        }
        if (!existing.logo && r.logo) existing.logo = r.logo;
      } else {
        const added: IptvChannel = {
          name: cleanName,
          url: r.url,
          fallbackUrls: [],
          mediaType: 'live',
          logo: r.logo,
          group: cleanRamysGroup(r.group),
          id: r.id || 'IPTV Brasil 2026',
        };
        channels.push(added);
        byNorm.set(nk, added);
      }
    }
  }

  if (channels.length > 0) {
    iptvCache.set('canais', { ts: Date.now(), data: channels });
  }
  return channels.length > 0 ? channels : cached?.data ?? [];
}

// ==================== LIVE XMLTV EPG ENGINE (BRASIL + USER URL-TVG) ====================

const DEFAULT_EPG_FEEDS = [
  'https://epgshare01.online/epgshare01/epg_ripper_BR1.xml.gz',
  'https://epgshare01.online/epgshare01/epg_ripper_BR2.xml.gz',
];

interface RawEpgProg {
  startMs: number;
  stopMs: number;
  title: string;
  desc: string;
  category: string;
}

interface EpgIndex {
  ts: number;
  channelCount: number;
  displayById: Map<string, string>;
  keyToIds: Map<string, string[]>;
  compactToIds: Map<string, string[]>;
  progsById: Map<string, RawEpgProg[]>;
}

let epgIndexCache: EpgIndex | null = null;
let epgInflightPromise: Promise<EpgIndex> | null = null;

function pushUniqueMapId(map: Map<string, string[]>, key: string, id: string): void {
  if (!key) return;
  let arr = map.get(key);
  if (!arr) {
    arr = [id];
    map.set(key, arr);
  } else if (!arr.includes(id)) {
    arr.push(id);
  }
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEpgKey(raw: string): string {
  let s = decodeXmlEntities(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Strip XMLTV regional prefixes like "São Paulo/SP  SporTV 2 HD ³" or "Campinas/SP..Film&Arts.br"
  s = s.replace(/^[a-z0-9 ._-]+\/[a-z]{2}[.\s]+/i, '');
  s = s.replace(/\.br$/i, '');
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ');
  s = s.replace(/\s*\[[^\]]*\]\s*/g, ' ');
  s = s.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, ' ');
  s = s.replace(/&/g, ' e ');
  s = s.replace(/[^a-z0-9+]+/g, ' ').trim();

  // Strip quality/platform suffixes
  s = s.replace(/\b(fhd|uhd|4k|hd|sd|h265|hevc|60fps|br|brasil|brazil|channel|canal|tv)\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Common Brazilian channel aliases
  s = s.replace(/^tc\s+/, 'telecine ');
  s = s.replace(/^spor\s+tv\b/, 'sportv');
  s = s.replace(/^rede\s+globo\b/, 'globo');
  s = s.replace(/^bandeirantes\b/, 'band');
  s = s.replace(/^recordtv\b/, 'record');
  s = s.replace(/^globonews\b/, 'globo news');
  s = s.replace(/^premiere\s+(clubes|fc)\b/, 'premiere');

  return s.replace(/\s+/g, ' ').trim();
}

function parseXmltvDate(raw: string): number {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return 0;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const min = Number(m[5]);
  const sec = Number(m[6]);
  let utcMs = Date.UTC(year, month, day, hour, min, sec);
  if (m[7]) {
    const sign = m[7] === '+' ? 1 : -1;
    const offMin = Number(m[8]) * 60 + Number(m[9]);
    utcMs -= sign * offMin * 60_000;
  }
  return utcMs;
}

const brTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatBrClock(ms: number): string {
  try {
    return brTimeFormatter.format(new Date(ms));
  } catch {
    return '--:--';
  }
}

async function fetchXmltvTextBounded(url: string, timeoutMs = 15_000): Promise<string> {
  if (!isSafeExternalUrl(url)) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'KPlayer-EPG/2.1.5' },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const contentLen = Number(res.headers.get('content-length') || '0');
    if (contentLen > 12 * 1024 * 1024) return '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 12 * 1024 * 1024) return '';
    const isGzip = buf.byteLength >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
    if (isGzip) {
      const out = gunzipSync(buf, { maxOutputLength: 28 * 1024 * 1024 });
      return out.toString('utf8');
    }
    return buf.toString('utf8');
  } catch {
    clearTimeout(timer);
    return '';
  }
}

function parseXmltvIntoIndex(xml: string, index: EpgIndex, nowMs: number): void {
  const windowStart = nowMs - 3 * 60 * 60_000;
  const windowEnd = nowMs + 24 * 60 * 60_000;

  // 1) Parse <channel id="..."> ... <display-name>...</display-name> </channel>
  const chRe = /<channel\s+[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = chRe.exec(xml)) !== null) {
    const rawId = decodeXmlEntities(cm[1]);
    const body = cm[2];
    if (!rawId) continue;

    const names: string[] = [rawId];
    const dnRe = /<display-name[^>]*>([\s\S]*?)<\/display-name>/gi;
    let dm: RegExpExecArray | null;
    let bestDisplay = rawId;
    while ((dm = dnRe.exec(body)) !== null) {
      const decoded = decodeXmlEntities(dm[1]);
      if (decoded) {
        if (bestDisplay === rawId) bestDisplay = decoded;
        names.push(decoded);
      }
    }

    if (!index.displayById.has(rawId)) {
      index.displayById.set(rawId, bestDisplay);
    }

    pushUniqueMapId(index.keyToIds, rawId.toLowerCase(), rawId);

    for (const candidate of names) {
      const nk = normalizeEpgKey(candidate);
      if (!nk) continue;
      pushUniqueMapId(index.keyToIds, nk, rawId);
      const compact = nk.replace(/\s+/g, '');
      if (compact) pushUniqueMapId(index.compactToIds, compact, rawId);
    }
  }

  // 2) Parse <programme ...> ... </programme> within active 27h window
  const progRe = /<programme\s+([^>]+)>([\s\S]*?)<\/programme>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = progRe.exec(xml)) !== null) {
    const attrs = pm[1];
    const body = pm[2];
    const startMatch = attrs.match(/start="([^"]+)"/i);
    const stopMatch = attrs.match(/stop="([^"]+)"/i);
    const chMatch = attrs.match(/channel="([^"]+)"/i);
    if (!startMatch || !stopMatch || !chMatch) continue;

    const startMs = parseXmltvDate(startMatch[1]);
    const stopMs = parseXmltvDate(stopMatch[1]);
    if (!startMs || !stopMs || stopMs <= windowStart || startMs >= windowEnd) continue;

    const rawId = decodeXmlEntities(chMatch[1]);
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
    if (!title) continue;

    const descMatch = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
    const catMatch = body.match(/<category[^>]*>([\s\S]*?)<\/category>/i);

    let list = index.progsById.get(rawId);
    if (!list) {
      list = [];
      index.progsById.set(rawId, list);
    }
    list.push({
      startMs,
      stopMs,
      title: title.slice(0, 140),
      desc: descMatch ? decodeXmlEntities(descMatch[1]).slice(0, 320) : '',
      category: catMatch ? decodeXmlEntities(catMatch[1]).slice(0, 64) : '',
    });
  }
}

async function loadEpgIndex(force = false): Promise<EpgIndex> {
  const nowMs = Date.now();
  if (!force && epgIndexCache && nowMs - epgIndexCache.ts < 3 * 60 * 60_000) {
    return epgIndexCache;
  }
  if (!force && epgInflightPromise) {
    return epgInflightPromise;
  }

  epgInflightPromise = (async () => {
    const index: EpgIndex = {
      ts: Date.now(),
      channelCount: 0,
      displayById: new Map(),
      keyToIds: new Map(),
      compactToIds: new Map(),
      progsById: new Map(),
    };

    const xmlList = await Promise.all(
      DEFAULT_EPG_FEEDS.map((u) => fetchXmltvTextBounded(u, 16_000))
    );

    const parseNow = Date.now();
    for (const xml of xmlList) {
      if (xml) parseXmltvIntoIndex(xml, index, parseNow);
    }

    for (const list of index.progsById.values()) {
      list.sort((a, b) => a.startMs - b.startMs);
    }
    index.channelCount = index.displayById.size;

    if (index.channelCount > 0) {
      epgIndexCache = index;
    }
    epgInflightPromise = null;
    return epgIndexCache ?? index;
  })();

  return epgInflightPromise;
}

function pickBestEpgId(index: EpgIndex, ids: string[] | undefined, nowMs: number): string | null {
  if (!ids || ids.length === 0) return null;
  let bestId: string | null = null;
  let bestScore = -1;
  for (const id of ids) {
    const list = index.progsById.get(id);
    if (!list || list.length === 0) continue;
    const hasLive = list.some((p) => p.startMs <= nowMs && p.stopMs > nowMs);
    const score = (hasLive ? 10000 : 0) + list.length;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

function resolveEpgChannelId(index: EpgIndex, channelName: string, tvgId?: string): string | null {
  const nowMs = Date.now();
  const candidates = [tvgId, channelName].filter((x): x is string => Boolean(x && x.trim()));
  for (const raw of candidates) {
    const exactLow = raw.trim().toLowerCase();
    const hitExact = pickBestEpgId(index, index.keyToIds.get(exactLow), nowMs);
    if (hitExact) return hitExact;

    const nk = normalizeEpgKey(raw);
    if (!nk) continue;
    const hitNorm = pickBestEpgId(index, index.keyToIds.get(nk), nowMs);
    if (hitNorm) return hitNorm;

    const compact = nk.replace(/\s+/g, '');
    const hitCompact = pickBestEpgId(index, index.compactToIds.get(compact), nowMs);
    if (hitCompact) return hitCompact;
  }

  // Soft fallback: strip trailing region/number words if still unmatched (e.g. "Globo SP" -> "globo")
  const baseNorm = normalizeEpgKey(channelName);
  if (baseNorm.includes(' ')) {
    const words = baseNorm.split(' ');
    const last = words[words.length - 1];
    if (/^(sp|rj|mg|rs|ba|pr|pe|ce|df|go|sc|nacional|leste|oeste|sul|norte|1|2)$/.test(last) && words.length >= 2) {
      const shorter = words.slice(0, -1).join(' ');
      const hitShort =
        pickBestEpgId(index, index.keyToIds.get(shorter), nowMs) ||
        pickBestEpgId(index, index.compactToIds.get(shorter.replace(/\s+/g, '')), nowMs);
      if (hitShort) return hitShort;
    }
  }
  return null;
}

function toEpgProgram(p: RawEpgProg, nowMs: number, includeProgress: boolean): EpgProgram {
  const total = Math.max(1, p.stopMs - p.startMs);
  const pct = includeProgress
    ? Math.max(0, Math.min(100, Math.round(((nowMs - p.startMs) / total) * 100)))
    : undefined;
  return {
    title: p.title,
    ...(p.desc ? { desc: p.desc } : {}),
    ...(p.category ? { category: p.category } : {}),
    startMs: p.startMs,
    stopMs: p.stopMs,
    startLabel: formatBrClock(p.startMs),
    stopLabel: formatBrClock(p.stopMs),
    ...(pct !== undefined ? { progressPct: pct } : {}),
  };
}

function lookupChannelEpg(
  index: EpgIndex | null,
  channelName: string,
  tvgId?: string
): { matchedChannel: string | null; now: EpgProgram | null; next: EpgProgram | null; schedule: EpgProgram[] } {
  if (!index || index.channelCount === 0) {
    return { matchedChannel: null, now: null, next: null, schedule: [] };
  }
  const chId = resolveEpgChannelId(index, channelName, tvgId);
  if (!chId) {
    return { matchedChannel: null, now: null, next: null, schedule: [] };
  }
  const list = index.progsById.get(chId) ?? [];
  const nowMs = Date.now();
  let nowIdx = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].startMs <= nowMs && list[i].stopMs > nowMs) {
      nowIdx = i;
      break;
    }
  }
  const nowProg = nowIdx >= 0 ? toEpgProgram(list[nowIdx], nowMs, true) : null;
  let nextProg: EpgProgram | null = null;
  if (nowIdx >= 0 && nowIdx + 1 < list.length) {
    nextProg = toEpgProgram(list[nowIdx + 1], nowMs, false);
  } else {
    const upcoming = list.find((p) => p.startMs > nowMs);
    if (upcoming) nextProg = toEpgProgram(upcoming, nowMs, false);
  }
  const startSlice = nowIdx >= 0 ? nowIdx : Math.max(0, list.findIndex((p) => p.stopMs > nowMs));
  const schedule = list
    .slice(startSlice, startSlice + 18)
    .map((p, i) => toEpgProgram(p, nowMs, nowIdx >= 0 && i === 0));

  return {
    matchedChannel: index.displayById.get(chId) ?? chId,
    now: nowProg,
    next: nextProg,
    schedule,
  };
}

async function loadSaimoMeta(force = false): Promise<SaimoMeta> {
  if (!force && saimoMetaCache && Date.now() - saimoMetaCache.ts < 45 * 60_000) {
    return saimoMetaCache;
  }
  const [indiceText, destaquesText, categoriasText, generosText] = await Promise.all([
    fetchTextTimeout(`${SAIMO_FILMES_BASE}indice.txt`, 16_000),
    fetchTextTimeout(`${SAIMO_FILMES_BASE}destaques.txt`, 16_000),
    fetchTextTimeout(`${SAIMO_FILMES_BASE}categorias.txt`, 16_000).catch(() => ''),
    fetchTextTimeout(`${SAIMO_FILMES_BASE}generos.txt`, 20_000).catch(() => ''),
  ]);

  const bases = new Map<string, string>();
  const letters: Array<{ letter: string; movieCount: number; seriesCount: number }> = [];
  for (const raw of indiceText.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('base:')) {
      const parts = line.slice(5).trim().split(/\s+/);
      if (parts.length >= 2) bases.set(parts[0], parts.slice(1).join(' '));
      continue;
    }
    const cols = line.split('\t');
    if (cols.length >= 3 && cols[0].trim().length === 1 && /^\d+$/.test(cols[1].trim()) && /^\d+$/.test(cols[2].trim())) {
      letters.push({
        letter: cols[0].trim().toUpperCase(),
        movieCount: Number(cols[1].trim()),
        seriesCount: Number(cols[2].trim()),
      });
    }
  }

  let capaBase = 'https://image.tmdb.org/t/p/w342';
  let shelf = 'Em alta';
  const featured: SaimoMeta['featured'] = [];
  const posterByMovie = new Map<string, string>();
  const yearByMovie = new Map<string, string>();
  const posterBySeries = new Map<string, string>();

  for (const raw of destaquesText.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('capa:')) {
      capaBase = trimmed.slice(5).trim();
      continue;
    }
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols[0] === 'fila' && cols.length >= 2) {
      shelf = cols[1].trim() || 'Destaques';
      continue;
    }
    if ((cols[0] === 'f' || cols[0] === 's') && cols.length >= 3) {
      const kind = cols[0];
      const title = cols[1].trim();
      const letter = cols[2].trim().toUpperCase() || '#';
      const year = (cols[3] ?? '').trim();
      const poster = (cols[4] ?? '').trim();
      const logo = poster.startsWith('/') ? capaBase + poster : poster;
      featured.push({ kind, title, letter, year, logo, shelf });
      const tl = title.toLowerCase();
      if (kind === 'f') {
        if (logo) posterByMovie.set(tl, logo);
        if (year) yearByMovie.set(tl, year);
      } else if (logo) {
        posterBySeries.set(tl, logo);
      }
    }
  }

  const categories: SaimoMeta['categories'] = [];
  for (const raw of categoriasText.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length >= 3 && (cols[0] === 'f' || cols[0] === 's')) {
      const cats = cols[2].split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
      if (cats.length > 0) categories.push({ kind: cols[0], title: cols[1].trim(), cats });
    }
  }

  const genres: SaimoMeta['genres'] = [];
  for (const raw of generosText.split(/\r?\n/)) {
    if (!raw || raw.startsWith('#')) continue;
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length >= 3 && (cols[0] === 'f' || cols[0] === 's')) {
      const gens = cols[2].split(',').map((g) => g.trim()).filter(Boolean);
      if (gens.length > 0) genres.push({ kind: cols[0], title: cols[1].trim(), gens });
    }
  }

  saimoMetaCache = {
    ts: Date.now(),
    bases,
    letters,
    featured,
    posterByMovie,
    yearByMovie,
    posterBySeries,
    categories,
    genres,
  };
  return saimoMetaCache;
}

async function loadSaimoMovieLetter(
  letter: string,
  bases: Map<string, string>,
  force = false
): Promise<Array<{ title: string; urls: string[]; lang: string }>> {
  const key = letter.trim().toUpperCase() || '#';
  const cached = saimoMovieLetterCache.get(key);
  if (!force && cached && Date.now() - cached.ts < 45 * 60_000) return cached.items;
  const txt = await fetchTextTimeout(`${SAIMO_FILMES_BASE}filmes-${saimoLetterSlug(key)}.txt`, 18_000);
  const items: Array<{ title: string; urls: string[]; lang: string }> = [];
  for (const raw of txt.split(/\r?\n/)) {
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length < 2) continue;
    const title = cols[0].trim();
    const parsed = parseSaimoMovieUrls(cols.slice(1), bases);
    if (title && parsed.urls.length > 0) {
      items.push({ title, urls: parsed.urls, lang: parsed.lang });
    }
  }
  saimoMovieLetterCache.set(key, { ts: Date.now(), items });
  return items;
}

async function loadSaimoSeriesLetter(
  letter: string,
  force = false
): Promise<Array<{ title: string; year: string; shard: string; episodeCount: number }>> {
  const key = letter.trim().toUpperCase() || '#';
  const cached = saimoSeriesLetterCache.get(key);
  if (!force && cached && Date.now() - cached.ts < 45 * 60_000) return cached.items;
  const txt = await fetchTextTimeout(`${SAIMO_FILMES_BASE}series-${saimoLetterSlug(key)}.txt`, 18_000);
  const items: Array<{ title: string; year: string; shard: string; episodeCount: number }> = [];
  for (const raw of txt.split(/\r?\n/)) {
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length < 3) continue;
    const title = cols[0].trim();
    const year = cols[1].trim();
    const shard = cols[2].trim();
    const episodeCount = cols[3] && /^\d+$/.test(cols[3].trim()) ? Number(cols[3].trim()) : 0;
    if (title && shard) items.push({ title, year, shard, episodeCount });
  }
  saimoSeriesLetterCache.set(key, { ts: Date.now(), items });
  return items;
}

async function loadSaimoSeriesShard(
  letter: string,
  shard: string,
  bases: Map<string, string>,
  force = false
): Promise<Map<string, Array<{ season: number; ep: number; lang: string; urls: string[] }>>> {
  const ltr = letter.trim().toUpperCase() || '#';
  const key = `${ltr}:${shard}`;
  const cached = saimoSeriesShardCache.get(key);
  if (!force && cached && Date.now() - cached.ts < 45 * 60_000) return cached.blocks;

  const txt = await fetchTextTimeout(
    `${SAIMO_FILMES_BASE}series-${saimoLetterSlug(ltr)}-${encodeURIComponent(shard)}.txt`,
    18_000
  );
  const blocks = new Map<string, Array<{ season: number; ep: number; lang: string; urls: string[] }>>();
  let curTitle = '';
  for (const raw of txt.split(/\r?\n/)) {
    if (raw.startsWith('@')) {
      curTitle = raw.slice(1).split('\t')[0].trim().toLowerCase();
      if (!blocks.has(curTitle)) blocks.set(curTitle, []);
      continue;
    }
    if (!curTitle) continue;
    const cols = raw.replace(/\r$/, '').split('\t');
    if (cols.length < 4) continue;
    const sStr = cols[0].trim();
    const eStr = cols[1].trim();
    if (sStr === '0' && eStr === '0') continue;
    const season = Number.parseInt(sStr, 10) || 0;
    const ep = Number.parseInt(eStr, 10) || 0;
    const lang = cols[2].trim().toUpperCase();
    const urls = rankSaimoUrls(cols[3].split(','), bases);
    if (urls.length > 0) {
      blocks.get(curTitle)!.push({ season, ep, lang, urls });
    }
  }
  saimoSeriesShardCache.set(key, { ts: Date.now(), blocks });
  return blocks;
}

async function getIptvCategories(
  source: 'canais' | 'filmes' | 'series' | 'usuario',
  force = false
): Promise<{
  source: string;
  sourceUrl: string;
  totalCount: number;
  categories: IptvCategory[];
  userPlaylists?: UserPlaylistSource[];
}> {
  if (source === 'canais' || source === 'usuario') {
    let entries: IptvChannel[] = [];
    let userPlaylists: UserPlaylistSource[] | undefined;
    if (source === 'canais') {
      entries = await loadSaimoCanais(force);
    } else {
      const u = await loadUserIptvAll(force);
      entries = u.channels;
      userPlaylists = u.playlists;
    }
    const counts = new Map<string, number>();
    for (const ch of entries) {
      const g = ch.group || (source === 'canais' ? 'Canais' : 'Minha Lista');
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const categories: IptvCategory[] = [
      { id: 'all', name: 'Todos os canais', count: entries.length, section: 'Geral' },
      ...Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([g, count]) => ({ id: `grp:${g}`, name: g, count, section: 'Categorias' })),
    ];
    return {
      source,
      sourceUrl: source === 'canais' ? SAIMO_CANAIS_BASE : 'ports/kplayer/iptv_usuario/',
      totalCount: entries.length,
      categories,
      ...(userPlaylists ? { userPlaylists } : {}),
    };
  }

  const meta = await loadSaimoMeta(force);
  const kind: 'f' | 's' = source === 'filmes' ? 'f' : 's';
  const categories: IptvCategory[] = [];

  // 1) Destaques shelves
  const shelfCounts = new Map<string, number>();
  for (const d of meta.featured) {
    if (d.kind !== kind) continue;
    shelfCounts.set(d.shelf, (shelfCounts.get(d.shelf) ?? 0) + 1);
  }
  for (const [sh, count] of shelfCounts.entries()) {
    categories.push({ id: `shelf:${sh}`, name: sh, count, section: 'Destaques' });
  }

  // 2) Special categories (Animes, Doramas, Kids, Novelas)
  const catCounts = new Map<string, number>();
  for (const row of meta.categories) {
    if (row.kind !== kind) continue;
    for (const c of row.cats) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }
  for (const slug of ['anime', 'dorama', 'kids', 'novela']) {
    const count = catCounts.get(slug) ?? 0;
    if (count > 0) {
      categories.push({ id: `cat:${slug}`, name: SAIMO_CAT_LABELS[slug], count, section: 'Categorias' });
    }
  }

  // 3) TMDB Genres sorted by item count desc
  const genCounts = new Map<string, number>();
  for (const row of meta.genres) {
    if (row.kind !== kind) continue;
    for (const g of row.gens) genCounts.set(g, (genCounts.get(g) ?? 0) + 1);
  }
  for (const [g, count] of Array.from(genCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))) {
    categories.push({ id: `gen:${g}`, name: g, count, section: 'Gêneros' });
  }

  // 4) Full A-Z catalog
  let totalCount = 0;
  const prefix = kind === 'f' ? 'Filmes' : 'Séries';
  for (const row of meta.letters) {
    const count = kind === 'f' ? row.movieCount : row.seriesCount;
    totalCount += count;
    if (count > 0) {
      categories.push({ id: `az:${row.letter}`, name: `${prefix} • ${row.letter}`, count, section: 'Catálogo A-Z' });
    }
  }

  return {
    source,
    sourceUrl: SAIMO_FILMES_BASE,
    totalCount,
    categories,
  };
}

async function getIptvCategoryItems(
  source: 'canais' | 'filmes' | 'series' | 'usuario',
  catId: string,
  force = false
): Promise<IptvChannel[]> {
  if (source === 'canais' || source === 'usuario') {
    const all = source === 'canais' ? await loadSaimoCanais(force) : (await loadUserIptvAll(force)).channels;
    if (!catId || catId === 'all') return all;
    if (catId.startsWith('grp:')) {
      const target = catId.slice(4);
      return all.filter((c) => (c.group || '') === target);
    }
    return all;
  }

  const meta = await loadSaimoMeta(force);

  if (source === 'filmes') {
    if (catId.startsWith('az:')) {
      const ltr = catId.slice(3).trim().toUpperCase() || '#';
      const list = await loadSaimoMovieLetter(ltr, meta.bases, force);
      return list.map((m) => {
        const tl = m.title.toLowerCase();
        const year = meta.yearByMovie.get(tl) || '';
        return {
          name: m.title,
          url: m.urls[0],
          fallbackUrls: m.urls.slice(1),
          mediaType: 'movie' as const,
          logo: meta.posterByMovie.get(tl) || '',
          group: `Filmes • ${ltr}`,
          id: year ? `Filme • ${year} • ${m.lang}` : `Filme • ${m.lang}`,
        };
      });
    }

    if (catId.startsWith('shelf:')) {
      const shelf = catId.slice(6);
      const wanted = meta.featured.filter((d) => d.kind === 'f' && d.shelf === shelf);
      const lettersNeeded = Array.from(new Set(wanted.map((d) => d.letter)));
      const mapExact = new Map<string, { urls: string[]; lang: string }>();
      const mapNorm = new Map<string, { urls: string[]; lang: string }>();
      await Promise.all(
        lettersNeeded.map(async (ltr) => {
          try {
            const list = await loadSaimoMovieLetter(ltr, meta.bases, force);
            for (const m of list) {
              mapExact.set(`${ltr}:${m.title.toLowerCase()}`, { urls: m.urls, lang: m.lang });
              const nk = `${ltr}:${saimoNormTitle(m.title)}`;
              if (!mapNorm.has(nk)) mapNorm.set(nk, { urls: m.urls, lang: m.lang });
            }
          } catch {
            // Skip failed shard
          }
        })
      );
      const out: IptvChannel[] = [];
      for (const d of wanted) {
        const hit =
          mapExact.get(`${d.letter}:${d.title.toLowerCase()}`) ||
          mapNorm.get(`${d.letter}:${saimoNormTitle(d.title)}`);
        if (!hit) continue;
        out.push({
          name: d.title,
          url: hit.urls[0],
          fallbackUrls: hit.urls.slice(1),
          mediaType: 'movie',
          logo: d.logo,
          group: shelf,
          id: d.year ? `Filme • ${d.year} • ${hit.lang}` : `Filme • ${hit.lang}`,
        });
      }
      return out;
    }

    if (catId.startsWith('cat:') || catId.startsWith('gen:')) {
      const isCat = catId.startsWith('cat:');
      const target = isCat ? catId.slice(4).toLowerCase() : catId.slice(4);
      const grpLabel = isCat ? SAIMO_CAT_LABELS[target] || target : target;
      const titles = isCat
        ? meta.categories.filter((r) => r.kind === 'f' && r.cats.includes(target)).map((r) => r.title)
        : meta.genres.filter((r) => r.kind === 'f' && r.gens.includes(target)).map((r) => r.title);

      const byLetterExact = new Map<string, Set<string>>();
      const byLetterNorm = new Map<string, Set<string>>();
      for (const t of titles) {
        const ltr = saimoLetterForTitle(t);
        if (!byLetterExact.has(ltr)) byLetterExact.set(ltr, new Set());
        if (!byLetterNorm.has(ltr)) byLetterNorm.set(ltr, new Set());
        byLetterExact.get(ltr)!.add(t.toLowerCase());
        byLetterNorm.get(ltr)!.add(saimoNormTitle(t));
      }

      const out: IptvChannel[] = [];
      await Promise.all(
        Array.from(byLetterExact.keys()).map(async (ltr) => {
          try {
            const list = await loadSaimoMovieLetter(ltr, meta.bases, force);
            const ex = byLetterExact.get(ltr)!;
            const nm = byLetterNorm.get(ltr)!;
            for (const m of list) {
              const tl = m.title.toLowerCase();
              if (ex.has(tl) || nm.has(saimoNormTitle(m.title))) {
                const year = meta.yearByMovie.get(tl) || '';
                out.push({
                  name: m.title,
                  url: m.urls[0],
                  fallbackUrls: m.urls.slice(1),
                  mediaType: 'movie',
                  logo: meta.posterByMovie.get(tl) || '',
                  group: grpLabel,
                  id: year ? `Filme • ${year} • ${m.lang}` : `Filme • ${m.lang}`,
                });
              }
            }
          } catch {
            // Skip failed letter
          }
        })
      );
      out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return out;
    }

    return [];
  }

  // source === 'series'
  const toShow = (
    title: string,
    ltr: string,
    year: string,
    shard: string,
    episodeCount: number,
    group: string,
    logo = ''
  ): IptvChannel => ({
    name: title,
    url: '',
    mediaType: 'series-show',
    letter: ltr,
    shard,
    year,
    episodeCount,
    logo: logo || meta.posterBySeries.get(title.toLowerCase()) || '',
    group,
    id: year && episodeCount
      ? `Série • ${year} • ${episodeCount} eps`
      : episodeCount
        ? `Série • ${episodeCount} eps`
        : 'Série',
  });

  if (catId.startsWith('az:')) {
    const ltr = catId.slice(3).trim().toUpperCase() || '#';
    const list = await loadSaimoSeriesLetter(ltr, force);
    return list.map((s) => toShow(s.title, ltr, s.year, s.shard, s.episodeCount, `Séries • ${ltr}`));
  }

  if (catId.startsWith('shelf:')) {
    const shelf = catId.slice(6);
    const wanted = meta.featured.filter((d) => d.kind === 's' && d.shelf === shelf);
    const lettersNeeded = Array.from(new Set(wanted.map((d) => d.letter)));
    const mapExact = new Map<string, { year: string; shard: string; episodeCount: number }>();
    const mapNorm = new Map<string, { year: string; shard: string; episodeCount: number }>();
    await Promise.all(
      lettersNeeded.map(async (ltr) => {
        try {
          const list = await loadSaimoSeriesLetter(ltr, force);
          for (const s of list) {
            mapExact.set(`${ltr}:${s.title.toLowerCase()}`, {
              year: s.year,
              shard: s.shard,
              episodeCount: s.episodeCount,
            });
            const nk = `${ltr}:${saimoNormTitle(s.title)}`;
            if (!mapNorm.has(nk)) {
              mapNorm.set(nk, { year: s.year, shard: s.shard, episodeCount: s.episodeCount });
            }
          }
        } catch {
          // Skip failed letter
        }
      })
    );
    const out: IptvChannel[] = [];
    for (const d of wanted) {
      const hit =
        mapExact.get(`${d.letter}:${d.title.toLowerCase()}`) ||
        mapNorm.get(`${d.letter}:${saimoNormTitle(d.title)}`);
      if (!hit) continue;
      out.push(toShow(d.title, d.letter, d.year || hit.year, hit.shard, hit.episodeCount, shelf, d.logo));
    }
    return out;
  }

  if (catId.startsWith('cat:') || catId.startsWith('gen:')) {
    const isCat = catId.startsWith('cat:');
    const target = isCat ? catId.slice(4).toLowerCase() : catId.slice(4);
    const grpLabel = isCat ? SAIMO_CAT_LABELS[target] || target : target;
    const titles = isCat
      ? meta.categories.filter((r) => r.kind === 's' && r.cats.includes(target)).map((r) => r.title)
      : meta.genres.filter((r) => r.kind === 's' && r.gens.includes(target)).map((r) => r.title);

    const byLetterExact = new Map<string, Set<string>>();
    const byLetterNorm = new Map<string, Set<string>>();
    for (const t of titles) {
      const ltr = saimoLetterForTitle(t);
      if (!byLetterExact.has(ltr)) byLetterExact.set(ltr, new Set());
      if (!byLetterNorm.has(ltr)) byLetterNorm.set(ltr, new Set());
      byLetterExact.get(ltr)!.add(t.toLowerCase());
      byLetterNorm.get(ltr)!.add(saimoNormTitle(t));
    }

    const out: IptvChannel[] = [];
    await Promise.all(
      Array.from(byLetterExact.keys()).map(async (ltr) => {
        try {
          const list = await loadSaimoSeriesLetter(ltr, force);
          const ex = byLetterExact.get(ltr)!;
          const nm = byLetterNorm.get(ltr)!;
          for (const s of list) {
            if (ex.has(s.title.toLowerCase()) || nm.has(saimoNormTitle(s.title))) {
              out.push(toShow(s.title, ltr, s.year, s.shard, s.episodeCount, grpLabel));
            }
          }
        } catch {
          // Skip failed letter
        }
      })
    );
    out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return out;
  }

  return [];
}

async function fetchJsonWithFallback(paths: string[], timeoutMs = 8000): Promise<unknown> {
  let lastErr: unknown;
  for (const url of paths) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-R36S/2.1.5' },
      });
      clearTimeout(timer);
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('Fetch failed');
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Serve real R36S sprites and Manrope fonts from the latest commit
  app.use('/sprites', express.static(path.join(__dirname, 'ports', 'kplayer', 'sprites')));
  app.use('/fonts', express.static(path.join(__dirname, 'extras', 'fontes-modernas')));

  const r36sZipFilename = 'KPlayer-v2.1.5-R36S.zip';
  const r36sZipPath = path.join(__dirname, 'releases', r36sZipFilename);
  const r36sShaPath = `${r36sZipPath}.sha256`;

  app.get('/api/r36s/info', async (_req, res) => {
    try {
      const stat = await fs.stat(r36sZipPath);
      let sha256 = '';
      try {
        sha256 = (await fs.readFile(r36sShaPath, 'utf8')).trim().split(/\s+/)[0] || '';
      } catch {
        sha256 = '';
      }
      return res.json({
        ready: true,
        version: '2.1.5',
        filename: r36sZipFilename,
        sizeBytes: stat.size,
        sha256,
        arch: 'ARM64 (aarch64-linux-gnu / dArkOS / PortMaster)',
      });
    } catch {
      return res.status(404).json({ ready: false, version: '2.1.5', filename: r36sZipFilename });
    }
  });

  app.get('/api/r36s/download', async (_req, res) => {
    try {
      await fs.access(r36sZipPath);
      return res.download(r36sZipPath, r36sZipFilename);
    } catch {
      return res.status(404).json({ error: 'Pacote R36S não encontrado' });
    }
  });

  app.get('/api/r36s/sha256', async (_req, res) => {
    try {
      await fs.access(r36sShaPath);
      return res.download(r36sShaPath, `${r36sZipFilename}.sha256`);
    } catch {
      return res.status(404).json({ error: 'Checksum não encontrado' });
    }
  });

  // ==================== AUTO-UPDATE ENGINE (GITHUB updates/ CHANNEL — R36S) ====================

  const REPO_SLUG_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const BRANCH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
  const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
  const SHA256_RE = /^[0-9a-f]{64}$/i;
  const UPDATE_PRESERVE_PATHS = [
    'iptv_usuario/',
    'radios_usuario/',
    'midias/',
    'settings.cfg',
    'preferences.cfg',
    'weather.cfg',
    'news.cfg',
    'gamelist.xml',
    'history.txt',
    'favorites.txt',
    'radio-favorites.tsv',
    'resume.cfg',
  ];
  const weatherCache = new Map<string, { fetchedAt: number; payload: Record<string, unknown> }>();

  function compareSemver(a: string, b: string): number {
    const ma = a.trim().replace(/^v/i, '').match(SEMVER_RE);
    const mb = b.trim().replace(/^v/i, '').match(SEMVER_RE);
    if (!ma || !mb) return 0;
    for (let i = 1; i <= 3; i++) {
      const diff = Number(ma[i]) - Number(mb[i]);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function nextPatchVersion(ver: string): string {
    const m = ver.trim().replace(/^v/i, '').match(SEMVER_RE);
    if (!m) return '2.1.5';
    return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
  }

  function sanitizeBranch(raw: unknown): string {
    const s = String(raw ?? '').trim().slice(0, 48);
    if (!s || s.includes('..') || !BRANCH_RE.test(s)) return 'main';
    return s;
  }

  async function readInstalledVersion(): Promise<string> {
    try {
      const header = await fs.readFile(path.join(__dirname, 'source', 'version.h'), 'utf8');
      const m = header.match(/#define\s+KPLAYER_VERSION\s+"(\d+\.\d+\.\d+)"/);
      if (m) return m[1];
    } catch {
      // Fallback below
    }
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')) as {
        version?: string;
      };
      if (pkg.version && SEMVER_RE.test(pkg.version)) return pkg.version;
    } catch {
      // Fallback below
    }
    return '2.1.5';
  }

  async function readLocalUpdateManifest(): Promise<Record<string, unknown> | null> {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'updates', 'latest.json'), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  async function detectUpdateRepoSlug(localManifest: Record<string, unknown> | null): Promise<string> {
    const envRepo = String(process.env.KPLAYER_UPDATE_REPO ?? '').trim();
    if (REPO_SLUG_RE.test(envRepo)) return envRepo;

    try {
      const cfg = (
        await fs.readFile(path.join(__dirname, 'ports', 'kplayer', 'update-repo.txt'), 'utf8')
      ).trim();
      if (REPO_SLUG_RE.test(cfg)) return cfg;
    } catch {
      // ignore missing config
    }

    const fromManifest = String(localManifest?.repository ?? '').trim();
    if (REPO_SLUG_RE.test(fromManifest)) return fromManifest;

    try {
      const gitCfg = await fs.readFile(path.join(__dirname, '.git', 'config'), 'utf8');
      const m = gitCfg.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\s*$/m);
      if (m && REPO_SLUG_RE.test(m[1])) return m[1];
    } catch {
      // ignore missing git config
    }

    return '';
  }

  interface CheckedUpdatePayload {
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
    remoteStatus: 'ok' | 'unconfigured' | 'not_found' | 'network_error';
    lastError?: string;
    checkedAt: number;
    r36s?: Record<string, unknown>;
  }

  let updateCheckCache: { ts: number; data: CheckedUpdatePayload } | null = null;

  async function fetchRemoteReleaseFallback(
    repository: string,
    currentVersion: string
  ): Promise<Record<string, unknown> | null> {
    if (!REPO_SLUG_RE.test(repository)) return null;
    const apiUrl = `https://api.github.com/repos/${repository}/releases/latest`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const r = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': `KPlayer-Updater/${currentVersion}`,
          Accept: 'application/vnd.github+json',
        },
      });
      clearTimeout(timer);
      if (!r.ok) return null;
      const txt = await r.text();
      if (txt.length > 256 * 1024) return null;
      const data = JSON.parse(txt) as {
        tag_name?: string;
        published_at?: string;
        html_url?: string;
        body?: string;
        assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
      };
      const ver = String(data.tag_name ?? '').trim().replace(/^v/i, '');
      if (!SEMVER_RE.test(ver)) return null;
      const zipAsset = (data.assets ?? []).find((a) => String(a.name ?? '').endsWith('-R36S.zip'));
      const shaAsset = (data.assets ?? []).find((a) => String(a.name ?? '').endsWith('-R36S.zip.sha256'));
      const notes = String(data.body ?? '')
        .split(/\r?\n/)
        .map((ln) => ln.trim())
        .filter((ln) => ln.startsWith('- ') || ln.startsWith('* '))
        .map((ln) => ln.slice(2).replace(/\*\*([^*]+)\*\*/g, '$1').trim().slice(0, 160))
        .slice(0, 6);
      return {
        version: ver,
        releasedAt: String(data.published_at ?? ''),
        releasePageUrl: String(data.html_url ?? ''),
        notes: notes.length ? notes : [`Release KPlayer R36S v${ver} disponível no GitHub.`],
        r36s: {
          filename: zipAsset?.name ?? `KPlayer-v${ver}-R36S.zip`,
          path: `updates/v${ver}/KPlayer-v${ver}-R36S.zip`,
          url: zipAsset?.browser_download_url ?? '',
          releaseUrl: zipAsset?.browser_download_url ?? '',
          sha256Url: shaAsset?.browser_download_url ?? '',
          sha256: '',
          sizeBytes: zipAsset?.size ?? 0,
        },
      };
    } catch {
      return null;
    }
  }

  async function runUpdateCheck(force = false): Promise<CheckedUpdatePayload> {
    if (!force && updateCheckCache && Date.now() - updateCheckCache.ts < 3 * 60_000) {
      return updateCheckCache.data;
    }
    const currentVersion = await readInstalledVersion();
    const localManifest = await readLocalUpdateManifest();
    const repository = await detectUpdateRepoSlug(localManifest);
    const branch = sanitizeBranch(process.env.KPLAYER_UPDATE_BRANCH || localManifest?.branch || 'main');

    let remoteManifest: Record<string, unknown> | null = null;
    let source: 'github' | 'github-release' | 'local' = 'local';
    let remoteStatus: 'ok' | 'unconfigured' | 'not_found' | 'network_error' = repository
      ? 'network_error'
      : 'unconfigured';
    let lastError = repository ? '' : 'Informe usuario/repositorio para consultar o GitHub.';

    if (repository && REPO_SLUG_RE.test(repository)) {
      const bust = Date.now();
      const remoteUrl = `https://raw.githubusercontent.com/${repository}/${branch}/updates/latest.json?t=${bust}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(remoteUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': `KPlayer-Updater/${currentVersion}`,
            'Cache-Control': 'no-cache, no-store',
          },
        });
        clearTimeout(timer);
        if (r.ok) {
          const txt = await r.text();
          if (txt.length <= 256 * 1024) {
            const parsed = JSON.parse(txt) as Record<string, unknown>;
            if (parsed && typeof parsed.version === 'string' && SEMVER_RE.test(parsed.version)) {
              remoteManifest = parsed;
              source = 'github';
              remoteStatus = 'ok';
              lastError = '';
            }
          }
        } else if (r.status === 404) {
          remoteStatus = 'not_found';
          lastError = 'Pasta updates/latest.json não encontrada nesse repositório.';
        } else {
          remoteStatus = 'network_error';
          lastError = `GitHub retornou HTTP ${r.status}.`;
        }
      } catch {
        remoteStatus = 'network_error';
        lastError = 'Não foi possível conectar ao GitHub agora.';
      }

      if (!remoteManifest) {
        const relFallback = await fetchRemoteReleaseFallback(repository, currentVersion);
        if (relFallback) {
          remoteManifest = relFallback;
          source = 'github-release';
          remoteStatus = 'ok';
          lastError = '';
        }
      }
    }

    const active = remoteManifest ?? localManifest;
    const latestVersion =
      typeof active?.version === 'string' && SEMVER_RE.test(active.version)
        ? active.version
        : currentVersion;
    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
    const notes = Array.isArray(active?.notes)
      ? active.notes.filter((x): x is string => typeof x === 'string').slice(0, 8)
      : [];
    const preserveUserPaths = Array.isArray(active?.preserveUserPaths)
      ? active.preserveUserPaths.filter((x): x is string => typeof x === 'string')
      : UPDATE_PRESERVE_PATHS;

    const r36sObj =
      active?.r36s && typeof active.r36s === 'object'
        ? { ...(active.r36s as Record<string, unknown>) }
        : undefined;
    if (r36sObj && typeof r36sObj.sha256 === 'string' && !SHA256_RE.test(r36sObj.sha256)) {
      r36sObj.sha256 = '';
    }

    const payload: CheckedUpdatePayload = {
      currentVersion,
      latestVersion,
      nextExpectedVersion: nextPatchVersion(currentVersion),
      updateAvailable,
      repository,
      branch,
      updatesFolderUrl: repository
        ? `https://github.com/${repository}/tree/${branch}/updates`
        : 'updates/',
      releasePageUrl:
        typeof active?.releasePageUrl === 'string' && active.releasePageUrl
          ? active.releasePageUrl
          : repository
          ? `https://github.com/${repository}/releases/tag/v${latestVersion}`
          : '',
      releasedAt: typeof active?.releasedAt === 'string' ? active.releasedAt : '',
      notes,
      preserveUserPaths,
      source,
      remoteStatus,
      ...(lastError ? { lastError } : {}),
      checkedAt: Date.now(),
      ...(r36sObj ? { r36s: r36sObj } : {}),
    };
    updateCheckCache = { ts: Date.now(), data: payload };
    return payload;
  }

  app.get('/api/update/check', async (req, res) => {
    const force = req.query.refresh === '1';
    try {
      const status = await runUpdateCheck(force);
      return res.json(status);
    } catch {
      const currentVersion = await readInstalledVersion();
      return res.status(200).json({
        currentVersion,
        latestVersion: currentVersion,
        nextExpectedVersion: nextPatchVersion(currentVersion),
        updateAvailable: false,
        repository: '',
        branch: 'main',
        updatesFolderUrl: 'updates/',
        releasedAt: '',
        notes: [],
        preserveUserPaths: UPDATE_PRESERVE_PATHS,
        source: 'local',
        remoteStatus: 'network_error',
        lastError: 'Falha ao consultar o canal de atualizações.',
        checkedAt: Date.now(),
      });
    }
  });

  app.get('/api/update/history', async (_req, res) => {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'updates', 'history.json'), 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return res.json({ ok: true, ...parsed });
    } catch {
      return res.json({ ok: true, latest: await readInstalledVersion(), releases: [] });
    }
  });

  app.post('/api/update/repo', async (req, res) => {
    const raw = String((req.body as { repository?: unknown } | undefined)?.repository ?? '')
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    if (!REPO_SLUG_RE.test(raw)) {
      return res.status(400).json({
        ok: false,
        error: 'Informe o repositório no formato usuario/repositorio (ex: MeuUsuario/KPlayer).',
      });
    }
    try {
      const cfgPath = path.join(__dirname, 'ports', 'kplayer', 'update-repo.txt');
      await fs.writeFile(cfgPath, `${raw}\n`, 'utf8');
      updateCheckCache = null;
      const status = await runUpdateCheck(true);
      return res.json({ ok: true, status });
    } catch {
      return res.status(500).json({ ok: false, error: 'Não foi possível salvar o repositório.' });
    }
  });

  app.post('/api/update/apply', async (req, res) => {
    try {
      const force = Boolean((req.body as { force?: unknown } | undefined)?.force);
      const status = await runUpdateCheck(true);
      // Clear only volatile network caches — strictly preserve iptv_usuario/, radios_usuario/, midias/, weather, settings & history
      iptvCache.clear();
      weatherCache.clear();
      epgIndexCache = null;
      updateCheckCache = null;

      const reinstalled = !status.updateAvailable && force;
      return res.json({
        ok: true,
        previousVersion: status.currentVersion,
        targetVersion: status.latestVersion,
        updateAvailable: status.updateAvailable,
        reinstalled,
        forced: force,
        source: status.source,
        releasePageUrl: status.releasePageUrl ?? '',
        r36s: status.r36s,
        preservedUserPaths: status.preserveUserPaths,
        restartRequired: true,
        message: status.updateAvailable
          ? `Atualização R36S v${status.latestVersion} preparada preservando todos os seus dados e histórico. Reiniciando...`
          : reinstalled
          ? `Reinstalação da mesma versão R36S v${status.currentVersion} concluída preservando favoritos, histórico e listas. Reiniciando...`
          : `KPlayer R36S v${status.currentVersion} sincronizado com o canal updates/. Reiniciando...`,
      });
    } catch {
      return res.status(502).json({
        ok: false,
        error: 'Não foi possível concluir a verificação do pacote de atualização.',
      });
    }
  });

  app.get('/api/user-radios', async (_req, res) => {
    const dirs = [
      path.join(__dirname, 'ports', 'kplayer', 'radios_usuario'),
    ];
    const stations: RadioStation[] = [];
    const seen = new Set<string>();

    for (const dir of dirs) {
      try {
        const files = (await fs.readdir(dir)).sort();
        for (const file of files) {
          if (!/\.(pls|m3u8?|asx)$/i.test(file)) continue;
          const full = path.join(dir, file);
          const stat = await fs.stat(full);
          if (stat.size > 65536) continue;
          const content = await fs.readFile(full, 'utf8');
          for (const st of parsePlsOrM3u(file, content)) {
            if (!seen.has(st.url)) {
              seen.add(st.url);
              stations.push(st);
            }
          }
        }
        if (stations.length > 0) break;
      } catch {
        // Directory not present, try next
      }
    }

    res.json({ stations });
  });

  app.get('/api/radio', async (req, res) => {
    const cat = String(req.query.category ?? '0');
    const cached = radioCache.get(cat);
    if (cached && Date.now() - cached.ts < 5 * 60_000) {
      return res.json({ stations: cached.data });
    }

    const endpoints: Record<string, string> = {
      '0': '/json/stations/bycountrycodeexact/BR?order=clickcount&reverse=true&limit=40&hidebroken=true',
      '1': '/json/stations/topclick/40?hidebroken=true',
      '2': '/json/stations/bytag/pop?order=clickcount&reverse=true&limit=40&hidebroken=true',
      '3': '/json/stations/bytag/rock?order=clickcount&reverse=true&limit=40&hidebroken=true',
      '4': '/json/stations/bytag/news?order=clickcount&reverse=true&limit=40&hidebroken=true',
    };
    const suffix = endpoints[cat] ?? endpoints['0'];
    const hosts = [
      'https://de1.api.radio-browser.info',
      'https://fr1.api.radio-browser.info',
      'https://nl1.api.radio-browser.info',
    ];

    try {
      const raw = (await fetchJsonWithFallback(hosts.map((h) => h + suffix))) as Array<Record<string, unknown>>;
      const stations: RadioStation[] = (Array.isArray(raw) ? raw : [])
        .map((o) => ({
          uuid: String(o.stationuuid ?? o.url_resolved ?? o.url ?? ''),
          name: String(o.name ?? 'Rádio').trim() || 'Rádio',
          url: String(o.url_resolved || o.url || '').trim(),
          tags: String(o.tags ?? '').slice(0, 120),
          country: String(o.country ?? 'Internet').slice(0, 48),
          codec: String(o.codec ?? 'STREAM').toUpperCase().slice(0, 16) || 'STREAM',
          favicon: String(o.favicon ?? '').trim(),
          bitrate: Number(o.bitrate ?? 0) || 0,
        }))
        .filter((s) => s.url.startsWith('http://') || s.url.startsWith('https://'));

      radioCache.set(cat, { ts: Date.now(), data: stations });
      return res.json({ stations });
    } catch {
      return res.status(502).json({ stations: cached?.data ?? [], error: 'offline' });
    }
  });

  app.get('/api/iptv/categories', async (req, res) => {
    const rawSource = String(req.query.source ?? 'canais');
    const source =
      rawSource === 'filmes' || rawSource === 'series' || rawSource === 'usuario'
        ? rawSource
        : 'canais';
    const force = req.query.refresh === '1';
    try {
      const payload = await getIptvCategories(source, force);
      if (source === 'canais' || source === 'usuario') {
        // Warm XMLTV EPG index in background so live channel items resolve instantly
        void loadEpgIndex(false).catch(() => {});
      }
      return res.json(payload);
    } catch {
      return res.status(502).json({
        source,
        sourceUrl: source === 'canais' ? SAIMO_CANAIS_BASE : SAIMO_FILMES_BASE,
        totalCount: 0,
        categories: [],
        error: 'unavailable',
      });
    }
  });

  app.get('/api/iptv/epg', async (req, res) => {
    const channel = String(req.query.channel ?? '').trim().slice(0, 140);
    const tvgId = String(req.query.tvgId ?? '').trim().slice(0, 140);
    const force = req.query.refresh === '1';
    try {
      const index = await loadEpgIndex(force);
      if (!channel && !tvgId) {
        return res.json({
          ready: index.channelCount > 0,
          channelCount: index.channelCount,
          updatedAt: index.ts,
        });
      }
      const guide = lookupChannelEpg(index, channel, tvgId || undefined);
      return res.json({
        ...guide,
        channelCount: index.channelCount,
        updatedAt: index.ts,
      });
    } catch {
      return res.status(502).json({
        matchedChannel: null,
        now: null,
        next: null,
        schedule: [],
        error: 'unavailable',
      });
    }
  });

  app.get('/api/iptv/items', async (req, res) => {
    const rawSource = String(req.query.source ?? 'canais');
    const source =
      rawSource === 'filmes' || rawSource === 'series' || rawSource === 'usuario'
        ? rawSource
        : 'canais';
    const category = String(req.query.category ?? 'all').slice(0, 160);
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const force = req.query.refresh === '1';
    try {
      let items = await getIptvCategoryItems(source, category, force);
      if (q) {
        items = items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.group.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q)
        );
      }
      if (source === 'canais' || source === 'usuario') {
        const epg = await Promise.race([
          loadEpgIndex(false).catch(() => null),
          new Promise<EpgIndex | null>((resolve) => setTimeout(() => resolve(epgIndexCache), 2600)),
        ]);
        if (epg && epg.channelCount > 0) {
          items = items.map((item) => {
            const guide = lookupChannelEpg(epg, item.name, item.id);
            if (!guide.now && !guide.next) return item;
            return {
              ...item,
              epgNow: guide.now,
              epgNext: guide.next,
            };
          });
        }
      }
      return res.json({ source, category, total: items.length, items });
    } catch {
      return res.status(502).json({ source, category, total: 0, items: [], error: 'unavailable' });
    }
  });

  app.get('/api/iptv/episodes', async (req, res) => {
    const letterRaw = String(req.query.letter ?? '#').trim().toUpperCase();
    const letter = letterRaw.length === 1 && letterRaw >= 'A' && letterRaw <= 'Z' ? letterRaw : '#';
    const shard = String(req.query.shard ?? '').trim();
    const title = String(req.query.title ?? '').trim();
    const force = req.query.refresh === '1';
    if (!/^\d{1,4}$/.test(shard) || !title) {
      return res.status(400).json({ error: 'Invalid series shard or title' });
    }
    try {
      const meta = await loadSaimoMeta(force);
      const blocks = await loadSaimoSeriesShard(letter, shard, meta.bases, force);
      let rawEps = blocks.get(title.toLowerCase());
      if (!rawEps) {
        const targetNorm = saimoNormTitle(title);
        for (const [k, v] of blocks.entries()) {
          if (saimoNormTitle(k) === targetNorm) {
            rawEps = v;
            break;
          }
        }
      }
      const best = new Map<string, { season: number; ep: number; lang: string; urls: string[] }>();
      for (const e of rawEps ?? []) {
        const k = `${e.season}:${e.ep}`;
        const prev = best.get(k);
        if (!prev) {
          best.set(k, { ...e, urls: [...e.urls] });
        } else if (prev.lang !== 'DUB' && e.lang === 'DUB') {
          best.set(k, { ...e, urls: [...e.urls, ...prev.urls.filter((u) => !e.urls.includes(u))] });
        } else {
          for (const u of e.urls) {
            if (!prev.urls.includes(u)) prev.urls.push(u);
          }
        }
      }
      const sorted = Array.from(best.values()).sort((a, b) => a.season - b.season || a.ep - b.ep);
      const seasons = Array.from(new Set(sorted.map((e) => e.season))).sort((a, b) => a - b);
      const logo = meta.posterBySeries.get(title.toLowerCase()) || '';
      const episodes: IptvChannel[] = sorted.map((e) => {
        const epTag = `T${String(e.season).padStart(2, '0')}E${String(e.ep).padStart(2, '0')}`;
        return {
          name: `${title} — ${epTag}`,
          url: e.urls[0],
          fallbackUrls: e.urls.slice(1),
          mediaType: 'series',
          logo,
          group: `Temporada ${e.season}`,
          id: `Série • ${epTag} • ${e.lang}`,
          season: e.season,
          episode: e.ep,
        };
      });
      return res.json({ title, seasons, totalEpisodes: episodes.length, episodes });
    } catch {
      return res.status(502).json({ title, seasons: [], totalEpisodes: 0, episodes: [], error: 'unavailable' });
    }
  });

  app.post('/api/iptv/user/url', async (req, res) => {
    const rawUrl = String(req.body?.url ?? '').trim();
    const rawName = String(req.body?.name ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 80);
    if (!isSafeExternalUrl(rawUrl)) {
      return res.status(400).json({ error: 'URL inválida. Use um link http:// ou https:// público.' });
    }
    try {
      const existing = await readUserPlaylistUrls();
      if (!existing.some((x) => x.url === rawUrl)) {
        const label = rawName || new URL(rawUrl).hostname || 'Lista IPTV';
        existing.push({ name: label, url: rawUrl });
        await writeUserPlaylistUrls(existing);
      }
      userIptvCache = null;
      const loaded = await loadUserIptvAll(true);
      return res.json({
        ok: true,
        totalChannels: loaded.channels.length,
        userPlaylists: loaded.playlists,
      });
    } catch {
      return res.status(500).json({ error: 'Não foi possível salvar a URL.' });
    }
  });

  app.post('/api/iptv/user/upload', async (req, res) => {
    const rawFilename = String(req.body?.filename ?? 'minha_lista.m3u');
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!content.trim()) {
      return res.status(400).json({ error: 'Arquivo vazio.' });
    }
    if (Buffer.byteLength(content, 'utf8') > 24 * 1024 * 1024) {
      return res.status(413).json({ error: 'Arquivo excede o limite de 24 MB.' });
    }
    const safeName = sanitizeUserFilename(rawFilename);
    const resolved = path.resolve(USER_IPTV_DIR, safeName);
    if (!resolved.startsWith(USER_IPTV_DIR + path.sep)) {
      return res.status(400).json({ error: 'Nome de arquivo inválido.' });
    }
    try {
      await fs.mkdir(USER_IPTV_DIR, { recursive: true });
      await fs.writeFile(resolved, content, 'utf8');
      userIptvCache = null;
      const loaded = await loadUserIptvAll(true);
      return res.json({
        ok: true,
        filename: safeName,
        totalChannels: loaded.channels.length,
        userPlaylists: loaded.playlists,
      });
    } catch {
      return res.status(500).json({ error: 'Não foi possível salvar o arquivo.' });
    }
  });

  app.delete('/api/iptv/user', async (req, res) => {
    const kind = req.body?.kind === 'file' ? 'file' : req.body?.kind === 'url' ? 'url' : '';
    const target = String(req.body?.target ?? '').trim();
    if (!kind || !target) {
      return res.status(400).json({ error: 'Parâmetros inválidos.' });
    }
    try {
      if (kind === 'url') {
        const existing = await readUserPlaylistUrls();
        await writeUserPlaylistUrls(existing.filter((x) => x.url !== target));
      } else {
        const safeName = sanitizeUserFilename(target);
        const resolved = path.resolve(USER_IPTV_DIR, safeName);
        if (!resolved.startsWith(USER_IPTV_DIR + path.sep)) {
          return res.status(400).json({ error: 'Arquivo inválido.' });
        }
        await fs.unlink(resolved).catch(() => {});
      }
      userIptvCache = null;
      const loaded = await loadUserIptvAll(true);
      return res.json({
        ok: true,
        totalChannels: loaded.channels.length,
        userPlaylists: loaded.playlists,
      });
    } catch {
      return res.status(500).json({ error: 'Não foi possível remover a playlist.' });
    }
  });

  app.get('/api/iptv', async (req, res) => {
    const source = req.query.source === 'filmes' ? 'filmes' : 'canais';
    const force = req.query.refresh === '1';
    try {
      const channels =
        source === 'filmes'
          ? await getIptvCategoryItems('filmes', 'shelf:Em alta', force)
          : await loadSaimoCanais(force);
      return res.json({
        source,
        sourceUrl: source === 'filmes' ? SAIMO_FILMES_BASE : SAIMO_CANAIS_BASE,
        channels,
      });
    } catch {
      return res.json({
        source,
        sourceUrl: source === 'filmes' ? SAIMO_FILMES_BASE : SAIMO_CANAIS_BASE,
        channels: [],
        stale: true,
      });
    }
  });

  app.get('/api/football', async (req, res) => {
    const force = req.query.refresh === '1';
    if (!force && footballCache && Date.now() - footballCache.ts < 45_000) {
      return res.json({ matches: footballCache.data });
    }

    const leagues: Array<{ id: string; label: string; region: 'br' | 'eu' }> = [
      { id: 'bra.1', label: 'Brasileirão Série A', region: 'br' },
      { id: 'bra.2', label: 'Brasileirão Série B', region: 'br' },
      { id: 'bra.copa_do_brasil', label: 'Copa do Brasil', region: 'br' },
      { id: 'conmebol.libertadores', label: 'Copa Libertadores', region: 'br' },
      { id: 'conmebol.sudamericana', label: 'Copa Sul-Americana', region: 'br' },
      { id: 'uefa.champions', label: 'UEFA Champions League', region: 'eu' },
      { id: 'eng.1', label: 'Premier League', region: 'eu' },
      { id: 'esp.1', label: 'LaLiga', region: 'eu' },
      { id: 'ita.1', label: 'Serie A Itália', region: 'eu' },
      { id: 'ger.1', label: 'Bundesliga', region: 'eu' },
    ];

    const translateStatus = (shortDetail: string, state: string): string => {
      const s = shortDetail.trim();
      if (s === 'FT') return 'Fim';
      if (s === 'HT') return 'Intervalo';
      if (s === 'AET') return 'Fim (Prorr.)';
      if (s === 'FT-Pens') return 'Fim (Pên.)';
      if (s === 'Postponed') return 'Adiado';
      if (!s) return state === 'in' ? 'AO VIVO' : state === 'post' ? 'Fim' : 'Agendado';
      return s;
    };

    const matches: FootballMatch[] = [];
    await Promise.all(
      leagues.map(async (lg) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.id}/scoreboard`,
            { signal: controller.signal, headers: { 'User-Agent': 'KPlayer-R36S/2.1.5' } }
          );
          clearTimeout(timer);
          if (!r.ok) return;
          const data = (await r.json()) as {
            leagues?: Array<{ name?: string }>;
            events?: Array<{
              id?: string;
              status?: { type?: { shortDetail?: string; description?: string; state?: string } };
              competitions?: Array<{
                venue?: { fullName?: string };
                details?: Array<{
                  scoringPlay?: boolean;
                  clock?: { displayValue?: string };
                  athletesInvolved?: Array<{ shortName?: string; displayName?: string }>;
                }>;
                competitors?: Array<{
                  homeAway?: string;
                  score?: string;
                  statistics?: Array<{ name?: string; displayValue?: string }>;
                  team?: { shortDisplayName?: string; displayName?: string; logo?: string };
                }>;
              }>;
            }>;
          };
          const leagueName = lg.label || data.leagues?.[0]?.name || lg.id;
          for (const ev of (data.events ?? []).slice(0, 12)) {
            const comp = ev.competitions?.[0];
            const home = comp?.competitors?.find((c) => c.homeAway === 'home');
            const away = comp?.competitors?.find((c) => c.homeAway === 'away');
            if (!home || !away) continue;
            const rawState = ev.status?.type?.state;
            const state: 'in' | 'post' | 'pre' =
              rawState === 'in' ? 'in' : rawState === 'post' ? 'post' : 'pre';
            const score =
              state === 'pre' ? '- : -' : `${home.score ?? '0'} - ${away.score ?? '0'}`;
            const status = translateStatus(
              ev.status?.type?.shortDetail || ev.status?.type?.description || '',
              state
            );
            const statVal = (
              teamComp: { statistics?: Array<{ name?: string; displayValue?: string }> },
              key: string
            ) => teamComp.statistics?.find((s) => s.name === key)?.displayValue ?? '';

            const previewParts: string[] = [];
            const hp = statVal(home, 'possessionPct');
            const ap = statVal(away, 'possessionPct');
            if (hp && ap) previewParts.push(`Posse ${hp}%-${ap}%`);
            const hs = statVal(home, 'totalShots');
            const as = statVal(away, 'totalShots');
            if (hs && as) previewParts.push(`Chutes ${hs}-${as}`);
            const goals = (comp?.details ?? [])
              .filter((d) => d.scoringPlay)
              .slice(-2)
              .map((d) => {
                const scorer = d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || 'Gol';
                const min = d.clock?.displayValue || '';
                return min ? `${min} ${scorer}` : scorer;
              });
            if (goals.length) previewParts.push(`Gol: ${goals.join(', ')}`);

            matches.push({
              id: String(ev.id ?? ''),
              leagueCode: lg.id,
              league: leagueName,
              region: lg.region,
              state,
              home: home.team?.shortDisplayName || home.team?.displayName || 'Casa',
              homeLogo: home.team?.logo || '',
              away: away.team?.shortDisplayName || away.team?.displayName || 'Fora',
              awayLogo: away.team?.logo || '',
              score,
              status,
              venue: comp?.venue?.fullName || '',
              preview: previewParts.join(' • '),
            });
          }
        } catch {
          clearTimeout(timer);
        }
      })
    );

    const stateOrder = { in: 0, post: 1, pre: 2 };
    matches.sort((a, b) => stateOrder[a.state] - stateOrder[b.state]);

    footballCache = { ts: Date.now(), data: matches };
    return res.json({ matches });
  });

  app.get('/api/football/match', async (req, res) => {
    const league = String(req.query.league ?? '').trim();
    const id = String(req.query.id ?? '').trim();
    const force = req.query.refresh === '1';

    if (!/^[a-z0-9._-]+$/i.test(league) || !/^[0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid league or event id' });
    }

    const cacheKey = `${league}:${id}`;
    const cached = footballDetailCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.ts < 30_000) {
      return res.json(cached.data);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${id}`,
        { signal: controller.signal, headers: { 'User-Agent': 'KPlayer-R36S/2.1.5' } }
      );
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as {
        gameInfo?: {
          venue?: { fullName?: string };
          attendance?: number;
          officials?: Array<{ fullName?: string; displayName?: string }>;
        };
        header?: {
          competitions?: Array<{
            competitors?: Array<{
              homeAway?: string;
              form?: string;
            }>;
          }>;
        };
        boxscore?: {
          teams?: Array<{
            homeAway?: string;
            team?: { shortDisplayName?: string; displayName?: string };
            statistics?: Array<{ name?: string; displayValue?: string }>;
          }>;
        };
        keyEvents?: Array<{
          clock?: { displayValue?: string };
          type?: { text?: string; type?: string };
          team?: { shortDisplayName?: string; displayName?: string };
          text?: string;
          shortText?: string;
          participants?: Array<{ athlete?: { shortName?: string; displayName?: string } }>;
        }>;
        rosters?: Array<{
          homeAway?: string;
          formation?: string;
          roster?: Array<{
            starter?: boolean;
            jersey?: string;
            position?: { abbreviation?: string };
            athlete?: { shortName?: string; displayName?: string };
          }>;
        }>;
      };

      const venue = json.gameInfo?.venue?.fullName || '';
      const attendance =
        typeof json.gameInfo?.attendance === 'number' && json.gameInfo.attendance > 0
          ? `${json.gameInfo.attendance.toLocaleString('pt-BR')} torcedores`
          : '';
      const referee =
        json.gameInfo?.officials?.[0]?.fullName || json.gameInfo?.officials?.[0]?.displayName || '';

      const hdrComps = json.header?.competitions?.[0]?.competitors ?? [];
      const homeForm = hdrComps.find((c) => c.homeAway === 'home')?.form || '';
      const awayForm = hdrComps.find((c) => c.homeAway === 'away')?.form || '';

      const teams = json.boxscore?.teams ?? [];
      const homeTeam = teams.find((t) => t.homeAway === 'home') ?? teams[0];
      const awayTeam = teams.find((t) => t.homeAway === 'away') ?? teams[1];

      const mapStats = (team?: { statistics?: Array<{ name?: string; displayValue?: string }> }) => {
        const m = new Map<string, string>();
        for (const s of team?.statistics ?? []) {
          if (s.name && s.displayValue !== undefined) m.set(s.name, s.displayValue);
        }
        return m;
      };
      const hm = mapStats(homeTeam);
      const am = mapStats(awayTeam);

      const statDefs: Array<{ key: string; label: string; suffix?: string }> = [
        { key: 'possessionPct', label: 'Posse de bola', suffix: '%' },
        { key: 'totalShots', label: 'Finalizações' },
        { key: 'shotsOnTarget', label: 'Chutes no gol' },
        { key: 'wonCorners', label: 'Escanteios' },
        { key: 'foulsCommitted', label: 'Faltas' },
        { key: 'yellowCards', label: 'Cartões amarelos' },
        { key: 'redCards', label: 'Cartões vermelhos' },
        { key: 'saves', label: 'Defesas do goleiro' },
        { key: 'offsides', label: 'Impedimentos' },
        { key: 'accuratePasses', label: 'Passes certos' },
      ];

      const parseNum = (v: string) => {
        const n = Number.parseFloat(v.replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : 0;
      };

      const stats: FootballMatchDetail['stats'] = [];
      for (const def of statDefs) {
        const hv = hm.get(def.key);
        const av = am.get(def.key);
        if (hv === undefined && av === undefined) continue;
        const hStr = hv ?? '0';
        const aStr = av ?? '0';
        const suf = def.suffix && !hStr.endsWith('%') ? def.suffix : '';
        stats.push({
          label: def.label,
          home: `${hStr}${suf}`,
          away: `${aStr}${suf}`,
          homeNum: parseNum(hStr),
          awayNum: parseNum(aStr),
        });
      }

      const events: FootballMatchDetail['events'] = [];
      for (const ev of json.keyEvents ?? []) {
        const typeTxt = (ev.type?.text || '').toLowerCase();
        let kind: 'goal' | 'yellow' | 'red' | 'sub' | 'other' | null = null;
        if (typeTxt.includes('goal') || typeTxt.includes('penalty - scored')) kind = 'goal';
        else if (typeTxt.includes('yellow')) kind = 'yellow';
        else if (typeTxt.includes('red')) kind = 'red';
        else if (typeTxt.includes('substitution')) kind = 'sub';
        if (!kind) continue;

        const minute = ev.clock?.displayValue || '';
        const team = ev.team?.shortDisplayName || ev.team?.displayName || '';
        const names = (ev.participants ?? [])
          .map((p) => p.athlete?.shortName || p.athlete?.displayName || '')
          .filter(Boolean);
        let desc = '';
        if (kind === 'sub' && names.length >= 2) {
          desc = `Entra ${names[0]} • Sai ${names[1]}`;
        } else if (names.length > 0) {
          desc = names.join(' / ');
        } else {
          desc = ev.shortText || ev.text || ev.type?.text || '';
        }
        events.push({ minute, kind, team, desc });
      }

      const posMap: Record<string, string> = {
        G: 'GOL',
        GK: 'GOL',
        D: 'DEF',
        CD: 'ZAG',
        CB: 'ZAG',
        LB: 'LE',
        RB: 'LD',
        M: 'MEI',
        CM: 'MEI',
        CDM: 'VOL',
        CAM: 'MEI',
        LM: 'MEI',
        RM: 'MEI',
        F: 'ATA',
        ST: 'ATA',
        CF: 'ATA',
        LW: 'ATA',
        RW: 'ATA',
      };

      const rosters = json.rosters ?? [];
      const homeRoster = rosters.find((x) => x.homeAway === 'home') ?? rosters[0];
      const awayRoster = rosters.find((x) => x.homeAway === 'away') ?? rosters[1];

      const mapLineup = (rObj?: (typeof rosters)[number]) =>
        (rObj?.roster ?? [])
          .filter((p) => p.starter)
          .slice(0, 11)
          .map((p) => {
            const rawPos = p.position?.abbreviation || '';
            return {
              jersey: p.jersey || '-',
              name: p.athlete?.shortName || p.athlete?.displayName || '',
              pos: posMap[rawPos] || rawPos,
            };
          });

      const detail: FootballMatchDetail = {
        venue,
        attendance,
        referee,
        homeForm,
        awayForm,
        homeFormation: homeRoster?.formation || '',
        awayFormation: awayRoster?.formation || '',
        stats,
        events,
        homeLineup: mapLineup(homeRoster),
        awayLineup: mapLineup(awayRoster),
      };

      footballDetailCache.set(cacheKey, { ts: Date.now(), data: detail });
      return res.json(detail);
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ error: 'match_unavailable' });
    }
  });

  app.get('/api/location', async (_req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const r = await fetch('https://ipwho.is/', {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-Weather/2.1.5' },
      });
      const data = (await r.json()) as {
        success?: boolean;
        city?: string;
        region?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      };
      if (
        data.success &&
        data.city &&
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number'
      ) {
        clearTimeout(timer);
        return res.json({
          ok: true,
          location: data.region ? `${data.city}, ${data.region}` : data.city,
          city: data.city,
          region: data.region || '',
          country: data.country || '',
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    } catch {
      // Fallback to ip-api below
    }

    try {
      const r2 = await fetch('http://ip-api.com/json/?fields=status,city,regionName,region,country,lat,lon', {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = (await r2.json()) as {
        status?: string;
        city?: string;
        regionName?: string;
        region?: string;
        country?: string;
        lat?: number;
        lon?: number;
      };
      if (data.status === 'success' && data.city && typeof data.lat === 'number' && typeof data.lon === 'number') {
        const reg = data.region || data.regionName || '';
        return res.json({
          ok: true,
          location: reg ? `${data.city}, ${reg}` : data.city,
          city: data.city,
          region: reg,
          country: data.country || '',
          latitude: data.lat,
          longitude: data.lon,
        });
      }
      return res.json({ ok: false, location: 'Mídias locais' });
    } catch {
      clearTimeout(timer);
      return res.json({ ok: false, location: 'Mídias locais' });
    }
  });

  // ==================== OPEN-METEO WEATHER & GEOCODING API ====================

  // weatherCache declared above so /api/update/apply can also flush it cleanly
  const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

  const PT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function formatIsoWeekdayPt(isoDate: string): string {
    const parts = isoDate.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return isoDate;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
    return `${PT_WEEKDAYS[d.getUTCDay()]} ${String(parts[2]).padStart(2, '0')}`;
  }

  function formatIsoClock(isoDateTime: string): string {
    const idx = isoDateTime.indexOf('T');
    if (idx < 0) return isoDateTime;
    return isoDateTime.slice(idx + 1, idx + 6);
  }

  app.get('/api/weather/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (q.length < 2) {
      return res.json({ results: [] });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=pt&format=json`;
      const upstream = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-Weather/2.1.5' },
      });
      clearTimeout(timer);
      if (!upstream.ok) return res.status(502).json({ results: [], error: 'geocoding_unavailable' });
      const data = (await upstream.json()) as {
        results?: Array<{
          name?: string;
          admin1?: string;
          country?: string;
          latitude?: number;
          longitude?: number;
          timezone?: string;
        }>;
      };
      const results = (data.results ?? [])
        .filter((item) => item.name && typeof item.latitude === 'number' && typeof item.longitude === 'number')
        .map((item) => ({
          name: String(item.name),
          region: item.admin1 ? String(item.admin1) : '',
          country: item.country ? String(item.country) : '',
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          timezone: item.timezone ? String(item.timezone) : 'auto',
        }));
      return res.json({ results });
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ results: [], error: 'geocoding_failed' });
    }
  });

  app.get('/api/weather', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'invalid_coordinates' });
    }
    const name = String(req.query.name ?? '').trim().slice(0, 80) || 'Localização atual';
    const region = String(req.query.region ?? '').trim().slice(0, 80);
    const country = String(req.query.country ?? '').trim().slice(0, 80);
    const force = req.query.refresh === '1';

    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = weatherCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) {
      return res.json({
        ...cached.payload,
        location: { name, region, country, latitude: lat, longitude: lon },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const apiUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat.toFixed(4))}` +
        `&longitude=${encodeURIComponent(lon.toFixed(4))}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure` +
        `&hourly=temperature_2m,precipitation_probability,weather_code,is_day` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max` +
        `&timezone=auto&forecast_days=7`;
      const upstream = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-Weather/2.1.5' },
      });
      clearTimeout(timer);
      if (!upstream.ok) return res.status(502).json({ error: 'weather_unavailable' });
      const raw = (await upstream.json()) as {
        timezone?: string;
        current?: {
          time?: string;
          temperature_2m?: number;
          relative_humidity_2m?: number;
          apparent_temperature?: number;
          is_day?: number;
          precipitation?: number;
          weather_code?: number;
          wind_speed_10m?: number;
          surface_pressure?: number;
        };
        hourly?: {
          time?: string[];
          temperature_2m?: number[];
          precipitation_probability?: number[];
          weather_code?: number[];
          is_day?: number[];
        };
        daily?: {
          time?: string[];
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          sunrise?: string[];
          sunset?: string[];
          uv_index_max?: number[];
          precipitation_probability_max?: number[];
        };
      };

      const cur = raw.current;
      if (!cur || typeof cur.temperature_2m !== 'number') {
        return res.status(502).json({ error: 'weather_empty' });
      }

      // Build next 12 hourly slots starting from current local time
      const curTimePrefix = (cur.time || '').slice(0, 13);
      const hTimes = raw.hourly?.time ?? [];
      let startIdx = hTimes.findIndex((t) => t.slice(0, 13) >= curTimePrefix);
      if (startIdx < 0) startIdx = 0;
      const hourly = [];
      for (let i = startIdx; i < Math.min(hTimes.length, startIdx + 12); i++) {
        hourly.push({
          time: hTimes[i],
          hourLabel: i === startIdx ? 'Agora' : formatIsoClock(hTimes[i]),
          temp: Number(raw.hourly?.temperature_2m?.[i] ?? cur.temperature_2m),
          weatherCode: Number(raw.hourly?.weather_code?.[i] ?? cur.weather_code ?? 0),
          precipProb: Number(raw.hourly?.precipitation_probability?.[i] ?? 0),
          isDay: Number(raw.hourly?.is_day?.[i] ?? 1) === 1,
        });
      }

      const dTimes = raw.daily?.time ?? [];
      const daily = dTimes.map((dt, idx) => ({
        date: dt,
        dayLabel: formatIsoWeekdayPt(dt),
        weatherCode: Number(raw.daily?.weather_code?.[idx] ?? 0),
        tempMax: Number(raw.daily?.temperature_2m_max?.[idx] ?? cur.temperature_2m),
        tempMin: Number(raw.daily?.temperature_2m_min?.[idx] ?? cur.temperature_2m),
        precipProbMax: Number(raw.daily?.precipitation_probability_max?.[idx] ?? 0),
        uvMax: Number(raw.daily?.uv_index_max?.[idx] ?? 0),
        sunrise: formatIsoClock(raw.daily?.sunrise?.[idx] ?? ''),
        sunset: formatIsoClock(raw.daily?.sunset?.[idx] ?? ''),
      }));

      const payload = {
        location: {
          name,
          region,
          country,
          latitude: lat,
          longitude: lon,
          timezone: raw.timezone || 'auto',
        },
        fetchedAt: Date.now(),
        current: {
          temp: Number(cur.temperature_2m),
          apparentTemp: Number(cur.apparent_temperature ?? cur.temperature_2m),
          humidity: Number(cur.relative_humidity_2m ?? 0),
          windSpeed: Number(cur.wind_speed_10m ?? 0),
          pressure: Number(cur.surface_pressure ?? 1013),
          precipitation: Number(cur.precipitation ?? 0),
          weatherCode: Number(cur.weather_code ?? 0),
          isDay: Number(cur.is_day ?? 1) === 1,
        },
        hourly,
        daily,
      };
      weatherCache.set(cacheKey, { fetchedAt: Date.now(), payload });
      return res.json(payload);
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ error: 'weather_fetch_failed' });
    }
  });

  // ==================== NOTÍCIAS BRASIL (NEWSDATA.IO + PUBLIC RSS FALLBACK) ====================
  interface NormalizedNewsArticle {
    id: string;
    title: string;
    description: string;
    content: string;
    source: string;
    pubDate: string;
    category: 'breaking' | 'world' | 'crime' | 'entertainment' | 'sports';
    categoryLabel: string;
    imageUrl: string;
    videoUrl: string;
    link: string;
  }

  const NEWS_ALLOWED_CATS = new Set(['all', 'breaking', 'world', 'crime', 'entertainment', 'sports']);
  const NEWS_DEFAULT_CATS = 'world,breaking,crime,entertainment,sports';
  const NEWS_CAT_LABELS: Record<string, string> = {
    breaking: 'Urgente',
    world: 'Mundo',
    crime: 'Polícia',
    entertainment: 'Entretenimento',
    sports: 'Esportes',
  };
  const NEWS_RSS_FEEDS: Array<{ cat: NormalizedNewsArticle['category']; source: string; url: string }> = [
    { cat: 'breaking', source: 'G1 Brasil', url: 'https://g1.globo.com/rss/g1/' },
    { cat: 'world', source: 'G1 Mundo', url: 'https://g1.globo.com/rss/g1/mundo/' },
    { cat: 'crime', source: 'G1 Brasil', url: 'https://g1.globo.com/rss/g1/brasil/' },
    { cat: 'entertainment', source: 'G1 Pop & Arte', url: 'https://g1.globo.com/rss/g1/pop-arte/' },
    { cat: 'sports', source: 'GE Esportes', url: 'https://ge.globo.com/rss/ge/' },
  ];
  const newsCache = new Map<
    string,
    { ts: number; provider: 'newsdata' | 'rss'; articles: NormalizedNewsArticle[] }
  >();

  const stripHtmlNews = (raw: string, limit: number): string =>
    decodeXmlEntities(raw.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);

  const formatNewsDateBr = (raw: string): string => {
    const s = (raw || '').trim();
    if (!s) return '';
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]} ${iso[4]}:${iso[5]}`;
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      try {
        return new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
          .format(new Date(parsed))
          .replace(',', '');
      } catch {
        return '';
      }
    }
    return s.slice(0, 20);
  };

  const normalizeNewsCategory = (
    rawCats: unknown,
    fallback: NormalizedNewsArticle['category']
  ): NormalizedNewsArticle['category'] => {
    const list = Array.isArray(rawCats) ? rawCats : typeof rawCats === 'string' ? [rawCats] : [];
    for (const c of list) {
      const low = String(c ?? '').trim().toLowerCase();
      if (low === 'breaking' || low === 'world' || low === 'crime' || low === 'entertainment' || low === 'sports') {
        return low;
      }
    }
    return fallback;
  };

  const parseNewsRssXml = (
    xml: string,
    cat: NormalizedNewsArticle['category'],
    sourceLabel: string
  ): NormalizedNewsArticle[] => {
    const out: NormalizedNewsArticle[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && out.length < 14) {
      const body = m[1];
      const titleM = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const descM = body.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const dateM = body.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const linkM = body.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const imgM =
        body.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i) ||
        body.match(/<media:content[^>]*medium=["']image["'][^>]*url=["']([^"']+)["']/i) ||
        body.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*medium=["']image["']/i) ||
        body.match(/<media:content[^>]*url=["']([^"']+)["']/i) ||
        body.match(/<enclosure[^>]*type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["']/i) ||
        body.match(/<img[^>]*src=["']([^"']+)["']/i);
      const vidM =
        body.match(/<media:content[^>]*medium=["']video["'][^>]*url=["']([^"']+)["']/i) ||
        body.match(/<media:content[^>]*type=["']video\/[^"']+["'][^>]*url=["']([^"']+)["']/i) ||
        body.match(/<enclosure[^>]*type=["']video\/[^"']+["'][^>]*url=["']([^"']+)["']/i) ||
        body.match(/<(?:video|source)[^>]*src=["']([^"']+)["']/i);

      const title = titleM ? stripHtmlNews(titleM[1], 220) : '';
      if (!title) continue;
      const desc = descM ? stripHtmlNews(descM[1], 480) : title;
      const rawLink = linkM ? decodeXmlEntities(linkM[1]).trim() : '';
      const rawImg = imgM ? decodeXmlEntities(imgM[1]).trim() : '';
      const rawVid = vidM ? decodeXmlEntities(vidM[1]).trim() : '';

      out.push({
        id: `rss-${cat}-${out.length}-${title.slice(0, 24)}`,
        title,
        description: desc || title,
        content: desc || title,
        source: sourceLabel,
        pubDate: dateM ? formatNewsDateBr(decodeXmlEntities(dateM[1])) : '',
        category: cat,
        categoryLabel: NEWS_CAT_LABELS[cat] ?? 'Brasil',
        imageUrl: rawImg && isSafeExternalUrl(rawImg) ? rawImg : '',
        videoUrl: rawVid && isSafeExternalUrl(rawVid) ? rawVid : '',
        link: rawLink && isSafeExternalUrl(rawLink) ? rawLink : '',
      });
    }
    return out;
  };

  app.get('/api/news', async (req, res) => {
    const rawCat = String(req.query.category ?? 'all').trim().toLowerCase();
    const cat = NEWS_ALLOWED_CATS.has(rawCat) ? rawCat : 'all';
    const force = req.query.refresh === '1' || req.query.refresh === 'true';

    const cached = newsCache.get(cat);
    if (!force && cached && Date.now() - cached.ts < 5 * 60_000) {
      return res.json({
        ok: true,
        provider: cached.provider,
        category: cat,
        fetchedAt: cached.ts,
        cached: true,
        articles: cached.articles,
      });
    }

    const apiKey = (process.env.NEWSDATA_API_KEY || '').trim();
    let articles: NormalizedNewsArticle[] = [];
    let provider: 'newsdata' | 'rss' = 'newsdata';

    if (apiKey) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const params = new URLSearchParams({
          apikey: apiKey,
          country: 'br',
          language: 'pt',
          category: cat === 'all' ? NEWS_DEFAULT_CATS : cat,
        });
        const upstream = await fetch(`https://newsdata.io/api/1/latest?${params.toString()}`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'KPlayer-R36S/2.1.5', Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (upstream.ok) {
          const json = (await upstream.json()) as {
            status?: string;
            results?: Array<{
              article_id?: string;
              title?: string;
              description?: string | null;
              content?: string | null;
              pubDate?: string | null;
              source_name?: string | null;
              source_id?: string | null;
              category?: string[] | string | null;
              image_url?: string | null;
              video_url?: string | null;
              link?: string | null;
            }>;
          };
          if (json.status === 'success' && Array.isArray(json.results)) {
            const seen = new Set<string>();
            const fallbackCat = (cat === 'all' ? 'breaking' : cat) as NormalizedNewsArticle['category'];
            for (const item of json.results.slice(0, 40)) {
              const title = stripHtmlNews(String(item.title ?? ''), 220);
              if (!title || seen.has(title.toLowerCase())) continue;
              seen.add(title.toLowerCase());
              const normCat = normalizeNewsCategory(item.category, fallbackCat);
              const desc = stripHtmlNews(String(item.description ?? ''), 520) || title;
              const rawContent = stripHtmlNews(String(item.content ?? ''), 1800);
              const content =
                !rawContent || rawContent.toUpperCase().includes('ONLY AVAILABLE IN PAID PLANS')
                  ? desc
                  : rawContent;
              const rawImg = String(item.image_url ?? '').trim();
              const rawVid = String(item.video_url ?? '').trim();
              const rawLink = String(item.link ?? '').trim();
              articles.push({
                id: String(item.article_id || `nd-${articles.length}`),
                title,
                description: desc,
                content,
                source: stripHtmlNews(String(item.source_name || item.source_id || 'Brasil'), 64),
                pubDate: formatNewsDateBr(String(item.pubDate ?? '')),
                category: normCat,
                categoryLabel: NEWS_CAT_LABELS[normCat] ?? 'Brasil',
                imageUrl: rawImg && isSafeExternalUrl(rawImg) ? rawImg : '',
                videoUrl: rawVid && isSafeExternalUrl(rawVid) ? rawVid : '',
                link: rawLink && isSafeExternalUrl(rawLink) ? rawLink : '',
              });
            }
          }
        }
      } catch {
        clearTimeout(timer);
      }
    }

    if (articles.length === 0) {
      provider = 'rss';
      const feeds = cat === 'all' ? NEWS_RSS_FEEDS : NEWS_RSS_FEEDS.filter((f) => f.cat === cat);
      const seen = new Set<string>();
      const chunks = await Promise.all(
        feeds.map(async (f) => {
          try {
            const xml = await fetchTextTimeout(f.url, 9_000);
            return parseNewsRssXml(xml, f.cat, f.source);
          } catch {
            return [] as NormalizedNewsArticle[];
          }
        })
      );
      for (const chunk of chunks) {
        for (const a of chunk) {
          if (!seen.has(a.title.toLowerCase())) {
            seen.add(a.title.toLowerCase());
            articles.push(a);
          }
        }
      }
      articles = articles.slice(0, 45);
    }

    if (articles.length > 0) {
      const ts = Date.now();
      newsCache.set(cat, { ts, provider, articles });
      return res.json({
        ok: true,
        provider,
        category: cat,
        fetchedAt: ts,
        cached: false,
        articles,
      });
    }

    if (cached && cached.articles.length > 0) {
      return res.json({
        ok: true,
        provider: cached.provider,
        category: cat,
        fetchedAt: cached.ts,
        cached: true,
        articles: cached.articles,
      });
    }

    return res.status(502).json({ ok: false, error: 'news_fetch_failed', articles: [] });
  });

  // ==================== STANDALONE R36S FILE MANAGER + EDITOR + 7-ZIP API (v2.1.3) ====================
  // Confines all Web Simulator file operations strictly inside data/r36s-fs/ (presented as "/").
  // Real R36S hardware accesses the real Linux root "/" directly via source/file_manager.h.

  const FM_SANDBOX_ROOT = path.resolve(__dirname, 'data', 'r36s-fs');
  const FM_SCRIPT_PATH = path.resolve(__dirname, 'ports', 'kplayer', 'file_ops.py');
  const FM_ARCHIVE_EXTS = new Set([
    '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.xz', '.txz', '.bz2', '.tbz2', '.cbz', '.cbr', '.iso',
  ]);
  const FM_TEXT_EXTS = new Set([
    '.txt', '.xml', '.html', '.htm', '.sh', '.cfg', '.conf', '.ini', '.json', '.log',
    '.md', '.css', '.js', '.py', '.m3u', '.m3u8', '.pls', '.xspf', '.tsv', '.csv',
    '.yaml', '.yml', '.nfo', '.lrc',
  ]);
  const FM_AUDIO_EXTS: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.opus': 'audio/opus',
  };
  const FM_VIDEO_EXTS: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.ts': 'video/mp2t',
  };
  const FM_PROTECTED_VIRTUAL_PATHS = new Set([
    '/', '/roms', '/roms2', '/roms/ports', '/home', '/etc', '/usr', '/usr/bin', '/var',
  ]);

  interface FmJobState {
    id: string;
    op: string;
    status: 'running' | 'done' | 'error' | 'cancelled' | 'bad_password';
    percent: number;
    bytesDone: number;
    bytesTotal: number;
    speedBps: number;
    etaSec: number;
    itemsDone: number;
    itemsTotal: number;
    currentFile: string;
    message: string;
    exitCode: number | null;
    progressFile: string;
    child: ChildProcess | null;
    createdAt: number;
    finishedAt: number | null;
  }

  const fmJobs = new Map<string, FmJobState>();
  let fmSeedPromise: Promise<void> | null = null;

  function isFmArchiveName(name: string): boolean {
    const low = name.toLowerCase();
    for (const ext of FM_ARCHIVE_EXTS) {
      if (low.endsWith(ext)) return true;
    }
    return false;
  }

  function isFmTextName(name: string): boolean {
    return FM_TEXT_EXTS.has(path.extname(name).toLowerCase());
  }

  function isFmScriptName(name: string): boolean {
    return name.toLowerCase().endsWith('.sh');
  }

  function isFmPlaylistName(name: string): boolean {
    const ext = path.extname(name).toLowerCase();
    return ext === '.m3u8' || ext === '.m3u';
  }

  function isFmRadioFile(name: string, virtualPath: string): boolean {
    const ext = path.extname(name).toLowerCase();
    if (ext === '.pls' || ext === '.xspf') return true;
    if (ext === '.tsv' || ext === '.m3u') {
      const low = `${virtualPath}/${name}`.toLowerCase();
      if (low.includes('radio') || low.includes('/radios')) return true;
    }
    return false;
  }

  async function isFmExecutableBinary(realPath: string, name: string): Promise<boolean> {
    if (isFmScriptName(name) || isFmArchiveName(name) || isFmTextName(name)) return false;
    const ext = path.extname(name).toLowerCase();
    if (FM_AUDIO_EXTS[ext] || FM_VIDEO_EXTS[ext]) return false;
    if (name.toLowerCase() === 'emulationstation' || name.toLowerCase().startsWith('emulationstation')) {
      return true;
    }
    try {
      const fh = await fs.open(realPath, 'r');
      const buf = Buffer.alloc(4);
      const { bytesRead } = await fh.read(buf, 0, 4, 0);
      await fh.close();
      if (bytesRead >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
        return true;
      }
      if (bytesRead >= 2 && buf[0] === 0x23 && buf[1] === 0x21) {
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function isValidFmEntryName(raw: unknown): raw is string {
    if (typeof raw !== 'string') return false;
    const name = raw.trim();
    if (!name || name.length > 128) return false;
    if (name === '.' || name === '..') return false;
    if (name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
    return true;
  }

  function resolveFmPath(rawVirtual: unknown): { virtualPath: string; realPath: string } | null {
    const raw = String(rawVirtual ?? '/').replace(/\0/g, '').trim();
    const cleaned = raw.replace(/\\/g, '/');
    const normalized = path.posix.normalize(cleaned.startsWith('/') ? cleaned : `/${cleaned}`);
    if (normalized === '..' || normalized.startsWith('/..')) return null;
    const rel = normalized.replace(/^\/+/, '');
    const realPath = path.resolve(FM_SANDBOX_ROOT, rel);
    if (realPath !== FM_SANDBOX_ROOT && !realPath.startsWith(FM_SANDBOX_ROOT + path.sep)) {
      return null;
    }
    return { virtualPath: normalized || '/', realPath };
  }

  async function ensureFmSandboxSeeded(): Promise<void> {
    if (fmSeedPromise) return fmSeedPromise;
    fmSeedPromise = (async () => {
      const dirs = [
        'roms/bgmusic',
        'roms/videos',
        'roms/ports/kplayer',
        'roms/gba',
        'roms/iptv',
        'roms/radios',
        'roms2/roms',
        'home/ark/Downloads',
        'etc',
        'usr/bin',
        'usr/share',
      ];
      for (const d of dirs) {
        await fs.mkdir(path.join(FM_SANDBOX_ROOT, d), { recursive: true });
      }

      const writeIfMissing = async (rel: string, content: string) => {
        const target = path.join(FM_SANDBOX_ROOT, rel);
        try {
          await fs.access(target);
        } catch {
          await fs.writeFile(target, content, 'utf8');
        }
      };

      await writeIfMissing(
        'roms/ports/kplayer/settings.cfg',
        'theme=0\nvisualizer=0\nkey_sfx=1\nbg_audio=0\nversion=2.1.5\n'
      );
      await writeIfMissing(
        'roms/ports/kplayer/changelog.txt',
        'KPlayer v2.1.5 (R36S)\n- Novo Mini-Player estilo GTA Trainer no jogo acionado por L3 + R3 (clique dos dois analogicos)\n- Navegacao vertical tipo menu de cheats (cima/baixo, B ativa, esquerda/direita volume, L2/R2 troca faixa, A fecha)\n- Leitor de PDF (PdfCraft R36S), Editor de texto nativo e 7-Zip oficial preservados\n'
      );
      await writeIfMissing(
        'roms/ports/kplayer/guia.html',
        '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8" />\n  <title>Guia R36S — KPlayer v2.1.5</title>\n</head>\n<body>\n  <h1>KPlayer R36S v2.1.5</h1>\n  <p>Edite arquivos HTML, XML, TXT e scripts .sh, abra PDFs (PdfCraft R36S) e use L3 + R3 para abrir o Trainer de Musica no jogo.</p>\n</body>\n</html>\n'
      );
      await writeIfMissing(
        'roms/ports/gamelist.xml',
        '<?xml version="1.0" encoding="UTF-8"?>\n<gameList>\n  <game>\n    <path>./KPlayer.sh</path>\n    <name>KPlayer</name>\n    <desc>Player de mídia, rádio, IPTV, notícias, placar e gerenciador de arquivos para R36S.</desc>\n  </game>\n  <game>\n    <path>./IniciarJogo.sh</path>\n    <name>Demo PortMaster R36S</name>\n    <desc>Script .sh de exemplo para testar abertura e edição no KPlayer v2.1.5.</desc>\n  </game>\n</gameList>\n'
      );
      await writeIfMissing(
        'roms/ports/IniciarJogo.sh',
        '#!/bin/bash\n# Script de jogo PortMaster / R36S\nXDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}\nGAMEDIR="/roms/ports/demo_port"\nexport SDL_GAMECONTROLLERCONFIG_FILE="$GAMEDIR/gamecontrollerdb.txt"\ncd "$GAMEDIR"\n$ESUDO chmod 666 /dev/uinput\n./game_arm64 --fullscreen\n'
      );
      await writeIfMissing(
        'usr/bin/emulationstation',
        '#!/bin/sh\n# EmulationStation Frontend Launcher (R36S / dArkOS)\nexec /usr/bin/emulationstation.bin --no-splash "$@"\n'
      );
      await writeIfMissing(
        'roms/iptv/canais-demo.m3u8',
        '#EXTM3U\n#EXTINF:-1 tvg-name="NASA TV Public" group-title="Ciência",NASA TV Public (HLS)\nhttps://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8\n#EXTINF:-1 tvg-name="Big Buck Bunny" group-title="Cinema",Big Buck Bunny (Demo HLS)\nhttps://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8\n'
      );
      await writeIfMissing(
        'roms/radios/estacoes-brasil.pls',
        '[playlist]\nNumberOfEntries=2\nFile1=https://stream.zeno.fm/f3wvbbqmdg8uv\nTitle1=Lofi Beats 24h (Rádio Online)\nLength1=-1\nFile2=https://ice1.somafm.com/groovesalad-128-mp3\nTitle2=SomaFM Groove Salad\nLength2=-1\nVersion=2\n'
      );
      await writeIfMissing(
        'roms/radios/radios-favoritas.m3u',
        '#EXTM3U\n#EXTINF:-1,SomaFM Groove Salad (128kbps)\nhttps://ice1.somafm.com/groovesalad-128-mp3\n#EXTINF:-1,SomaFM DEF CON Radio\nhttps://ice1.somafm.com/defcon-128-mp3\n'
      );
      await writeIfMissing(
        'roms/bgmusic/LEIA-ME.txt',
        'Pasta de músicas do console R36S (/roms/bgmusic).\nPressione B em qualquer música ou vídeo aqui no Gerenciador de Arquivos para reproduzir direto!\n'
      );
      await writeIfMissing(
        'home/ark/Downloads/LEIA-ME-SENHA.txt',
        'Arquivos de teste do Gerenciador de Arquivos KPlayer v2.1.5:\n' +
          '- Manual-KPlayer-R36S.pdf (Documento PDF multi-pagina compativel com PdfCraft R36S)\n' +
          '- pacote-temas-r36s.zip (ZIP padrão, sem senha)\n' +
          '- backup-protegido.zip (ZIP protegido por senha -> senha: r36s)\n'
      );
      await writeIfMissing(
        'etc/os-release',
        'PRETTY_NAME="dArkOS Debian 13 (R36S Simulator Root)"\nID=darkos\nARCH=aarch64\n'
      );

      // Generate a real, valid multi-page PDF 1.4 sample (Manual-KPlayer-R36S.pdf) for PdfCraft R36S testing
      const samplePdfPath = path.join(FM_SANDBOX_ROOT, 'home/ark/Downloads/Manual-KPlayer-R36S.pdf');
      const hasPdf = await fs.access(samplePdfPath).then(() => true).catch(() => false);
      if (!hasPdf) {
        const pdfEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const makePageStream = (title: string, lines: string[]) => {
          const ops = [
            'BT',
            '/F1 18 Tf',
            '48 756 Td',
            `(${pdfEsc(title)}) Tj`,
            '/F1 12 Tf',
            '0 -28 Td',
            ...lines.flatMap((line) => [`(${pdfEsc(line)}) Tj`, '0 -20 Td']),
            'ET',
          ];
          return ops.join('\n') + '\n';
        };
        const p1 = makePageStream('KPlayer v2.1.5 - Manual R36S (Pagina 1/2)', [
          'Leitor de PDF compativel com PdfCraft R36S (kaiaum01/PdfReader-R36s).',
          ' ',
          'Novidades da versao 2.1.5:',
          '1. Novo Mini-Player estilo GTA Trainer no jogo acionado por L3 + R3.',
          '2. Menu flutuante vertical no topo esquerdo: cima/baixo, B ativa, <> volume.',
          '3. Leitor PDF integrado com paginas (L1/R1), zoom (X) e modo texto (Y).',
          '4. Deteccao automatica do motor pdfcraft-core.aarch64 e PdfCraft.sh no R36S.',
        ]);
        const p2 = makePageStream('Compatibilidade PdfCraft R36S (Pagina 2/2)', [
          'Se voce instalar o PdfCraft R36S em /roms/ports/pdfcraft-r36s:',
          '- O KPlayer detecta automaticamente o motor pdfcraft-core.aarch64.',
          '- Usa o protocolo JSON de sessao do PdfCraft (open, render, text, quit).',
          '- Suporta PDFs protegidos por senha e zoom por recorte de viewport.',
          '- Voce tambem pode abrir diretamente no PdfCraft.sh e voltar ao KPlayer.',
          ' ',
          'Controles: L1/R1 mudar pagina | X alternar zoom | Y modo texto | A voltar.',
        ]);
        const objs: string[] = [
          '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
          '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n',
          '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>\nendobj\n',
          `4 0 obj\n<< /Length ${Buffer.byteLength(p1, 'latin1')} >>\nstream\n${p1}endstream\nendobj\n`,
          '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>\nendobj\n',
          `6 0 obj\n<< /Length ${Buffer.byteLength(p2, 'latin1')} >>\nstream\n${p2}endstream\nendobj\n`,
          '7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
          '8 0 obj\n<< /Title (Manual KPlayer R36S v2.1.5) /Author (KPlayer R36S) >>\nendobj\n',
        ];
        let body = '%PDF-1.4\n';
        const offsets: number[] = [0];
        for (const obj of objs) {
          offsets.push(Buffer.byteLength(body, 'latin1'));
          body += obj;
        }
        const xrefOffset = Buffer.byteLength(body, 'latin1');
        body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
        for (let i = 1; i <= objs.length; i++) {
          body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        }
        body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
        await fs.writeFile(samplePdfPath, Buffer.from(body, 'latin1'));
      }

      // Generate a real tiny playable WAV audio sample in /roms/bgmusic/KPlayer-Chime.wav
      const demoWav = path.join(FM_SANDBOX_ROOT, 'roms/bgmusic/KPlayer-Chime.wav');
      const hasWav = await fs.access(demoWav).then(() => true).catch(() => false);
      if (!hasWav) {
        const sampleRate = 22050;
        const durationSec = 1.4;
        const numSamples = Math.floor(sampleRate * durationSec);
        const dataSize = numSamples * 2;
        const buf = Buffer.alloc(44 + dataSize);
        buf.write('RIFF', 0);
        buf.writeUInt32LE(36 + dataSize, 4);
        buf.write('WAVE', 8);
        buf.write('fmt ', 12);
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(1, 22);
        buf.writeUInt32LE(sampleRate, 24);
        buf.writeUInt32LE(sampleRate * 2, 28);
        buf.writeUInt16LE(2, 32);
        buf.writeUInt16LE(16, 34);
        buf.write('data', 36);
        buf.writeUInt32LE(dataSize, 40);
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < numSamples; i++) {
          const t = i / sampleRate;
          const noteIdx = Math.min(notes.length - 1, Math.floor(t / 0.35));
          const localT = t - noteIdx * 0.35;
          const env = Math.min(1, localT * 40) * Math.exp(-localT * 5.2);
          const s = Math.sin(2 * Math.PI * notes[noteIdx] * t) * 0.32 * env;
          buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), 44 + i * 2);
        }
        await fs.writeFile(demoWav, buf);
      }

      // Generate sample plain ZIP and password-protected ZIP (password: "r36s") once
      const plainZip = path.join(FM_SANDBOX_ROOT, 'home/ark/Downloads/pacote-temas-r36s.zip');
      const encZip = path.join(FM_SANDBOX_ROOT, 'home/ark/Downloads/backup-protegido.zip');
      let needsZips = false;
      try {
        await fs.access(plainZip);
        await fs.access(encZip);
      } catch {
        needsZips = true;
      }

      if (needsZips) {
        const seedPy = [
          'import os, struct, sys, time, zipfile, zlib',
          'plain_path, enc_path = sys.argv[1], sys.argv[2]',
          'if not os.path.exists(plain_path):',
          '  with zipfile.ZipFile(plain_path, "w", zipfile.ZIP_DEFLATED) as zf:',
          '    zf.writestr("temas/oled-aurora.txt", "Tema OLED Aurora para KPlayer R36S\\n" * 120)',
          '    zf.writestr("temas/cyber-neon.txt", "Paleta Cyber Neon v2.1.2\\n" * 120)',
          '    zf.writestr("LEIA-ME.txt", "Pacote de temas pronto para descompactar no R36S.\\n")',
          'def write_zipcrypto_zip(out_path, files, password):',
          '  pwd = password.encode("utf-8")',
          '  def crc_byte(c, b): return zlib.crc32(bytes([b]), c ^ 0xFFFFFFFF) ^ 0xFFFFFFFF',
          '  def encrypt(data, crc32_val):',
          '    k0, k1, k2 = 0x12345678, 0x23456789, 0x34567890',
          '    def upd(b):',
          '      nonlocal k0, k1, k2',
          '      k0 = crc_byte(k0, b)',
          '      k1 = ((k1 + (k0 & 0xFF)) * 134775813 + 1) & 0xFFFFFFFF',
          '      k2 = crc_byte(k2, (k1 >> 24) & 0xFF)',
          '    def stream_byte():',
          '      t = (k2 | 2) & 0xFFFF',
          '      return ((t * (t ^ 1)) >> 8) & 0xFF',
          '    for ch in pwd: upd(ch)',
          '    hdr = bytes([0x4B, 0x50, 0x32, 0x31, 0x32, 0x52, 0x33, 0x36, 0x53, 0x00, 0x7A, (crc32_val >> 24) & 0xFF])',
          '    out = bytearray()',
          '    for b in hdr + data:',
          '      c = b ^ stream_byte()',
          '      upd(b)',
          '      out.append(c)',
          '    return bytes(out)',
          '  central = bytearray()',
          '  offset = 0',
          '  with open(out_path, "wb") as f:',
          '    for name, raw in files:',
          '      nb = name.encode("utf-8")',
          '      crc = zlib.crc32(raw) & 0xFFFFFFFF',
          '      enc = encrypt(raw, crc)',
          '      lh = struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0x0001, 0, 0, 0x5821, crc, len(enc), len(raw), len(nb), 0)',
          '      f.write(lh); f.write(nb); f.write(enc)',
          '      ch = struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 20, 20, 0x0001, 0, 0, 0x5821, crc, len(enc), len(raw), len(nb), 0, 0, 0, 0, 0, offset)',
          '      central.extend(ch); central.extend(nb)',
          '      offset += len(lh) + len(nb) + len(enc)',
          '    cd_off = offset',
          '    f.write(central)',
          '    eocd = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(files), len(files), len(central), cd_off, 0)',
          '    f.write(eocd)',
          'if not os.path.exists(enc_path):',
          '  write_zipcrypto_zip(enc_path, [',
          '    ("backup/config-r36s.txt", b"Backup protegido do KPlayer R36S v2.1.2!\\nDescompactado com sucesso usando senha.\\n"),',
          '    ("backup/saves-info.txt", b"Pasta de saves verificada pelo gerenciador de arquivos.\\n"),',
          '  ], "r36s")',
        ].join('\n');

        await new Promise<void>((resolve) => {
          const child = spawn('python3', ['-c', seedPy, plainZip, encZip], { shell: false });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      }
    })();
    return fmSeedPromise;
  }

  function parseFmProgressTsv(raw: string): Partial<FmJobState> | null {
    const line = raw.trim().split(/\r?\n/)[0];
    if (!line) return null;
    const parts = line.split('\t');
    if (parts.length < 10) return null;
    const rawStatus = parts[0];
    const status: FmJobState['status'] =
      rawStatus === 'done' || rawStatus === 'error' || rawStatus === 'cancelled' || rawStatus === 'bad_password'
        ? rawStatus
        : 'running';
    return {
      status,
      percent: Math.max(0, Math.min(100, Number(parts[1]) || 0)),
      bytesDone: Math.max(0, Number(parts[2]) || 0),
      bytesTotal: Math.max(0, Number(parts[3]) || 0),
      speedBps: Math.max(0, Number(parts[4]) || 0),
      etaSec: Number(parts[5]) >= 0 ? Number(parts[5]) : -1,
      itemsDone: Math.max(0, Number(parts[6]) || 0),
      itemsTotal: Math.max(0, Number(parts[7]) || 0),
      op: parts[8] || 'op',
      currentFile: parts[9] || '',
      message: parts[10] || '',
    };
  }

  function pruneOldFmJobs(): void {
    const now = Date.now();
    for (const [id, job] of fmJobs.entries()) {
      if (job.finishedAt && now - job.finishedAt > 10 * 60_000) {
        fs.unlink(job.progressFile).catch(() => undefined);
        fmJobs.delete(id);
      }
    }
  }

  app.get('/api/fm/list', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const showHidden = req.query.hidden === '1' || req.query.hidden === 'true';
      const resolved = resolveFmPath(req.query.path ?? '/');
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      const stat = await fs.stat(resolved.realPath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        return res.status(404).json({ ok: false, error: 'Pasta não encontrada' });
      }
      const dirents = await fs.readdir(resolved.realPath, { withFileTypes: true });
      const entries: Array<{
        name: string;
        path: string;
        isDir: boolean;
        size: number;
        mtime: number;
        isHidden: boolean;
        isArchive: boolean;
        isPdf: boolean;
        isText: boolean;
        isScript: boolean;
        isExecutable: boolean;
        isPlaylist: boolean;
        isRadio: boolean;
        isAudio: boolean;
        isVideo: boolean;
        ext: string;
      }> = [];

      for (const d of dirents) {
        const isHidden = d.name.startsWith('.');
        if (!showHidden && isHidden) continue;
        const full = path.join(resolved.realPath, d.name);
        const st = await fs.lstat(full).catch(() => null);
        if (!st) continue;
        const isDir = st.isDirectory();
        const vPath = resolved.virtualPath === '/' ? `/${d.name}` : `${resolved.virtualPath}/${d.name}`;
        const ext = isDir ? '' : path.extname(d.name).toLowerCase();
        const isArchive = !isDir && isFmArchiveName(d.name);
        const isPdf = !isDir && ext === '.pdf';
        const isScript = !isDir && isFmScriptName(d.name);
        const isRadio = !isDir && isFmRadioFile(d.name, vPath);
        const isPlaylist = !isDir && !isRadio && isFmPlaylistName(d.name);
        const isText = !isDir && isFmTextName(d.name);
        const isAudio = !isDir && Boolean(FM_AUDIO_EXTS[ext]);
        const isVideo = !isDir && Boolean(FM_VIDEO_EXTS[ext]);
        const isExecutable = !isDir && !isPdf && (await isFmExecutableBinary(full, d.name));
        entries.push({
          name: d.name,
          path: vPath,
          isDir,
          size: isDir ? 0 : st.size,
          mtime: Math.floor(st.mtimeMs),
          isHidden,
          isArchive,
          isPdf,
          isText,
          isScript,
          isExecutable,
          isPlaylist,
          isRadio,
          isAudio,
          isVideo,
          ext,
        });
      }

      entries.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      });

      const parentPath =
        resolved.virtualPath === '/' ? '/' : path.posix.dirname(resolved.virtualPath) || '/';

      return res.json({
        ok: true,
        path: resolved.virtualPath,
        parentPath,
        isProtected: FM_PROTECTED_VIRTUAL_PATHS.has(resolved.virtualPath),
        entries,
        quickRoots: [
          { label: '/ (Raiz)', path: '/' },
          { label: '/roms', path: '/roms' },
          { label: '/roms/ports', path: '/roms/ports' },
          { label: '/roms/iptv', path: '/roms/iptv' },
          { label: '/roms/radios', path: '/roms/radios' },
          { label: '/home/ark/Downloads', path: '/home/ark/Downloads' },
        ],
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao listar pasta' });
    }
  });

  // v2.1.3 Text Editor Read/Write (TXT, XML, HTML, SH, CFG, JSON, M3U8, PLS...)
  app.get('/api/fm/text', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.query.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile()) {
        return res.status(404).json({ ok: false, error: 'Arquivo não encontrado' });
      }
      if (st.size > 1024 * 1024) {
        return res.status(413).json({ ok: false, error: 'Arquivo muito grande para o editor (máx. 1 MB)' });
      }
      const rawBuf = await fs.readFile(resolved.realPath);
      if (rawBuf.includes(0)) {
        return res.status(415).json({ ok: false, error: 'Arquivo binário não suportado no editor de texto' });
      }
      const content = rawBuf.toString('utf8');
      const lineCount = content.length === 0 ? 1 : content.split(/\r?\n/).length;
      return res.json({
        ok: true,
        path: resolved.virtualPath,
        name: path.posix.basename(resolved.virtualPath),
        ext: path.extname(resolved.virtualPath).toLowerCase(),
        size: st.size,
        lineCount,
        content,
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao abrir arquivo de texto' });
    }
  });

  app.post('/api/fm/text', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.body?.path);
      if (!resolved || resolved.virtualPath === '/' || FM_PROTECTED_VIRTUAL_PATHS.has(resolved.virtualPath)) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido ou protegido' });
      }
      if (typeof req.body?.content !== 'string') {
        return res.status(400).json({ ok: false, error: 'Conteúdo inválido' });
      }
      const buf = Buffer.from(req.body.content, 'utf8');
      if (buf.byteLength > 1024 * 1024) {
        return res.status(413).json({ ok: false, error: 'Arquivo excede o limite de 1 MB' });
      }
      await fs.mkdir(path.dirname(resolved.realPath), { recursive: true });
      const tmpPath = `${resolved.realPath}.kp_tmp_${randomUUID().slice(0, 8)}`;
      await fs.writeFile(tmpPath, buf);
      await fs.rename(tmpPath, resolved.realPath);
      const lineCount = req.body.content.length === 0 ? 1 : req.body.content.split(/\r?\n/).length;
      return res.json({
        ok: true,
        path: resolved.virtualPath,
        size: buf.byteLength,
        lineCount,
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao salvar arquivo de texto' });
    }
  });

  // v2.1.3 Confined Media File Streamer (only allowed audio/video extensions inside sandbox)
  app.get('/api/fm/raw', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.query.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      const ext = path.extname(resolved.realPath).toLowerCase();
      const mime = FM_AUDIO_EXTS[ext] || FM_VIDEO_EXTS[ext];
      if (!mime) {
        return res.status(415).json({ ok: false, error: 'Formato de mídia não suportado para reprodução direta' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile()) {
        return res.status(404).json({ ok: false, error: 'Arquivo de mídia não encontrado' });
      }
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');

      const range = req.headers.range;
      if (range && /^bytes=\d*-\d*$/.test(range)) {
        const [startStr, endStr] = range.replace(/^bytes=/, '').split('-');
        const start = startStr ? Math.min(st.size - 1, Math.max(0, parseInt(startStr, 10))) : 0;
        const end = endStr ? Math.min(st.size - 1, Math.max(start, parseInt(endStr, 10))) : st.size - 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        const fh = await fs.open(resolved.realPath, 'r');
        const chunk = Buffer.alloc(end - start + 1);
        await fh.read(chunk, 0, chunk.length, start);
        await fh.close();
        return res.end(chunk);
      }
      res.setHeader('Content-Length', String(st.size));
      const fullBuf = await fs.readFile(resolved.realPath);
      return res.end(fullBuf);
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao reproduzir mídia' });
    }
  });

  // v2.1.3 Playlist (.m3u8/.m3u) & Radio (.pls/.xspf/.tsv) parser inside sandbox
  app.post('/api/fm/parse-playlist', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.body?.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Arquivo inválido' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile() || st.size > 2 * 1024 * 1024) {
        return res.status(404).json({ ok: false, error: 'Lista não encontrada ou muito grande' });
      }
      const raw = await fs.readFile(resolved.realPath, 'utf8');
      const name = path.posix.basename(resolved.virtualPath);
      const ext = path.extname(name).toLowerCase();
      const isRadioHint = isFmRadioFile(name, resolved.virtualPath);
      const baseDir = path.posix.dirname(resolved.virtualPath) || '/';

      const sanitizeEntryUrl = (candidate: string): { url: string; isLocal: boolean } | null => {
        const trimmed = candidate.trim();
        if (!trimmed) return null;
        if (/^https?:\/\//i.test(trimmed)) {
          try {
            const parsed = new URL(trimmed);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
              return { url: parsed.toString(), isLocal: false };
            }
          } catch {
            return null;
          }
          return null;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
          return null; // block javascript:, data:, file:, etc.
        }
        const localVirtual = trimmed.startsWith('/') ? trimmed : path.posix.join(baseDir, trimmed);
        const localResolved = resolveFmPath(localVirtual);
        if (!localResolved) return null;
        return { url: localResolved.virtualPath, isLocal: true };
      };

      const items: Array<{ title: string; url: string; isLocal: boolean; isVideo: boolean; group: string }> = [];

      if (ext === '.pls') {
        const files = new Map<number, string>();
        const titles = new Map<number, string>();
        for (const rawLine of raw.split(/\r?\n/)) {
          const line = rawLine.trim();
          const fm = line.match(/^File(\d+)\s*=\s*(.+)$/i);
          if (fm) files.set(Number(fm[1]), fm[2].trim());
          const tm = line.match(/^Title(\d+)\s*=\s*(.+)$/i);
          if (tm) titles.set(Number(tm[1]), tm[2].trim());
        }
        const keys = Array.from(files.keys()).sort((a, b) => a - b);
        for (const k of keys) {
          const safe = sanitizeEntryUrl(files.get(k) || '');
          if (!safe) continue;
          items.push({
            title: titles.get(k) || path.posix.basename(safe.url) || safe.url,
            url: safe.url,
            isLocal: safe.isLocal,
            isVideo: false,
            group: 'Rádio PLS',
          });
        }
      } else if (ext === '.tsv') {
        for (const rawLine of raw.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const parts = line.split('\t');
          if (parts.length < 2) continue;
          const safe = sanitizeEntryUrl(parts[1]);
          if (!safe) continue;
          items.push({
            title: parts[0].trim() || safe.url,
            url: safe.url,
            isLocal: safe.isLocal,
            isVideo: false,
            group: (parts[2] || 'Rádio').trim(),
          });
        }
      } else if (ext === '.xspf') {
        const trackBlocks = raw.match(/<track\b[^>]*>[\s\S]*?<\/track>/gi) || [];
        for (const blk of trackBlocks) {
          const lm = blk.match(/<location>([^<]+)<\/location>/i);
          if (!lm) continue;
          const safe = sanitizeEntryUrl(lm[1]);
          if (!safe) continue;
          const tm = blk.match(/<title>([^<]+)<\/title>/i);
          items.push({
            title: (tm ? tm[1].trim() : '') || path.posix.basename(safe.url) || safe.url,
            url: safe.url,
            isLocal: safe.isLocal,
            isVideo: !isRadioHint,
            group: isRadioHint ? 'Rádio XSPF' : 'Playlist XSPF',
          });
        }
      } else {
        let pendingTitle = '';
        let pendingGroup = isRadioHint ? 'Rádio M3U' : 'Playlist M3U8';
        for (const rawLine of raw.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          if (line.startsWith('#EXTINF:')) {
            const gm = line.match(/group-title="([^"]+)"/i);
            if (gm) pendingGroup = gm[1].trim();
            const comma = line.lastIndexOf(',');
            if (comma >= 0 && comma + 1 < line.length) {
              pendingTitle = line.slice(comma + 1).trim();
            }
            continue;
          }
          if (line.startsWith('#')) continue;
          const safe = sanitizeEntryUrl(line);
          if (!safe) continue;
          const lowerUrl = safe.url.toLowerCase();
          const isVid = safe.isLocal
            ? Boolean(FM_VIDEO_EXTS[path.extname(lowerUrl)])
            : !isRadioHint && (lowerUrl.includes('.m3u8') || lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.ts') || ext === '.m3u8');
          items.push({
            title: pendingTitle || path.posix.basename(safe.url) || safe.url,
            url: safe.url,
            isLocal: safe.isLocal,
            isVideo: isVid,
            group: pendingGroup,
          });
          pendingTitle = '';
        }
      }

      return res.json({
        ok: true,
        path: resolved.virtualPath,
        name,
        kind: isRadioHint ? 'radio' : 'playlist',
        count: items.length,
        items: items.slice(0, 500),
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao ler playlist ou arquivo de rádio' });
    }
  });

  // v2.1.4 Confined PDF Streamer & PdfCraft R36S (kaiaum01/PdfReader-R36s) Inspector
  app.get('/api/fm/pdf', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.query.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      if (path.extname(resolved.realPath).toLowerCase() !== '.pdf') {
        return res.status(400).json({ ok: false, error: 'Apenas arquivos .pdf são permitidos' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile() || st.size <= 0 || st.size > 128 * 1024 * 1024) {
        return res.status(404).json({ ok: false, error: 'Arquivo PDF não encontrado' });
      }
      const buf = await fs.readFile(resolved.realPath);
      if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        return res.status(400).json({ ok: false, error: 'Cabeçalho %PDF- inválido' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buf);
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao carregar PDF' });
    }
  });

  app.post('/api/fm/pdf/info', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.body?.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      if (path.extname(resolved.realPath).toLowerCase() !== '.pdf') {
        return res.status(400).json({ ok: false, error: 'Selecione um arquivo .pdf' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile() || st.size <= 0 || st.size > 128 * 1024 * 1024) {
        return res.status(404).json({ ok: false, error: 'Arquivo PDF não encontrado' });
      }
      const buf = await fs.readFile(resolved.realPath);
      if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        return res.status(400).json({ ok: false, error: 'Cabeçalho %PDF- inválido' });
      }
      const latin = buf.toString('latin1');
      const encrypted = /\/Encrypt\b/.test(latin);
      const titleMatch = latin.match(/\/Title\s*\(((?:\\.|[^\\)]){1,240})\)/);
      const decodeLit = (raw: string) =>
        raw
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
      const title = titleMatch ? decodeLit(titleMatch[1]).trim() : path.posix.basename(resolved.virtualPath, '.pdf');
      const pageMatches = latin.match(/\/Type\s*\/Page(?![A-Za-z])/g) || [];
      let pageCount = pageMatches.length;
      if (pageCount === 0) {
        const cntM = latin.match(/\/Type\s*\/Pages\b[^>]{0,240}\/Count\s+(\d+)/s);
        pageCount = cntM ? Math.max(1, Number(cntM[1])) : 1;
      }

      const pageTexts: string[] = [];
      if (!encrypted) {
        const streamRe = /(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let sm: RegExpExecArray | null;
        while ((sm = streamRe.exec(latin)) !== null && pageTexts.length < 200) {
          const hdr = sm[1];
          let content = sm[2];
          if (/\/FlateDecode\b/.test(hdr)) {
            try {
              content = inflateSync(Buffer.from(content, 'latin1')).toString('latin1');
            } catch {
              continue;
            }
          }
          if (!content.includes('BT') || (!content.includes('Tj') && !content.includes('TJ'))) continue;
          const lines: string[] = [];
          const opRe = /\[([\s\S]*?)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|')/g;
          let om: RegExpExecArray | null;
          while ((om = opRe.exec(content)) !== null) {
            let line = '';
            if (om[1] !== undefined) {
              const lits = om[1].match(/\((?:\\.|[^\\)])*\)/g) || [];
              line = lits.map((l) => decodeLit(l.slice(1, -1))).join('');
            } else if (om[2] !== undefined) {
              line = decodeLit(om[2]);
            }
            if (line.trim()) lines.push(line.trim());
          }
          if (lines.length > 0) pageTexts.push(lines.join('\n'));
        }
      }

      return res.json({
        ok: true,
        path: resolved.virtualPath,
        name: path.posix.basename(resolved.virtualPath),
        title,
        size: st.size,
        pageCount,
        encrypted,
        pageTexts,
        engine: 'KPlayer PDF + PdfCraft R36S',
        pdfcraftCompat: {
          repo: 'kaiaum01/PdfReader-R36s',
          engineName: 'PdfCraft R36S (pdfcraft-core.aarch64)',
          protocol: 'serve JSON IPC (open / render / text / quit)',
        },
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao inspecionar PDF' });
    }
  });

  // v2.1.3/v2.1.4 Safe R36S Script (.sh) & EmulationStation Launcher Preview (never executes shell on server host)
  app.post('/api/fm/launch', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.body?.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Caminho inválido' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile()) {
        return res.status(404).json({ ok: false, error: 'Arquivo não encontrado' });
      }
      const name = path.posix.basename(resolved.virtualPath);
      const isScript = isFmScriptName(name);
      const isExec = isScript || (await isFmExecutableBinary(resolved.realPath, name));
      if (!isExec) {
        return res.status(400).json({ ok: false, error: 'Arquivo não é um script .sh nem executável do EmulationStation' });
      }
      const bgAudioPreview = Boolean(req.body?.bgAudioPreview);
      const activeMediaTitle =
        typeof req.body?.activeMediaTitle === 'string' ? req.body.activeMediaTitle.trim().slice(0, 120) : '';
      const activeMediaKind =
        req.body?.activeMediaKind === 'radio' || req.body?.activeMediaKind === 'music'
          ? (req.body.activeMediaKind as 'radio' | 'music')
          : null;

      const rawBuf = await fs.readFile(resolved.realPath);
      const isElf = rawBuf.length >= 4 && rawBuf[0] === 0x7f && rawBuf[1] === 0x45 && rawBuf[2] === 0x4c && rawBuf[3] === 0x46;
      const lines: string[] = [];
      let interpreter = isElf ? 'ELF ARM64 (Execução direta)' : '/bin/bash';
      let targetDir = path.posix.dirname(resolved.virtualPath) || '/';
      let gameDir = '';
      let execLine = '';

      if (!isElf) {
        const text = rawBuf.toString('utf8', 0, Math.min(rawBuf.length, 16384));
        const textLines = text.split(/\r?\n/);
        if (textLines[0]?.startsWith('#!')) {
          interpreter = textLines[0].slice(2).trim();
        }
        for (const l of textLines) {
          const s = l.trim();
          if (!s || s.startsWith('#')) continue;
          const gdm = s.match(/^GAMEDIR\s*=\s*["']?([^"']+)["']?/);
          if (gdm) gameDir = gdm[1];
          if (s.startsWith('exec ') || s.startsWith('./') || s.includes('emulationstation')) {
            execLine = s;
          }
        }
        if (bgAudioPreview) {
          lines.push(`[R36S • Teste prévio] Liberando SDL2/gptokeyb via código 43 e isolando LD_LIBRARY_PATH para o jogo...`);
          if (activeMediaKind && activeMediaTitle) {
            lines.push(
              `[Áudio em fundo] ./kplayer --bg-audio (libVLC nativo + ALSA dmix/Pulse): ${activeMediaKind === 'radio' ? 'rádio' : 'música'} "${activeMediaTitle}" (55% vol)`
            );
          } else {
            lines.push(`[Áudio em fundo] ./kplayer --bg-audio pronto com fila de músicas/rádios (pausado até L3 + R3).`);
          }
          lines.push(`[KPlayer Trainer] Menu estilo GTA oculto por padrão • L3 + R3 abre/fecha • ↑↓ menu • B ativa • ←→ vol • L2/R2 faixa.`);
          lines.push(`[R36S] Diretório de trabalho: ${gameDir || targetDir}`);
          lines.push(`[R36S] Executando via bg_audio.py: ${interpreter.split(/\s+/)[0]} "${resolved.virtualPath}"`);
          if (execLine) {
            lines.push(`[Script] Alvo principal detectado: ${execLine}`);
          }
          lines.push(`[R36S • Teste prévio] Ao sair do jogo, o daemon --bg-audio encerra com segurança e o KPlayer retorna automaticamente.`);
        } else {
          lines.push(`[R36S] Encerrando SDL2/libVLC do KPlayer para liberar tela e áudio ALSA...`);
          lines.push(`[R36S] Diretório de trabalho: ${gameDir || targetDir}`);
          lines.push(`[R36S] Interpretador: ${interpreter}`);
          lines.push(`[R36S] Comando de handoff nativo: execv("${interpreter.split(/\s+/)[0]}", ["${resolved.virtualPath}"])`);
          if (execLine) {
            lines.push(`[Script] Alvo principal detectado: ${execLine}`);
          }
          lines.push(`[Simulador Web] Script validado com segurança (no console R36S real, o jogo/EmulationStation assume a tela imediatamente).`);
        }
      } else {
        lines.push(`[R36S] Binário ELF detectado (${st.size} bytes).`);
        if (bgAudioPreview) {
          lines.push(
            activeMediaKind && activeMediaTitle
              ? `[R36S • Teste prévio] ./kplayer --bg-audio mantendo ${activeMediaKind === 'radio' ? 'rádio' : 'música'} "${activeMediaTitle}" com KPlayer Trainer (L3 + R3).`
              : `[R36S • Teste prévio] ./kplayer --bg-audio pronto — pressione L3 + R3 no jogo para abrir o KPlayer Trainer.`
          );
        } else {
          lines.push(`[R36S] Encerrando SDL2/libVLC do KPlayer para liberar framebuffer DRM/KMS...`);
        }
        lines.push(`[R36S] Comando de handoff nativo: execv("${resolved.virtualPath}", ["${resolved.virtualPath}"])`);
        lines.push(`[Simulador Web] Executável pronto para iniciar diretamente no hardware R36S.`);
      }

      return res.json({
        ok: true,
        path: resolved.virtualPath,
        name,
        kind: isScript ? 'script' : 'executable',
        interpreter,
        targetDir: gameDir || targetDir,
        bgAudioActive: Boolean(bgAudioPreview && activeMediaKind && activeMediaTitle),
        bgAudioPreview,
        logLines: lines,
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao preparar execução do arquivo' });
    }
  });

  app.post('/api/fm/mkdir', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const parentResolved = resolveFmPath(req.body?.parent ?? '/');
      const name = req.body?.name;
      if (!parentResolved || !isValidFmEntryName(name)) {
        return res.status(400).json({ ok: false, error: 'Nome de pasta inválido' });
      }
      const targetVirtual =
        parentResolved.virtualPath === '/' ? `/${name.trim()}` : `${parentResolved.virtualPath}/${name.trim()}`;
      const targetResolved = resolveFmPath(targetVirtual);
      if (!targetResolved) {
        return res.status(400).json({ ok: false, error: 'Caminho de destino inválido' });
      }
      await fs.mkdir(targetResolved.realPath, { recursive: false });
      return res.json({ ok: true, path: targetResolved.virtualPath });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EEXIST') {
        return res.status(409).json({ ok: false, error: 'Já existe um item com esse nome' });
      }
      return res.status(500).json({ ok: false, error: 'Falha ao criar pasta' });
    }
  });

  app.post('/api/fm/rename', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const srcResolved = resolveFmPath(req.body?.path);
      const newName = req.body?.newName;
      if (!srcResolved || !isValidFmEntryName(newName)) {
        return res.status(400).json({ ok: false, error: 'Nome inválido para renomear' });
      }
      if (FM_PROTECTED_VIRTUAL_PATHS.has(srcResolved.virtualPath)) {
        return res.status(403).json({ ok: false, error: 'Pasta protegida do sistema não pode ser renomeada' });
      }
      const parentVirtual = path.posix.dirname(srcResolved.virtualPath) || '/';
      const dstVirtual = parentVirtual === '/' ? `/${newName.trim()}` : `${parentVirtual}/${newName.trim()}`;
      const dstResolved = resolveFmPath(dstVirtual);
      if (!dstResolved) {
        return res.status(400).json({ ok: false, error: 'Destino inválido' });
      }
      const exists = await fs.access(dstResolved.realPath).then(() => true).catch(() => false);
      if (exists) {
        return res.status(409).json({ ok: false, error: 'Já existe um item com esse nome' });
      }
      await fs.rename(srcResolved.realPath, dstResolved.realPath);
      return res.json({ ok: true, path: dstResolved.virtualPath });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao renomear item' });
    }
  });

  app.post('/api/fm/archive/list', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      const resolved = resolveFmPath(req.body?.path);
      if (!resolved) {
        return res.status(400).json({ ok: false, error: 'Arquivo inválido' });
      }
      const st = await fs.stat(resolved.realPath).catch(() => null);
      if (!st || !st.isFile()) {
        return res.status(404).json({ ok: false, error: 'Arquivo não encontrado' });
      }
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const args = [FM_SCRIPT_PATH, 'list-archive', resolved.realPath];
      if (password) args.push('--password-stdin');

      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn('python3', args, { shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          if (stdout.length < 2 * 1024 * 1024) stdout += chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer) => {
          if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
        });
        if (password) {
          child.stdin.write(`${password}\n`);
        }
        child.stdin.end();
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
        child.on('error', () => resolve({ code: 1, stdout: '', stderr: 'spawn_failed' }));
      });

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(result.stdout || '{}') as Record<string, unknown>;
      } catch {
        parsed = { ok: false, error: 'Falha ao ler conteúdo do arquivo compactado' };
      }

      return res.json({
        ok: Boolean(parsed.ok),
        archivePath: resolved.virtualPath,
        engine: parsed.engine ?? 'python-zipfile',
        encrypted: Boolean(parsed.encrypted),
        badPassword: Boolean(parsed.bad_password) || result.code === 3,
        count: Number(parsed.count) || 0,
        totalSize: Number(parsed.total_size) || 0,
        items: Array.isArray(parsed.items) ? parsed.items : [],
        error: typeof parsed.error === 'string' ? parsed.error : undefined,
      });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao abrir arquivo compactado' });
    }
  });

  app.post('/api/fm/job/start', async (req, res) => {
    try {
      await ensureFmSandboxSeeded();
      pruneOldFmJobs();

      const action = String(req.body?.action ?? '');
      if (!['copy', 'move', 'delete', 'extract', 'compress'].includes(action)) {
        return res.status(400).json({ ok: false, error: 'Ação inválida' });
      }

      const rawSources: unknown[] = Array.isArray(req.body?.sources) ? req.body.sources : [];
      if (rawSources.length === 0 || rawSources.length > 256) {
        return res.status(400).json({ ok: false, error: 'Selecione pelo menos um item' });
      }

      const resolvedSources: Array<{ virtualPath: string; realPath: string }> = [];
      for (const s of rawSources) {
        const r = resolveFmPath(s);
        if (!r) return res.status(400).json({ ok: false, error: 'Caminho de origem inválido' });
        if ((action === 'delete' || action === 'move') && FM_PROTECTED_VIRTUAL_PATHS.has(r.virtualPath)) {
          return res.status(403).json({
            ok: false,
            error: `Pasta protegida do sistema não pode ser removida ou movida: ${r.virtualPath}`,
          });
        }
        resolvedSources.push(r);
      }

      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const jobId = randomUUID();
      const progressFile = path.join(os.tmpdir(), `kplayer-fm-${jobId}.tsv`);
      let args: string[] = [];

      if (action === 'copy' || action === 'move') {
        const destResolved = resolveFmPath(req.body?.dest);
        if (!destResolved) {
          return res.status(400).json({ ok: false, error: 'Pasta de destino inválida' });
        }
        args = [
          FM_SCRIPT_PATH,
          action,
          '--dest',
          destResolved.realPath,
          '--progress',
          progressFile,
          ...resolvedSources.map((s) => s.realPath),
        ];
      } else if (action === 'delete') {
        args = [
          FM_SCRIPT_PATH,
          'delete',
          '--progress',
          progressFile,
          ...resolvedSources.map((s) => s.realPath),
        ];
      } else if (action === 'extract') {
        const destResolved = resolveFmPath(req.body?.dest);
        if (!destResolved) {
          return res.status(400).json({ ok: false, error: 'Pasta de destino inválida' });
        }
        await fs.mkdir(destResolved.realPath, { recursive: true });
        args = [
          FM_SCRIPT_PATH,
          'extract',
          resolvedSources[0].realPath,
          '--dest',
          destResolved.realPath,
          '--progress',
          progressFile,
        ];
        if (password) args.push('--password-stdin');
      } else if (action === 'compress') {
        const destDirResolved = resolveFmPath(req.body?.dest ?? '/');
        const rawOutName = String(req.body?.outputName ?? 'arquivo.zip').trim();
        const safeOutName = rawOutName.toLowerCase().endsWith('.zip') ? rawOutName : `${rawOutName}.zip`;
        if (!destDirResolved || !isValidFmEntryName(safeOutName)) {
          return res.status(400).json({ ok: false, error: 'Nome de arquivo ZIP inválido' });
        }
        const outVirtual =
          destDirResolved.virtualPath === '/' ? `/${safeOutName}` : `${destDirResolved.virtualPath}/${safeOutName}`;
        const outResolved = resolveFmPath(outVirtual);
        if (!outResolved) {
          return res.status(400).json({ ok: false, error: 'Destino do ZIP inválido' });
        }
        args = [
          FM_SCRIPT_PATH,
          'compress',
          '--output',
          outResolved.realPath,
          '--progress',
          progressFile,
          ...resolvedSources.map((s) => s.realPath),
        ];
      }

      const child = spawn('python3', args, { shell: false });
      const job: FmJobState = {
        id: jobId,
        op: action,
        status: 'running',
        percent: 0,
        bytesDone: 0,
        bytesTotal: 0,
        speedBps: 0,
        etaSec: -1,
        itemsDone: 0,
        itemsTotal: resolvedSources.length,
        currentFile: path.basename(resolvedSources[0].realPath),
        message: 'Iniciando operação...',
        exitCode: null,
        progressFile,
        child,
        createdAt: Date.now(),
        finishedAt: null,
      };
      fmJobs.set(jobId, job);

      if (action === 'extract' && password) {
        child.stdin.write(`${password}\n`);
      }
      child.stdin.end();

      child.on('close', async (code) => {
        job.child = null;
        job.exitCode = code ?? 1;
        job.finishedAt = Date.now();
        try {
          const tsv = await fs.readFile(progressFile, 'utf8');
          const parsed = parseFmProgressTsv(tsv);
          if (parsed) Object.assign(job, parsed);
        } catch {
          // progress file may not exist on immediate failure
        }
        if (job.status === 'running') {
          if (code === 0) {
            job.status = 'done';
            job.percent = 100;
            job.etaSec = 0;
            job.message = 'Operação concluída';
          } else if (code === 3) {
            job.status = 'bad_password';
            job.message = 'Senha incorreta ou arquivo criptografado';
          } else if (code === 4) {
            job.status = 'cancelled';
            job.message = 'Operação cancelada';
          } else {
            job.status = 'error';
            job.message = 'Falha na operação de arquivo';
          }
        }
      });

      child.on('error', () => {
        job.child = null;
        job.exitCode = 1;
        job.status = 'error';
        job.finishedAt = Date.now();
        job.message = 'Não foi possível iniciar o motor de arquivos';
      });

      return res.json({ ok: true, jobId });
    } catch {
      return res.status(500).json({ ok: false, error: 'Falha ao iniciar operação' });
    }
  });

  app.get('/api/fm/job/:id', async (req, res) => {
    const job = fmJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ ok: false, error: 'Operação não encontrada' });
    }
    if (job.status === 'running') {
      try {
        const tsv = await fs.readFile(job.progressFile, 'utf8');
        const parsed = parseFmProgressTsv(tsv);
        if (parsed) {
          job.percent = parsed.percent ?? job.percent;
          job.bytesDone = parsed.bytesDone ?? job.bytesDone;
          job.bytesTotal = parsed.bytesTotal ?? job.bytesTotal;
          job.speedBps = parsed.speedBps ?? job.speedBps;
          job.etaSec = parsed.etaSec ?? job.etaSec;
          job.itemsDone = parsed.itemsDone ?? job.itemsDone;
          job.itemsTotal = parsed.itemsTotal ?? job.itemsTotal;
          job.op = parsed.op ?? job.op;
          job.currentFile = parsed.currentFile ?? job.currentFile;
          job.message = parsed.message ?? job.message;
        }
      } catch {
        // File not flushed yet
      }
    }
    return res.json({
      ok: true,
      job: {
        id: job.id,
        op: job.op,
        status: job.status,
        percent: job.percent,
        bytesDone: job.bytesDone,
        bytesTotal: job.bytesTotal,
        speedBps: job.speedBps,
        etaSec: job.etaSec,
        itemsDone: job.itemsDone,
        itemsTotal: job.itemsTotal,
        currentFile: job.currentFile,
        message: job.message,
        badPassword: job.status === 'bad_password' || job.exitCode === 3,
        exitCode: job.exitCode,
      },
    });
  });

  app.post('/api/fm/job/:id/cancel', (req, res) => {
    const job = fmJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ ok: false, error: 'Operação não encontrada' });
    }
    if (job.child && !job.child.killed) {
      job.child.kill('SIGTERM');
    }
    return res.json({ ok: true });
  });

  app.get('/api/stream', async (req, res) => {
    const target = String(req.query.url ?? '');
    if (!isSafeExternalUrl(target)) {
      return res.status(400).json({ error: 'Invalid stream URL' });
    }
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    try {
      let hostMeta: StreamHeadersMeta | undefined = streamHeaderMap.get(target);
      if (!hostMeta) {
        try {
          hostMeta = streamHostHeaderMap.get(new URL(target).host);
        } catch {
          hostMeta = undefined;
        }
      }
      const headers: Record<string, string> = {
        'User-Agent': hostMeta?.userAgent || 'KPlayer-R36S/2.1.5',
        Accept: '*/*',
      };
      if (hostMeta?.referer) {
        headers.Referer = hostMeta.referer;
        try {
          headers.Origin = new URL(hostMeta.referer).origin;
        } catch {
          // ignore
        }
      }
      if (typeof req.headers.range === 'string' && req.headers.range.startsWith('bytes=')) {
        headers.Range = req.headers.range;
      }

      const upstream = await fetch(target, {
        signal: controller.signal,
        redirect: 'follow',
        headers,
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status || 502).end();
      }

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const lowerTarget = target.toLowerCase();
      const isPlaylist =
        contentType.toLowerCase().includes('mpegurl') ||
        lowerTarget.includes('.m3u8') ||
        lowerTarget.includes('master.txt') ||
        lowerTarget.endsWith('/error.txt');

      if (isPlaylist) {
        const text = await upstream.text();
        const base = new URL(upstream.url || target);
        const proxify = (rawUrl: string) => {
          try {
            const abs = new URL(rawUrl, base).toString();
            return `/api/stream?url=${encodeURIComponent(abs)}`;
          } catch {
            return rawUrl;
          }
        };
        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_m, u: string) => `URI="${proxify(u)}"`);
            }
            return proxify(trimmed);
          })
          .join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(rewritten);
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      const acceptRanges = upstream.headers.get('accept-ranges');
      const contentRange = upstream.headers.get('content-range');
      const contentLength = upstream.headers.get('content-length');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (contentLength) res.setHeader('Content-Length', contentLength);

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.end();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(502).end();
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, HOST, () => {
    console.log(`KPlayer 2.1.5 (R36S) listening on http://${HOST}:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start KPlayer server:', err);
  process.exit(1);
});
