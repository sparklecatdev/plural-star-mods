// Lyrics timing and matching follow BitChord's player approach. See THIRD_PARTY_NOTICES.md.
export const MUSIC_PREFERENCES_KEY = 'sparklecat.music.v1';
export type MusicPreferences = {enabled: boolean; onlineLyrics: boolean; miniPlayer: boolean; followLyrics: boolean; lyricSize: number; lyricOffset: number};
export const DEFAULT_MUSIC_PREFERENCES: MusicPreferences = {enabled: false, onlineLyrics: false, miniPlayer: true, followLyrics: true, lyricSize: 22, lyricOffset: 0};
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
const text = (value: unknown, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';

export function normalizeMusicPreferences(value: unknown): MusicPreferences {
  const data = object(value);
  return {enabled: data.enabled === true, onlineLyrics: data.onlineLyrics === true,
    miniPlayer: data.miniPlayer !== false, followLyrics: data.followLyrics !== false,
    lyricSize: [18, 22, 28, 34].includes(Number(data.lyricSize)) ? Number(data.lyricSize) : 22,
    lyricOffset: typeof data.lyricOffset === 'number' && Number.isFinite(data.lyricOffset) ? Math.round(Math.max(-10000, Math.min(10000, data.lyricOffset))) : 0};
}

export function createMusicPreferences(storage: {read: () => Promise<string | null>; write: (value: string) => Promise<void>}) {
  let value = DEFAULT_MUSIC_PREFERENCES, loaded: Promise<void> | undefined, writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const load = () => loaded ??= storage.read().then(raw => {
    let saved: unknown; try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
    value = normalizeMusicPreferences(saved); notify();
  }).catch(error => { loaded = undefined; throw error; });
  return {load, getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set: (update: Partial<MusicPreferences>) => {
      const write = writes.then(async () => { await load(); const next = normalizeMusicPreferences({...value, ...update}); await storage.write(JSON.stringify(next)); value = next; notify(); });
      writes = write.catch(() => {}); return write;
    }};
}

export type MusicTrack = {
  sessionId: string; source: string; title: string; artist: string; album: string; artwork: string;
  duration: number; position: number; playing: boolean; buffering: boolean;
  canPlay: boolean; canPause: boolean; canNext: boolean; canPrevious: boolean; canSeek: boolean; canQueue: boolean; canVolume: boolean;
  volume: number; maxVolume: number;
  queue: Array<{id: string; title: string; artist: string; active: boolean}>;
  customActions: Array<{id: string; name: string}>;
};
export type MusicSnapshot = {access: boolean; sessions: Array<{id: string; name: string; playing: boolean}>; track: MusicTrack | null};
export function normalizeMusicSnapshot(value: unknown): MusicSnapshot {
  const data = object(value);
  const access = data.access === true;
  const sessions = access && Array.isArray(data.sessions) ? data.sessions.slice(0, 50).map(row => {
    const item = object(row); return {id: text(item.id), name: text(item.name), playing: item.playing === true};
  }).filter(item => !!item.id) : [];
  const raw = object(data.track); const id = text(raw.sessionId);
  if (!access || !id || !sessions.some(item => item.id === id)) return {access, sessions, track: null};
  const duration = number(raw.duration, 86400000); const position = number(raw.position, duration || 86400000);
  const artwork = text(raw.artwork, 4000);
  return {access, sessions, track: {
    sessionId: id, source: text(raw.source), title: text(raw.title), artist: text(raw.artist), album: text(raw.album),
    artwork: /^file:\/\/\//.test(artwork) ? artwork : '', duration, position, playing: raw.playing === true, buffering: raw.buffering === true,
    canPlay: raw.canPlay === true, canPause: raw.canPause === true, canNext: raw.canNext === true, canPrevious: raw.canPrevious === true,
    canSeek: raw.canSeek === true && duration > 0, canQueue: raw.canQueue === true, canVolume: raw.canVolume === true && number(raw.maxVolume, 10000) > 0,
    volume: number(raw.volume, number(raw.maxVolume, 10000)), maxVolume: number(raw.maxVolume, 10000),
    queue: Array.isArray(raw.queue) ? raw.queue.slice(0, 200).map(row => { const item = object(row); return {id: text(item.id, 30), title: text(item.title), artist: text(item.artist), active: item.active === true}; }).filter(item => /^-?\d{1,20}$/.test(item.id)) : [],
    customActions: Array.isArray(raw.customActions) ? raw.customActions.slice(0, 12).map(row => { const item = object(row); return {id: text(item.id), name: text(item.name)}; }).filter(item => !!item.id && !!item.name) : [],
  }};
}

export type LyricLine = {time: number; text: string};
export type Lyrics = {lines: LyricLine[]; plain: string; instrumental: boolean};
export function parseLrc(input: string): LyricLine[] {
  const source = input.slice(0, 100000); const offsetMatch = source.match(/\[offset:([+-]?\d+)\]/i);
  const offset = offsetMatch ? Math.max(-60000, Math.min(60000, Number(offsetMatch[1]))) : 0;
  const lines: LyricLine[] = [];
  for (const line of source.split(/\r?\n/).slice(0, 3000)) {
    const stamps = [...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:[0-5]\d(?:[.:]\d{1,3})?>/g, '').replace(/<R>/g, '').trim();
    for (const stamp of stamps) lines.push({time: Math.max(0, (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + Number((stamp[3] || '').padEnd(3, '0')) + offset), text: content});
  }
  return lines.sort((a, b) => a.time - b.time).slice(0, 3000);
}
export function lyricIndex(lines: LyricLine[], position: number): number {
  let low = 0, high = lines.length;
  while (low < high) { const mid = (low + high) >>> 1; if (lines[mid].time <= position) low = mid + 1; else high = mid; }
  return low - 1;
}
export function trackKey(track: Pick<MusicTrack, 'title' | 'artist' | 'duration'>): string { return JSON.stringify([track.title, track.artist, Math.round(track.duration / 1000)]); }
export function cleanMusicTitle(value: string): string {
  return value.replace(/\s*[([](?:official\s*)?(?:music\s*video|video|audio|lyrics?|visuali[sz]er)[)\]]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 300);
}
export function formatMusicTime(value: number): string {
  const seconds = Math.floor(number(value, 86400000) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function lyricsFromResponse(value: unknown): Lyrics | null {
  const data = object(value); const synced = text(data.syncedLyrics, 100000), plain = text(data.plainLyrics, 100000);
  const lines = parseLrc(synced);
  return lines.length || plain || data.instrumental === true ? {lines, plain, instrumental: data.instrumental === true} : null;
}
export async function findLyrics(track: Pick<MusicTrack, 'title' | 'artist' | 'duration'>, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Lyrics | null> {
  const title = cleanMusicTitle(track.title), artist = track.artist.trim().slice(0, 300);
  if (!title || !artist) throw new Error('The music app needs to share a title and artist. You can enter them below.');
  const query = `track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
  const request = async (path: string) => {
    if (signal.aborted) throw new Error('Lyrics lookup cancelled.');
    const response = await fetcher(`https://lrclib.net/api/${path}`, {signal, headers: {Accept: 'application/json'}});
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(response.status === 429 ? 'Lyrics requests are limited. Try again in a moment.' : 'Could not load lyrics. Check your connection and try again.');
    if (Number(response.headers.get('content-length')) > 1000000) throw new Error('The lyrics response is too large.');
    const body = await response.text(); if (body.length > 1000000) throw new Error('The lyrics response is too large.');
    try { return JSON.parse(body) as unknown; } catch { throw new Error('The lyrics provider returned an unreadable response.'); }
  };
  if (track.duration > 0) {
    const exact = lyricsFromResponse(await request(`get?${query}&duration=${Math.round(track.duration / 1000)}`));
    if (exact) return exact;
  }
  const result = await request(`search?${query}`);
  if (!Array.isArray(result)) return null;
  const candidates = result.slice(0, 100).map(item => ({data: object(item), lyrics: lyricsFromResponse(item)})).filter(item => item.lyrics);
  const fold = (value: unknown) => text(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  candidates.sort((a, b) => {
    const score = (item: typeof a) => (fold(item.data.trackName) === fold(title) ? 0 : 1000) + (fold(item.data.artistName) === fold(artist) ? 0 : 500) + (track.duration > 0 ? Math.abs(number(item.data.duration, 86400) - track.duration / 1000) : 0) + (item.lyrics!.lines.length ? 0 : 10);
    return score(a) - score(b);
  });
  return candidates[0]?.lyrics || null;
}
