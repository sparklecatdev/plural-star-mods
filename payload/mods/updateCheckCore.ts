export type UpdateState = {automatic: boolean; lastChecked: number; available: string | null; checking: boolean; error: string | null};
type Preferences = Pick<UpdateState, 'automatic' | 'lastChecked' | 'available'>;
export const UPDATE_API = 'https://api.github.com/repos/sparklecatdev/plural-star-mods/releases?per_page=30';
export const UPDATE_PAGE = 'https://github.com/sparklecatdev/plural-star-mods/releases';
export const UPDATER_LINK = 'sparklecatmods://updates';
const DAY = 24 * 60 * 60 * 1000;

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
export function latestVersion(data: unknown, current: string): string | null {
  if (!Array.isArray(data)) throw Error('The update server returned an invalid response.');
  let best: string | null = null;
  for (const row of data) {
    const tag = row?.tag_name;
    if (row?.draft !== false || typeof tag !== 'string' || !tag.startsWith('v') || !parseVersion(tag) || compareVersions(tag, current) <= 0) continue;
    const version = tag.slice(1);
    const names = Array.isArray(row.assets) ? row.assets.filter((a: {state?: string}) => a?.state === 'uploaded').map((a: {name?: string}) => a.name) : [];
    if (!names.includes(`sparklecat-plural-star-mods-${version}.apk`) || !names.includes('SHA256SUMS')) continue;
    if (best === null || compareVersions(version, best) > 0) best = version;
  }
  return best;
}
export function createUpdateChecker(current: string, io: {read(): Promise<string | null>; write(value: string): Promise<unknown>; fetch(): Promise<unknown>}, now = Date.now) {
  let prefs: Preferences = {automatic: true, lastChecked: 0, available: null};
  let checking = false, error: string | null = null;
  let state: UpdateState = {...prefs, checking, error};
  let loaded: Promise<void> | undefined, active: Promise<void> | undefined;
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = () => { state = {...prefs, checking, error}; for (const fn of listeners) fn(); };
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
        const available = latestVersion(await io.fetch(), current);
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
