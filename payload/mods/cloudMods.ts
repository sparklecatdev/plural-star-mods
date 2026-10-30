import {useEffect, useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {store} from '../storage';
import {useAppStore} from '../store/appStore';
import {saveAppSettings} from '../store/actions';
import {NetworkManager} from '../network/NetworkManager';
import {modPreferences} from './modPreferences';
import {updateChecker, patchInstaller} from './updateCheck';
import {compareVersions} from './updateCheckCore';
import {options, payloadVersion, patchRuntime, patchVariant} from './modOptions';
import {CLOUD_MODS_KEY, createCloudMods} from './cloudModsCore';

export const cloudMods = createCloudMods({version: payloadVersion, runtime: patchRuntime, variant: patchVariant}, options, {
  load: () => Promise.all([modPreferences.load(), updateChecker.load()]),
  read: () => AsyncStorage.getItem(CLOUD_MODS_KEY),
  write: text => store.setRaw(CLOUD_MODS_KEY, text),
  local: () => ({enabled: {...modPreferences.getSnapshot()},
    pkFrontSyncEnabled: useAppStore.getState().appSettings.pkFrontSyncEnabled === true,
    automaticUpdates: updateChecker.getSnapshot().automatic}),
  apply: async settings => {
    await modPreferences.setPreferences(settings.enabled);
    if (updateChecker.getSnapshot().automatic !== settings.automaticUpdates) await updateChecker.setAutomatic(settings.automaticUpdates);
    if ((useAppStore.getState().appSettings.pkFrontSyncEnabled === true) !== settings.pkFrontSyncEnabled) {
      await saveAppSettings({...useAppStore.getState().appSettings, pkFrontSyncEnabled: settings.pkFrontSyncEnabled});
    }
  },
  restore: async target => {
    await patchInstaller.load();
    const ready = patchInstaller.getSnapshot().ready;
    if (ready && compareVersions(ready, target.version) >= 0) return;
    // Resolve identifiers through GitHub; cloud data never supplies executable URLs.
    await updateChecker.check(true);
    const {release, error} = updateChecker.getSnapshot();
    if (error || !release || compareVersions(release.version, target.version) < 0) throw Error('Saved patch is unavailable.');
    await patchInstaller.install(release);
    const result = patchInstaller.getSnapshot();
    if (result.error || !result.ready || compareVersions(result.ready, target.version) < 0) throw Error('Patch restore failed.');
  },
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
