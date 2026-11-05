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
const extraCore = load('extraCustomizationCore.ts');
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
  assert.equal(core.normalizeMusicPreferences({lyricSize: 99}).lyricSize, 34);
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
    './lastfm': {lastfmMusicEnabled: async () => {}},
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
    'react-native': {View: 'View', TouchableOpacity: 'Button', Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image', ActivityIndicator: 'Spinner', PanResponder: {create: () => ({panHandlers: {}})}, useWindowDimensions: () => ({width: 400, height: 840})},
    'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'}, 'react-native-svg': {__esModule: true, default: 'Svg', Path: 'Path'},
    '../components/AppText': {Text: 'Text', TextInput: 'Input'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n}, './musicCore': core,
    './LastfmSettings': {LastfmSettings: host('Lastfm')}, './lastfm': {lastfmMusicEnabled: async () => {}},
    '../store/appStore': {useAppStore: select => select({appSettings: {}})}, '../utils/mediaFiles': {fs: {dirs: {DocumentDir: '/data/files'}}},
    './modOptions': {options: {wallpaper: true}}, './modPreferences': {useModPreferences: () => ({wallpaper: false})},
    './extraCustomization': {...extraCore, useExtraCustomization: () => extraCore.DEFAULT_EXTRA_CUSTOMIZATION},
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


function playerHarness(findLyrics = core.findLyrics) {
  const h = {prefs: {...core.DEFAULT_MUSIC_PREFERENCES, enabled: true},
    extra: extraCore.DEFAULT_EXTRA_CUSTOMIZATION, calls: [], appSettings: {}, wallpaper: false, dimensions: {width: 400, height: 840},
    state: {...core.normalizeMusicSnapshot(snapshot()), foreground: true, open: true, ready: true, busy: false, error: ''}};
  const ui = load('MusicPlayer.tsx', {
    'react-native': {View: 'View', TouchableOpacity: 'Button', Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image', ActivityIndicator: 'Spinner', PanResponder: {create: () => ({panHandlers: {}})}, PixelRatio: {get: () => 3}, useWindowDimensions: () => h.dimensions},
    'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'}, 'react-native-svg': {__esModule: true, default: 'Svg', Path: 'Path'},
    '../components/AppText': {Text: 'Text', TextInput: 'Input'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n}, './musicCore': {...core, findLyrics},
    '../store/appStore': {useAppStore: select => select({appSettings: h.appSettings})}, '../utils/mediaFiles': {fs: {dirs: {DocumentDir: '/data/files'}}},
    './modOptions': {options: {wallpaper: true}}, './modPreferences': {useModPreferences: () => ({wallpaper: h.wallpaper})},
    './extraCustomization': {...extraCore, useExtraCustomization: () => h.extra},
    './LastfmSettings': {LastfmSettings: host('Lastfm')}, './lastfm': {lastfmMusicEnabled: async () => {}},
    './music': {musicSupported: true, useMusicEngine: () => {}, useMusicPreferences: () => h.prefs, useMusic: () => h.state,
      musicPreferences: {set: async value => { h.prefs = {...h.prefs, ...value}; }},
      musicCommand: async (...args) => h.calls.push(args), closeMusic: () => h.calls.push(['close']),
      selectMusicSource: id => h.calls.push(['source', id]), refreshMusic: async () => {}, openMusicAccess: async () => {}, openMusic: () => {}},
  });
  return {...ui, h};
}
const button = (renderer, label) => renderer.root.findAllByType('Button').find(node => node.props.accessibilityLabel === label);

