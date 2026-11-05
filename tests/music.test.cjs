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
function load(name, imports = {}, globals = {}) {
  const filename = path.join(__dirname, '../payload/mods', name);
  const {code} = babel.transformSync(fs.readFileSync(filename, 'utf8'), {filename, babelrc: false, configFile: false,
    presets: [path.join(upstream, 'node_modules/@react-native/babel-preset')]});
  const exports = {};
  vm.runInNewContext(code, {exports, Error, AbortController, setTimeout, clearTimeout, ...globals, require: n => {
    if (n === 'react' || n === 'react/jsx-runtime') return require(n);
    return Object.hasOwn(imports, n) ? imports[n] : require(require.resolve(n, {paths: [upstream]}));
  }});
  return exports;
}
const core = load('musicCore.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const snapshot = (title = 'Song') => ({access: true, sessions: [{id: 'player:1', name: 'Music', playing: true}], track: {
  sessionId: 'player:1', source: 'Music', title, artist: 'Artist', duration: 180000, position: 15000,
  playing: true, canPause: true, canSeek: true, canNext: true, queue: [],
}});

test('music is off by default; settings persist serially and recover from failed writes', async () => {
  let disk = null, fail = false;
  const io = {read: async () => disk, write: async value => { if (fail) throw Error('disk full'); disk = value; }};
  const prefs = core.createMusicPreferences(io);
  await prefs.load();
  assert.equal(prefs.getSnapshot().enabled, false);
  assert.equal(prefs.getSnapshot().onlineLyrics, false);
  await Promise.all([prefs.set({enabled: true}), prefs.set({lyricSize: 28}), prefs.set({miniPlayer: false})]);
  assert.equal(prefs.getSnapshot().enabled, true);
  assert.equal(prefs.getSnapshot().lyricSize, 28);
  assert.equal(prefs.getSnapshot().miniPlayer, false);
  fail = true;
  await assert.rejects(prefs.set({onlineLyrics: true}), /disk full/);
  assert.equal(prefs.getSnapshot().onlineLyrics, false);
  fail = false;
  await prefs.set({lyricOffset: 900000});
  const reopened = core.createMusicPreferences(io); await reopened.load();
  assert.deepEqual(plain(reopened.getSnapshot()), plain(prefs.getSnapshot()));
  assert.equal(reopened.getSnapshot().lyricOffset, 10000);
  assert.equal(core.normalizeMusicPreferences({enabled: 'true', onlineLyrics: 1, lyricSize: 99, lyricOffset: NaN}).enabled, false);
  assert.equal(core.normalizeMusicPreferences({lyricSize: 99}).lyricSize, 22);
  const corrupt = core.createMusicPreferences({read: async () => '{broken', write: async () => {}});
  await corrupt.load(); assert.equal(corrupt.getSnapshot().enabled, false);
});

test('preference read failures are retryable and never overwrite saved settings', async () => {
  let fail = true, writes = 0;
  const prefs = core.createMusicPreferences({read: async () => { if (fail) throw Error('read failed'); return '{"enabled":true}'; }, write: async () => { writes++; }});
  await assert.rejects(prefs.set({lyricSize: 28}), /read failed/);
  assert.equal(writes, 0);
  fail = false;
  await prefs.set({lyricSize: 28});
  assert.equal(prefs.getSnapshot().enabled, true);
  assert.equal(writes, 1);
});

test('media snapshots require granted access and a live session, and bound untrusted metadata', () => {
  assert.equal(core.normalizeMusicSnapshot({...snapshot(), access: false}).track, null);
  assert.equal(core.normalizeMusicSnapshot({...snapshot(), sessions: []}).track, null);
  const raw = snapshot();
  Object.assign(raw.track, {artwork: 'https://example.test/tracker', title: 'x'.repeat(2000), duration: 0, position: Infinity,
    canVolume: true, maxVolume: 10, volume: 999, queue: [{id: '../bad'}, {id: '5', title: 'Next'}],
    customActions: [{id: 'like', name: 'Like'}, {id: 'bad'}]});
  const track = core.normalizeMusicSnapshot(raw).track;
  assert.equal(track.artwork, ''); assert.equal(track.title.length, 1000);
  assert.equal(track.canSeek, false); assert.equal(track.position, 0); assert.equal(track.volume, 10);
  assert.deepEqual(plain(track.queue), [{id: '5', title: 'Next', artist: '', active: false}]);
  assert.deepEqual(plain(track.customActions), [{id: 'like', name: 'Like'}]);
  raw.track.artwork = 'file:///data/user/0/app/cache/art.jpg';
  assert.equal(core.normalizeMusicSnapshot(raw).track.artwork, raw.track.artwork);
});

