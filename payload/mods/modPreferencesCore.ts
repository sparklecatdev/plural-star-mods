export type ModId = 'wallpaper' | 'storage' | 'noSpeaker' | 'singleConfirm' | 'deviceUnlock' | 'groupView' | 'hideLockIcon' | 'syncPreferences' | 'profilePalettes' | 'chatKeyboardFix' | 'disableFacets';
export type ModPreferences = Record<ModId, boolean>;
export const MOD_PREFERENCES_KEY = 'sparklecat:mods';

// Separate from ordinary settings drafts. Cloud restore applies these explicitly.
export function createModPreferences(available: Pick<ModPreferences, 'wallpaper' | 'storage'>, io: {
  read(): Promise<string | null>; write(value: string): Promise<unknown>;
  beforeDisable?(id: ModId): Promise<unknown>;
}) {
  let state: ModPreferences = {wallpaper: false, storage: false, noSpeaker: false, singleConfirm: false, deviceUnlock: false, groupView: false, hideLockIcon: false, syncPreferences: false, profilePalettes: false, chatKeyboardFix: false, disableFacets: false};
  let loaded: Promise<void> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (value: ModPreferences) => { state = value; for (const fn of listeners) fn(); };
  const load = (): Promise<void> => loaded ??= io.read().then(raw => {
    let saved: Partial<ModPreferences> | null = {};
    try { saved = raw ? JSON.parse(raw) : {}; } catch { /* Use defaults for malformed preferences. */ }
    publish({
      wallpaper: available.wallpaper && saved?.wallpaper === true,
      storage: available.storage && saved?.storage === true,
      noSpeaker: saved?.noSpeaker === true,
      singleConfirm: saved?.singleConfirm === true,
      deviceUnlock: saved?.deviceUnlock === true,
      groupView: saved?.groupView === true,
      hideLockIcon: saved?.hideLockIcon === true,
      syncPreferences: saved?.syncPreferences === true,
      profilePalettes: saved?.profilePalettes === true,
      chatKeyboardFix: saved?.chatKeyboardFix === true,
      disableFacets: saved?.disableFacets === true,
    });
  }).catch(error => { loaded = undefined; throw error; });
  const setPreferences = (values: Partial<ModPreferences>): Promise<void> => {
    const save = pending.then(async () => {
      await load();
      const next = {...state};
      for (const id of ['wallpaper', 'storage', 'noSpeaker', 'singleConfirm', 'deviceUnlock', 'groupView', 'hideLockIcon', 'syncPreferences', 'profilePalettes', 'chatKeyboardFix', 'disableFacets'] as ModId[]) {
        if (typeof values[id] !== 'boolean') continue;
        next[id] = (id === 'wallpaper' || id === 'storage' ? available[id] : true) && values[id]!;
        if (!next[id]) await io.beforeDisable?.(id);
      }
      await io.write(JSON.stringify(next));
      publish(next);
    });
    pending = save.catch(() => {});
    return save;
  };
  const setEnabled = (id: ModId, enabled: boolean) => setPreferences({[id]: enabled});
  return {getSnapshot: () => state, load, setEnabled, setPreferences,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }};
}
