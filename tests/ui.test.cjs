const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const React = require('react');
const {act, create} = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const upstream = path.resolve(process.argv[2] || path.join(__dirname, '../.work/upstream'));
const babel = require(path.join(upstream, 'node_modules/@babel/core'));

function load(name, imports = {}, generated = false) {
  const filename = generated ? path.join(upstream, name) : path.join(__dirname, '../payload/mods', name);
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
    presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const exports = {};
  vm.runInNewContext(code, {exports, require: n => {
    if (n === 'react') return React;
    if (n === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (Object.hasOwn(imports, n)) return imports[n];
    if (n.startsWith('@babel/runtime/')) return require(require.resolve(n, {paths: [upstream]}));
    assert.fail('Unexpected UI dependency: ' + n);
  }});
  return exports;
}
const theme = {bg: '#14101F', text: '#ffffff', surface: '#241b33', accent: '#e5b5ff', dim: '#c5b9d4', muted: '#9889a8', danger: '#ffb4c8', border: '#51465e'};
const host = name => ({children, ...props}) => React.createElement(name, props, children);

test('PluralKit settings require opt-in and mask the token while editing', async () => {
  const calls = [];
  const {PluralKitSettings} = load('PluralKitSettings.tsx', {
    'react-native': {View: 'View'}, 'react-i18next': {useTranslation: () => ({t: (key, options) => options?.defaultValue || key})},
    '../components/AppText': {Text: 'Text', TextInput: 'TextInput'},
    '../components/controls': {ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
  });
  const props = {token: 'secret', onToggle: () => calls.push('toggle'), onToken: value => calls.push(value)};
  let renderer;
  await act(async () => { renderer = create(React.createElement(PluralKitSettings, {...props, enabled: false})); });
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  await act(async () => renderer.update(React.createElement(PluralKitSettings, {...props, enabled: true})));
  const input = renderer.root.findByType('TextInput');
  assert.equal(input.props.secureTextEntry, true);
  assert.equal(input.props.value, 'secret');
  await act(async () => input.props.onChangeText('replacement'));
  assert.deepEqual(calls, ['toggle', 'replacement']);
  await act(async () => renderer.unmount());
});

function rootHarness({password = null, reduceMotion = false, recoveryError = false, deferred = false} = {}) {
  const animations = []; const gates = []; let resolveRecovery;
  const recovered = deferred ? new Promise(resolve => { resolveRecovery = resolve; }) : Promise.resolve();
  const {default: Root} = load('ModsRoot.tsx', {
    'react-native': {View: 'View', Text: 'Text', TextInput: 'TextInput', Button: 'Button', ActivityIndicator: 'ActivityIndicator',
      StyleSheet: {create: value => value, absoluteFillObject: {}}, Easing: {cubic: () => {}, out: fn => fn},
      AccessibilityInfo: {isReduceMotionEnabled: async () => reduceMotion},
      Animated: {Value: class {}, View: 'AnimatedView', timing: () => ({}), parallel: () => ({}), delay: () => ({}),
        sequence: () => ({start: fn => animations.push(fn), stop: () => {}})}},
    '@react-native-async-storage/async-storage': {getItem: async () => password ? JSON.stringify({appLockPassword: password}) : null},
    './modPreferences': {modPreferences: {load: async () => {}}},
    './updateCheck': {updateChecker: {check: async () => {}}},
    './storageSnapshot': {recoverBeforeStart: async () => { await recovered; if (recoveryError) throw Error('restore failed'); },
      retryStoragePreparation: async () => {}, recovery: {recover: async () => {}}, restoreQueue: {cancel: async () => {}}},
    './toolsState': {setToolsOpen: value => gates.push(value), waitForStorageIdle: async () => {}},
    '../../App': {default: () => React.createElement('PluralStar')},
  });
  return {Root, animations, gates, resolveRecovery};
}

test('launch shows a short animation and opens the app automatically without a boot menu', async () => {
  const h = rootHarness(); let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); });
  assert.equal(renderer.root.findAllByType('PluralStar').length, 1);
  assert.equal(renderer.root.findAllByType('Button').length, 0, 'no Open app or mod menu action on boot');
  assert.equal(h.animations.length, 1);
  await act(async () => { h.animations[0]({finished: true}); });
  assert.equal(renderer.root.findAllByType('AnimatedView').length, 0);
  assert.equal(renderer.root.findAllByType('PluralStar').length, 1);
  assert.equal(h.gates.at(-1), false);
  await act(async () => renderer.unmount());
});

