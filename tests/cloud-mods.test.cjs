const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
function load(name, imports = {}, generated = false) {
  const filename = generated ? path.join(upstream, name) : path.join(__dirname, '../payload/mods', name);
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
    presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const exports = {};
  vm.runInNewContext(code, {exports, require: n => {
    if (Object.hasOwn(imports, n)) return imports[n];
    if (n.startsWith('@babel/runtime/')) return require(require.resolve(n, {paths: [upstream]}));
    assert.fail('Unexpected dependency: ' + n);
  }});
  return exports;
}
const versions = load('updateCheckCore.ts');
const {CLOUD_MODS_KEY, readCloudMods, createCloudMods} = load('cloudModsCore.ts', {'./updateCheckCore': versions});
const {createModPreferences} = load('modPreferencesCore.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const current = {runtime: 'plural-star-1.23.3-mods-1', variant: 'wallpaper-storage', version: '0.4.2'};
const settings = () => ({enabled: {wallpaper: true, storage: true}, pkFrontSyncEnabled: false, automaticUpdates: true});
const record = () => ({schema: 1, settings: settings(), automaticRestore: true, patches: [{...current}]});
function harness(saved = null, available = {wallpaper: true, storage: true}) {
  let disk = saved === null ? null : JSON.stringify(saved), local = settings(), failRead = false, failWrite = false, failRestore = false;
  const writes = [], restores = [], applies = [];
  const controller = createCloudMods(current, available, {
    read: async () => { if (failRead) throw Error('read failed'); return disk; },
    write: async text => { if (failWrite) throw Error('disk full'); disk = text; writes.push(JSON.parse(text)); },
    local: () => plain(local),
    apply: async value => { applies.push(plain(value)); local = plain(value); await controller.saveLocal(); },
    restore: async target => { restores.push(plain(target)); if (failRestore) throw Error('offline'); },
  });
  return {controller, writes, restores, applies, disk: () => disk, local: () => local,
    remote: value => { disk = JSON.stringify(value); }, change: value => { local = value; },
    failRead: value => { failRead = value; }, failWrite: value => { failWrite = value; }, failRestore: value => { failRestore = value; }};
}

test('cloud records reject malformed, oversized, future, and duplicate data; executable fields are discarded', () => {
  for (const raw of ['{', 'null', 'x'.repeat(16385), JSON.stringify({...record(), schema: 2}),
    JSON.stringify({...record(), settings: {...settings(), automaticUpdates: 'yes'}}),
    JSON.stringify({...record(), patches: [{...current, version: '../evil'}]}),
    JSON.stringify({...record(), patches: [current, current]})]) assert.throws(() => readCloudMods(raw));
  const untrusted = {...record(), code: 'evil()', token: 'secret', url: 'https://evil.test',
    patches: [{...current, url: 'https://evil.test', sha256: 'fake'}]};
  assert.deepEqual(plain(readCloudMods(JSON.stringify(untrusted))), record());
  assert.equal(readCloudMods(null), null);
});

test('first start creates a cloud-compatible record; unchanged starts do not write again', async () => {
  const h = harness(); await h.controller.sync();
  assert.deepEqual(JSON.parse(h.disk()), record());
  await h.controller.sync();
  assert.equal(h.writes.length, 1);
  assert.equal(h.restores.length, 0);
  assert.equal(h.controller.getSnapshot().ready, true);
});

test('reinstall and remote sync restore preferences before publishing without feedback writes', async () => {
  const saved = record(); saved.settings.enabled.storage = false; saved.settings.pkFrontSyncEnabled = true;
  const h = harness(saved); await h.controller.sync();
  assert.deepEqual(h.local(), saved.settings);
  assert.equal(h.writes.length, 0);
  saved.settings.automaticUpdates = false; h.remote(saved);
  await h.controller.sync();
  assert.equal(h.local().automaticUpdates, false);
  assert.equal(h.writes.length, 0);
});

test('local changes preserve unavailable switches, other runtimes, and the higher saved patch version', async () => {
  const saved = record(); saved.patches[0].version = '0.4.9';
  saved.patches.push({...current, runtime: 'future-runtime', version: '1.0.0'});
  const h = harness(saved, {wallpaper: false, storage: true}); await h.controller.sync();
  const next = settings(); next.enabled.wallpaper = false; next.enabled.storage = false; h.change(next);
  await h.controller.saveLocal();
  const result = JSON.parse(h.disk());
  assert.equal(result.settings.enabled.wallpaper, true);
  assert.equal(result.settings.enabled.storage, false);
  assert.deepEqual(result.patches, saved.patches);
  await h.controller.saveLocal();
  assert.equal(h.writes.length, 1, 'unavailable switches do not create feedback writes');
});

test('only newer patches for this runtime and variant restore; disabled restore stays disabled', async () => {
  const saved = record(); saved.patches[0].version = '0.4.9';
  const h = harness(saved); await h.controller.sync(); await h.controller.retry();
  assert.deepEqual(h.restores[0], {...current, version: '0.4.9'});
  await h.controller.setAutomaticRestore(false); const count = h.restores.length;
  await h.controller.sync(); await h.controller.retry();
  assert.equal(h.restores.length, count);
  await h.controller.sync(true); await h.controller.retry(true);
  assert.ok(h.restores.length > count, 'manual restore works with automatic restore disabled');
  const incompatible = record(); incompatible.patches = [{...current, runtime: 'future', version: '9.0.0'}, {...current, variant: 'storage', version: '9.0.0'}];
  const other = harness(incompatible); await other.controller.sync();
  assert.equal(other.restores.length, 0);
});

test('offline restore keeps settings and target intact, reports failure, and retries successfully', async () => {
  const saved = record(); saved.patches[0].version = '0.4.9'; saved.settings.enabled.wallpaper = false;
  const h = harness(saved); h.failRestore(true); await h.controller.sync(); await h.controller.retry();
  assert.match(h.controller.getSnapshot().error, /Could not check/);
  assert.equal(h.local().enabled.wallpaper, false);
  assert.deepEqual(JSON.parse(h.disk()), saved);
  h.failRestore(false); await h.controller.retry();
  assert.equal(h.controller.getSnapshot().error, '');
  assert.match(h.controller.getSnapshot().message, /patcher/);
});

test('storage failures preserve existing cloud records and allow retry', async () => {
  const h = harness(); h.failRead(true); await h.controller.sync();
  assert.equal(h.controller.getSnapshot().ready, false);
  assert.match(h.controller.getSnapshot().error, /read failed/);
  h.failRead(false); h.failWrite(true); await h.controller.sync();
  assert.equal(h.disk(), null);
  h.failWrite(false); await h.controller.sync();
  assert.equal(h.controller.getSnapshot().ready, true);
  h.remote({...record(), schema: 999}); await h.controller.sync();
  assert.equal(JSON.parse(h.disk()).schema, 999, 'unknown versions are not overwritten');
});

test('initialization failure cannot publish defaults and succeeds on a later sync', async () => {
  let failing = true, writes = 0;
  const controller = createCloudMods(current, settings().enabled, {
    load: async () => { if (failing) throw Error('preferences unavailable'); },
    read: async () => null, write: async () => { writes++; }, local: settings,
    apply: async () => {}, restore: async () => {},
  });
  await controller.sync();
  assert.equal(writes, 0);
  assert.equal(controller.getSnapshot().ready, false);
  assert.match(controller.getSnapshot().error, /preferences unavailable/);
  failing = false; await controller.sync();
  assert.equal(writes, 1);
  assert.equal(controller.getSnapshot().ready, true);
});

test('restoring switches cancels a pending storage restore and commits both switches atomically', async () => {
  const actions = [];
  const prefs = createModPreferences({wallpaper: true, storage: true}, {read: async () => null,
    beforeDisable: async id => { actions.push('cancel-' + id); }, write: async text => { actions.push(JSON.parse(text)); }});
  await prefs.setPreferences({wallpaper: false, storage: false});
  assert.deepEqual(plain(actions), ['cancel-wallpaper', 'cancel-storage', {wallpaper: false, storage: false}]);
});

test('upstream cloud and linked-device snapshots include the dedicated mod record', async () => {
  const {buildSnapshot} = load('src/sync/snapshot.ts', {
    '../config': {config: () => ({})}, '../storage': {KEYS: {members: 'ps:members', system: 'ps:system'}},
    '../network/mediaKey': {}, '../network/types': {MIRROR_CACHE_PREFIX: 'ps:mirror:', SYNC_EXCLUDE_KEYS: []},
  }, true);
  const text = JSON.stringify(record());
  const snap = await buildSnapshot({allKeys: async () => [CLOUD_MODS_KEY, 'sparklecat:mods'],
    getMany: async keys => Object.fromEntries(keys.map(key => [key, text]))}, {});
  assert.deepEqual(plain(snap), {[CLOUD_MODS_KEY]: text});
});

test('runtime restore preserves credentials and preferences while leaving executable updates to the patcher', async () => {
  const saved = record(); saved.patches[0].version = '0.4.9'; saved.settings.pkFrontSyncEnabled = true;
  saved.settings.automaticUpdates = false;
  let disk = JSON.stringify(saved), appSettings = {pkToken: 'private', language: 'de'}, enabled = settings().enabled;
  const {cloudMods} = load('cloudMods.ts', {
    react: {}, 'react-native': {},
    '@react-native-async-storage/async-storage': {getItem: async () => disk},
    '../storage': {store: {setRaw: async (key, text) => { assert.equal(key, CLOUD_MODS_KEY); disk = text; }}},
    '../store/appStore': {useAppStore: {getState: () => ({appSettings})}},
    '../store/actions': {saveAppSettings: async next => { appSettings = next; }},
    '../network/NetworkManager': {},
    './modPreferences': {modPreferences: {load: async () => {}, getSnapshot: () => enabled,
      setPreferences: async next => { enabled = next; }}},
    './updateCheck': {updateChecker: {load: async () => {}}},
    './modOptions': {options: settings().enabled, payloadVersion: current.version, patchRuntime: current.runtime, patchVariant: current.variant},
    './cloudModsCore': {CLOUD_MODS_KEY, createCloudMods},
  });
  await cloudMods.sync(); await cloudMods.retry();
  assert.deepEqual(plain(appSettings), {pkToken: 'private', language: 'de', pkFrontSyncEnabled: true});
  assert.deepEqual(plain(enabled), saved.settings.enabled);
  assert.equal(!!cloudMods.getSnapshot().error, false);
  assert.match(cloudMods.getSnapshot().message, /patcher/);
  assert.equal(JSON.parse(disk).patches[0].version, '0.4.9');
});
