// Storage tools run before the upstream app is mounted or its sync starts.
export const MAX_BYTES = 32 * 1024 * 1024;
export const MEDIA_DIRS = ['ps_avatars', 'ps_avatars_full', 'ps_banners', 'ps_bio_images', 'ps_chat_media', 'ps_mirror_gifs', 'ps_backgrounds', 'ps_backup'];
export const appKey = (key: string): boolean => /^(ps:|ps\.|psdev:)/.test(key);
export type Snapshot = {format: 'sparklecat-storage'; version: 1; created: string; documentDir: string; records: Record<string, string>; files: Record<string, string>};
export const validPath = (name: string): boolean => {
  const parts = name.split('/');
  return parts.length > 1 && MEDIA_DIRS.includes(parts[0]) && parts.every(p => /^[a-zA-Z0-9_. -]+$/.test(p) && p !== '.' && p !== '..');
};
export function validateSnapshot(value: unknown): Snapshot {
  const s = value as Snapshot;
  if (!s || s.format !== 'sparklecat-storage' || s.version !== 1 || typeof s.created !== 'string'
    || typeof s.documentDir !== 'string' || !s.documentDir.startsWith('/') || s.documentDir.length < 5
    || !s.records || Array.isArray(s.records) || typeof s.records !== 'object'
    || !s.files || Array.isArray(s.files) || typeof s.files !== 'object') throw Error('Not a supported storage snapshot.');
  let size = 0;
  const keys = Object.keys(s.records);
  const files = Object.keys(s.files);
  if (keys.length > 20000 || files.length > 10000) throw Error('Snapshot contains too many entries.');
  for (const key of keys) {
    if (!appKey(key) || typeof s.records[key] !== 'string') throw Error('Invalid storage key.');
    size += key.length + s.records[key].length;
  }
  for (const name of files) {
    const b64 = s.files[name];
    if (!validPath(name) || typeof b64 !== 'string' || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw Error('Invalid media entry.');
    size += name.length + b64.length;
  }
  if (size > MAX_BYTES) throw Error('Snapshot exceeds the 32 MiB limit. Use the standard export for larger libraries.');
  return s;
}
export function rebaseRecords(s: Snapshot, documentDir: string): Record<string, string> {
  return Object.fromEntries(Object.entries(s.records).map(([key, value]) => [key, value.split(s.documentDir + '/').join(documentDir + '/')]));
}

export type RestoreIO = {
  exists(path: string): Promise<boolean>; mkdir(path: string): Promise<unknown>;
  read(path: string): Promise<string>; write(path: string, value: string): Promise<unknown>;
  writeMedia(path: string, b64: string): Promise<unknown>; move(from: string, to: string): Promise<unknown>; remove(path: string): Promise<unknown>;
  keys(): Promise<string[]>; get(keys: string[]): Promise<Record<string, string | null>>;
  set(records: Record<string, string>): Promise<unknown>; removeKeys(keys: string[]): Promise<unknown>;
};
export function restorer(io: RestoreIO, docs: string) {
  const tx = docs + '/.sparklecat-restore';
  const marker = tx + '/pending.json';
  const remove = async (p: string) => { if (await io.exists(p)) await io.remove(p); };
  const replaceRecords = async (records: Record<string, string>) => {
    await io.set(records);
    const extras = (await io.keys()).filter(k => appKey(k) && !Object.hasOwn(records, k));
    if (extras.length) await io.removeKeys(extras);
  };
  const recover = async () => {
    if (!(await io.exists(marker))) { await remove(tx); return; }
    const journal = JSON.parse(await io.read(marker)) as {records: Record<string, string>; directories: string[]};
    if (!Array.isArray(journal.directories) || journal.directories.some(d => !MEDIA_DIRS.includes(d))) throw Error('Invalid restore journal. Keep app closed and retain its data.');
    for (const dir of journal.directories) {
      const old = tx + '/old/' + dir;
      const pending = tx + '/new/' + dir;
      if (await io.exists(old)) {
        await remove(docs + '/' + dir);
        // The had-dir flag prevents a second recovery from removing this restored directory.
        await io.move(old, docs + '/' + dir);
      } else if (!(await io.exists(pending)) && !(await io.exists(tx + '/had-' + dir))) {
        await remove(docs + '/' + dir);
      }
    }
    await replaceRecords(journal.records);
    await remove(tx);
  };
  const restore = async (input: Snapshot) => {
    const s = validateSnapshot(input);
    await recover();
    await io.mkdir(tx); await io.mkdir(tx + '/new'); await io.mkdir(tx + '/old');
    for (const dir of MEDIA_DIRS) {
      await io.mkdir(tx + '/new/' + dir);
      if (await io.exists(docs + '/' + dir)) await io.write(tx + '/had-' + dir, '1');
    }
    for (const [name, b64] of Object.entries(s.files)) {
      const target = tx + '/new/' + name;
      const parent = target.slice(0, target.lastIndexOf('/'));
      if (!(await io.exists(parent))) await io.mkdir(parent);
      await io.writeMedia(target, b64);
    }
    const current = await io.get((await io.keys()).filter(appKey));
    const records = Object.fromEntries(Object.entries(current).filter((entry): entry is [string, string] => entry[1] !== null));
    // Prepare journal completely before an atomic rename makes it authoritative.
    await io.write(tx + '/journal.tmp', JSON.stringify({records, directories: MEDIA_DIRS}));
    await io.move(tx + '/journal.tmp', marker);
    try {
      for (const dir of MEDIA_DIRS) {
        if (await io.exists(docs + '/' + dir)) await io.move(docs + '/' + dir, tx + '/old/' + dir);
        await io.move(tx + '/new/' + dir, docs + '/' + dir);
      }
      await replaceRecords(rebaseRecords(s, docs));
      // Removing the marker commits; a later cleanup failure must not undo the restore.
      await io.remove(marker);
    } catch (e) {
      await recover();
      throw e;
    }
    try { await remove(tx); } catch { /* Committed. Cleanup is retried before next launch. */ }
  };
  return {recover, restore};
}
