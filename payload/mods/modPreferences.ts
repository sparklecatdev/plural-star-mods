import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createModPreferences, MOD_PREFERENCES_KEY} from './modPreferencesCore';
import {options} from './modOptions';
import {restoreQueue} from './storageSnapshot';

export const modPreferences = createModPreferences(options, {
  read: () => AsyncStorage.getItem(MOD_PREFERENCES_KEY),
  write: value => AsyncStorage.setItem(MOD_PREFERENCES_KEY, value),
  beforeDisable: id => id === 'storage' ? restoreQueue.cancel() : Promise.resolve(),
});
export const useModPreferences = () => useSyncExternalStore(modPreferences.subscribe, modPreferences.getSnapshot, modPreferences.getSnapshot);
