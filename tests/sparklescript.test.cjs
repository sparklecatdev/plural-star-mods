const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));
const filename = path.join(__dirname, '../payload/mods/sparkleScriptCore.ts');
const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
const result = {}; vm.runInNewContext(code, {exports: result});
const {parseSparkle, runSparkle, sparkleCss} = result;
test('CSS declarations translate to React Native styles and reject unsupported syntax', () => {
 const style = sparkleCss`background-color: #123456; padding: ${12}px; width: 50%; font-weight: 700;`;
 assert.equal(style.backgroundColor, '#123456'); assert.equal(style.padding, 12);
 assert.equal(style.width, '50%'); assert.equal(style.fontWeight, '700');
 assert.throws(() => sparkleCss('view { color: red }'));
 assert.throws(() => sparkleCss('margin: 1px 2px'));
 assert.throws(() => sparkleCss('animation: spin 1s'));
});
const script = 'mod "Hello" version "1.0.0" { describe "A greeting" when tap { show "Hello!" } }';
test('parses a bounded mod and runs only the selected event', () => {
 const mod = parseSparkle(script), messages = [];
 runSparkle(mod, 'open', m => messages.push(m.value)); assert.equal(messages.length, 0);
 runSparkle(mod, 'tap', m => messages.push(m.value)); assert.deepEqual(messages, ['Hello!']);
});
test('rejects arbitrary code, malformed input and oversized scripts', () => {
 for (const value of [script + ' fetch("https://example.com")', 'mod "x" version "1.0.0" { when tap { show "x" }', 'x'.repeat(16385), 'mod "x" version "1.0.0" { when tap { eval "x" } }']) assert.throws(() => parseSparkle(value));
});

test('appearance changes require a declared permission and valid colors', () => {
 assert.throws(() => parseSparkle('mod "x" version "1.0.0" { when tap { accent "#123456" } }'));
 assert.throws(() => parseSparkle('mod "x" version "1.0.0" { allow appearance when tap { accent "red" } }'));
 const mod = parseSparkle('mod "x" version "1.0.0" { allow appearance when tap { accent "#ab12ef" } }');
 const actions = []; runSparkle(mod, 'tap', a => actions.push(a.value)); assert.deepEqual(actions, ['#AB12EF']);
});
function managerHarness(initial = null) {
 const disk = {'sparklecat:custom-scripts': initial}; const alerts = []; const changes = [];
 const file = path.join(__dirname, '../payload/mods/sparkleScripts.ts');
 const transformed = babel.transformSync(fs.readFileSync(file, 'utf8'), {filename: file, babelrc: false, configFile: false, presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]}).code;
 const api = {}; const native = {Alert: {alert: (...args) => alerts.push(args)}};
 vm.runInNewContext(transformed, {exports: api, require: name => {
  if (name === '@react-native-async-storage/async-storage') return {getItem: async key => disk[key] || null, setItem: async (key, value) => {disk[key] = value;}};
  if (name === 'react') return {useSyncExternalStore: () => {}};
  if (name === 'react-native-blob-util') return {};
  if (name === '../store/appStore') return {useAppStore: {}};
  if (name === 'react-native') return native;
  if (name === './sparkleScriptCore') return result;
  if (name === './extraCustomization') return {extraCustomization: {getSnapshot: () => ({enabled: false, colors: {}}), set: async value => changes.push(value)}};
  if (name.startsWith('@babel/runtime/')) return require(require.resolve(name, {paths: [upstream]}));
  throw Error('Unexpected dependency ' + name);
 }});
 return {api, native, alerts, changes, disk: () => disk['sparklecat:custom-scripts']};
}
test('scripts persist disabled until explicitly enabled; edits may be disabled again', async () => {
 const h = managerHarness(); await h.api.loadScripts();
 await h.api.saveScripts(rows => [...rows, {id: 'one', source: script, enabled: false}]);
 h.api.runScripts('tap', 'one'); assert.equal(h.alerts.length, 0);
 await h.api.saveScripts(rows => rows.map(row => ({...row, enabled: true})));
 await h.api.setScriptingEnabled(true);
 h.api.runScripts('tap', 'one'); assert.equal(h.alerts.length, 1);
 const next = managerHarness(h.disk()); await next.api.loadScripts();
 assert.equal(next.api.listScripts()[0].enabled, true);
 await next.api.saveScripts(rows => rows.map(row => ({...row, enabled: false})));
 next.api.runScripts('tap', 'one'); assert.equal(next.alerts.length, 0);
});
test('invalid persisted or updated scripts never run', async () => {
 const broken = managerHarness(JSON.stringify([{id: 'x', source: 'evil()', enabled: true}]));
 await assert.rejects(broken.api.loadScripts()); assert.equal(broken.alerts.length, 0);
 const h = managerHarness(); await h.api.loadScripts();
 await assert.rejects(h.api.saveScripts(() => [{id: 'x', source: 'evil()', enabled: true}]));
 assert.equal(h.api.listScripts().length, 0);
});
test('an appearance script does not turn on unrelated saved customization settings', async () => {
 const source = 'mod "x" version "1.0.0" { allow appearance when tap { accent "#abcdef" } }';
 const h = managerHarness(); await h.api.loadScripts();
 await h.api.saveScripts(() => [{id: 'x', source, enabled: true}]);
 await h.api.setScriptingEnabled(true); h.api.runScripts('tap', 'x'); await new Promise(setImmediate);
 assert.equal(h.changes.length, 1); assert.equal(h.changes[0].enabled, false);
 assert.equal(h.changes[0].colors.accentBg, '#ABCDEF');
});

test('JavaScript mods require opt-in and clean up when disabled', async () => {
 const h = managerHarness(); await h.api.loadScripts();
 const source = '// sparkle {"name":"Example","version":"1.0.0"}\napi.ReactNative.Alert.alert("started"); api.onDispose(() => api.ReactNative.Alert.alert("stopped"));';
 await h.api.saveScripts(() => [{id: 'example', source, enabled: true}]);
 h.api.runScripts('open'); assert.equal(h.alerts.length, 0);
 await h.api.setScriptingEnabled(true); assert.equal(h.alerts[0][0], 'started');
 await h.api.setScriptingEnabled(false); assert.equal(h.alerts[1][0], 'stopped');
 assert.throws(() => parseSparkle('// sparkle {"name":"x","version":"1.0.0"}\nconst ='));
});

test('enabled scripts can use the CSS helper', async () => {
 const h = managerHarness(); await h.api.loadScripts();
 const source = '// sparkle {"name":"Styles","version":"1.0.0"}\napi.ReactNative.Alert.alert(api.css("padding: 8px").padding);';
 await h.api.saveScripts(() => [{id: 'styles', source, enabled: true}]);
 h.api.runScripts('open'); await h.api.setScriptingEnabled(true);
 assert.equal(h.alerts[0][0], 8);
});

test('a stopped script cannot add a late app wrapper', async () => {
 const h = managerHarness(); await h.api.loadScripts();
 const source = '// sparkle {"name":"Late","version":"1.0.0"}\napi.ReactNative.Alert.late = () => api.wrapApp(function Wrapper() {});';
 await h.api.saveScripts(() => [{id: 'late', source, enabled: true}]);
 h.api.runScripts('open'); await h.api.setScriptingEnabled(true);
 await h.api.setScriptingEnabled(false);
 // The saved callback retains the original API, even after disabling the mod.
 h.native.Alert.late(); assert.equal(h.api.useScriptState().wrappers.length, 0);
});