test('reduced-motion launches skip the animation and retain automatic navigation', async () => {
  const h = rootHarness({reduceMotion: true}); let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); });
  assert.equal(h.animations.length, 0);
  assert.equal(renderer.root.findAllByType('PluralStar').length, 1);
  assert.equal(renderer.root.findAllByType('AnimatedView').length, 0);
  await act(async () => renderer.unmount());
});

test('app startup waits for restore completion; restore failure never opens the live app', async () => {
  const h = rootHarness({deferred: true, reduceMotion: true}); let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); });
  assert.equal(renderer.root.findAllByType('PluralStar').length, 0);
  assert.equal(h.gates.at(-1), true);
  await act(async () => h.resolveRecovery());
  assert.equal(renderer.root.findAllByType('PluralStar').length, 1);
  await act(async () => renderer.unmount());
  const failed = rootHarness({recoveryError: true, reduceMotion: true});
  await act(async () => { renderer = create(React.createElement(failed.Root)); });
  assert.equal(renderer.root.findAllByType('PluralStar').length, 0);
  assert.ok(renderer.root.findAllByType('Button').some(node => node.props.title === 'Try again'));
  assert.equal(failed.gates.at(-1), true);
  await act(async () => renderer.unmount());
});

test('the existing app password still gates access after the intro', async () => {
  const h = rootHarness({password: 'app secret', reduceMotion: true}); let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); });
  assert.equal(renderer.root.findAllByType('PluralStar').length, 0);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('wrong'));
  await act(async () => renderer.root.findByType('Button').props.onPress());
  assert.equal(renderer.root.findAllByType('PluralStar').length, 0);
  await act(async () => renderer.root.findByType('TextInput').props.onChangeText('app secret'));
  await act(async () => renderer.root.findByType('Button').props.onPress());
  assert.equal(renderer.root.findAllByType('PluralStar').length, 1);
  await act(async () => renderer.unmount());
});

test('Settings opens the mod menu; both switches persist and hide disabled controls', async () => {
  const {createModPreferences} = load('modPreferencesCore.ts'); let disk;
  const prefs = createModPreferences({wallpaper: true, storage: true}, {read: async () => null, write: async value => { disk = value; }});
  await prefs.load();
  const {ModSettingsButton} = load('ModMenu.tsx', {
    'react-native': {Modal: 'Modal', ScrollView: 'ScrollView', View: 'View'},
    'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'},
    '../components/AppText': {Text: 'Text'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './modPreferences': {modPreferences: prefs, useModPreferences: () => React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot)},
    './modOptions': {options: {wallpaper: true, storage: true}},
    './WallpaperControls': {WallpaperControls: host('WallpaperControls')}, './BackupTools': {BackupTools: host('BackupTools')},
    './UpdateEntry': {UpdateEntry: host('UpdateEntry')},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(ModSettingsButton)); });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.root.findByType('Button').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 1);
  assert.equal(renderer.root.findAllByType('WallpaperControls').length, 1);
  for (const label of ['Wallpaper', 'Storage tools']) {
    await act(async () => {
      renderer.root.findAllByType('Toggle').find(n => n.props.label === label).props.onToggle();
      await new Promise(setImmediate);
    });
  }
  assert.deepEqual(JSON.parse(disk), {wallpaper: false, storage: false});
  assert.equal(renderer.root.findAllByType('WallpaperControls').length, 0);
  assert.equal(renderer.root.findAllByType('BackupTools').length, 0);
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Done').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.unmount());
});

if (fs.existsSync(path.join(upstream, 'src/app/AppBackground.tsx'))) test('disabling wallpaper restores the solid canvas while retaining the chosen image', async () => {
  let enabled = true;
  const {AppBackground} = load('src/app/AppBackground.tsx', {
    'react-native': {View: 'View'}, '../components/BackgroundImage': {BackgroundImage: host('BackgroundImage')},
    '../store/appStore': {useAppStore: fn => fn({appSettings: {backgroundImage: 'wall.png'}})},
    '../themeContext': {useTheme: () => theme, ThemeProvider: host('ThemeProvider')},
    '../utils/backgroundImage': {backgroundImageUri: name => name && 'file:///media/' + name},
    '../mods/modPreferences': {useModPreferences: () => ({wallpaper: enabled})},
  }, true);
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppBackground, null, 'screen')); });
  assert.equal(renderer.root.findByType('BackgroundImage').props.filename, 'wall.png');
  assert.equal(renderer.root.findByType('ThemeProvider').props.value.canvas, 'transparent');
  enabled = false;
  await act(async () => renderer.update(React.createElement(AppBackground, null, 'screen')));
  assert.equal(renderer.root.findByType('BackgroundImage').props.filename, undefined);
  assert.equal(renderer.root.findByType('ThemeProvider').props.value.canvas, theme.bg);
  enabled = true;
  await act(async () => renderer.update(React.createElement(AppBackground, null, 'screen')));
  assert.equal(renderer.root.findByType('BackgroundImage').props.filename, 'wall.png');
  await act(async () => renderer.unmount());
});

