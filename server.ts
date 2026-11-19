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
  league: string;
  home: string;
  score: string;
  away: string;
  status: string;
}

const radioCache = new Map<string, { ts: number; data: RadioStation[] }>();
const iptvCache = new Map<string, { ts: number; data: IptvChannel[] }>();
let footballCache: { ts: number; data: FootballMatch[] } | null = null;

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
        headers: { 'User-Agent': 'KPlayer-R36S/1.0.4' },
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

  app.get('/api/youtube/search', async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (!q) return res.json({ items: [] });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20250101.00.00',
              hl: 'pt',
              gl: 'BR',
            },
          },
          query: q,
        }),
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as unknown;

      const items: Array<{ id: string; title: string; channel: string; thumb: string }> = [];
      const seen = new Set<string>();

      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object' || items.length >= 20) return;
        if (Array.isArray(node)) {
          for (const el of node) walk(el);
          return;
        }
        const obj = node as Record<string, unknown>;
        const vr = obj.videoRenderer as Record<string, unknown> | undefined;
        if (vr && typeof vr.videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(vr.videoId)) {
          if (!seen.has(vr.videoId)) {
            seen.add(vr.videoId);
            const titleRuns = (vr.title as { runs?: Array<{ text?: string }> } | undefined)?.runs;
            const title =
              titleRuns?.map((x) => x.text ?? '').join('').trim() ||
              (vr.title as { simpleText?: string } | undefined)?.simpleText ||
              'Vídeo';
            const ownerRuns = (vr.ownerText as { runs?: Array<{ text?: string }> } | undefined)?.runs;
            const longRuns = (vr.longBylineText as { runs?: Array<{ text?: string }> } | undefined)?.runs;
            const channel =
              ownerRuns?.map((x) => x.text ?? '').join('').trim() ||
              longRuns?.map((x) => x.text ?? '').join('').trim() ||
              'YouTube';
            items.push({
              id: vr.videoId,
              title: title.slice(0, 180),
              channel: channel.slice(0, 120),
              thumb: `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
            });
          }
        }
        for (const val of Object.values(obj)) walk(val);
      };
      walk(json);

      return res.json({ items });
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ items: [], error: 'offline' });
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
        headers: { 'User-Agent': 'KPlayer-R36S/1.0.4' },
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
    if (!force && footballCache && Date.now() - footballCache.ts < 60_000) {
      return res.json({ matches: footballCache.data });
    }

    const leagues = [
      { id: 'bra.1', label: 'Brasileirão Série A' },
      { id: 'bra.2', label: 'Brasileirão Série B' },
      { id: 'conmebol.libertadores', label: 'Copa Libertadores' },
      { id: 'uefa.champions', label: 'UEFA Champions League' },
      { id: 'eng.1', label: 'Premier League' },
      { id: 'esp.1', label: 'LaLiga' },
    ];

    const matches: FootballMatch[] = [];
    await Promise.all(
      leagues.map(async (lg) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.id}/scoreboard`,
            { signal: controller.signal, headers: { 'User-Agent': 'KPlayer-R36S/1.0.4' } }
          );
          clearTimeout(timer);
          if (!r.ok) return;
          const data = (await r.json()) as {
            leagues?: Array<{ name?: string }>;
            events?: Array<{
              status?: { type?: { shortDetail?: string; description?: string; state?: string } };
              competitions?: Array<{
                competitors?: Array<{
                  homeAway?: string;
                  score?: string;
                  team?: { shortDisplayName?: string; displayName?: string };
                }>;
              }>;
            }>;
          };
          const leagueName = data.leagues?.[0]?.name || lg.label;
          for (const ev of (data.events ?? []).slice(0, 15)) {
            const comp = ev.competitions?.[0];
            const home = comp?.competitors?.find((c) => c.homeAway === 'home');
            const away = comp?.competitors?.find((c) => c.homeAway === 'away');
            if (!home || !away) continue;
            const state = ev.status?.type?.state;
            const score =
              state === 'pre'
                ? '- : -'
                : `${home.score ?? '0'} - ${away.score ?? '0'}`;
            const status =
              ev.status?.type?.shortDetail ||
              ev.status?.type?.description ||
              (state === 'in' ? 'AO VIVO' : 'Agendado');
            matches.push({
              league: leagueName,
              home: home.team?.shortDisplayName || home.team?.displayName || 'Casa',
              score,
              away: away.team?.shortDisplayName || away.team?.displayName || 'Fora',
              status,
            });
          }
        } catch {
          clearTimeout(timer);
        }
      })
    );

    footballCache = { ts: Date.now(), data: matches };
    return res.json({ matches });
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
          'User-Agent': 'KPlayer-R36S/1.0.4',
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
    console.log(`KPlayer 1.0.4 (R36S) listening on http://${HOST}:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start KPlayer server:', err);
  process.exit(1);
});
