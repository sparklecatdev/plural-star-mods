const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.join(__dirname, '../payload/mods/updateCheckCore.ts');
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
  presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
const moduleExports = {};
vm.runInNewContext(code, {exports: moduleExports, require: n => require(require.resolve(n, {paths: [upstream]}))});
const {compareVersions, parseVersion, latestVersion, createUpdateChecker} = moduleExports;
const release = (tag, draft = false) => ({tag_name: tag, draft, assets: [
  {name: `sparklecat-plural-star-mods-${tag.slice(1)}.apk`, state: 'uploaded'}, {name: 'SHA256SUMS', state: 'uploaded'},
]});

test('semantic version ordering agrees with release and preview ordering', () => {
  const versions = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.9.0', '1.10.0', '2.0.0'];
  for (let i = 0; i < versions.length - 1; i++) assert.ok(compareVersions(versions[i], versions[i+1]) < 0, versions[i]);
  assert.equal(compareVersions('v0.3.0', '0.3.0'), 0);
  for (const value of ['latest', '1.2', '01.2.3', '1.2.3-beta.01', '1.2.3/other']) assert.equal(parseVersion(value), null);
});

test('only complete newer public mod-pack releases are shown', () => {
  assert.equal(latestVersion([release('v0.4.0'), release('v0.10.0'), release('v9.0.0', true)], '0.3.0'), '0.10.0');
  assert.equal(latestVersion([release('v0.2.0')], '0.3.0'), null);
  const incomplete = release('v0.4.0'); incomplete.assets.pop();
  assert.equal(latestVersion([incomplete], '0.3.0'), null);
  assert.throws(() => latestVersion({}, '0.3.0'));
});

test('automatic checks coalesce and run at most once per day; manual checks bypass the interval', async () => {
  let time = 1000000, calls = 0, disk = null;
  const checker = createUpdateChecker('0.3.0', {read: async () => disk, write: async value => { disk = value; }, fetch: async () => { calls++; return [release('v0.4.0')]; }}, () => time);
  await Promise.all([checker.check(), checker.check()]);
  assert.equal(calls, 1); assert.equal(checker.getSnapshot().available, '0.4.0');
  await checker.check(); assert.equal(calls, 1);
  await checker.check(true); assert.equal(calls, 2);
  time += 24 * 60 * 60 * 1000; await checker.check(); assert.equal(calls, 3);
  assert.equal(checker.getSnapshot().checking, false);
});

test('turning off automatic checks persists across launches and still permits manual checks', async () => {
  let disk = null, calls = 0;
  const io = {read: async () => disk, write: async value => { disk = value; }, fetch: async () => { calls++; return []; }};
  const checker = createUpdateChecker('0.3.0', io);
  await checker.setAutomatic(false); await checker.check(); assert.equal(calls, 0);
  const reopened = createUpdateChecker('0.3.0', io); await reopened.check(); assert.equal(calls, 0);
  await reopened.check(true); assert.equal(calls, 1); assert.equal(reopened.getSnapshot().automatic, false);
});

test('overlapping checks and preference changes do not overwrite each other', async () => {
  let releaseFetch, disk = null;
  const checker = createUpdateChecker('0.3.0', {read: async () => disk, write: async value => { disk = value; },
    fetch: () => new Promise(resolve => { releaseFetch = resolve; })});
  const check = checker.check(); await new Promise(setImmediate);
  await checker.setAutomatic(false);
  releaseFetch([release('v0.4.0')]); await check;
  assert.equal(JSON.parse(disk).automatic, false);
  assert.equal(JSON.parse(disk).available, '0.4.0');
  assert.equal(checker.getSnapshot().checking, false);
});

test('offline checks remain nonfatal and an adjusted clock cannot disable checking indefinitely', async () => {
  let time = 1000000, calls = 0;
  const checker = createUpdateChecker('0.3.0', {read: async () => null, write: async () => {}, fetch: async () => { calls++; throw Error('offline'); }}, () => time);
  await checker.check(); assert.equal(calls, 1); assert.ok(checker.getSnapshot().error); assert.equal(checker.getSnapshot().checking, false);
  await checker.check(); assert.equal(calls, 1);
  time -= 1000; await checker.check(); assert.equal(calls, 2);
});
