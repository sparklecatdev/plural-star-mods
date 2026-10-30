import {compareVersions, parseVersion} from './updateCheckCore';
import type {ModPreferences} from './modPreferencesCore';

export const CLOUD_MODS_KEY = 'ps:sparklecat:mods';
export type ModSettings = {enabled: ModPreferences; pkFrontSyncEnabled: boolean; automaticUpdates: boolean};
export type PatchTarget = {runtime: string; variant: string; version: string};
export type CloudModRecord = {schema: 1; settings: ModSettings; automaticRestore: boolean; patches: PatchTarget[]};
const variants = ['wallpaper', 'storage', 'wallpaper-storage'];
const validTarget = (p: PatchTarget) => p && typeof p.runtime === 'string' && /^[a-z0-9.-]{1,80}$/.test(p.runtime) &&
  variants.includes(p.variant) && typeof p.version === 'string' && /^\d+\.\d+\.\d+$/.test(p.version) && !!parseVersion(p.version);

// Only declarative preferences and release identifiers cross the cloud boundary.
export function readCloudMods(raw: string | null): CloudModRecord | null {
  if (raw === null) return null;
  if (raw.length > 16384) throw Error('Saved mod preferences are too large.');
  let r;
  try { r = JSON.parse(raw); } catch { throw Error('Saved mod preferences are invalid.'); }
  const s = r?.settings;
  if (r?.schema !== 1 || typeof r.automaticRestore !== 'boolean' ||
    typeof s?.enabled?.wallpaper !== 'boolean' || typeof s?.enabled?.storage !== 'boolean' ||
    typeof s.pkFrontSyncEnabled !== 'boolean' || typeof s.automaticUpdates !== 'boolean' ||
    !Array.isArray(r.patches) || r.patches.length > 16 || !r.patches.every(validTarget) ||
    new Set(r.patches.map((p: PatchTarget) => `${p.runtime}/${p.variant}`)).size !== r.patches.length) {
    throw Error('Saved mod preferences use an invalid or unsupported format.');
  }
  return {schema: 1, settings: {enabled: {wallpaper: s.enabled.wallpaper, storage: s.enabled.storage},
    pkFrontSyncEnabled: s.pkFrontSyncEnabled, automaticUpdates: s.automaticUpdates},
    automaticRestore: r.automaticRestore,
    patches: r.patches.map((p: PatchTarget) => ({runtime: p.runtime, variant: p.variant, version: p.version}))};
}

export function createCloudMods(current: PatchTarget, available: ModPreferences, io: {
  load?(): Promise<unknown>;
  read(): Promise<string | null>; write(value: string): Promise<unknown>;
  local(): ModSettings; apply(settings: ModSettings): Promise<void>;
  restore(target: PatchTarget): Promise<void>;
}) {
  let record: CloudModRecord | null = null;
  let applying = false;
  let pending = Promise.resolve();
  let active: Promise<void> | undefined;
  let state = {ready: false, automaticRestore: true, restoring: false, error: '', message: ''};
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => { state = {...state, ...patch}; for (const fn of listeners) fn(); };
  const enqueue = (fn: () => Promise<void>) => {
    const task = pending.then(fn).catch(e => { publish({error: e instanceof Error ? e.message : String(e)}); });
    pending = task;
    return task;
  };
  const rememberCurrent = (r: CloudModRecord) => {
    const found = r.patches.find(p => p.runtime === current.runtime && p.variant === current.variant);
    if (found) { if (compareVersions(current.version, found.version) > 0) found.version = current.version; }
    else { if (r.patches.length === 16) r.patches.shift(); r.patches.push({...current}); }
    return r;
  };
  const persist = async (next: CloudModRecord) => {
    const text = JSON.stringify(next);
    if (await io.read() !== text) await io.write(text);
    record = next;
    publish({ready: true, automaticRestore: next.automaticRestore, error: ''});
  };
  const retry = (force = false): Promise<void> => {
    if (active) return active;
    if (!record || (!force && !record.automaticRestore)) return Promise.resolve();
    const target = record.patches.find(p => p.runtime === current.runtime && p.variant === current.variant);
    if (!target || compareVersions(target.version, current.version) <= 0) {
      publish({message: 'Saved patches match this installation.'});
      return Promise.resolve();
    }
    publish({restoring: true, error: '', message: `Restoring patch ${target.version}…`});
    active = io.restore({...target}).then(() => {
      publish({message: 'Patches downloaded. Fully restart Plural Star to apply them.'});
    }).catch(() => {
      publish({message: '', error: 'Could not restore saved patches. Check your connection and retry. A compatible patched APK may be needed.'});
    }).finally(() => { active = undefined; publish({restoring: false}); });
    return active;
  };
  const sync = (forceRestore = false) => enqueue(async () => {
    await io.load?.();
    const saved = readCloudMods(await io.read());
    if (saved) {
      applying = true;
      try { await io.apply(saved.settings); } finally { applying = false; }
    }
    const next = rememberCurrent(saved || {schema: 1, settings: io.local(), automaticRestore: true, patches: []});
    await persist(next);
  }).then(() => { if (!state.error) void retry(forceRestore); });
  const saveLocal = () => {
    if (applying || !state.ready) return Promise.resolve();
    const local = io.local();
    const previous = record?.settings;
    if (previous && local.pkFrontSyncEnabled === previous.pkFrontSyncEnabled && local.automaticUpdates === previous.automaticUpdates &&
      (!available.wallpaper || local.enabled.wallpaper === previous.enabled.wallpaper) &&
      (!available.storage || local.enabled.storage === previous.enabled.storage)) return Promise.resolve();
    return enqueue(async () => {
      const next = readCloudMods(await io.read()) || record;
      if (!next) return;
      next.settings = {...local, enabled: {
        wallpaper: available.wallpaper ? local.enabled.wallpaper : next.settings.enabled.wallpaper,
        storage: available.storage ? local.enabled.storage : next.settings.enabled.storage,
      }};
      await persist(rememberCurrent(next));
    });
  };
  return {sync, retry, saveLocal, getSnapshot: () => state,
    setAutomaticRestore: (value: boolean) => enqueue(async () => {
      const next = readCloudMods(await io.read()) || record;
      if (!next) throw Error('Mod preferences have not loaded yet.');
      await persist({...next, automaticRestore: value});
    }).then(() => { if (value && !state.error) void retry(); }),
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
