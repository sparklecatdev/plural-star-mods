const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.join(__dirname, '../payload/mods/pluralKitSyncCore.ts');
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
  presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
const moduleExports = {};
vm.runInNewContext(code, {exports: moduleExports, require: name => {
  assert.ok(name.startsWith('@babel/runtime/'), 'Unexpected dependency: ' + name);
  return require(require.resolve(name, {paths: [upstream]}));
}});
const {createPluralKitSync} = moduleExports;
const members = [{id: 'a', sourceId: 'abcde'}, {id: 'b', sourceId: 'abcdef'},
  {id: 'uuid', sourceId: '12345678-abcd-abcd-abcd-123456789012'},
  {id: 'local'}, {id: 'amp', sourceId: 'amp:abcde'}];
function harness() {
  let now = 0, next = 0;
  const timers = new Map(), calls = [];
  const settings = {pkFrontSyncEnabled: true, pkToken: ' token '};
  const h = {settings, calls, failures: 0, send: async () => {}};
  h.sync = createPluralKitSync({settings: () => settings, now: () => now,
    schedule: (run, delay) => { timers.set(++next, {run, at: now + delay}); return next; },
    clear: id => timers.delete(id), failed: () => h.failures++,
    send: async (token, refs) => { calls.push([token, Array.from(refs)]); await h.send(); }});
  h.queue = ids => h.sync.queue(ids, members);
  h.tick = async ms => {
    now += ms;
    for (const [id, task] of timers) if (task.at <= now) { timers.delete(id); task.run(); }
    await new Promise(setImmediate);
  };
  return h;
}

test('sync requires explicit opt-in and a nonempty token', async () => {
  const h = harness(); h.settings.pkFrontSyncEnabled = false;
  h.queue(['a']); await h.tick(0); assert.equal(h.calls.length, 0);
  h.settings.pkFrontSyncEnabled = true; h.settings.pkToken = '  ';
  h.queue(['a']); await h.tick(0); assert.equal(h.calls.length, 0);
});

test('primary member IDs map to unique valid PluralKit references, including six-letter IDs and UUIDs', async () => {
  const h = harness(); h.queue(['a', 'b', 'uuid', 'a', 'local', 'amp', 'missing']); await h.tick(0);
  assert.deepEqual(h.calls, [['token', ['abcde', 'abcdef', members[2].sourceId]]]);
  h.queue([]); await h.tick(5000); assert.deepEqual(h.calls[1], ['token', []]);
});

test('rapid changes collapse to the latest front, respect cooldown, and deduplicate successes', async () => {
  const h = harness(); h.queue(['a']); await h.tick(0);
  h.queue([]); h.queue(['b']); await h.tick(4999); assert.equal(h.calls.length, 1);
  await h.tick(1); assert.deepEqual(h.calls[1], ['token', ['abcdef']]);
  h.queue(['b']); await h.tick(5000); assert.equal(h.calls.length, 2);
});

test('in-flight requests serialize; reverting to an earlier front still sends the latest desired state', async () => {
  const h = harness(); h.queue(['a']); await h.tick(0);
  let finish; h.send = () => new Promise(resolve => { finish = resolve; });
  h.queue(['b']); await h.tick(5000); h.queue(['a']); await h.tick(5000);
  assert.equal(h.calls.length, 2); h.send = async () => {}; finish(); await h.tick(0); await h.tick(0);
  assert.deepEqual(h.calls[2], ['token', ['abcde']]);
});

test('disabled sync, changed tokens, and canceled queues never send pending switches', async () => {
  for (const change of [h => { h.settings.pkFrontSyncEnabled = false; },
    h => { h.settings.pkToken = 'different'; }, h => h.sync.cancel()]) {
    const h = harness(); h.queue(['a']); change(h); await h.tick(0); assert.equal(h.calls.length, 0);
  }
});

test('request failures stay nonfatal and allow a later front update to retry', async () => {
  const h = harness(); h.send = async () => { throw Error('offline'); };
  h.queue(['a']); await h.tick(0); assert.equal(h.failures, 1);
  h.send = async () => {}; h.queue(['a']); await h.tick(5000); assert.equal(h.calls.length, 2);
});
