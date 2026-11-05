import {useEffect, useSyncExternalStore} from 'react';
import {AppState, NativeModules, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createMusicPreferences, MUSIC_PREFERENCES_KEY, normalizeMusicSnapshot} from './musicCore';
import type {MusicSnapshot} from './musicCore';

type MusicBridge = {getSnapshot: (id: string) => Promise<unknown>; openAccessSettings: () => Promise<void>; command: (id: string, action: string, value: string) => Promise<void>};
const bridge: MusicBridge | undefined = Platform.OS === 'android' ? NativeModules.SparklecatMusic : undefined;
export const musicSupported = !!bridge?.getSnapshot && !!bridge?.command && !!bridge?.openAccessSettings;
export const musicPreferences = createMusicPreferences({read: () => AsyncStorage.getItem(MUSIC_PREFERENCES_KEY), write: value => AsyncStorage.setItem(MUSIC_PREFERENCES_KEY, value)});
export function useMusicPreferences() {
  useEffect(() => { void musicPreferences.load().catch(error => update({error: `Could not load music settings: ${message(error)}`})); }, []);
  return useSyncExternalStore(musicPreferences.subscribe, musicPreferences.getSnapshot, musicPreferences.getSnapshot);
}
type State = MusicSnapshot & {open: boolean; busy: boolean; error: string; ready: boolean; foreground: boolean};
const empty: MusicSnapshot = {access: false, sessions: [], track: null};
let state: State = {...empty, open: false, busy: false, error: '', ready: false, foreground: false};
const listeners = new Set<() => void>();
const update = (next: Partial<State>) => { state = {...state, ...next}; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useMusic = () => useSyncExternalStore(subscribe, () => state, () => state);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
let preferred = '', generation = 0, reading = false;
export async function refreshMusic() {
  if (!musicSupported || !musicPreferences.getSnapshot().enabled || !state.foreground || reading) return;
  const current = generation; reading = true;
  try {
    const result = normalizeMusicSnapshot(await bridge!.getSnapshot(preferred));
    if (current === generation) update({...result, ready: true, error: ''});
  } catch (error) { if (current === generation) update({...empty, ready: true, error: message(error)}); }
  finally { reading = false; }
}
export const openMusic = () => { if (musicPreferences.getSnapshot().enabled && musicSupported) { update({open: true}); void refreshMusic(); } };
export const closeMusic = () => update({open: false});
export const selectMusicSource = (id: string) => { if (!state.busy && state.sessions.some(item => item.id === id)) { preferred = id; generation++; update({track: null}); void refreshMusic(); } };
export async function openMusicAccess() {
  if (!musicSupported || !musicPreferences.getSnapshot().enabled) return;
  try { await bridge!.openAccessSettings(); } catch (error) { update({error: message(error)}); }
}
export async function musicCommand(action: string, value = '') {
  if (!musicSupported || !musicPreferences.getSnapshot().enabled || !state.foreground || state.busy || !state.track) return;
  const id = state.track.sessionId, current = generation; update({busy: true, error: ''});
  try { await bridge!.command(id, action, value); if (current === generation) await refreshMusic(); }
  catch (error) { if (current === generation) update({error: message(error)}); }
  finally { if (current === generation) update({busy: false}); }
}
/** Poll only while the unlocked app is visible; no background listener collects notifications. */
export function useMusicEngine() {
  const prefs = useMusicPreferences();
  useEffect(() => {
    if (!prefs.enabled || !musicSupported) { generation++; preferred = ''; update({...empty, open: false, busy: false, ready: false, foreground: false}); return; }
    const foreground = (active: boolean) => {
      generation++;
      update(active ? {foreground: true, busy: false} : {...empty, foreground: false, busy: false, ready: false});
      if (active) void refreshMusic();
    };
    foreground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', next => foreground(next === 'active'));
    const timer = setInterval(() => { void refreshMusic(); }, 1000);
    return () => { clearInterval(timer); subscription.remove(); generation++; update({...empty, open: false, busy: false, ready: false, foreground: false}); };
  }, [prefs.enabled]);
}