test('player panels preserve controls, gate unsupported commands, and dismiss in order', async () => {
  const {MusicRoot, h} = playerHarness();
  h.state.track = {...h.state.track, canQueue: true, canVolume: true, volume: 4, maxVolume: 10,
    queue: [{id: '1', title: 'Song', artist: 'Artist', active: true}, {id: '2', title: 'Next song', artist: 'Artist', active: false}]};
  let renderer;
  const element = () => React.createElement(MusicRoot);
  await act(async () => { renderer = create(element()); });
  assert.equal(button(renderer, 'Previous track').props.disabled, true);
  await act(async () => button(renderer, 'Pause music').props.onPress());
  await act(async () => renderer.root.findByProps({accessibilityLabel: 'Playback position'}).props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  await act(async () => renderer.root.findByProps({accessibilityLabel: 'Music volume'}).props.onAccessibilityAction({nativeEvent: {actionName: 'decrement'}}));
  assert.deepEqual(h.calls, [['pause'], ['seek', '20000'], ['volume', '3']]);
  await act(async () => button(renderer, 'Show queue').props.onPress());
  await act(async () => button(renderer, 'Next song').props.onPress());
  assert.deepEqual(h.calls.at(-1), ['queue', '2']);
  assert.equal(button(renderer, 'Hide queue').props.accessibilityState.selected, true);
  h.dimensions = {width: 840, height: 400};
  await act(async () => renderer.update(element()));
  const controls = renderer.root.findAllByType('View').find(node => node.props.style?.width === '50%');
  assert.ok(controls, 'landscape queue keeps a separate column for controls');
  assert.equal(controls.parent.props.style.flexDirection, 'row');
  assert.ok(button(renderer, 'Next song'));
  await act(async () => button(renderer, 'Show lyrics').props.onPress());
  assert.equal(controls.parent.props.style.flexDirection, 'row');
  assert.ok(renderer.root.findAllByType('Button').some(node => node.props.children === 'Enable online lyrics'));
  await act(async () => button(renderer, 'Show queue').props.onPress());
  await act(async () => button(renderer, 'Choose music source').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 2);
  await act(async () => renderer.root.findAllByType('Modal')[1].props.onRequestClose());
  assert.equal(renderer.root.findAllByType('Modal').length, 1);
  assert.ok(button(renderer, 'Hide queue'));
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.ok(button(renderer, 'Show queue'));
  h.state.busy = true;
  await act(async () => renderer.update(element()));
  assert.equal(button(renderer, 'Pause music').props.disabled, true);
  assert.equal(button(renderer, 'Next track').props.disabled, true);
  await act(async () => renderer.root.findByProps({accessibilityLabel: 'Music volume'}).props.onAccessibilityAction({nativeEvent: {actionName: 'increment'}}));
  assert.deepEqual(h.calls.at(-1), ['queue', '2']);
  await act(async () => renderer.root.findByType('Modal').props.onRequestClose());
  assert.deepEqual(h.calls.at(-1), ['close']);
  h.prefs.enabled = false;
  await act(async () => renderer.update(element()));
  assert.equal(renderer.toJSON(), null);
  await act(async () => renderer.unmount());
});

test('lyrics stay opt-in, show timed lines, seek with the saved offset, and abort on leaving', async () => {
  let lookups = 0, signal;
  const {MusicRoot, h} = playerHarness(async (_, requestSignal) => {
    lookups++; signal = requestSignal;
    return {lines: [{time: 20000, text: 'A lyric line'}], plain: '', instrumental: false};
  });
  let renderer;
  const element = () => React.createElement(MusicRoot);
  await act(async () => { renderer = create(element()); });
  assert.equal(lookups, 0);
  await act(async () => button(renderer, 'Show lyrics').props.onPress());
  assert.equal(lookups, 0);
  assert.ok(renderer.root.findAllByType('Button').some(node => node.props.children === 'Enable online lyrics'));
  h.prefs = {...h.prefs, onlineLyrics: true, lyricOffset: 500};
  await act(async () => renderer.update(element()));
  assert.equal(lookups, 1);
  await act(async () => button(renderer, 'A lyric line, 0:20').props.onPress());
  assert.deepEqual(h.calls.at(-1), ['seek', '19500']);
  await act(async () => button(renderer, 'Lyrics options').props.onPress());
  assert.equal(renderer.root.findAllByType('Modal').length, 2);
  await act(async () => renderer.root.findAllByType('Modal')[1].props.onRequestClose());
  await act(async () => button(renderer, 'Hide lyrics').props.onPress());
  assert.equal(signal.aborted, true);
  assert.equal(lookups, 1);
  await act(async () => renderer.unmount());
});

test('music appearance respects the customization switch and uses a separate wallpaper backdrop', async () => {
  const {MusicRoot, h} = playerHarness();
  h.extra = extraCore.sanitizeExtraCustomization({enabled: false, cards: {music: {transparent: true, color: '#123456', radius: 24}}});
  h.wallpaper = true; h.appSettings = {backgroundImage: 'background-test.png'};
  let renderer;
  const element = () => React.createElement(MusicRoot);
  const playerStyle = () => Object.assign({}, ...renderer.root.findAllByType('View').find(node => Array.isArray(node.props.style) && node.props.style[0]?.maxWidth === 1000).props.style);
  await act(async () => { renderer = create(element()); });
  assert.equal(playerStyle().borderRadius, undefined);
  assert.equal(renderer.root.findByType('Modal').props.transparent, undefined);
  assert.equal(renderer.root.findByType('Image').props.source.uri, 'file:///data/files/ps_backgrounds/background-test.png');
  h.extra = {...h.extra, enabled: true};
  await act(async () => renderer.update(element()));
  assert.equal(playerStyle().backgroundColor, 'transparent');
  assert.equal(playerStyle().borderRadius, 24);
  h.appSettings = {backgroundImage: '../private.png'};
  await act(async () => renderer.update(element()));
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  await act(async () => renderer.unmount());
});

function lastfmBridge(overrides = {}) {
  return {lastfmStatus: async () => '{}', lastfmMusicEnabled: async () => {}, lastfmConfigure: async () => {},
    lastfmBegin: async () => '', lastfmFinish: async () => '', lastfmDisconnect: async () => {}, lastfmRetry: async () => {}, ...overrides};
}
const lastfm = bridge => load('lastfm.ts', {'react-native': {Platform: {OS: 'android'}, NativeModules: {SparklecatMusic: bridge}}});
test('Last.fm requires the new native bridge, validates credentials and sign-in URLs, and never exposes native secrets', async () => {
  const old = lastfm({getSnapshot: async () => snapshot()});
  assert.equal(old.lastfmSupported, false); await old.lastfmMusicEnabled(false);
  assert.equal((await old.lastfmStatus()).connected, false);
  let calls = 0;
  const key = 'a'.repeat(32), secret = 'b'.repeat(32);
  const api = lastfm(lastfmBridge({lastfmStatus: async () => JSON.stringify({connected: true, username: 'Listener',
    enabled: 'true', nowPlaying: 1, queued: 999, secret: 'private', session: 'private', token: 'private'}),
    lastfmBegin: async (k, s) => { calls++; assert.equal(k, key); assert.equal(s, secret); return `https://www.last.fm/api/auth/?api_key=${key}&token=testtoken`; }}));
  const status = await api.lastfmStatus();
  assert.equal(status.connected, true); assert.equal(status.enabled, false); assert.equal(status.nowPlaying, false);
  assert.equal(status.queued, 500); assert.equal(JSON.stringify(status).includes('private'), false);
  await assert.rejects(api.lastfmBegin('bad', secret), /32-character/); assert.equal(calls, 0);
  assert.match(await api.lastfmBegin(` ${key} `, secret), /^https:\/\/www\.last\.fm\//); assert.equal(calls, 1);
  for (const url of ['https://example.test/api/auth/', 'https://www.last.fm.evil.test/api/auth/', `https://www.last.fm/api/auth/?api_key=${key}&token=token&redirect=bad`]) {
    await assert.rejects(lastfm(lastfmBridge({lastfmBegin: async () => url})).lastfmBegin(key, secret), /invalid sign-in link/);
  }
  await assert.rejects(lastfm(lastfmBridge({lastfmStatus: async () => '[]'})).lastfmStatus(), /Could not read/);
});

test('Last.fm browser approval keeps both sharing toggles off until explicitly enabled and surfaces save errors', async () => {
  let status = {...lastfm(lastfmBridge()).emptyLastfmStatus}, configured = [], opened = [], timer, renderer, fail = false;
  const module = load('LastfmSettings.tsx', {
    'react-native': {View: 'View', AppState: {currentState: 'active'}, Linking: {openURL: async url => { opened.push(url); }}},
    '../components/AppText': {Text: 'Text', TextInput: 'Input'}, '../components/controls': {Btn: host('Button'), ToggleRow: host('Toggle')},
    '../themeContext': {useTheme: () => theme}, '../theme': {fontScale: () => n => n},
    './lastfm': {lastfmSupported: true, emptyLastfmStatus: status, lastfmStatus: async () => ({...status}),
      lastfmBegin: async (key, secret) => { assert.equal(key, 'a'.repeat(32)); assert.equal(secret, 'b'.repeat(32)); status.pendingAuth = true; return 'https://www.last.fm/api/auth/'; },
      lastfmFinish: async () => { status = {...status, pendingAuth: false, connected: true, username: 'Listener'}; },
      lastfmConfigure: async (enabled, nowPlaying) => { if (fail) throw Error('device storage full'); configured.push({enabled, nowPlaying}); status = {...status, enabled, nowPlaying}; },
      lastfmDisconnect: async () => { status = {...status, connected: false, enabled: false, nowPlaying: false}; },
    },
  }, {setInterval: callback => { timer = callback; return 1; }, clearInterval: () => { timer = undefined; }});
  const button = label => renderer.root.findAllByType('Button').find(node => node.props.children === label);
  const toggle = label => renderer.root.findAllByType('Toggle').find(node => node.props.label === label);
  await act(async () => { renderer = create(React.createElement(module.LastfmSettings, {disabled: false})); });
  assert.equal(button('Connect in browser').props.disabled, true);
  await act(async () => { renderer.root.findByProps({accessibilityLabel: 'Last.fm API key'}).props.onChangeText('a'.repeat(32));
    renderer.root.findByProps({accessibilityLabel: 'Last.fm shared secret'}).props.onChangeText('b'.repeat(32)); });
  assert.equal(renderer.root.findByProps({accessibilityLabel: 'Last.fm shared secret'}).props.secureTextEntry, true);
  await act(async () => button('Connect in browser').props.onPress());
  assert.equal(opened.length, 1); assert.equal(renderer.root.findByProps({accessibilityLabel: 'Last.fm shared secret'}).props.value, '');
  await act(async () => button('Finish connecting').props.onPress());
  assert.equal(toggle('Last.fm scrobbling').props.value, false); assert.equal(toggle('Share Now Playing').props.value, false);
  await act(async () => toggle('Last.fm scrobbling').props.onToggle());
  assert.deepEqual(configured, [{enabled: true, nowPlaying: false}]);
  fail = true;
  await act(async () => toggle('Share Now Playing').props.onToggle());
  assert.equal(toggle('Share Now Playing').props.value, false);
  assert.match(renderer.root.findByProps({accessibilityRole: 'alert'}).props.children, /device storage full/);
  await act(async () => button('Disconnect Last.fm').props.onPress());
  assert.ok(button('Connect in browser')); await act(async () => renderer.unmount()); assert.equal(timer, undefined);
});
