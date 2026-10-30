export type PatchRelease = {version: string; runtime: string; variant: string; url: string; sha256: string; bytes: number; notes?: string};
export type UpdateState = {automatic: boolean; lastChecked: number; available: string | null; release: PatchRelease | null; checking: boolean; error: string | null};
type Preferences = Pick<UpdateState, 'automatic' | 'lastChecked' | 'available'>;
export const UPDATE_API = 'https://api.github.com/repos/sparklecatdev/plural-star-mods/releases?per_page=100';
const DAY = 24 * 60 * 60 * 1000;
export function releaseNotes(body: unknown): string {
  return typeof body === 'string' && body.trim() ? body.slice(0, 6000).replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').trim() || 'No release notes were provided.' : 'No release notes were provided.';
}

export function parseVersion(value: string): {numbers: number[]; preview: string[]} | null {
  if (typeof value !== 'string' || value.length > 96) return null;
  const m = /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*))?$/.exec(value);
  if (!m) return null;
  const numbers = m.slice(1, 4).map(Number), preview = m[4]?.split('.') || [];
  if (numbers.some(n => !Number.isSafeInteger(n)) || preview.some(p => /^0[0-9]+$/.test(p))) return null;
  return {numbers, preview};
}
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw Error('Invalid release version.');
  for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return Math.sign(x.numbers[i] - y.numbers[i]);
  if (!x.preview.length || !y.preview.length) return Math.sign(Number(!x.preview.length) - Number(!y.preview.length));
  for (let i = 0; i < Math.min(x.preview.length, y.preview.length); i++) {
    const p = x.preview[i], q = y.preview[i];
    if (p === q) continue;
    const pn = /^[0-9]+$/.test(p), qn = /^[0-9]+$/.test(q);
    if (pn && qn && p.length !== q.length) return Math.sign(p.length - q.length);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return Math.sign(x.preview.length - y.preview.length);
}
export function latestPatch(data: unknown, current: string, runtime: string, variant: string): PatchRelease | null {
  if (!Array.isArray(data)) throw Error('The update server returned an invalid response.');
  let best: PatchRelease | null = null;
  for (const row of data) {
    const tag = row?.tag_name;
    const match = typeof tag === 'string' ? /^(?:patches|compat-v\d+\.\d+\.\d+-patches)-v(\d+\.\d+\.\d+)$/.exec(tag) : null;
    if (row?.draft !== false || row?.prerelease === true || !match) continue;
    const version = match[1];
    if (!parseVersion(version) || compareVersions(version, current) <= 0) continue;
    const name = `patches-${runtime}-${variant}-${version}.bundle`;
    const asset = Array.isArray(row.assets) ? row.assets.find((a: {name?: string}) => a?.name === name) : null;
    const url = `https://github.com/sparklecatdev/plural-star-mods/releases/download/${tag}/${name}`;
    if (!asset || asset.state !== 'uploaded' || asset.browser_download_url !== url ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 32 * 1024 * 1024 ||
      typeof asset.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(asset.digest)) continue;
    if (best === null || compareVersions(version, best.version) > 0) best = {version, runtime, variant, url, sha256: asset.digest.slice(7), bytes: asset.size, notes: releaseNotes(row.body)};
  }
  return best;
}
export function createUpdateChecker(current: string, io: {read(): Promise<string | null>; write(value: string): Promise<unknown>; fetch(): Promise<unknown>}, now = Date.now, runtime = 'plural-star-1.23.3-mods-1', variant = 'wallpaper-storage') {
  let prefs: Preferences = {automatic: true, lastChecked: 0, available: null};
  let checking = false, error: string | null = null, release: PatchRelease | null = null;
  let state: UpdateState = {...prefs, checking, error, release};
  let loaded: Promise<void> | undefined, active: Promise<void> | undefined;
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = () => { state = {...prefs, checking, error, release}; for (const fn of listeners) fn(); };
  const load = (): Promise<void> => loaded ??= io.read().then(raw => {
    let saved: Partial<Preferences> = {};
    try { saved = raw ? JSON.parse(raw) || {} : {}; } catch { /* Use defaults. */ }
    const last = saved.lastChecked;
    prefs = {automatic: saved.automatic !== false,
      lastChecked: typeof last === 'number' && Number.isFinite(last) && last >= 0 && last <= now() ? last : 0,
      available: typeof saved.available === 'string' && parseVersion(saved.available) && compareVersions(saved.available, current) > 0 ? saved.available : null};
    publish();
  }).catch(e => { loaded = undefined; throw e; });
  const persist = (update: (p: Preferences) => Preferences) => {
    const task = writes.then(async () => { const next = update(prefs); await io.write(JSON.stringify(next)); prefs = next; publish(); });
    writes = task.catch(() => {}); return task;
  };
  const check = async (force = false): Promise<void> => {
    try { await load(); } catch { error = 'Could not load update preferences. Try again.'; publish(); return; }
    if (active) return active;
    const age = now() - prefs.lastChecked;
    if (!force && (!prefs.automatic || prefs.lastChecked > 0 && age >= 0 && age < DAY)) return;
    checking = true; error = null; publish();
    active = (async () => {
      try {
        release = latestPatch(await io.fetch(), current, runtime, variant);
        const available = release?.version ?? null;
        await persist(p => ({...p, available, lastChecked: now()}));
      } catch {
        error = 'Could not check for updates. Try again later.';
        try { await persist(p => ({...p, lastChecked: now()})); } catch { /* Keep the last saved preferences. */ }
      } finally { checking = false; active = undefined; publish(); }
    })();
    return active;
  };
  return {getSnapshot: () => state, load, check,
    setAutomatic: async (value: boolean) => { await load(); await persist(p => ({...p, automatic: value})); },
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }};
}
