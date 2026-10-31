const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.join(__dirname, '../payload/mods/discordPresenceCore.ts');
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
  presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
const exports_ = {};
vm.runInNewContext(code, {exports: exports_});
const {frontingPresence} = exports_;

test('presence only includes public primary and co-fronting members', () => {
  const members = [{id: 'a', name: 'Alice'}, {id: 'b', name: 'Bee', private: true},
    {id: 'c', name: 'Cat'}, {id: 'd', name: 'Deleted', deleted: true}];
  const front = {primary: {memberIds: ['a', 'b', 'd']}, coFront: {memberIds: ['c', 'a']}};
  assert.equal(frontingPresence(members, front), 'Fronting: Alice, Cat');
  assert.equal(frontingPresence(members, {primary: {memberIds: ['b']}}), null);
  assert.equal(frontingPresence(members, null), null);
});

test('presence respects Discord length limits without splitting emoji', () => {
  const result = frontingPresence([{id: 'a', name: 'x'.repeat(117) + '😀😀'}], {primary: {memberIds: ['a']}});
  assert.equal(Array.from(result).length, 128);
  assert.ok(!result.endsWith('\ud83d'));
});
