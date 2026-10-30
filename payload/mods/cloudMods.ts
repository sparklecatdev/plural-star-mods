import {useEffect, useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {store} from '../storage';
import {useAppStore} from '../store/appStore';
import {saveAppSettings} from '../store/actions';
import {NetworkManager} from '../network/NetworkManager';
import {modPreferences} from './modPreferences';
import {updateChecker} from './updateCheck';
import {options, payloadVersion, patchRuntime, patchVariant} from './modOptions';
import {CLOUD_MODS_KEY, createCloudMods} from './cloudModsCore';

export const cloudMods = createCloudMods({version: payloadVersion, runtime: patchRuntime, variant: patchVariant}, options, {
  load: () => Promise.all([modPreferences.load(), updateChecker.load()]),
  read: () => AsyncStorage.getItem(CLOUD_MODS_KEY),
  write: text => store.setRaw(CLOUD_MODS_KEY, text),
  local: () => ({enabled: {...modPreferences.getSnapshot()},
    pkFrontSyncEnabled: useAppStore.getState().appSettings.pkFrontSyncEnabled === true,
    automaticUpdates: true}),
  apply: async settings => {
    await modPreferences.setPreferences(settings.enabled);
    if ((useAppStore.getState().appSettings.pkFrontSyncEnabled === true) !== settings.pkFrontSyncEnabled) {
      await saveAppSettings({...useAppStore.getState().appSettings, pkFrontSyncEnabled: settings.pkFrontSyncEnabled});
    }
  },
  // Cloud saves retain version identifiers; the patcher owns executable updates.
  restore: async () => {},
});

export const useCloudMods = () => useSyncExternalStore(cloudMods.subscribe, cloudMods.getSnapshot, cloudMods.getSnapshot);

// Called only after upstream hydration, setup, and the app lock have completed.
export function useModCloudSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const off: (() => void)[] = [];
    off.push(NetworkManager.onSyncApplied(keys => { if (keys.includes(CLOUD_MODS_KEY)) void cloudMods.sync(); }));
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void cloudMods.sync(); });
    off.push(() => sub.remove());
    void cloudMods.sync().then(() => {
      if (stopped) return;
      const save = () => { void cloudMods.saveLocal(); };
      off.push(modPreferences.subscribe(save), updateChecker.subscribe(save), useAppStore.subscribe(save));
    });
    return () => { stopped = true; off.forEach(fn => fn()); };
  }, [enabled]);
}