test('LRC timing supports fractions, offsets, repeated stamps, and instrumental gaps', () => {
  const lines = core.parseLrc('[ar:Artist]\n[offset:-500]\n[00:02.5][00:04.050]First <00:02.5>line\n[00:03.00]\n[00:01.005]Intro');
  assert.deepEqual(plain(lines), [{time: 505, text: 'Intro'}, {time: 2000, text: 'First line'}, {time: 2500, text: ''}, {time: 3550, text: 'First line'}]);
  assert.equal(core.lyricIndex(lines, 0), -1);
  assert.equal(core.lyricIndex(lines, 2000), 1);
  assert.equal(core.lyricIndex(lines, 99999), 3);
  assert.equal(core.formatMusicTime(65000), '1:05');
  assert.equal(core.formatMusicTime(NaN), '0:00');
  assert.equal(core.cleanMusicTitle('Song (Official Music Video) [lyrics]'), 'Song');
  assert.equal(core.parseLrc('[00:99]invalid').length, 0);
});

const response = (body, status = 200, length) => ({ok: status >= 200 && status < 300, status, headers: {get: () => length ?? null}, text: async () => typeof body === 'string' ? body : JSON.stringify(body)});
test('lyrics use exact duration matching then rank title, artist and duration in search results', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push(url); assert.ok(options.signal); assert.equal(options.headers.Accept, 'application/json');
    return calls.length === 1 ? response({}, 404) : response([
      {trackName: 'Other', artistName: 'Artist', duration: 180, plainLyrics: 'wrong song'},
      {trackName: 'Song', artistName: 'Other', duration: 180, plainLyrics: 'wrong artist'},
      {trackName: 'Song', artistName: 'Artist', duration: 180, syncedLyrics: '[00:01.00]Right song'},
    ]);
  };
  const lyrics = await core.findLyrics(snapshot().track, new AbortController().signal, fetcher);
  assert.equal(calls.length, 2); assert.match(calls[0], /get\?.*duration=180$/); assert.match(calls[1], /search\?/);
  assert.equal(lyrics.lines[0].text, 'Right song');
  let count = 0;
  const exact = await core.findLyrics(snapshot().track, new AbortController().signal, async () => { count++; return response({instrumental: true}); });
  assert.equal(count, 1); assert.equal(exact.instrumental, true);
});

test('lyrics handle provider errors, limits, invalid metadata and cancellation', async () => {
  const signal = new AbortController().signal;
  for (const [value, error] of [[response({}, 429), /limited/], [response({}, 503), /connection/], [response('not json'), /unreadable/], [response({}, 200, '1000001'), /too large/], [response('x'.repeat(1000001)), /too large/]]) {
    await assert.rejects(core.findLyrics(snapshot().track, signal, async () => value), error);
  }
  await assert.rejects(core.findLyrics({...snapshot().track, title: ''}, signal, async () => assert.fail('invalid query must not be sent')), /title and artist/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(core.findLyrics(snapshot().track, controller.signal, async () => assert.fail('cancelled query must not be sent')), /cancelled/);
  assert.equal(await core.findLyrics(snapshot().track, signal, async () => response([], 404)), null);
});

function engineHarness(bridge) {
  let disk = null, appChange, tick;
  const engine = load('music.ts', {'./musicCore': core,
    'react-native': {Platform: {OS: 'android'}, NativeModules: {SparklecatMusic: bridge},
      AppState: {currentState: 'active', addEventListener: (_, listener) => { appChange = listener; return {remove: () => { appChange = undefined; }}; }}},
    '@react-native-async-storage/async-storage': {getItem: async () => disk, setItem: async (_, value) => { disk = value; }},
  }, {setInterval: callback => { tick = callback; return 1; }, clearInterval: () => { tick = undefined; }});
  let state;
  function Root() { engine.useMusicEngine(); state = engine.useMusic(); return null; }
  return {engine, Root, state: () => state, app: value => appChange(value), tick: () => tick?.()};
}
test('media collection is off until enabled and discards results after backgrounding or disabling', async () => {
  let calls = 0, read, command;
  const h = engineHarness({getSnapshot: async () => { calls++; return read ? read.promise : snapshot(); }, command: async () => command?.promise, openAccessSettings: async () => {}});
  let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); });
  assert.equal(calls, 0);
  await act(async () => h.engine.musicPreferences.set({enabled: true}));
  assert.equal(h.state().track.title, 'Song');
  read = deferred();
  await act(async () => h.tick());
  await act(async () => h.app('background'));
  await act(async () => read.resolve(snapshot('private late result')));
  assert.equal(h.state().track, null); assert.equal(h.state().foreground, false);
  const count = calls;
  await act(async () => h.tick()); assert.equal(calls, count);
  read = null;
  await act(async () => h.app('active'));
  assert.equal(h.state().track.title, 'Song');
  command = deferred(); let pending;
  await act(async () => { pending = h.engine.musicCommand('pause'); });
  assert.equal(h.state().busy, true);
  await act(async () => h.engine.musicPreferences.set({enabled: false}));
  await act(async () => { command.reject(Error('late command error')); await pending; });
  assert.equal(h.state().track, null); assert.equal(h.state().busy, false); assert.equal(h.state().error, '');
  await act(async () => renderer.unmount());
});

