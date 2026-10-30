// Focused executable fault-injection tests against the shipped snapshot implementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.resolve(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.resolve(__dirname, '../payload/mods/snapshotCore.ts');
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
const mod = {exports: {}};
vm.runInNewContext(code, {exports: mod.exports, require: n => require(require.resolve(n, {paths: [upstream]}))});
const {restorer, validateSnapshot, rebaseRecords} = mod.exports;
const plain = x => JSON.parse(JSON.stringify(x));
const canonical = x => JSON.stringify(x, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const snapshot = () => ({format: 'sparklecat-storage', version: 1, created: '2026-10-30T00:00:00.000Z', documentDir: '/old/files', records: {'ps:system': '{"name":"restored"}', 'ps:members': '[{"avatar":"file:///old/files/ps_avatars/a.png"}]'}, files: {'ps_avatars/a.png': 'bmV3', 'ps_backgrounds/wall.png': 'cGlj'}});

function harness(failAt = Infinity, permanent = false) {
  const entries = new Map([['/app/files', null], ['/app/files/ps_avatars', null], ['/app/files/ps_avatars/a.png', 'old'], ['/app/files/ps_backup', null], ['/app/files/ps_backup/system.json', 'original backup'], ['/app/files/unrelated', 'leave me']]);
  let records = {'ps:system': 'original', 'ps:extra': 'extra', unrelated: 'keep'};
  let operations = 0, fault = true;
  const step = () => { operations++; if (fault && (operations === failAt || permanent && operations >= failAt)) throw Error('injected power loss'); };
  const io = {
    exists: async p => { step(); return entries.has(p); },
    mkdir: async p => { step(); if (entries.has(p)) throw Error('already exists'); entries.set(p, null); },
    read: async p => { step(); if (!entries.has(p)) throw Error('missing'); return entries.get(p); },
    write: async (p, v) => { step(); entries.set(p, v); },
    writeMedia: async (p, v) => { step(); entries.set(p, Buffer.from(v, 'base64').toString()); },
    move: async (from, to) => {
      step(); if (!entries.has(from) || entries.has(to)) throw Error('invalid rename: ' + from + ' -> ' + to);
      for (const [p, v] of [...entries]) if (p === from || p.startsWith(from + '/')) { entries.delete(p); entries.set(to + p.slice(from.length), v); }
    },
    remove: async p => { step(); for (const key of [...entries.keys()]) if (key === p || key.startsWith(p + '/')) entries.delete(key); },
    keys: async () => { step(); return Object.keys(records); },
    get: async keys => { step(); return Object.fromEntries(keys.map(k => [k, records[k] ?? null])); },
    // Model partial key writes too: an interrupted setMany can have committed one key.
    set: async values => { for (const [k, v] of Object.entries(values)) { step(); records[k] = v; } },
    removeKeys: async keys => { for (const k of keys) { step(); delete records[k]; } },
  };
  const state = () => ({records: {...records}, files: Object.fromEntries([...entries].filter(([p]) => !p.startsWith('/app/files/.sparklecat-restore')).sort())});
  return {io, state, resume: () => { fault = false; }, count: () => operations, needsRollback: () => entries.has('/app/files/.sparklecat-restore/pending.json') && entries.has('/app/files/.sparklecat-restore/old/ps_avatars') && entries.get('/app/files/ps_avatars/a.png') === 'new'};
}

test('full storage round trip replaces keys, rebases media, and preserves unrelated data', async () => {
  const h = harness();
  await restorer(h.io, '/app/files').restore(snapshot());
  const value = h.state();
  assert.equal(value.records['ps:system'], '{"name":"restored"}');
  assert.equal(value.records['ps:extra'], undefined);
  assert.equal(value.records.unrelated, 'keep');
  assert.match(value.records['ps:members'], /file:\/\/\/app\/files\/ps_avatars/);
  assert.equal(value.files['/app/files/ps_avatars/a.png'], 'new');
  assert.equal(value.files['/app/files/ps_backgrounds/wall.png'], 'pic');
  assert.equal(value.files['/app/files/unrelated'], 'leave me');
});

test('rejects traversal, invalid keys, corrupt base64, unsupported version and oversized records', () => {
  for (const name of ['../secret', '/etc/passwd', 'ps_avatars/../../private', 'ps_avatars//a', 'unknown/a', 'ps_avatars/a\\b']) {
    assert.throws(() => validateSnapshot({...snapshot(), files: {[name]: 'YQ=='}}));
  }
  assert.throws(() => validateSnapshot({...snapshot(), version: 2}));
  assert.throws(() => validateSnapshot({...snapshot(), records: {unrelated: 'x'}}));
  assert.throws(() => validateSnapshot({...snapshot(), files: {'ps_avatars/a': '%%%='}}));
  assert.throws(() => validateSnapshot({...snapshot(), records: {'ps:a': 'x'.repeat(32 * 1024 * 1024 + 1)}}));
  assert.deepEqual(plain(rebaseRecords(snapshot(), '/new/files')), {'ps:system': '{"name":"restored"}', 'ps:members': '[{"avatar":"file:///new/files/ps_avatars/a.png"}]'});
});

test('every interrupted I/O boundary restores either the complete old or complete new state', async () => {
  const before = harness().state();
  const success = harness(); await restorer(success.io, '/app/files').restore(snapshot());
  const after = success.state(), boundaries = success.count();
  for (let at = 1; at <= boundaries; at++) {
    const h = harness(at, true);
    try { await restorer(h.io, '/app/files').restore(snapshot()); } catch {}
    h.resume();
    await restorer(h.io, '/app/files').recover();
    await restorer(h.io, '/app/files').recover();
    const state = h.state();
    assert.ok(canonical(state) === canonical(before) || canonical(state) === canonical(after), `mixed data after boundary ${at}: ${JSON.stringify(state)}`);
  }
  console.log(`Checked ${boundaries} restore interruption boundaries`);
});

test('recovery itself can be interrupted and retried at every I/O boundary', async () => {
  // Persist a journal immediately before a key write failure, then kill each recovery step.
  const base = harness(); await restorer(base.io, '/app/files').restore(snapshot());
  let failureAt;
  for (let at = 1; at <= base.count(); at++) {
    const h = harness(at, true);
    try { await restorer(h.io, '/app/files').restore(snapshot()); } catch {}
    if (h.needsRollback()) { failureAt = at; break; }
  }
  assert.ok(failureAt, 'must exercise a partially replaced media directory');
  for (let recoveryAt = 1; recoveryAt <= 85; recoveryAt++) {
    const h = harness(failureAt, true);
    try { await restorer(h.io, '/app/files').restore(snapshot()); } catch {}
    h.resume();
    let calls = 0;
    const interruptedIO = Object.fromEntries(Object.entries(h.io).map(([name, fn]) => [name, async (...args) => {
      if (++calls >= recoveryAt) throw Error('power loss during recovery');
      return fn(...args);
    }]));
    try { await restorer(interruptedIO, '/app/files').recover(); } catch {}
    await restorer(h.io, '/app/files').recover();
    assert.deepEqual(h.state(), harness().state(), `recovery boundary ${recoveryAt}`);
  }
});

test('snapshot encryption round trip authenticates password and ciphertext before any restore write', async () => {
  const moduleFile = path.resolve(__dirname, '../payload/mods/storageSnapshot.ts');
  const {code: js} = babel.transformSync(fs.readFileSync(moduleFile, 'utf8'), {filename: moduleFile, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const data = new Map();
  const storage = {'ps:system': '{"name":"private"}'};
  let mutations = 0;
  const mocks = {
    'react-native-get-random-values': {},
    '@react-native-async-storage/async-storage': {
      getAllKeys: async () => Object.keys(storage), getMany: async keys => Object.fromEntries(keys.map(k => [k, storage[k] ?? null])),
      setMany: async () => { mutations++; }, removeMany: async () => { mutations++; },
    },
    'react-native-blob-util': {fs: {
      dirs: {DocumentDir: '/app/files', CacheDir: '/cache'}, exists: async p => data.has(p),
      writeFile: async (p, v) => data.set(p, v), readFile: async p => data.get(p),
      stat: async p => ({size: Buffer.byteLength(data.get(p))}), lstat: async () => [],
    }},
    '../network/bytes': {encodeBase64: b => Buffer.from(b).toString('base64'), decodeBase64: s => new Uint8Array(Buffer.from(s, 'base64'))},
    './snapshotCore': mod.exports,
    './restoreQueue': {createRestoreQueue: () => ({apply: async () => {}})},
    // Normalize the options object's realm; noble intentionally rejects cross-realm plain objects.
    '@noble/hashes/scrypt.js': {scryptAsync: (password, salt, opts) => require(require.resolve('@noble/hashes/scrypt.js', {paths: [upstream]})).scryptAsync(password, salt, {...opts})},
  };
  const exports = {};
  vm.runInNewContext(js, {exports, Uint8Array, crypto: require('node:crypto').webcrypto, require: n => Object.hasOwn(mocks, n) ? mocks[n] : require(require.resolve(n, {paths: [upstream]}))});
  await assert.rejects(exports.saveSnapshot('short'), /12 characters/);
  const location = await exports.saveSnapshot('my long password 🌟');
  assert.ok(!data.get(location).includes('private'));
  const opened = await exports.openSnapshot(location, 'my long password 🌟');
  assert.equal(opened.records['ps:system'], storage['ps:system']);
  await assert.rejects(exports.openSnapshot(location, 'wrong password'), /Wrong password/);
  const env = JSON.parse(data.get(location));
  const bytes = Buffer.from(env.ciphertext, 'base64'); bytes[40] ^= 1; env.ciphertext = bytes.toString('base64');
  data.set(location, JSON.stringify(env));
  await assert.rejects(exports.openSnapshot(location, 'my long password 🌟'), /Wrong password/);
  assert.equal(mutations, 0, 'decryption and authentication must not mutate app records');
});

test('foreground tools drain in-flight notification writes and block new callbacks', async () => {
  const filename = path.resolve(__dirname, '../payload/mods/toolsState.ts');
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const exports = {};
  vm.runInNewContext(code, {exports, require: n => require(require.resolve(n, {paths: [upstream]}))});
  let release, writes = 0, idle = false;
  const notification = exports.runNotification(async () => { await new Promise(resolve => { release = resolve; }); writes++; });
  exports.setToolsOpen(true);
  const waiting = exports.waitForStorageIdle().then(() => { idle = true; });
  await exports.runNotification(async () => { writes++; });
  assert.equal(writes, 0); assert.equal(idle, false);
  release(); await notification; await waiting;
  assert.equal(writes, 1); assert.equal(idle, true);
  exports.setToolsOpen(false);
  await exports.runNotification(async () => { writes++; });
  assert.equal(writes, 2, 'background tasks resume when upstream app opens');
});
