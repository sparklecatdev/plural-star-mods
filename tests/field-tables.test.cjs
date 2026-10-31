const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.join(__dirname, '../payload/mods/fieldTablesCore.ts');
const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]}).code;
const api = {}; vm.runInNewContext(code, {exports: api});
test('parses styled cells and preserves surrounding text', () => {
  const result = api.parseFieldTables('Before<table><tr><th style="color: red">Name</th><td>A &amp; B<br>Hi</td></tr></table>After');
  assert.equal(result.length, 3); assert.equal(result[0].text, 'Before');
  assert.equal(result[1].rows[0][0].css, 'color: red'); assert.equal(result[1].rows[0][0].header, true);
  assert.equal(result[1].rows[0][1].text, 'A & B\nHi'); assert.equal(result[2].text, 'After');
});
test('unsupported or broken tables fall back to the existing renderer', () => {
  for (const text of ['plain', '<table><tr><td colspan="2">x</td></tr></table>', '<table><tr><td><b>x</b></td></tr></table>', '<table><tr><td>x</td></tr>', '<table><tr><td>x</td></tr><tr><td>y</td><td>z</td></tr></table>']) assert.equal(api.parseFieldTables(text), null);
});
