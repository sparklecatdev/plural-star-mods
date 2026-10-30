import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Blob from 'react-native-blob-util';
import {strFromU8, strToU8} from 'fflate';
import nacl from 'tweetnacl';
import {scryptAsync} from '@noble/hashes/scrypt.js';
import {encodeBase64, decodeBase64} from '../network/bytes';
import {appKey, MAX_BYTES, MEDIA_DIRS, restorer, validateSnapshot} from './snapshotCore';
import type {Snapshot} from './snapshotCore';
import {createRestoreQueue} from './restoreQueue';
const fs = Blob.fs;
const docs = fs.dirs.DocumentDir;
const kdf = (password: string, salt: Uint8Array) => scryptAsync(password, salt, {N: 32768, r: 8, p: 1, dkLen: 32, maxmem: 64 * 1024 * 1024});
const random = (length: number) => {
  const b = new Uint8Array(length);
  (globalThis as unknown as {crypto: {getRandomValues: (v: Uint8Array) => Uint8Array}}).crypto.getRandomValues(b);
  return b;
};
export const recovery = restorer({
  exists: fs.exists, mkdir: fs.mkdir, read: p => fs.readFile(p, 'utf8'), write: (p, v) => fs.writeFile(p, v, 'utf8'),
  writeMedia: (p, v) => fs.writeFile(p, v, 'base64'), move: fs.mv, remove: fs.unlink,
  keys: AsyncStorage.getAllKeys, get: AsyncStorage.getMany, set: AsyncStorage.setMany, removeKeys: AsyncStorage.removeMany,
}, docs);
export const restoreQueue = createRestoreQueue({
  exists: fs.exists, read: p => fs.readFile(p, 'utf8'), write: (p, value) => fs.writeFile(p, value, 'utf8'),
  move: fs.mv, remove: fs.unlink,
}, docs, recovery);
let startupRecovery: Promise<void> | undefined;
// Share one recovery between the foreground root and headless notifications.
export const recoverBeforeStart = (): Promise<void> => startupRecovery ??= restoreQueue.apply();
export const retryStoragePreparation = (): Promise<void> => {
  startupRecovery = undefined;
  return recoverBeforeStart();
};

export async function saveSnapshot(password: string): Promise<string> {
  if (password.length < 12) throw Error('Use a password with at least 12 characters.');
  const keys = (await AsyncStorage.getAllKeys()).filter(appKey).sort();
  const raw = await AsyncStorage.getMany(keys);
  const records = Object.fromEntries(Object.entries(raw).filter((v): v is [string, string] => v[1] !== null));
  const files: Record<string, string> = {};
  const checks: [string, string, number][] = [];
  let total = JSON.stringify(records).length;
  const walk = async (relative: string): Promise<void> => {
    for (const entry of await fs.lstat(docs + '/' + relative)) {
      const name = relative + '/' + entry.filename;
      if (entry.type === 'directory') await walk(name);
      else if (entry.type === 'file') {
        total += Math.ceil(Number(entry.size) / 3) * 4;
        if (total > MAX_BYTES) throw Error('Storage exceeds the 32 MiB snapshot limit. Use standard export for larger libraries.');
        files[name] = await fs.readFile(docs + '/' + name, 'base64');
        checks.push([name, String(entry.lastModified), Number(entry.size)]);
      } else throw Error('Unsupported media file type.');
    }
  };
  for (const dir of MEDIA_DIRS) if (await fs.exists(docs + '/' + dir)) await walk(dir);
  const s = validateSnapshot({format: 'sparklecat-storage', version: 1, created: new Date().toISOString(), documentDir: docs, records, files});
  const keysAfter = (await AsyncStorage.getAllKeys()).filter(appKey).sort();
  const after = await AsyncStorage.getMany(keys);
  if (JSON.stringify(keysAfter) !== JSON.stringify(keys) || keys.some(key => raw[key] !== after[key])) throw Error('App data changed while saving. Please try again.');
  const currentFiles: [string, string, number][] = [];
  const inspect = async (relative: string): Promise<void> => {
    for (const entry of await fs.lstat(docs + '/' + relative)) {
      const name = relative + '/' + entry.filename;
      if (entry.type === 'directory') await inspect(name);
      else if (entry.type === 'file') currentFiles.push([name, String(entry.lastModified), Number(entry.size)]);
      else throw Error('Unsupported media file type.');
    }
  };
  for (const dir of MEDIA_DIRS) if (await fs.exists(docs + '/' + dir)) await inspect(dir);
  const sortFiles = (a: [string, string, number], b: [string, string, number]) => a[0].localeCompare(b[0]);
  if (JSON.stringify(checks.sort(sortFiles)) !== JSON.stringify(currentFiles.sort(sortFiles))) throw Error('App media changed while saving. Please try again.');
  const salt = random(16), nonce = random(24);
  const plaintext = strToU8(JSON.stringify(s));
  if (plaintext.length > MAX_BYTES) throw Error('Encoded snapshot exceeds the 32 MiB limit. Use standard export.');
  const key = await kdf(password, salt);
  try {
    const ciphertext = nacl.secretbox(plaintext, nonce, key);
    const path = fs.dirs.CacheDir + '/plural-star-storage.scat';
    await fs.writeFile(path, JSON.stringify({format: 'sparklecat-encrypted', version: 1, salt: encodeBase64(salt), nonce: encodeBase64(nonce), ciphertext: encodeBase64(ciphertext)}), 'utf8');
    return path;
  } finally { key.fill(0); }
}
export async function openSnapshot(path: string, password: string): Promise<Snapshot> {
  const stat = await fs.stat(path);
  if (Number(stat.size) > MAX_BYTES * 2 || Number(stat.size) < 100) throw Error('Invalid snapshot size.');
  const envelope = JSON.parse(await fs.readFile(path, 'utf8'));
  if (envelope.format !== 'sparklecat-encrypted' || envelope.version !== 1 || typeof envelope.salt !== 'string' || typeof envelope.nonce !== 'string' || typeof envelope.ciphertext !== 'string') throw Error('Unsupported snapshot. Use Plural Star Import for standard JSON or ZIP backups.');
  const salt = decodeBase64(envelope.salt), nonce = decodeBase64(envelope.nonce);
  if (salt.length !== 16 || nonce.length !== 24) throw Error('Invalid encryption header.');
  const key = await kdf(password, salt);
  try {
    const plaintext = nacl.secretbox.open(decodeBase64(envelope.ciphertext), nonce, key);
    if (!plaintext) throw Error('Wrong password or damaged snapshot. No data was changed.');
    return validateSnapshot(JSON.parse(strFromU8(plaintext)));
  } finally { key.fill(0); }
}
