export type ModId = 'wallpaper' | 'storage';
export type ModPreferences = Record<ModId, boolean>;
export const MOD_PREFERENCES_KEY = 'sparklecat:mods';

// Separate from app settings so ordinary settings drafts and imported backups
// cannot switch a mod back on. Disabled mods keep their saved data.
export function createModPreferences(available: ModPreferences, io: {
  read(): Promise<string | null>; write(value: string): Promise<unknown>;
  beforeDisable?(id: ModId): Promise<unknown>;
}) {
  let state: ModPreferences = {...available};
  let loaded: Promise<void> | undefined;
  let pending: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (value: ModPreferences) => { state = value; for (const fn of listeners) fn(); };
  const load = (): Promise<void> => loaded ??= io.read().then(raw => {
    let saved: Partial<ModPreferences> | null = {};
    try { saved = raw ? JSON.parse(raw) : {}; } catch { /* Use defaults for malformed preferences. */ }
    publish({
      wallpaper: available.wallpaper && saved?.wallpaper !== false,
      storage: available.storage && saved?.storage !== false,
    });
  }).catch(error => { loaded = undefined; throw error; });
  const setEnabled = (id: ModId, enabled: boolean): Promise<void> => {
    const save = pending.then(async () => {
      await load();
      const next = {...state, [id]: available[id] && enabled};
      if (!next[id]) await io.beforeDisable?.(id);
      await io.write(JSON.stringify(next));
      publish(next);
    });
    pending = save.catch(() => {});
    return save;
  };
  return {getSnapshot: () => state, load, setEnabled,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }};
}