test('older native hosts do not collect music or offer a player', async () => {
  const h = engineHarness(undefined); let renderer;
  await act(async () => { renderer = create(React.createElement(h.Root)); await h.engine.musicPreferences.set({enabled: true}); });
  assert.equal(h.engine.musicSupported, false);
  await act(async () => { h.engine.openMusic(); await h.engine.openMusicAccess(); await h.engine.musicCommand('play'); });
  assert.equal(h.state().open, false); assert.equal(h.state().track, null);
  await act(async () => renderer.unmount());
});

const theme = {bg: '#14101f', surface: '#241b33', border: '#51465e', text: '#ffffff', accent: '#e5b5ff', dim: '#c5b9d4', muted: '#9889a8', danger: '#ffb4c8'};
const host = name => ({children, ...props}) => React.createElement(name, props, children);
const search = load('SettingsSearch.tsx', {'react-native': {TouchableOpacity: 'Button', View: 'View'}, '../components/AppText': {Text: 'Text', TextInput: 'Input'}, '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n}});
test('settings search matches accents and all words without indexing secret values, and keeps tools mounted', async () => {
  assert.equal(search.matchesSettings('THEME cafe', 'Café theme settings'), true);
  assert.equal(search.matchesSettings('theme absent', 'Café theme settings'), false);
  assert.equal(search.settingsText(React.createElement('Input', {value: 'private token', label: 'Access token'})), 'Access token');
  let mounted = 0, renderer;
  function Tool() { React.useEffect(() => { mounted++; return () => { mounted--; }; }, []); return React.createElement('Tool'); }
  const element = query => React.createElement(search.SettingsQuery.Provider, {value: query}, React.createElement(search.SearchSection, {keywords: 'Music lyrics'}, React.createElement(Tool)));
  await act(async () => { renderer = create(element('lyrics')); });
  assert.equal(renderer.root.findByType('View').props.style.display, 'flex'); assert.equal(mounted, 1);
  await act(async () => renderer.update(element('unrelated')));
  assert.equal(renderer.root.findByType('View').props.style.display, 'none'); assert.equal(mounted, 1);
  await act(async () => renderer.unmount()); assert.equal(mounted, 0);
});

test('music controls respect the off switch and display preference save errors', async () => {
  let preferences = {...core.DEFAULT_MUSIC_PREFERENCES};
  const {MusicSettings, MusicDock, MusicHubButton} = load('MusicPlayer.tsx', {
    'react-native': {View: 'View', TouchableOpacity: 'Button', Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image', ActivityIndicator: 'Spinner', PanResponder: {create: () => ({panHandlers: {}})}, useWindowDimensions: () => ({width: 400})},
    'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'}, 'react-native-svg': {__esModule: true, default: 'Svg', Path: 'Path'},
    '../components/AppText': {Text: 'Text', TextInput: 'Input'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n}, './musicCore': core,
    './music': {musicSupported: true, useMusicPreferences: () => preferences, useMusic: () => ({foreground: true, track: snapshot().track}), musicPreferences: {set: async () => { throw Error('disk full'); }}},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(React.Fragment, null, React.createElement(MusicSettings), React.createElement(MusicDock), React.createElement(MusicHubButton))); });
  assert.equal(renderer.root.findAllByType('Toggle').length, 1);
  assert.equal(renderer.root.findAllByType('Button').length, 0);
  await act(async () => renderer.root.findByType('Toggle').props.onToggle());
  assert.match(renderer.root.findByProps({accessibilityRole: 'alert'}).props.children, /Could not save/);
  assert.equal(renderer.root.findByType('Toggle').props.value, false);
  await act(async () => renderer.unmount());
});
