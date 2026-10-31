import {compareVersions, parseVersion} from './updateCheckCore';
import type {ModPreferences} from './modPreferencesCore';
import {sanitizeExtraCustomization} from './extraCustomizationCore';
import type {ExtraCustomization} from './extraCustomizationCore';

export const CLOUD_MODS_KEY = 'ps:sparklecat:mods';
export type ModSettings = {enabled: Omit<ModPreferences, 'syncPreferences'>; pkFrontSyncEnabled: boolean; automaticUpdates: boolean; extraCustomization?: ExtraCustomization};
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
    (s.enabled.noSpeaker !== undefined && typeof s.enabled.noSpeaker !== 'boolean') ||
    (s.enabled.singleConfirm !== undefined && typeof s.enabled.singleConfirm !== 'boolean') ||
    (s.enabled.deviceUnlock !== undefined && typeof s.enabled.deviceUnlock !== 'boolean') ||
    (s.enabled.disableFacets !== undefined && typeof s.enabled.disableFacets !== 'boolean') ||
    (s.enabled.chatKeyboardFix !== undefined && typeof s.enabled.chatKeyboardFix !== 'boolean') ||
    (s.enabled.profilePalettes !== undefined && typeof s.enabled.profilePalettes !== 'boolean') ||
    (s.enabled.groupView !== undefined && typeof s.enabled.groupView !== 'boolean') ||
    (s.enabled.hideLockIcon !== undefined && typeof s.enabled.hideLockIcon !== 'boolean') ||
    typeof s.pkFrontSyncEnabled !== 'boolean' || typeof s.automaticUpdates !== 'boolean' ||
    !Array.isArray(r.patches) || r.patches.length > 16 || !r.patches.every(validTarget) ||
    new Set(r.patches.map((p: PatchTarget) => `${p.runtime}/${p.variant}`)).size !== r.patches.length) {
    throw Error('Saved mod preferences use an invalid or unsupported format.');
  }
  return {schema: 1, settings: {enabled: {wallpaper: s.enabled.wallpaper, storage: s.enabled.storage, noSpeaker: s.enabled.noSpeaker === true,
    singleConfirm: s.enabled.singleConfirm === true, deviceUnlock: s.enabled.deviceUnlock === true,
    groupView: s.enabled.groupView === true, profilePalettes: s.enabled.profilePalettes === true, hideLockIcon: s.enabled.hideLockIcon === true, chatKeyboardFix: s.enabled.chatKeyboardFix === true, disableFacets: s.enabled.disableFacets === true},
    pkFrontSyncEnabled: s.pkFrontSyncEnabled, automaticUpdates: s.automaticUpdates,
    ...(s.extraCustomization === undefined ? {} : {extraCustomization: sanitizeExtraCustomization(s.extraCustomization)})},
    automaticRestore: r.automaticRestore,
    patches: r.patches.map((p: PatchTarget) => ({runtime: p.runtime, variant: p.variant, version: p.version}))};
}

export function createCloudMods(current: PatchTarget, available: Pick<ModPreferences, 'wallpaper' | 'storage'>, io: {
  load?(): Promise<unknown>;
  enabled?(): boolean;
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
    const previous = await io.read();
    if (io.enabled && !io.enabled()) return;
    if (previous !== text) await io.write(text);
    record = next;
    publish({ready: true, automaticRestore: next.automaticRestore, error: ''});
  };
  const retry = (force = false): Promise<void> => {
    if (io.enabled && !io.enabled()) return Promise.resolve();
    if (active) return active;
    if (!record || (!force && !record.automaticRestore)) return Promise.resolve();
    const target = record.patches.find(p => p.runtime === current.runtime && p.variant === current.variant);
    if (!target || compareVersions(target.version, current.version) <= 0) {
      publish({message: 'Saved patches match this installation.'});
      return Promise.resolve();
    }
    publish({restoring: true, error: '', message: `Checking saved patch ${target.version}…`});
    active = io.restore({...target}).then(() => {
      publish({message: 'A newer patch is saved. Open the patcher to update this installation.'});
    }).catch(() => {
      publish({message: '', error: 'Could not check saved patches. Try restoring mod preferences again.'});
    }).finally(() => { active = undefined; publish({restoring: false}); });
    return active;
  };
  const sync = (forceRestore = false) => enqueue(async () => {
    if (io.enabled && !io.enabled()) return;
    await io.load?.();
    if (io.enabled && !io.enabled()) return;
    const saved = readCloudMods(await io.read());
    if (io.enabled && !io.enabled()) return;
    if (saved) {
      applying = true;
      try { await io.apply(saved.settings); } finally { applying = false; }
    }
    if (io.enabled && !io.enabled()) return;
    const next = rememberCurrent(saved || {schema: 1, settings: io.local(), automaticRestore: true, patches: []});
    if (!next.settings.extraCustomization) next.settings.extraCustomization = io.local().extraCustomization;
    await persist(next);
  }).then(() => { if (!state.error) void retry(forceRestore); });
  const saveLocal = () => {
    if ((io.enabled && !io.enabled()) || applying || !state.ready) return Promise.resolve();
    const local = io.local();
    const previous = record?.settings;
    if (previous && local.pkFrontSyncEnabled === previous.pkFrontSyncEnabled && local.automaticUpdates === previous.automaticUpdates &&
      JSON.stringify(local.extraCustomization) === JSON.stringify(previous.extraCustomization) &&
      local.enabled.profilePalettes === previous.enabled.profilePalettes && local.enabled.groupView === previous.enabled.groupView && local.enabled.hideLockIcon === previous.enabled.hideLockIcon &&
      local.enabled.disableFacets === previous.enabled.disableFacets && local.enabled.chatKeyboardFix === previous.enabled.chatKeyboardFix && local.enabled.noSpeaker === previous.enabled.noSpeaker &&
      local.enabled.singleConfirm === previous.enabled.singleConfirm && local.enabled.deviceUnlock === previous.enabled.deviceUnlock &&
      (!available.wallpaper || local.enabled.wallpaper === previous.enabled.wallpaper) &&
      (!available.storage || local.enabled.storage === previous.enabled.storage)) return Promise.resolve();
    return enqueue(async () => {
      const next = readCloudMods(await io.read()) || record;
      if ((io.enabled && !io.enabled()) || !next) return;
      next.settings = {...local, enabled: {
        groupView: local.enabled.groupView, profilePalettes: local.enabled.profilePalettes, hideLockIcon: local.enabled.hideLockIcon,
        disableFacets: local.enabled.disableFacets, chatKeyboardFix: local.enabled.chatKeyboardFix, noSpeaker: local.enabled.noSpeaker,
        singleConfirm: local.enabled.singleConfirm,
        deviceUnlock: local.enabled.deviceUnlock,
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
