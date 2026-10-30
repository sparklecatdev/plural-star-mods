import {useAppStore} from '../store/appStore';
import {log} from '../utils/log';
import {createPluralKitSync} from './pluralKitSyncCore';

const sync = createPluralKitSync({
  settings: () => useAppStore.getState().appSettings,
  now: Date.now,
  schedule: setTimeout,
  clear: clearTimeout,
  failed: () => log.warn('pluralkit', 'Front sync failed; local front changes are saved.'),
  send: async (token, members) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.pluralkit.me/v2/systems/@me/switches', {
        method: 'POST', signal: controller.signal,
        headers: {Authorization: token, 'Content-Type': 'application/json',
          'User-Agent': 'PluralStarMods (https://github.com/sparklecatdev/plural-star-mods)'},
        body: JSON.stringify({members}),
      });
      if (!response.ok) throw new Error('PluralKit rejected the switch');
    } finally {
      clearTimeout(timeout);
    }
  },
});

useAppStore.subscribe((state, previous) => {
  if (state.appSettings.pkFrontSyncEnabled !== previous.appSettings.pkFrontSyncEnabled ||
      state.appSettings.pkToken !== previous.appSettings.pkToken) sync.cancel();
});

export const syncPluralKitFront = (ids: string[]) => sync.queue(ids, useAppStore.getState().members);
