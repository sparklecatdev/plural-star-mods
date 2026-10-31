import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useSyncExternalStore} from 'react';
import * as ReactNative from 'react-native';
import Blob from 'react-native-blob-util';
import {useAppStore} from '../store/appStore';
import {parseSparkle, runSparkle} from './sparkleScriptCore';
import {extraCustomization} from './extraCustomization';

export type SavedScript = {id: string; source: string; enabled: boolean};
const KEY = 'sparklecat:custom-scripts';
const ENABLED_KEY = 'sparklecat:sparklescript-enabled';
const MAX = 20;
let records: SavedScript[] = [];
let loading: Promise<void> | undefined;
let writes: Promise<void> = Promise.resolve();
let lastOpen = 0;
let enabled = false, started = false;
type Wrapper = React.ComponentType<{children: React.ReactNode}>;
let wrappers: {id: string; component: Wrapper}[] = [];
const active = new Map<string, {source: string; dispose: (() => void)[]}>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export function useScriptState() {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => wrappers);
  return {enabled, wrappers};
}
function stop(id: string) {
  const entry = active.get(id); if (!entry) return;
  active.delete(id);
  for (const dispose of entry.dispose.reverse()) { try { dispose(); } catch (error) { console.warn('SparkleScript cleanup failed', error); } }
  wrappers = wrappers.filter(wrapper => wrapper.id !== id); notify();
}
function reconcile() {
  for (const [id, entry] of active) if (!enabled || !records.some(row => row.id === id && row.enabled && row.source === entry.source)) stop(id);
  if (!enabled || !started) return;
  for (const row of records) {
    const mod = parseSparkle(row.source);
    if (!row.enabled || !mod.javascript || active.has(row.id)) continue;
    const entry = {source: row.source, dispose: [] as (() => void)[]}; active.set(row.id, entry);
    const api = {
      React, ReactNative, storage: AsyncStorage, files: Blob, store: useAppStore, fetch: globalThis.fetch,
      wrapApp(component: Wrapper) { if (active.get(row.id) !== entry) return; if (!component || (typeof component !== 'function' && typeof component !== 'object')) throw Error('Expected a React component.'); wrappers = [...wrappers, {id: row.id, component}]; notify(); },
      onDispose(callback: () => void) { if (typeof callback !== 'function') throw Error('Expected a cleanup function.'); if (active.get(row.id) === entry) entry.dispose.push(callback); else callback(); },
    };
    try { new Function('api', row.source)(api); }
    catch (error) { stop(row.id); ReactNative.Alert.alert(mod.name, `SparkleScript failed: ${String(error)}`); }
  }
}
export async function setScriptingEnabled(value: boolean): Promise<void> {
  await loadScripts(); await AsyncStorage.setItem(ENABLED_KEY, value ? 'true' : 'false');
  enabled = value; wrappers = [...wrappers]; notify(); reconcile();
}
export function loadScripts(): Promise<void> {
  return loading ??= Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(ENABLED_KEY)]).then(([raw, flag]) => {
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data) || data.length > MAX) throw Error('Custom mod storage is invalid.');
    const seen = new Set<string>();
    records = data.map(row => {
      if (!row || typeof row.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(row.id) || seen.has(row.id) || typeof row.source !== 'string' || typeof row.enabled !== 'boolean') throw Error('Custom mod storage is invalid.');
      seen.add(row.id); parseSparkle(row.source);
      return {id: row.id, source: row.source, enabled: row.enabled};
    }); enabled = flag === 'true'; wrappers = [...wrappers]; notify();
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
    await AsyncStorage.setItem(KEY, JSON.stringify(next)); records = next; reconcile();
  });
  writes = task.catch(() => {}); return task;
}
export function runScripts(event: 'open' | 'tap', id?: string): void {
  if (event === 'open') { started = true; reconcile(); }
  if (!enabled) return;
  const now = Date.now();
  if (event === 'open') { if (now - lastOpen < 60000 && now >= lastOpen) return; lastOpen = now; }
  // One short message per event avoids blocking the UI with a stack of dialogs.
  for (const row of records) {
    if (!row.enabled || (id && row.id !== id)) continue;
    let message: string | undefined, accent: string | undefined;
    const script = parseSparkle(row.source);
    runSparkle(script, event, action => { if (action.kind === 'show' && message === undefined) message = action.value; if (action.kind === 'accent') accent = action.value; });
    if (accent) { const before = extraCustomization.getSnapshot(); void extraCustomization.set({...before, colors: {...before.colors, accentBg: accent}}).catch(() => ReactNative.Alert.alert('Custom mod', 'Could not save the appearance change.')); }
    if (message !== undefined) { ReactNative.Alert.alert(script.name, message); break; }
  }
}
