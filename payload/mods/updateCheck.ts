import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BlobUtil from 'react-native-blob-util';
import {createUpdateChecker, readReleases} from './updateCheckCore';
import {payloadVersion, patchRuntime, patchVariant} from './modOptions';
const KEY = 'sparklecat:updates';
const root = `${BlobUtil.fs.dirs.DocumentDir}/sparklecat-updates`;
const files = {
  read: async (name: string) => {
    const path = `${root}/${name}`;
    if (!await BlobUtil.fs.exists(path)) return null;
    if (Number((await BlobUtil.fs.stat(path)).size) > 4096) throw Error('Invalid patch update metadata.');
    return BlobUtil.fs.readFile(path, 'utf8');
  },
  write: async (name: string, value: string) => {
    await BlobUtil.fs.writeFile(`${root}/${name}.tmp`, value, 'utf8');
    await BlobUtil.fs.mv(`${root}/${name}.tmp`, `${root}/${name}`);
  },
  remove: async (name: string) => { if (await BlobUtil.fs.exists(`${root}/${name}`)) await BlobUtil.fs.unlink(`${root}/${name}`); },
};

export const updateChecker = createUpdateChecker(payloadVersion, {
  read: async () => {
    const saved = await AsyncStorage.getItem(KEY);
    // Startup notices replace the retired update preference.
    if (!saved) return null;
    try { return JSON.stringify({...JSON.parse(saved), automatic: true}); } catch { return null; }
  }, write: value => AsyncStorage.setItem(KEY, value),
  fetch: async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const releases = await readReleases(async (url, limit) => {
        const response = await fetch(url, {signal: controller.signal, headers: {Accept: 'application/vnd.github+json'}});
        if (!response.ok) throw Error('Update check unavailable.');
        if (Number(response.headers.get('content-length')) > limit) throw Error('Update response is too large.');
        return response.text();
      });
      const failed = JSON.parse(await files.read('failed.json') || 'null');
      return releases.map(row => ({...row, assets: Array.isArray(row?.assets) ? row.assets.filter((asset: {digest?: string}) => asset?.digest !== `sha256:${failed?.sha256}`) : []}));
    } finally { clearTimeout(timeout); }
  },
}, Date.now, patchRuntime, patchVariant);
export const useUpdateCheck = () => useSyncExternalStore(updateChecker.subscribe, updateChecker.getSnapshot, updateChecker.getSnapshot);
export const confirmPatchLaunch = async (): Promise<void> => {
  const attempt = JSON.parse(await files.read('attempt.json') || 'null');
  if (attempt?.version === payloadVersion && attempt?.runtime === patchRuntime && attempt?.variant === patchVariant && /^[0-9a-f]{64}$/.test(attempt?.sha256)) {
    await files.write('healthy.json', JSON.stringify({sha256: attempt.sha256}));
    await files.remove('failed.json');
  }
};
