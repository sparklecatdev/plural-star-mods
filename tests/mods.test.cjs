const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
function load(name, imports = {}) {
  const filename = path.join(__dirname, '../payload/mods', name);
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
    presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const exports = {};
  vm.runInNewContext(code, {exports, require: n => Object.hasOwn(imports, n) ? imports[n] : require(require.resolve(n, {paths: [upstream]}))});
  return exports;
}
const core = load('snapshotCore.ts');
const {createRestoreQueue} = load('restoreQueue.ts', {'./snapshotCore': core});
const {createModPreferences} = load('modPreferencesCore.ts');
const plain = x => JSON.parse(JSON.stringify(x));
const both = {wallpaper: true, storage: true};

test('mod switches persist independently and survive concurrent changes and relaunch', async () => {
  let disk = null;
  const io = {read: async () => disk, write: async value => { disk = value; }};
  const prefs = createModPreferences(both, io);
  let updates = 0; const unsubscribe = prefs.subscribe(() => updates++);
  await Promise.all([prefs.setEnabled('wallpaper', false), prefs.setEnabled('storage', false)]);
  assert.deepEqual(plain(prefs.getSnapshot()), {wallpaper: false, storage: false});
  const reopened = createModPreferences(both, io); await reopened.load();
  assert.deepEqual(plain(reopened.getSnapshot()), {wallpaper: false, storage: false});
  await reopened.setEnabled('wallpaper', true);
  assert.deepEqual(JSON.parse(disk), {wallpaper: true, storage: false});
  assert.equal(updates, 3); unsubscribe();
});

test('failed switch save keeps the committed state and later changes still work', async () => {
  let fail = true;
  const prefs = createModPreferences(both, {read: async () => null, write: async () => { if (fail) throw Error('disk full'); }});
  await prefs.load();
  const original = prefs.getSnapshot();
  await assert.rejects(prefs.setEnabled('wallpaper', false), /disk full/);
  assert.equal(prefs.getSnapshot(), original);
  fail = false; await prefs.setEnabled('wallpaper', false);
  assert.equal(prefs.getSnapshot().wallpaper, false);
});

test('unavailable features cannot be enabled and malformed preferences use defaults', async () => {
  const prefs = createModPreferences({wallpaper: false, storage: true}, {read: async () => '{bad', write: async () => {}});
  await prefs.load(); await prefs.setEnabled('wallpaper', true);
  assert.deepEqual(plain(prefs.getSnapshot()), {wallpaper: false, storage: true});
});

test('disabling storage cancels a queued restore before committing the disabled switch', async () => {
  const actions = [];
  const prefs = createModPreferences(both, {read: async () => null,
    beforeDisable: async id => { actions.push('cancel-' + id); }, write: async () => { actions.push('saved'); }});
  await prefs.setEnabled('storage', false);
  assert.deepEqual(actions, ['cancel-storage', 'saved']);
  assert.equal(prefs.getSnapshot().storage, false);
  const blocked = createModPreferences(both, {read: async () => null,
    beforeDisable: async () => { throw Error('cancel failed'); }, write: async () => assert.fail('must not disable')});
  await assert.rejects(blocked.setEnabled('storage', false), /cancel failed/);
  assert.equal(blocked.getSnapshot().storage, true);
});

test('a transient preference read failure can be retried', async () => {
  let fail = true;
  const prefs = createModPreferences(both, {read: async () => { if (fail) throw Error('read failed'); return '{"storage":false}'; }, write: async () => {}});
  await assert.rejects(prefs.load(), /read failed/);
  fail = false; await prefs.load(); assert.equal(prefs.getSnapshot().storage, false);
});

function queueHarness() {
  const files = new Map(); const actions = [];
  let failRestore = false, failDelete = false;
  const io = {exists: async p => files.has(p), read: async p => files.get(p),
    write: async (p, text) => files.set(p, text),
    move: async (from, to) => { assert.ok(files.has(from)); files.set(to, files.get(from)); files.delete(from); },
    remove: async p => { if (failDelete && p.endsWith('next.json')) throw Error('unlink interrupted'); files.delete(p); }};
  const queue = createRestoreQueue(io, '/app/files', {
    recover: async () => { actions.push('recover'); },
    restore: async s => { actions.push('restore:' + s.records['ps:system']); if (failRestore) throw Error('power loss'); },
  });
  return {queue, files, actions, restoreFail: value => { failRestore = value; }, deleteFail: value => { failDelete = value; }};
}
const snapshot = () => ({format: 'sparklecat-storage', version: 1, created: '2026-10-30', documentDir: '/old/files',
  records: {'ps:system': 'backup'}, files: {'ps_backgrounds/wall.png': 'cGlj'}});

test('Settings queues a restore without touching live data; cold startup applies it once', async () => {
  const h = queueHarness();
  await h.queue.queue(snapshot());
  assert.deepEqual(h.actions, []); assert.equal(await h.queue.hasPending(), true);
  await h.queue.apply(); assert.deepEqual(h.actions, ['recover', 'restore:backup']);
  assert.equal(await h.queue.hasPending(), false);
  await h.queue.apply(); assert.deepEqual(h.actions, ['recover', 'restore:backup', 'recover']);
});

test('queued restore validation and duplicate rejection never overwrite a pending backup', async () => {
  const h = queueHarness();
  await assert.rejects(h.queue.queue({...snapshot(), files: {'../../outside': 'cGlj'}}));
  assert.equal(h.files.size, 0);
  await h.queue.queue(snapshot());
  await assert.rejects(h.queue.queue({...snapshot(), records: {'ps:system': 'different'}}), /already waiting/);
  await h.queue.apply(); assert.ok(h.actions.includes('restore:backup'));
});

test('failed cold restore remains queued for recovery and retry', async () => {
  const h = queueHarness(); await h.queue.queue(snapshot()); h.restoreFail(true);
  await assert.rejects(h.queue.apply(), /power loss/);
  assert.equal(await h.queue.hasPending(), true);
  h.restoreFail(false); await h.queue.apply();
  assert.deepEqual(h.actions, ['recover', 'restore:backup', 'recover', 'restore:backup']);
  assert.equal(await h.queue.hasPending(), false);
});

test('interruption after restore commit keeps startup blocked until the queue is consumed', async () => {
  const h = queueHarness(); await h.queue.queue(snapshot()); h.deleteFail(true);
  await assert.rejects(h.queue.apply(), /unlink interrupted/);
  assert.equal(await h.queue.hasPending(), true);
  h.deleteFail(false); await h.queue.apply();
  assert.equal(await h.queue.hasPending(), false);
});

test('canceling a pending restore keeps the running app data untouched', async () => {
  const h = queueHarness(); await h.queue.queue(snapshot()); await h.queue.cancel(); await h.queue.apply();
  assert.deepEqual(h.actions, ['recover']); assert.equal(h.files.size, 0);
});
