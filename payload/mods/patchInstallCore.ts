import {compareVersions, parseVersion, PatchRelease} from './updateCheckCore';

export type PatchInstallState = {busy: boolean; ready: string | null; error: string | null};
export type PatchFiles = {
  read(name: string): Promise<string | null>;
  write(name: string, value: string): Promise<void>;
  download(release: PatchRelease, name: string): Promise<void>;
  size(name: string): Promise<number>;
  hash(name: string): Promise<string>;
  move(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
};

export function validPatch(value: unknown, current: string, runtime: string, variant: string): value is PatchRelease {
  const p = value as PatchRelease | null;
  return !!p && typeof p.version === 'string' && /^\d+\.\d+\.\d+$/.test(p.version) && !!parseVersion(p.version) &&
    compareVersions(p.version, current) > 0 && p.runtime === runtime && p.variant === variant &&
    typeof p.sha256 === 'string' && /^[0-9a-f]{64}$/.test(p.sha256) && Number.isSafeInteger(p.bytes) && p.bytes > 0 && p.bytes <= 32 * 1024 * 1024 &&
    p.url === `https://github.com/sparklecatdev/plural-star-mods/releases/download/patches-v${p.version}/patches-${runtime}-${variant}-${p.version}.bundle`;
}

export function createPatchInstaller(io: PatchFiles, current: string, runtime: string, variant: string) {
  let state: PatchInstallState = {busy: false, ready: null, error: null};
  let active: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: Partial<PatchInstallState>) => { state = {...state, ...next}; for (const fn of listeners) fn(); };
  const load = async () => {
    try {
      const pending = JSON.parse(await io.read('pending.json') || 'null');
      const failed = JSON.parse(await io.read('failed.json') || 'null');
      publish({ready: validPatch(pending, current, runtime, variant) ? pending.version : null,
        error: failed ? 'A patch failed to start and was rolled back. Your saved data was kept.' : null});
    } catch { publish({error: 'Could not read patch update status.'}); }
  };
  const install = (release: PatchRelease): Promise<void> => {
    if (active) return active;
    publish({busy: true, error: null});
    active = (async () => {
      try {
        if (!validPatch(release, current, runtime, variant)) throw Error('This patch is not compatible with this app.');
        const failed = JSON.parse(await io.read('failed.json') || 'null');
        if (failed?.sha256 === release.sha256) throw Error('This patch failed to start before. Wait for a newer patch.');
        await io.download(release, 'download.part');
        if (await io.size('download.part') !== release.bytes || await io.hash('download.part') !== release.sha256) throw Error('Patch verification failed. Try downloading again.');
        const target = release.sha256 + '.bundle';
        await io.move('download.part', target);
        // The native loader only sees a patch after its complete, verified file is in place.
        await io.write('pending.json', JSON.stringify(release));
        publish({ready: release.version});
      } catch (e) { publish({error: e instanceof Error ? e.message : 'Could not download the patch. Try again.'}); }
      finally {
        await io.remove('download.part').catch(() => {});
        active = undefined; publish({busy: false});
      }
    })();
    return active;
  };
  return {load, install, getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }};
}
