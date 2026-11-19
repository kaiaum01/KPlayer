import type { IptvChannel, LyricLine, MediaTrack } from '../types';

export function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-- MB';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(raw)) !== null) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      const frac = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
      timestamps.push(min * 60_000 + sec * 1000 + frac);
    }
    const content = raw.replace(regex, '').trim();
    if (content && timestamps.length > 0) {
      for (const timeMs of timestamps) {
        lines.push({ timeMs, text: content });
      }
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

export function parseLocalM3u(content: string): IptvChannel[] {
  const out: IptvChannel[] = [];
  let name = '';
  let logo = '';
  let group = '';
  let id = '';

  const attr = (line: string, key: string) => {
    const m = line.match(new RegExp(`${key}="([^"]*)"`, 'i'));
    return m ? m[1] : '';
  };

  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/^\ufeff/, '').trim();
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
        group: group || 'Lista local',
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

/**
 * Generates a gentle ambient warm-pad WAV blob (32 seconds, 22050 Hz mono)
 * so the demo track "Noite tranquila" from docs/images/readme-audio.png
 * plays smoothly out of the box with synced LRC lyrics.
 */
export function createDemoTrackWavUrl(): { url: string; sizeBytes: number; durationMs: number } {
  const sampleRate = 22050;
  const durationSec = 32;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // 4-bar chill progression (Cmaj7 -> Am7 -> Fmaj7 -> G6)
  const chords = [
    [261.63, 329.63, 392.0, 493.88],
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66, 329.63],
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.floor(t / 4) % chords.length;
    const chordLocalT = t % 4;
    const env = Math.min(1, chordLocalT / 0.35) * Math.min(1, (4 - chordLocalT) / 0.4);
    const globalFade = Math.min(1, t / 0.5) * Math.min(1, (durationSec - t) / 1.2);
    const notes = chords[chordIdx];

    let sample = 0;
    for (let n = 0; n < notes.length; n++) {
      const freq = notes[n];
      sample += Math.sin(2 * Math.PI * freq * t) * 0.14;
      sample += Math.sin(2 * Math.PI * (freq * 0.5) * t) * 0.06;
    }
    // Gentle pulse
    const pulse = 0.85 + 0.15 * Math.sin(2 * Math.PI * 1.0 * t);
    const val = Math.max(-1, Math.min(1, sample * env * globalFade * pulse));
    view.setInt16(44 + i * 2, Math.floor(val * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return {
    url: URL.createObjectURL(blob),
    sizeBytes: buffer.byteLength,
    durationMs: durationSec * 1000,
  };
}

export function createInitialDemoTracks(): MediaTrack[] {
  const demo = createDemoTrackWavUrl();
  return [
    {
      id: 'demo-noite-tranquila',
      name: 'Noite tranquila.wav',
      title: 'Noite tranquila',
      artist: 'Faixa demonstrativa',
      album: 'Áudio local',
      kind: 'audio',
      format: 'WAV',
      sizeBytes: demo.sizeBytes,
      durationMs: demo.durationMs,
      sampleRate: 22050,
      channels: 1,
      bitrateKbps: 352,
      url: demo.url,
      isDemoSynth: true,
      folder: '/ports/kplayer/midias',
      lyrics: [
        { timeMs: 0, text: 'O dia vai ficando para trás' },
        { timeMs: 4500, text: 'E a música encontra seu lugar' },
        { timeMs: 9500, text: 'Um novo caminho para seguir' },
        { timeMs: 14500, text: 'No ritmo calmo do R36S' },
        { timeMs: 19500, text: 'Sua biblioteca em qualquer lugar' },
        { timeMs: 24500, text: 'Com letras em sincronia no K Player' },
      ],
    },
  ];
}

export const AUDIO_EXT_RE = /\.(mp3|flac|ogg|wav|m4a|aac|opus)$/i;
export const VIDEO_EXT_RE = /\.(mp4|mkv|avi|mov|webm|m4v|mpg|mpeg)$/i;
