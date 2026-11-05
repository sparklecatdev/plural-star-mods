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
  vm.runInNewContext(code, {exports, __DEV__: false, setTimeout, clearTimeout, require: n => {
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

test('sheet opacity is optional and does not fade content', async () => {
  let colors = {...theme, card: '#00000000'};
  let extra = {enabled: true, sheetOpacity: null};
  const {Sheet} = load('src/components/Sheet.tsx', {
    'react-native': {View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', StyleSheet: {create: x => x}, Platform: {OS: 'android'}},
    './AppText': {Text: 'Text'}, 'react-native-safe-area-context': {useSafeAreaInsets: () => ({bottom: 0})},
    '@lodev09/react-native-true-sheet': {TrueSheet: host('TrueSheet')}, '../theme': {Fonts: {display: 'font'}},
    '../themeContext': {useTheme: () => colors}, 'react-i18next': {useTranslation: () => ({t: x => x})},
    '../utils/log': {log: {debug: () => {}}}, '../mods/extraCustomization': {useExtraCustomization: () => extra},
  }, true);
  let renderer;
  const element = () => React.createElement(Sheet, {visible: false, title: 'Settings', onClose: () => {}}, 'Content');
  const check = (color, content = color) => {
    const sheet = renderer.root.findByType('TrueSheet');
    assert.equal(sheet.props.backgroundColor, color);
    assert.equal(sheet.props.header.props.style[1].backgroundColor, content);
    assert.equal(renderer.root.findByType('ScrollView').props.style[1].backgroundColor, content);
  };
  await act(async () => { renderer = create(element()); });
  check('#00000000');
  extra = {enabled: true, sheetOpacity: 50};
  await act(async () => renderer.update(element()));
  check(theme.bg + '80', 'transparent');
  extra = {enabled: true, sheetOpacity: 100};
  await act(async () => renderer.update(element()));
  check(theme.bg + 'ff', 'transparent');
  extra = {enabled: false, sheetOpacity: 100};
  await act(async () => renderer.update(element()));
  check('#00000000');
  colors = {...colors, card: '#322233'};
  await act(async () => renderer.update(element()));
  check(colors.card);
  await act(async () => renderer.unmount());
});

test('mod sync controls support manual restore and show failures inside the mod settings', async () => {
  const calls = [];
  const state = {ready: true, automaticRestore: false, restoring: false, error: 'Restore failed', message: ''};
  const {CloudModSettings} = load('CloudModSettings.tsx', {
    'react-native': {View: 'View'}, '../components/AppText': {Text: 'Text'},
    '../components/controls': {Btn: host('Button')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './cloudMods': {useCloudMods: () => state, cloudMods: {
      sync: async force => { calls.push(['restore', force]); },
    }},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(CloudModSettings, {disabled: false})); });
  assert.equal(renderer.root.findByProps({accessibilityRole: 'alert'}).props.children, 'Restore failed');
  await act(async () => renderer.root.findByType('Button').props.onPress());
  assert.equal(renderer.root.findAllByType('Toggle').length, 0);
  assert.equal(renderer.root.findByType('Button').props.children, 'Restore mod preferences');
  assert.deepEqual(calls, [['restore', true]]);
  await act(async () => renderer.update(React.createElement(CloudModSettings, {disabled: true})));
  assert.equal(renderer.root.findByType('Button').props.disabled, true);
  await act(async () => renderer.unmount());
});

function pluralKitHarness(save) {
  let settings = {language: 'en', pkToken: 'secret'};
  const listeners = new Set();
  const publish = next => { settings = next; for (const listener of listeners) listener(); };
  const useAppStore = selector => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => selector({appSettings: settings}));
  useAppStore.getState = () => ({appSettings: settings});
  const {PluralKitSettings} = load('PluralKitSettings.tsx', {
    'react-native': {View: 'View'}, 'react-i18next': {useTranslation: () => ({t: (key, options) => options?.defaultValue || key})},
    '../components/AppText': {Text: 'Text', TextInput: 'TextInput'},
    '../components/controls': {ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    '../store/appStore': {useAppStore},
    '../store/actions': {saveAppSettings: async next => { await save(next); publish(next); }},
  });
  return {PluralKitSettings, publish, settings: () => settings};
}

test('PluralKit settings require opt-in, mask tokens, and save edits without losing other settings', async () => {
  const calls = []; const busy = [];
  const h = pluralKitHarness(async next => calls.push(next));
  const props = {disabled: false, onBusy: value => busy.push(value)};
  let renderer;
  await act(async () => { renderer = create(React.createElement(h.PluralKitSettings, props)); });
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  assert.equal(h.settings().pkFrontSyncEnabled, true);
  const input = renderer.root.findByType('TextInput');
  assert.equal(input.props.secureTextEntry, true);
  assert.equal(input.props.value, 'secret');
  await act(async () => {
    input.props.onChangeText('re');
    input.props.onChangeText('replacement ');
    h.publish({...h.settings(), language: 'de'});
  });
  assert.deepEqual(calls.slice(1).map(value => value.pkToken), ['re', 'replacement']);
  assert.equal(h.settings().language, 'de');
  assert.equal(input.props.value, 'replacement ');
  assert.equal(busy.at(-1), false);
  await act(async () => renderer.update(React.createElement(h.PluralKitSettings, {...props, disabled: true})));
  assert.equal(input.props.editable, false);
  assert.equal(renderer.root.findByType('Toggle').props.disabled, true);
  await act(async () => renderer.unmount());
});

test('PluralKit save failures are visible and allow a retry', async () => {
  let fail = true; const busy = [];
  const h = pluralKitHarness(async () => { if (fail) throw Error('Storage unavailable'); });
  let renderer;
  await act(async () => { renderer = create(React.createElement(h.PluralKitSettings, {disabled: false, onBusy: value => busy.push(value)})); });
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  assert.match(renderer.root.findByProps({accessibilityRole: 'alert'}).props.children, /Storage unavailable/);
  assert.equal(busy.at(-1), false);
  assert.equal(renderer.root.findByType('Toggle').props.disabled, false);
  fail = false;
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  assert.equal(h.settings().pkFrontSyncEnabled, true);
  assert.equal(renderer.root.findAllByProps({accessibilityRole: 'alert'}).length, 0);
  await act(async () => renderer.unmount());
});

function rootHarness({password = null, reduceMotion = false, recoveryError = false, deferred = false} = {}) {
  const animations = []; const gates = []; const checks = []; let resolveRecovery;
  const recovered = deferred ? new Promise(resolve => { resolveRecovery = resolve; }) : Promise.resolve();
  const {default: Root} = load('ModsRoot.tsx', {
    'react-native': {View: 'View', Text: 'Text', TextInput: 'TextInput', Button: 'Button', ActivityIndicator: 'ActivityIndicator',
      StyleSheet: {create: value => value, absoluteFillObject: {}}, Easing: {cubic: () => {}, out: fn => fn},
      AccessibilityInfo: {isReduceMotionEnabled: async () => reduceMotion},
      Animated: {Value: class {}, View: 'AnimatedView', timing: () => ({}), parallel: () => ({}), delay: () => ({}),
        sequence: () => ({start: fn => animations.push(fn), stop: () => {}})}},
    '@react-native-async-storage/async-storage': {getItem: async () => password ? JSON.stringify({appLockPassword: password}) : null},
    './modPreferences': {modPreferences: {load: async () => {}}, useModPreferences: () => ({deviceUnlock: false})},
    './extraCustomization': {extraCustomization: {load: async () => {}}},
    './sparkleScripts': {loadScripts: async () => {}, runScripts: () => {}, useScriptState: () => ({wrappers: []})},
    './useDeviceUnlock': {useDeviceUnlock: () => ({available: false, prompt: async () => {}})},
    './modOptions': {nativeUnlockSupported: true},
    './updateCheck': {updateChecker: {check: async force => { checks.push(force); }}, confirmPatchLaunch: async () => {}},
    './storageSnapshot': {recoverBeforeStart: async () => { await recovered; if (recoveryError) throw Error('restore failed'); },
      retryStoragePreparation: async () => {}, recovery: {recover: async () => {}}, restoreQueue: {cancel: async () => {}}},
    './toolsState': {setToolsOpen: value => gates.push(value), waitForStorageIdle: async () => {}},
    '../../App': {default: () => React.createElement('PluralStar')},
  });
  return {Root, animations, gates, checks, resolveRecovery};
}

test('each launch checks for updates after unlocking', async () => {
  const h = rootHarness({password: 'secret', reduceMotion: true}); let renderer;
  for (let launch = 1; launch <= 2; launch++) {
    await act(async () => { renderer = create(React.createElement(h.Root)); });
    assert.equal(h.checks.length, launch - 1);
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('secret'));
    await act(async () => renderer.root.findByProps({title: 'Unlock'}).props.onPress());
    assert.deepEqual(h.checks, Array(launch).fill(true));
    await act(async () => renderer.unmount());
  }
});

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

test('Settings opens the mod menu; switches persist and hide disabled controls', async () => {
  const {createModPreferences} = load('modPreferencesCore.ts'); let disk;
  const prefs = createModPreferences({wallpaper: true, storage: true}, {read: async () => null, write: async value => { disk = value; }});
  await prefs.load();
  const {ModSettingsButton} = load('ModMenu.tsx', {
    'react-native': {Modal: 'Modal', ScrollView: 'ScrollView', View: 'View'},
    'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'},
    '../components/AppText': {Text: 'Text'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './modPreferences': {modPreferences: prefs, useModPreferences: () => React.useSyncExternalStore(prefs.subscribe, prefs.getSnapshot)},
    './extraCustomization': {extraCustomization: {set: async () => {}}, useExtraCustomization: () => ({enabled: false})},
    './ExtraCustomizationMenu': {ExtraCustomizationMenu: host('ExtraCustomizationMenu')},
    './modOptions': {options: {wallpaper: true, storage: true}},
    './WallpaperControls': {WallpaperControls: host('WallpaperControls')}, './BackupTools': {BackupTools: host('BackupTools')},
    './PluralKitSettings': {PluralKitSettings: host('PluralKitSettings')},
    './RestModeSettings': {RestModeSettings: host('RestModeSettings')},
    './MusicPlayer': {MusicSettings: host('MusicSettings')},
    './SettingsSearch': load('SettingsSearch.tsx', {
      'react-native': {View: 'View', TouchableOpacity: 'TouchableOpacity'},
      '../components/AppText': {Text: 'Text', TextInput: 'TextInput'},
      '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    }),
    './CloudModSettings': {CloudModSettings: host('CloudModSettings')},
    './DesktopCompanionSettings': {DesktopCompanionSettings: host('DesktopCompanionSettings')},
    './ModSupport': {ModSupport: host('ModSupport')}, './CustomMods': {CustomMods: host('CustomMods')},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(ModSettingsButton)); });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.root.findByType('Button').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 1);
  assert.equal(renderer.root.findAllByType('WallpaperControls').length, 0);
  assert.equal(renderer.root.findAllByType('CloudModSettings').length, 0);
  assert.equal(renderer.root.findAllByType('DesktopCompanionSettings').length, 0);
  for (const label of ['Wallpaper', 'Storage tools', 'Sync mod preferences']) {
    await act(async () => { renderer.root.findAllByType('Toggle').find(n => n.props.label === label).props.onToggle(); await new Promise(setImmediate); });
  }
  assert.equal(renderer.root.findAllByType('CloudModSettings').length, 1);
  assert.equal(renderer.root.findAllByType('DesktopCompanionSettings').length, 1);
  assert.equal(renderer.root.findAllByType('PluralKitSettings').length, 1);
  await act(async () => renderer.root.findByType('PluralKitSettings').props.onBusy(true));
  assert.equal(renderer.root.findByType('BackupTools').props.disabled, true);
  assert.equal(renderer.root.findAllByType('Button').find(n => n.props.children === 'Done').props.disabled, true);
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.equal(renderer.root.findAllByType('Modal').length, 1);
  await act(async () => renderer.root.findByType('PluralKitSettings').props.onBusy(false));
  for (const label of ['Wallpaper', 'Storage tools', 'Allow No speaker', 'Hide inactive lock icon', 'Sync mod preferences']) {
    await act(async () => {
      renderer.root.findAllByType('Toggle').find(n => n.props.label === label).props.onToggle();
      await new Promise(setImmediate);
    });
  }
  assert.deepEqual(JSON.parse(disk), {wallpaper: false, storage: false, noSpeaker: true, singleConfirm: false, deviceUnlock: false, groupView: false, profilePalettes: false, hideLockIcon: true, chatKeyboardFix: false, disableFacets: false, archivePolls: false, syncPreferences: false});
  assert.equal(renderer.root.findAllByType('WallpaperControls').length, 0);
  assert.equal(renderer.root.findAllByType('BackupTools').length, 0);
  assert.equal(renderer.root.findAllByType('CloudModSettings').length, 0);
  assert.equal(renderer.root.findAllByType('DesktopCompanionSettings').length, 0);
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Done').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.unmount());
});

test('saving the main settings form preserves changes made in the mod menu', async () => {
  const original = {language: 'en'};
  let current = original; let saved;
  const {SystemModal} = load('src/modals/SystemModal.tsx', {
    'react-native': {View: 'View', TouchableOpacity: 'TouchableOpacity', Text: 'RawText'},
    'react-i18next': {useTranslation: () => ({t: key => key})},
    '../components/AppText': {Text: 'Text', TextInput: 'TextInput'},
    '../components/Sheet': {Sheet: ({footer, children}) => React.createElement('Sheet', null, children, footer)},
    '../components/controls': {sectionLabel: () => ({}), ...Object.fromEntries(['Btn', 'Field', 'PasswordSection', 'SectionHead', 'ToggleRow'].map(name => [name, host(name)]))},
    '../theme': {fontScale: () => n => n, FONT_OPTIONS: []}, '../themeContext': {useTheme: () => theme},
    '../utils': {TEXT_SCALE_OPTIONS: [], fontChoiceOf: () => 'default'},
    '../i18n/i18n': {SUPPORTED_LANGUAGES: ['en']}, '../i18n/terminology': {TERMINOLOGY_FIELDS: [], TIER_NAME_FIELDS: []},
    './system/SettingsControls': {ChipListEditor: host('ChipListEditor'), Dropdown: host('Dropdown')},
    './system/PaletteSection': {PaletteSection: host('PaletteSection')},
    './system/BackgroundSection': {BackgroundSection: host('BackgroundSection')},
    '../components/DevSettings': {DevSettings: host('DevSettings')},
    '../utils/saveError': {reportSaveError: error => assert.fail(String(error))},
    '../mods/ModMenu': {ModSettingsButton: host('ModSettingsButton')},
    '../store/appStore': {useAppStore: {getState: () => ({appSettings: current})}},
  }, true);
  let renderer;
  await act(async () => { renderer = create(React.createElement(SystemModal, {
    visible: true, system: {}, settings: original, palettes: [], activePaletteId: '',
    onSave: async () => {}, onSaveSettings: async value => { saved = value; }, onClose: () => {},
  })); });
  assert.equal(renderer.root.findAllByType('ModSettingsButton').length, 1);
  current = {...original, pkFrontSyncEnabled: true, pkToken: 'new token', backgroundImage: 'new.png'};
  await act(async () => renderer.root.findAllByType('Btn').find(node => node.props.children === 'common.save').props.onPress());
  assert.equal(saved.pkFrontSyncEnabled, true);
  assert.equal(saved.pkToken, 'new token');
  assert.equal(saved.backgroundImage, 'new.png');
  await act(async () => renderer.unmount());
});

if (fs.existsSync(path.join(upstream, 'src/app/AppBackground.tsx'))) test('disabling wallpaper restores the solid canvas while retaining the chosen image', async () => {
  let enabled = true, fullScreen = false;
  const {AppBackground} = load('src/app/AppBackground.tsx', {
    'react-native': {View: 'View'}, '../components/BackgroundImage': {BackgroundImage: host('BackgroundImage')},
    '../store/appStore': {useAppStore: fn => fn({appSettings: {backgroundImage: 'wall.png'}})},
    '../themeContext': {useTheme: () => theme, ThemeProvider: host('ThemeProvider')},
    '../utils/backgroundImage': {backgroundImageUri: name => name && 'file:///media/' + name},
    '../mods/modPreferences': {useModPreferences: () => ({wallpaper: enabled})},
    '../mods/extraCustomization': {useExtraCustomization: () => ({enabled: true, fullScreenWallpaper: fullScreen})},
  }, true);
  let renderer;
  await act(async () => { renderer = create(React.createElement(AppBackground, null, 'screen')); });
  assert.equal(renderer.root.findByType('BackgroundImage').props.filename, 'wall.png');
  assert.equal(renderer.root.findByType('ThemeProvider').props.value.canvas, 'transparent');
  fullScreen = true;
  await act(async () => renderer.update(React.createElement(AppBackground, null, 'screen')));
  assert.equal(renderer.root.findAllByType('BackgroundImage').length, 0);
  assert.equal(renderer.root.findByType('View').props.style.backgroundColor, 'transparent');
  fullScreen = false;
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

function promptHarness({foreground = 'active', fail = false, seen = '0.4.5'} = {}) {
  const calls = [], state = {available: '0.4.3', checking: false, error: ''};
  let listener, removed = false;
  const {PatchUpdatePrompt} = load('PatchUpdatePrompt.tsx', {
    'react-native': {View: 'View', Text: 'Text', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
      AppState: {currentState: foreground, addEventListener: (_, callback) => {
        listener = callback; return {remove: () => { removed = true; }};
      }}, Linking: {openURL: async url => { calls.push(url); if (fail) throw Error('not installed'); }}},
    './updateCheck': {useUpdateCheck: () => state},
    '@react-native-async-storage/async-storage': {getItem: async () => seen, setItem: async (_, value) => { seen = value; }},
    './modOptions': {payloadVersion: '0.4.5'}, './changelog': {changelog: 'New patch features'},
  });
  return {PatchUpdatePrompt, state, calls, foreground: value => listener(value), removed: () => removed, seen: () => seen};
}

test('boot notice waits for unlocked foreground, matches the patcher theme, and dismisses once', async () => {
  const h = promptHarness({foreground: 'background'}); let renderer;
  await act(async () => { renderer = create(React.createElement(h.PatchUpdatePrompt, {enabled: false})); });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => h.foreground('active'));
  assert.equal(renderer.root.findByProps({accessibilityViewIsModal: true}).props.style.backgroundColor, '#241B33');
  assert.equal(renderer.root.findByProps({accessibilityRole: 'header'}).props.style.color, '#E5B5FF');
  assert.equal(renderer.root.findAllByType('Pressable')[0].props.style.backgroundColor, '#5C417D');
  await act(async () => renderer.root.findAllByType('Pressable')[1].props.onPress());
  h.state.available = '0.4.4';
  await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.unmount());
  assert.equal(h.removed(), true);
});

test('boot notice opens the patcher and handles a missing patcher without downloading code', async () => {
  for (const fail of [false, true]) {
    const h = promptHarness({fail}); let renderer;
    h.state.checking = true;
    await act(async () => { renderer = create(React.createElement(h.PatchUpdatePrompt, {enabled: true})); });
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    h.state.checking = false; h.state.error = 'offline';
    await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    h.state.error = ''; h.state.available = null;
    await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    h.state.available = '0.4.3';
    await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
    await act(async () => renderer.root.findAllByType('Pressable')[0].props.onPress());
    assert.deepEqual(h.calls, ['sparklecatmods://patches']);
    if (fail) {
      assert.match(renderer.root.findByProps({accessibilityRole: 'alert'}).props.children, /Could not open the patcher/);
      await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
    }
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    await act(async () => renderer.unmount());
  }
});


test('installed patch notes work offline, wait for unlock, and appear once per version', async () => {
  const h = promptHarness({seen: '0.4.4', foreground: 'background'}); let renderer;
  h.state.error = 'offline';
  await act(async () => { renderer = create(React.createElement(h.PatchUpdatePrompt, {enabled: false})); });
  await act(async () => h.foreground('active'));
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.update(React.createElement(h.PatchUpdatePrompt, {enabled: true})));
  assert.match(renderer.root.findByProps({accessibilityRole: 'header'}).props.children, /What's new.*0.4.5/);
  assert.equal(renderer.root.findAllByType('Pressable').length, 1);
  await act(async () => renderer.root.findByType('Pressable').props.onPress());
  assert.equal(h.seen(), '0.4.5');
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.unmount());
  await act(async () => { renderer = create(React.createElement(h.PatchUpdatePrompt, {enabled: true})); });
  assert.equal(renderer.root.findAllByType('Modal').length, 0);
  await act(async () => renderer.unmount());
});

test('available update notice follows installed notes and includes release details', async () => {
  const h = promptHarness({seen: null}); let renderer;
  h.state.release = {notes: 'Fixes and improvements'};
  await act(async () => { renderer = create(React.createElement(h.PatchUpdatePrompt, {enabled: true})); });
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.equal(renderer.root.findByProps({accessibilityRole: 'header'}).props.children, 'Patches available');
  assert.ok(renderer.root.findAllByType('Text').some(n => String(n.props.children).includes('Fixes and improvements')));
  await act(async () => renderer.unmount());
});

test('diagnostics allowlist excludes private settings and validates report fields', () => {
  const {diagnosticReport} = load('diagnosticsCore.ts');
  const report = JSON.parse(diagnosticReport({appVersion: '1.23.3', patchVersion: '0.4.5', runtime: 'runtime', variant: 'wallpaper-storage',
    platform: 'android', platformVersion: 36, wallpaper: true, storage: false, pkFrontSync: true,
    lastChecked: -1, available: null, checking: false, updateError: true, cloudReady: true, cloudRestoring: false, cloudError: false,
    pkToken: 'secret-token', error: '/private/account', members: ['private-name']}));
  assert.equal(report.appVersion, '1.23.3');
  assert.equal(report.updates.lastChecked, 0);
  assert.equal(report.updates.failed, true);
  assert.equal(report.mods.pkFrontSync, true);
  assert.doesNotMatch(JSON.stringify(report), /secret-token|private-name|private\/account|pkToken/);
  assert.equal(JSON.parse(diagnosticReport({...report, appVersion: '/private/account', lastChecked: Infinity})).appVersion, 'unknown');
});

test('mod support previews before sharing and opens the patches community', async () => {
  const calls = []; const {diagnosticReport} = load('diagnosticsCore.ts');
  const {ModSupport} = load('ModSupport.tsx', {
    'react-native': {View: 'View', Platform: {OS: 'android', Version: 36},
      Linking: {openURL: async url => { calls.push(url); }}, Share: {share: async value => { calls.push(value); }}},
    '../components/AppText': {Text: 'Text'}, '../components/controls': {Btn: host('Button')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    '../store/appStore': {useAppStore: {getState: () => ({appSettings: {pkToken: 'private-token', pkFrontSyncEnabled: true}})}},
    '../../package.json': {version: '1.23.3'}, './modOptions': {payloadVersion: '0.4.5', patchRuntime: 'runtime', patchVariant: 'wallpaper-storage'},
    './modPreferences': {modPreferences: {getSnapshot: () => ({wallpaper: true, storage: true})}},
    './updateCheck': {updateChecker: {getSnapshot: () => ({lastChecked: 123, available: null, checking: false, error: '/private/path'})}},
    './cloudMods': {cloudMods: {getSnapshot: () => ({ready: true, restoring: false, error: ''})}},
    './changelog': {changelog: 'New features'}, './diagnosticsCore': {diagnosticReport},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(ModSupport, {disabled: false})); });
  const press = label => renderer.root.findAllByType('Button').find(n => n.props.children === label).props.onPress();
  assert.equal(calls.length, 0);
  await act(async () => press('Preview diagnostics'));
  assert.equal(calls.length, 0);
  await act(async () => press('Share diagnostics'));
  assert.equal(JSON.parse(calls[0].message).mods.pkFrontSync, true);
  assert.doesNotMatch(calls[0].message, /private-token|private\/path/);
  await act(async () => press('Patches Discord'));
  assert.equal(calls[1], 'https://discord.gg/Pf2F2BawKV');
  await act(async () => renderer.update(React.createElement(ModSupport, {disabled: true})));
  assert.ok(renderer.root.findAllByType('Button').filter(n => n.props.children !== 'Close diagnostics').every(n => n.props.disabled));
  await act(async () => renderer.unmount());
});

test('custom mods import disabled and can be enabled after appearance permission', async () => {
  const {parseSparkle} = load('sparkleScriptCore.ts'); const rows = []; const dialogs = [];
  const source = 'mod "Lilac" version "1.0.0" { allow appearance when tap { accent "#abcdef" } }';
  const {CustomMods} = load('CustomMods.tsx', {
    'react-native': {View: 'View', Linking: {}, Share: {}, Alert: {alert: (title, message, buttons) => { dialogs.push(title); if (title === 'Enable SparkleScript?') buttons[1].onPress(); }}},
    '@react-native-documents/picker': {pick: async () => [{uri: 'file://script', size: source.length}], keepLocalCopy: async () => [{status: 'success', localUri: 'file://script'}], isErrorWithCode: () => false, errorCodes: {}},
    'react-native-blob-util': {fs: {stat: async () => ({size: source.length}), readFile: async () => source, exists: async () => false}}, '../components/AppText': {Text: 'Text'},
    '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './sparkleScriptCore': {parseSparkle},
    './sparkleScripts': {listScripts: () => rows.slice(), loadScripts: async () => {}, runScripts: () => {}, useScriptState: () => ({enabled: true}), setScriptingEnabled: async () => {},
      saveScripts: async update => { const next = update(rows.slice()); rows.splice(0, rows.length, ...next); }},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(CustomMods, {disabled: false})); });
  await act(async () => renderer.root.findAllByType('Button').find(n => n.props.children === 'Import .sparkle').props.onPress());
  assert.equal(rows.length, 1); assert.equal(rows[0].enabled, false);
  await act(async () => renderer.root.findAllByType('Toggle').find(n => n.props.label === 'Lilac').props.onToggle());
  assert.equal(rows[0].enabled, true); assert.deepEqual(dialogs, ['Mod imported']);
  await act(async () => renderer.unmount());
});

test('group view chooses the classic or enhanced pane from the saved switch', async () => {
  let enabled = false;
  const {GroupBrowsePane} = load('src/screens/systemManager/GroupBrowsePane.tsx', {
    './ClassicGroupBrowsePane': {GroupBrowsePane: host('Classic')},
    './EnhancedGroupBrowsePane': {GroupBrowsePane: host('Enhanced')},
    '../../mods/modPreferences': {useModPreferences: () => ({groupView: enabled})},
  }, true);
  let renderer;
  await act(async () => { renderer = create(React.createElement(GroupBrowsePane, {example: 'kept'})); });
  assert.equal(renderer.root.findByType('Classic').props.example, 'kept');
  enabled = true;
  await act(async () => renderer.update(React.createElement(GroupBrowsePane, {example: 'kept'})));
  assert.equal(renderer.root.findByType('Enhanced').props.example, 'kept');
  await act(async () => renderer.unmount());
});

test('inactive lock button hides only when its switch is enabled', async () => {
  let hide = false;
  const {AppHeader} = load('src/components/AppHeader.tsx', {
    'react-native': {View: 'View', TouchableOpacity: 'TouchableOpacity', StyleSheet: {create: x => x}, StatusBar: {}, Platform: {OS: 'android'}},
    './AppText': {Text: 'Text'}, './AccentText': {AccentText: host('AccentText')},
    'react-native-safe-area-context': {useSafeAreaInsets: () => ({top: 0})},
    'react-i18next': {useTranslation: () => ({t: x => x})},
    '../theme': {Fonts: {}, readableAccent: () => '#fff'}, '../themeContext': {useTheme: () => theme},
    '../mods/extraCustomization': {useExtraCustomization: () => ({enabled: false})},
    '../mods/modPreferences': {useModPreferences: () => ({hideLockIcon: hide})},
  }, true);
  let renderer; const props = {systemName: 'System', canLock: false, onLock: () => {}, onOpenSettings: () => {}};
  await act(async () => { renderer = create(React.createElement(AppHeader, props)); });
  assert.equal(renderer.root.findAllByProps({accessibilityLabel: 'a11y.lockApp'}).length, 1);
  hide = true;
  await act(async () => renderer.update(React.createElement(AppHeader, props)));
  assert.equal(renderer.root.findAllByProps({accessibilityLabel: 'a11y.lockApp'}).length, 0);
  await act(async () => renderer.update(React.createElement(AppHeader, {...props, canLock: true})));
  assert.equal(renderer.root.findAllByProps({accessibilityLabel: 'a11y.lockApp'}).length, 1);
  await act(async () => renderer.unmount());
});


test('enhanced member cards default to banners while respecting an explicit background', async () => {
  let enhanced = false;
  const {MemberCard} = load('src/screens/members/MemberCard.tsx', {
    '../../mods/extraCustomization': {useExtraCustomization: () => ({}), cardAppearance: () => ({})},
    '../../mods/modPreferences': {useModPreferences: () => ({groupView: enhanced})},
    'react-native': {View: 'View', TouchableOpacity: 'TouchableOpacity', Image: 'Image', StyleSheet: {create: x => x, absoluteFill: {}}},
    'react-i18next': {useTranslation: () => ({t: x => x})},
    '@shopify/flash-list': {useMappingHelper: () => ({getMappingKey: x => x})},
    '../../components/AppText': {Text: 'Text'}, '../../components/Avatar': {Avatar: host('Avatar')},
    '../../components/Glyphs': {PlusMinusIcon: host('Icon')},
    '../../theme': {fontScale: () => n => n, tierAccent: () => '#fff'},
    '../../themeContext': {useTheme: () => theme},
    '../../utils': {FRONT_TIER_KEYS: [], sortGroupsForDisplay: x => x, groupKind: () => 'group'},
  }, true);
  const props = {m: {id: '1', name: 'Name', banner: 'file://banner', color: '#aabbcc'}, index: 0, isLast: true,
    selectionMode: false, isSelected: false, showReorder: false, front: null, allFrontIds: new Set(), groups: [],
    onActivate: () => {}, onToggleSelect: () => {}, onEnterSelection: () => {}, fields: {}};
  let renderer;
  await act(async () => { renderer = create(React.createElement(MemberCard, props)); });
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  enhanced = true;
  await act(async () => renderer.update(React.createElement(MemberCard, {...props, fields: {}})));
  assert.equal(renderer.root.findByType('Image').props.source.uri, 'file://banner');
  await act(async () => renderer.update(React.createElement(MemberCard, {...props, fields: {background: 'plain'}})));
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  await act(async () => renderer.unmount());
});

test('display options reflect the enhanced default and explicit background', async () => {
  let enhanced = false;
  const {DisplayOptionsSheet} = load('src/screens/members/DisplayOptionsSheet.tsx', {
    '../../mods/modPreferences': {useModPreferences: () => ({groupView: enhanced})},
    'react-native': {View: 'View', TouchableOpacity: 'TouchableOpacity', Modal: 'Modal'},
    'react-i18next': {useTranslation: () => ({t: x => x})},
    '../../components/AppText': {Text: 'Text'}, '../../theme': {fontScale: () => n => n},
    '../../themeContext': {useTheme: () => theme}, '../../components/controls': {sectionLabel: () => ({})},
    '../../components/ToggleSwitch': {TogglePill: host('Toggle')},
  }, true);
  const props = {visible: true, fields: {}, onChange: () => {}, onClose: () => {}};
  let renderer;
  await act(async () => { renderer = create(React.createElement(DisplayOptionsSheet, props)); });
  const selected = label => renderer.root.findByProps({accessibilityLabel: label}).props.accessibilityState.selected;
  assert.equal(selected('members.bgPlain'), true);
  enhanced = true;
  await act(async () => renderer.update(React.createElement(DisplayOptionsSheet, {...props, fields: {}})));
  assert.equal(selected('members.bgBanner'), true);
  await act(async () => renderer.update(React.createElement(DisplayOptionsSheet, {...props, fields: {background: 'plain'}})));
  assert.equal(selected('members.bgPlain'), true);
  await act(async () => renderer.unmount());
});