test('Settings restore confirms and queues the backup without restoring over the running app', async () => {
  const actions = []; const busy = []; const alerts = [];
  const snapshot = {created: '2026-10-30', records: {'ps:system': 'backup'}};
  const {BackupTools} = load('BackupTools.tsx', {
    'react-native': {ActivityIndicator: 'ActivityIndicator', View: 'View', Linking: {openSettings: async () => actions.push('settings')},
      Alert: {alert: (title, message, buttons) => { alerts.push(title); if (title === 'Restore app data?') buttons[1].onPress(); }}},
    '@react-native-documents/picker': {pick: async () => [{uri: 'content://backups/file', size: 1000}],
      keepLocalCopy: async () => [{status: 'success', localUri: 'file:///cache/backup.scat'}],
      isErrorWithCode: () => false, errorCodes: {}},
    'react-native-blob-util': {fs: {exists: async () => true, unlink: async () => actions.push('clean-cache')}},
    '../components/AppText': {Text: 'Text', TextInput: 'TextInput'}, '../components/controls': {Btn: host('Button')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './storageSnapshot': {saveSnapshot: async () => assert.fail('not saving'), openSnapshot: async () => snapshot,
      restoreQueue: {hasPending: async () => false, queue: async value => { assert.equal(value, snapshot); actions.push('queued'); }, cancel: async () => actions.push('cancel')}},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(BackupTools, {onBusy: value => busy.push(value)})); });
  await act(async () => renderer.root.findAllByType('TextInput')[0].props.onChangeText('backup password'));
  await act(async () => {
    renderer.root.findAllByType('Button').find(n => n.props.children === 'Restore app data').props.onPress();
    await new Promise(setImmediate);
  });
  assert.deepEqual(actions, ['queued', 'clean-cache']);
  assert.deepEqual(busy, [true, false]);
  assert.deepEqual(alerts, ['Restore app data?', 'Restore ready']);
  assert.ok(renderer.root.findAllByType('Button').some(n => n.props.children === 'Open app settings'));
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Cancel pending restore').props.onPress());
  assert.equal(actions.at(-1), 'cancel');
  await act(async () => renderer.unmount());
});

test('update settings display availability, persist opt-out, and retain manual checks', async () => {
  const calls = [];
  const state = {automatic: true, available: '0.4.0', checking: false, error: ''};
  const {UpdateEntry} = load('UpdateEntry.tsx', {
    'react-native': {View: 'View'}, '../components/AppText': {Text: 'Text'},
    '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './updateCheck': {useUpdateCheck: () => state, openUpdater: async () => calls.push('open'),
      updateChecker: {setAutomatic: async value => calls.push(value), check: async force => calls.push(['check', force])}},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(UpdateEntry)); });
  assert.ok(renderer.root.findAllByType('Text').some(n => n.props.children === 'Mod pack 0.4.0 is available.'));
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Check for updates').props.onPress());
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Open updater').props.onPress());
  assert.deepEqual(calls, [false, ['check', true], 'open']);
  await act(async () => renderer.unmount());
});

test('opening updater uses the app link and falls back to the trusted release page', async () => {
  const urls = []; let installed = true;
  const {openUpdater} = load('updateCheck.ts', {
    '@react-native-async-storage/async-storage': {getItem: async () => null, setItem: async () => {}},
    'react-native': {Linking: {openURL: async url => { urls.push(url); if (!installed && url.startsWith('sparklecatmods:')) throw Error('not installed'); }}},
    './modOptions': {payloadVersion: '0.3.0'},
    './updateCheckCore': {createUpdateChecker: () => ({}), UPDATE_API: '',
      UPDATE_PAGE: 'https://github.com/sparklecatdev/plural-star-mods/releases', UPDATER_LINK: 'sparklecatmods://updates'},
  });
  await openUpdater(); installed = false; await openUpdater();
  assert.deepEqual(urls, ['sparklecatmods://updates', 'sparklecatmods://updates', 'https://github.com/sparklecatdev/plural-star-mods/releases']);
});
