import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert} from 'react-native';
import {parseSparkle, runSparkle} from './sparkleScriptCore';
import {extraCustomization} from './extraCustomization';

export type SavedScript = {id: string; source: string; enabled: boolean};
const KEY = 'sparklecat:custom-scripts';
const MAX = 20;
let records: SavedScript[] = [];
let loading: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
let lastOpen = 0;
export function loadScripts(): Promise<void> {
  return loading ??= AsyncStorage.getItem(KEY).then(raw => {
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data) || data.length > MAX) throw Error('Custom mod storage is invalid.');
    const seen = new Set<string>();
    records = data.map(row => {
      if (!row || typeof row.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(row.id) || seen.has(row.id) || typeof row.source !== 'string' || typeof row.enabled !== 'boolean') throw Error('Custom mod storage is invalid.');
      seen.add(row.id); parseSparkle(row.source);
      return {id: row.id, source: row.source, enabled: row.enabled};
    });
  }).catch(error => { loading = undefined; throw error; });
}
export function listScripts(): SavedScript[] { return records.map(row => ({...row})); }
export function saveScripts(update: (current: SavedScript[]) => SavedScript[]): Promise<void> {
  const task = writes.then(async () => {
    await loadScripts(); const next = update(listScripts());
    if (next.length > MAX) throw Error('Maximum of 20 custom mods.');
    const ids = new Set<string>();
    for (const row of next) {
      if (!/^[a-z0-9-]{1,80}$/.test(row.id) || ids.has(row.id) || typeof row.enabled !== 'boolean') throw Error('Invalid custom mod.');
      ids.add(row.id); parseSparkle(row.source);
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(next)); records = next;
  });
  writes = task.catch(() => {}); return task;
}
export function runScripts(event: 'open' | 'tap', id?: string): void {
  const now = Date.now();
  if (event === 'open') { if (now - lastOpen < 60000 && now >= lastOpen) return; lastOpen = now; }
  // One short message per event avoids blocking the UI with a stack of dialogs.
  for (const row of records) {
    if (!row.enabled || (id && row.id !== id)) continue;
    let message: string | undefined, accent: string | undefined;
    const script = parseSparkle(row.source);
    runSparkle(script, event, action => { if (action.kind === 'show' && message === undefined) message = action.value; if (action.kind === 'accent') accent = action.value; });
    if (accent) { const before = extraCustomization.getSnapshot(); void extraCustomization.set({...before, colors: {...before.colors, accentBg: accent}}).catch(() => Alert.alert('Custom mod', 'Could not save the appearance change.')); }
    if (message !== undefined) { Alert.alert(script.name, message); break; }
  }
}
