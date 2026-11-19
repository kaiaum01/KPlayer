import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

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

interface IptvChannel {
  name: string;
  url: string;
  logo: string;
  group: string;
  id: string;
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

function parseIptvM3u(content: string, max = 2048): IptvChannel[] {
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
    if (out.length >= max) break;
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
        logo,
        group,
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

async function fetchJsonWithFallback(paths: string[], timeoutMs = 8000): Promise<unknown> {
  let lastErr: unknown;
  for (const url of paths) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-R36S/2.0.0' },
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

  // Serve real R36S sprites and Manrope fonts from the latest commit
  app.use('/sprites', express.static(path.join(__dirname, 'ports', 'kplayer', 'sprites')));
  app.use('/fonts', express.static(path.join(__dirname, 'extras', 'fontes-modernas')));

  const r36sZipPath = path.join(__dirname, 'releases', 'KPlayer-v2.0.0-R36S.zip');
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
        version: '2.0.0',
        filename: 'KPlayer-v2.0.0-R36S.zip',
        sizeBytes: stat.size,
        sha256,
        arch: 'ARM64 (aarch64-linux-gnu / dArkOS / PortMaster)',
      });
    } catch {
      return res.status(404).json({ ready: false });
    }
  });

  app.get('/api/r36s/download', async (_req, res) => {
    try {
      await fs.access(r36sZipPath);
      return res.download(r36sZipPath, 'KPlayer-v2.0.0-R36S.zip');
    } catch {
      return res.status(404).json({ error: 'Pacote R36S não encontrado' });
    }
  });

  app.get('/api/r36s/sha256', async (_req, res) => {
    try {
      await fs.access(r36sShaPath);
      return res.download(r36sShaPath, 'KPlayer-v2.0.0-R36S.zip.sha256');
    } catch {
      return res.status(404).json({ error: 'Checksum não encontrado' });
    }
  });

  app.get('/api/user-radios', async (_req, res) => {
    const dirs = [
      path.join(__dirname, 'ports', 'kplayer', 'radios_usuario'),
      path.join(__dirname, 'kplayer', 'radios_usuario'),
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

  app.get('/api/iptv', async (req, res) => {
    const source = req.query.source === 'world' ? 'world' : 'br';
    const force = req.query.refresh === '1';
    const cached = iptvCache.get(source);
    if (!force && cached && Date.now() - cached.ts < 10 * 60_000) {
      return res.json({ channels: cached.data });
    }

    const url =
      source === 'world'
        ? 'https://raw.githubusercontent.com/iptv-com/iptv/main/lists/world.m3u'
        : 'https://raw.githubusercontent.com/iptv-com/iptv/main/lists/brazil.m3u';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'KPlayer-R36S/2.0.0' },
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      const channels = parseIptvM3u(text, 2048);
      iptvCache.set(source, { ts: Date.now(), data: channels });
      return res.json({ channels });
    } catch {
      clearTimeout(timer);
      return res.json({ channels: cached?.data ?? [], stale: true });
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
            { signal: controller.signal, headers: { 'User-Agent': 'KPlayer-R36S/2.0.0' } }
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
        { signal: controller.signal, headers: { 'User-Agent': 'KPlayer-R36S/2.0.0' } }
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
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const r = await fetch('http://ip-api.com/json/?fields=status,city,region', {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = (await r.json()) as { status?: string; city?: string; region?: string };
      if (data.status === 'success' && data.city) {
        return res.json({ location: data.region ? `${data.city}, ${data.region}` : data.city });
      }
      return res.json({ location: 'Mídias locais' });
    } catch {
      clearTimeout(timer);
      return res.json({ location: 'Mídias locais' });
    }
  });

  app.get('/api/stream', async (req, res) => {
    const target = String(req.query.url ?? '');
    if (!isSafeExternalUrl(target)) {
      return res.status(400).json({ error: 'Invalid stream URL' });
    }
    const controller = new AbortController();
    req.on('close', () => controller.abort());
    try {
      const upstream = await fetch(target, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'KPlayer-R36S/2.0.0',
          Accept: '*/*',
        },
      });
      if (!upstream.ok || !upstream.body) {
        return res.status(upstream.status || 502).end();
      }
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');

      // Rewrite relative URLs inside M3U8 manifests so HLS playback works through proxy
      if (
        contentType.includes('mpegurl') ||
        target.toLowerCase().includes('.m3u8')
      ) {
        const text = await upstream.text();
        const base = new URL(upstream.url || target);
        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            try {
              const abs = new URL(trimmed, base).toString();
              return `/api/stream?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');
        return res.send(rewritten);
      }

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
    console.log(`KPlayer 2.0.0 (R36S) listening on http://${HOST}:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start KPlayer server:', err);
  process.exit(1);
});
