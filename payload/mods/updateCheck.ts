import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BlobUtil from 'react-native-blob-util';
import {createUpdateChecker, UPDATE_API} from './updateCheckCore';
import {createPatchInstaller, PatchFiles} from './patchInstallCore';
import {payloadVersion, patchRuntime, patchVariant} from './modOptions';
const KEY = 'sparklecat:updates';
const root = `${BlobUtil.fs.dirs.DocumentDir}/sparklecat-updates`;
const files: PatchFiles = {
  read: async name => {
    const path = `${root}/${name}`;
    if (!await BlobUtil.fs.exists(path)) return null;
    if (Number((await BlobUtil.fs.stat(path)).size) > 4096) throw Error('Invalid patch update metadata.');
    return BlobUtil.fs.readFile(path, 'utf8');
  },
  write: async (name, value) => {
    await BlobUtil.fs.writeFile(`${root}/${name}.tmp`, value, 'utf8');
    await BlobUtil.fs.mv(`${root}/${name}.tmp`, `${root}/${name}`);
  },
  download: async (release, name) => {
    if (!await BlobUtil.fs.exists(root)) await BlobUtil.fs.mkdir(root);
    let oversized = false;
    const task = BlobUtil.config({path: `${root}/${name}`, timeout: 120000, followRedirect: true})
      .fetch('GET', release.url, {Accept: 'application/octet-stream'});
    task.progress({interval: 100}, (received, total) => {
      if (Number(received) > release.bytes || Number(total) > release.bytes) { oversized = true; void task.cancel().catch(() => {}); }
    });
    const response = await task;
    if (oversized) throw Error('Patch download exceeded its expected size.');
    if (response.info().status !== 200) throw Error('Patch download unavailable. Try again later.');
  },
  size: async name => Number((await BlobUtil.fs.stat(`${root}/${name}`)).size),
  hash: name => BlobUtil.fs.hash(`${root}/${name}`, 'sha256'),
  move: async (from, to) => { await BlobUtil.fs.mv(`${root}/${from}`, `${root}/${to}`); },
  remove: async name => { if (await BlobUtil.fs.exists(`${root}/${name}`)) await BlobUtil.fs.unlink(`${root}/${name}`); },
};
export const patchInstaller = createPatchInstaller(files, payloadVersion, patchRuntime, patchVariant);

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
      const releases = JSON.parse(text);
      const failed = JSON.parse(await files.read('failed.json') || 'null');
      if (!Array.isArray(releases)) throw Error('Invalid update response.');
      return releases.map(row => ({...row, assets: Array.isArray(row?.assets) ? row.assets.filter((asset: {digest?: string}) => asset?.digest !== `sha256:${failed?.sha256}`) : []}));
    } finally { clearTimeout(timeout); }
  },
}, Date.now, patchRuntime, patchVariant);
export const useUpdateCheck = () => useSyncExternalStore(updateChecker.subscribe, updateChecker.getSnapshot, updateChecker.getSnapshot);
export const usePatchInstall = () => useSyncExternalStore(patchInstaller.subscribe, patchInstaller.getSnapshot, patchInstaller.getSnapshot);
export const installLatestPatch = async (): Promise<void> => {
  await updateChecker.check(true);
  const {release, error} = updateChecker.getSnapshot();
  if (error) throw Error(error);
  if (!release) throw Error('No compatible patch update is available.');
  await patchInstaller.install(release);
};
export const confirmPatchLaunch = async (): Promise<void> => {
  const attempt = JSON.parse(await files.read('attempt.json') || 'null');
  if (attempt?.version === payloadVersion && attempt?.runtime === patchRuntime && attempt?.variant === patchVariant && /^[0-9a-f]{64}$/.test(attempt?.sha256)) {
    await files.write('healthy.json', JSON.stringify({sha256: attempt.sha256}));
    await files.remove('failed.json');
  }
};
