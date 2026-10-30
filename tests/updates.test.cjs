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
const {compareVersions, parseVersion, latestPatch, createUpdateChecker} = moduleExports;
const runtime = 'plural-star-1.23.3-mods-1', variant = 'wallpaper-storage';
const release = (tag, draft = false) => {
  const version = tag.split('-v').at(-1), name = `patches-${runtime}-${variant}-${version}.bundle`;
  return {tag_name: tag, draft, assets: [{name, state: 'uploaded', size: 123,
    digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: `https://github.com/sparklecatdev/plural-star-mods/releases/download/${tag}/${name}`}]};
};
const latest = (rows, current = '0.3.0') => latestPatch(rows, current, runtime, variant);

test('release notes follow the selected patch and remain bounded plain text', () => {
  const row = release('patches-v0.4.5');
  row.body = 'New features\u0000\nMore details';
  assert.equal(latest([row]).notes, 'New features\nMore details');
  row.body = 'x'.repeat(7000);
  assert.equal(latest([row]).notes.length, 6000);
  for (const body of [null, {}, '', 42]) {
    row.body = body;
    assert.equal(latest([row]).notes, 'No release notes were provided.');
  }
});

test('semantic version ordering agrees with release and preview ordering', () => {
  const versions = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.9.0', '1.10.0', '2.0.0'];
  for (let i = 0; i < versions.length - 1; i++) assert.ok(compareVersions(versions[i], versions[i+1]) < 0, versions[i]);
  assert.equal(compareVersions('v0.3.0', '0.3.0'), 0);
  for (const value of ['latest', '1.2', '01.2.3', '1.2.3-beta.01', '1.2.3/other']) assert.equal(parseVersion(value), null);
});

test('only verified newer compatible stable patch releases are shown', () => {
  assert.equal(latest([release('compat-v1.24.0-patches-v0.4.4')]).version, '0.4.4');
  assert.equal(latest([release('patches-v0.4.0'), release('patches-v0.10.0'), release('patches-v9.0.0', true)]).version, '0.10.0');
  assert.equal(latest([release('patches-v0.2.0')]), null);
  assert.equal(latest([release('v0.4.0')]), null); // Patcher releases are independent.
  for (const change of [a => { a.assets = []; }, a => { a.prerelease = true; },
    a => { a.assets[0].digest = null; }, a => { a.assets[0].size = 33 * 1024 * 1024; },
    a => { a.assets[0].browser_download_url = 'https://other.test/file'; },
    a => { a.assets[0].name = a.assets[0].name.replace(runtime, 'other-runtime'); },
    a => { a.assets[0].name = a.assets[0].name.replace(variant, 'storage'); }]) {
    const row = release('patches-v0.4.0'); change(row); assert.equal(latest([row]), null);
  }
  assert.throws(() => latest({}));
});

test('automatic checks coalesce and run at most once per day; manual checks bypass the interval', async () => {
  let time = 1000000, calls = 0, disk = null;
  const checker = createUpdateChecker('0.3.0', {read: async () => disk, write: async value => { disk = value; }, fetch: async () => { calls++; return [release('patches-v0.4.0')]; }}, () => time);
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
  releaseFetch([release('patches-v0.4.0')]); await check;
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

const installFilename = path.join(__dirname, '../payload/mods/patchInstallCore.ts');
const installCode = babel.transformSync(fs.readFileSync(installFilename, 'utf8'), {filename: installFilename, babelrc: false, configFile: false,
  presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]}).code;
const installExports = {};
vm.runInNewContext(installCode, {exports: installExports, require: n => n === './updateCheckCore' ? moduleExports : require(require.resolve(n, {paths: [upstream]}))});
const {createPatchInstaller} = installExports;
function installerIO() {
  const files = new Map(), events = [];
  const io = {
    read: async n => files.get(n) || null,
    write: async (n, v) => { events.push(n); files.set(n, v); },
    download: async (_, n) => { events.push('download'); files.set(n, 'bundle'); },
    size: async () => 123, hash: async () => 'a'.repeat(64),
    move: async (from, to) => { events.push('move'); files.set(to, files.get(from)); files.delete(from); },
    remove: async n => { files.delete(n); },
  };
  return {io, files, events};
}
const patch = () => latest([release('patches-v0.4.2')]);
test('patch install coalesces requests and stages only a complete verified download', async () => {
  const h = installerIO(), installer = createPatchInstaller(h.io, '0.4.1', runtime, variant);
  await Promise.all([installer.install(patch()), installer.install(patch())]);
  assert.deepEqual(h.events, ['download', 'move', 'pending.json']);
  assert.equal(installer.getSnapshot().ready, '0.4.2');
  assert.equal(installer.getSnapshot().busy, false);
  assert.equal(JSON.parse(h.files.get('pending.json')).sha256, 'a'.repeat(64));
  assert.equal(h.files.has('download.part'), false);
  const reopened = createPatchInstaller(h.io, '0.4.1', runtime, variant);
  await reopened.load(); assert.equal(reopened.getSnapshot().ready, '0.4.2');
});
test('bad hashes, sizes, network errors and incomplete writes cannot activate a patch', async () => {
  for (const fail of [io => { io.hash = async () => 'b'.repeat(64); }, io => { io.size = async () => 1; },
    io => { io.download = async () => { throw Error('offline'); }; },
    io => { io.write = async () => { throw Error('storage full'); }; }]) {
    const h = installerIO(); fail(h.io);
    const installer = createPatchInstaller(h.io, '0.4.1', runtime, variant); await installer.install(patch());
    assert.ok(installer.getSnapshot().error); assert.equal(installer.getSnapshot().ready, null);
    assert.equal(installer.getSnapshot().busy, false); assert.equal(h.files.has('pending.json'), false);
    assert.equal(h.files.has('download.part'), false);
  }
});
test('incompatible and previously failed patches are rejected before download', async () => {
  for (const change of [p => { p.runtime = 'other'; }, p => { p.variant = 'storage'; },
    p => { p.version = '0.4.1'; }, p => { p.url = 'https://other.test/file'; }, p => { p.sha256 = '../path'; }]) {
    const h = installerIO(), p = patch(); change(p);
    const installer = createPatchInstaller(h.io, '0.4.1', runtime, variant); await installer.install(p);
    assert.ok(installer.getSnapshot().error); assert.deepEqual(h.events, []);
  }
  const h = installerIO(); h.files.set('failed.json', JSON.stringify(patch()));
  const installer = createPatchInstaller(h.io, '0.4.1', runtime, variant);
  await installer.load(); assert.match(installer.getSnapshot().error, /rolled back/);
  await installer.install(patch()); assert.match(installer.getSnapshot().error, /failed to start/);
  assert.deepEqual(h.events, []);
});
