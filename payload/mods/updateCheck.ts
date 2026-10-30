import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Linking} from 'react-native';
import {createUpdateChecker, UPDATE_API, UPDATE_PAGE, UPDATER_LINK} from './updateCheckCore';
import {payloadVersion} from './modOptions';
const KEY = 'sparklecat:updates';

export const updateChecker = createUpdateChecker(payloadVersion, {
  read: () => AsyncStorage.getItem(KEY), write: value => AsyncStorage.setItem(KEY, value),
  fetch: async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(UPDATE_API, {signal: controller.signal, headers: {Accept: 'application/vnd.github+json'}});
      if (!response.ok) throw Error('Update check unavailable.');
      if (Number(response.headers.get('content-length')) > 1024 * 1024) throw Error('Update response is too large.');
      const text = await response.text();
      if (text.length > 1024 * 1024) throw Error('Update response is too large.');
      return JSON.parse(text);
    } finally { clearTimeout(timeout); }
  },
});
export const useUpdateCheck = () => useSyncExternalStore(updateChecker.subscribe, updateChecker.getSnapshot, updateChecker.getSnapshot);
export const openUpdater = async (): Promise<void> => {
  try { await Linking.openURL(UPDATER_LINK); }
  catch { await Linking.openURL(UPDATE_PAGE); }
};
