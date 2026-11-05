// Player layout adapted from BitChord. See THIRD_PARTY_NOTICES.md.
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Modal, PanResponder, PixelRatio, ScrollView, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import type {ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {useAppStore} from '../store/appStore';
import {fs as mediaFiles} from '../utils/mediaFiles';
import {options} from './modOptions';
import {useModPreferences} from './modPreferences';
import {cardAppearance, useExtraCustomization} from './extraCustomization';
import type {CardArea, ExtraCustomization} from './extraCustomization';
import {closeMusic, musicCommand, musicPreferences, musicSupported, openMusic, openMusicAccess, refreshMusic, selectMusicSource, useMusic, useMusicEngine, useMusicPreferences} from './music';
import {findLyrics, formatMusicTime, lyricIndex, trackKey} from './musicCore';
import type {Lyrics, MusicPreferences, MusicTrack} from './musicCore';
import {LastfmSettings} from './LastfmSettings';
import {lastfmMusicEnabled} from './lastfm';

const lyricsCache = new Map<string, Lyrics | null>();
const paths = {
  play: 'M8 5v14l11-7z', pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  previous: 'M5 5v14M19 5L7 12l12 7z', next: 'M19 5v14M5 5l12 7-12 7z',
  music: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 2-6 4-6 1s6-4 6-1zm11-2c0 2-6 4-6 1s6-4 6-1z',
  lyrics: 'M5 7h5v6H5zM14 7h5v6h-5zM10 13c0 4-2 5-4 5m13-5c0 4-2 5-4 5',
  queue: 'M4 6h16M4 11h16M4 16h9m4-1 4 3-4 3z',
  more: 'M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  down: 'm6 9 6 6 6-6', close: 'm6 6 12 12M6 18 18 6',
  volumeLow: 'M11 5 6 9H3v6h3l5 4z', volumeHigh: 'M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  output: 'M4 4h16v12H4zM9 20l3-4 3 4z',
};
function Icon({name, size = 24, color}: {name: keyof typeof paths; size?: number; color?: string}) {
  const T = useTheme(); const tint = color || T.text;
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden><Path d={paths[name]} fill={['play', 'pause', 'previous', 'next', 'more'].includes(name) ? tint : 'none'} stroke={tint} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function IconButton({name, label, disabled = false, onPress, size = 26, touchSize = 48, selected = false}: {name: keyof typeof paths; label: string; disabled?: boolean; onPress: () => void; size?: number; touchSize?: number; selected?: boolean}) {
  const T = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled, selected}} disabled={disabled} onPress={onPress}
    style={{width: touchSize, height: touchSize, borderRadius: touchSize / 2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1}}><Icon name={name} size={size} color={selected ? T.accent : T.text} /></TouchableOpacity>;
}
function Cover({track, size}: {track: MusicTrack; size: number}) {
  const T = useTheme(); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track.artwork]);
  const style = {width: size, height: size, borderRadius: size < 80 ? 9 : 14, backgroundColor: T.surface};
  return track.artwork && !failed ? <Image source={{uri: track.artwork}} accessibilityLabel={`Artwork for ${track.title || 'current track'}`} onError={() => setFailed(true)} style={style} /> :
    <View style={[style, {alignItems: 'center', justifyContent: 'center'}]}><Icon name="music" size={Math.max(24, size / 3)} color={T.dim} /></View>;
}
function appearance(prefs: ExtraCustomization, area: CardArea, backgroundColor = 'transparent'): ViewStyle {
  return {backgroundColor: prefs.enabled && prefs.transparentAllCards ? 'transparent' : backgroundColor,
    borderWidth: prefs.enabled && prefs.cards[area]?.borderColor ? 1 : 0, borderColor: 'transparent', ...cardAppearance(prefs, area)};
}
function useSwipe(onSwipe: (direction: 'left' | 'right' | 'up' | 'down') => void) {
  const callback = useRef(onSwipe); callback.current = onSwipe;
  return useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) > 18,
    onPanResponderRelease: (_, gesture) => {
      if (Math.max(Math.abs(gesture.dx), Math.abs(gesture.dy)) < 45) return;
      callback.current(Math.abs(gesture.dx) > Math.abs(gesture.dy) ? gesture.dx < 0 ? 'left' : 'right' : gesture.dy < 0 ? 'up' : 'down');
    },
  })).current.panHandlers;
}
function PlayerBackdrop({track, transparent}: {track: MusicTrack | null; transparent: boolean}) {
  const T = useTheme(); const extra = useExtraCustomization(); const mods = useModPreferences();
  const filename = useAppStore(s => (s.appSettings as {backgroundImage?: string}).backgroundImage);
  const wallpaper = options.wallpaper && mods.wallpaper && typeof filename === 'string' && /^background-[a-z0-9-]+\.(png|gif)$/.test(filename)
    ? `file://${mediaFiles.dirs.DocumentDir}/ps_backgrounds/${filename}` : '';
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: T.bg}}>
    {!!wallpaper && <><Image source={{uri: wallpaper}} resizeMode={extra.enabled ? extra.wallpaperFit : 'cover'} style={{width: '100%', height: '100%'}} /><View style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: T.bg, opacity: extra.enabled ? extra.wallpaperDim : 0.78}} /></>}
    {/* Android's blur filter accepts at most 25 physical pixels. */}
    {!transparent && !!track?.artwork && <><Image source={{uri: track.artwork}} blurRadius={Math.min(18, 48 / PixelRatio.get())} resizeMode="cover" style={{position: 'absolute', top: -60, bottom: -60, left: -60, right: -60, opacity: 0.65}} /><View style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: T.bg, opacity: 0.65}} /></>}
  </View>;
}

export function MusicSettings({disabled}: {disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T); const prefs = useMusicPreferences(); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const save = async (update: Partial<MusicPreferences>) => {
    setSaving(true); setError('');
    try {
      if (update.enabled === false) await lastfmMusicEnabled(false);
      await musicPreferences.set(update);
      if (update.enabled === true) await lastfmMusicEnabled(true);
    } catch { setError('Could not save music settings. Try again.'); } finally { setSaving(false); }
  };
  return <View style={{gap: 12}}>
    <ToggleRow label="Music player" desc={musicSupported ? 'See and control music playing in another Android app, with artwork, lyrics, and its shared queue.' : 'Update the patcher, then prepare and install Plural Star again to add Android music access.'}
      value={prefs.enabled && musicSupported} disabled={disabled || saving || !musicSupported} onToggle={() => { void save({enabled: !prefs.enabled}); }} />
    {prefs.enabled && musicSupported && <>
      <Text style={{color: T.dim, fontSize: fs(13)}}>Allow notification access in Android to read active media sessions. Notification messages are never read or saved. Playback and queue controls depend on your music app.</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><Btn disabled={disabled || saving} onPress={() => { void openMusicAccess(); }}>Allow music access</Btn><Btn variant="ghost" disabled={disabled || saving} onPress={openMusic}>Open player</Btn></View>
      <ToggleRow label="Show mini player" desc="Keep playback controls above the bottom bar while music is active. Music is also available from the hub." value={prefs.miniPlayer} disabled={disabled || saving} onToggle={() => { void save({miniPlayer: !prefs.miniPlayer}); }} />
      <ToggleRow label="Online lyrics" desc="Send the current song title, artist, and duration to LRCLIB when you open Lyrics. No account is needed." value={prefs.onlineLyrics} disabled={disabled || saving} onToggle={() => { void save({onlineLyrics: !prefs.onlineLyrics}); }} />
      <LastfmSettings disabled={disabled || saving} />
    </>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
  </View>;
}

export function MusicDock() {
  const T = useTheme(); const fs = fontScale(T); const prefs = useMusicPreferences(); const state = useMusic(); const extra = useExtraCustomization(); const track = state.track;
  const swipe = useSwipe(direction => {
    if (direction === 'up') openMusic();
    else if (track && !state.busy && direction === 'left' && track.canNext) void musicCommand('next');
    else if (track && !state.busy && direction === 'right' && track.canPrevious) void musicCommand('previous');
  });
  if (!prefs.enabled || !prefs.miniPlayer || !musicSupported || !state.foreground || !track) return null;
  return <View {...swipe} style={[{marginHorizontal: 12, marginVertical: 8, flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 4, paddingVertical: 6, borderRadius: 40, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}, appearance(extra, 'miniPlayer', T.surface),
    !extra.enabled || !extra.cards.miniPlayer ? {borderWidth: 1, borderColor: T.border} : {}]}>
    <TouchableOpacity onPress={openMusic} accessibilityRole="button" accessibilityLabel={`Open music player. ${track.title || 'Unknown track'}, ${track.artist || track.source}`} style={{flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10}}>
      <Cover track={track} size={40} /><View style={{flex: 1}}><Text numberOfLines={1} style={{color: T.text, fontSize: fs(14), fontWeight: '600'}}>{track.title || 'Unknown track'}</Text><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(13)}}>{track.artist || track.source}</Text></View>
    </TouchableOpacity>
    {track.buffering ? <View style={{width: 48, alignItems: 'center'}}><ActivityIndicator color={T.text} accessibilityLabel="Buffering music" /></View> : <IconButton name={track.playing ? 'pause' : 'play'} label={track.playing ? 'Pause music' : 'Play music'} disabled={state.busy || !(track.playing ? track.canPause : track.canPlay)} onPress={() => { void musicCommand(track.playing ? 'pause' : 'play'); }} size={28} />}
    <IconButton name="next" label="Next track" disabled={state.busy || !track.canNext} onPress={() => { void musicCommand('next'); }} size={26} />
  </View>;
}

export function MusicHubButton() {
  const prefs = useMusicPreferences();
  if (!prefs.enabled || !musicSupported) return null;
  return <Btn variant="ghost" style={{marginBottom: 12}} onPress={openMusic}>Music player</Btn>;
}

function Slider({value, max, disabled, label, step, onChange, valueText}: {value: number; max: number; disabled: boolean; label: string; step: number; onChange: (value: number) => void; valueText: (value: number) => string}) {
  const T = useTheme(); const [draft, setDraft] = useState<number | null>(null); const width = useRef(0); const origin = useRef(0); const current = useRef(0);
  const props = useRef({disabled, max, onChange}); props.current = {disabled, max, onChange};
  const update = (x: number) => { if (width.current > 0) { current.current = Math.max(0, Math.min(props.current.max, x / width.current * props.current.max)); setDraft(current.current); } };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !props.current.disabled,
    onMoveShouldSetPanResponder: () => !props.current.disabled,
    onPanResponderGrant: event => { origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX; update(event.nativeEvent.locationX); },
    onPanResponderMove: event => update(event.nativeEvent.pageX - origin.current),
    onPanResponderRelease: () => { if (!props.current.disabled) props.current.onChange(Math.round(current.current)); setDraft(null); },
    onPanResponderTerminate: () => setDraft(null),
  })).current;
  const position = draft ?? value; const percent = max > 0 ? Math.max(0, Math.min(100, position / max * 100)) : 0;
  return <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{disabled}} accessibilityValue={{min: 0, max, now: position, text: valueText(position)}}
    accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]} onAccessibilityAction={event => { if (!disabled) onChange(Math.round(Math.max(0, Math.min(max, position + (event.nativeEvent.actionName === 'increment' ? step : -step))))); }}
    {...pan.panHandlers} onLayout={event => { width.current = event.nativeEvent.layout.width; }} style={{height: 32, justifyContent: 'center', opacity: disabled ? 0.35 : 1}}>
    <View style={{height: draft === null ? 5 : 9, borderRadius: 5, backgroundColor: T.text, opacity: 0.16}} /><View pointerEvents="none" style={{position: 'absolute', height: draft === null ? 5 : 9, width: `${percent}%`, borderRadius: 5, backgroundColor: T.text, opacity: 0.8}} />
  </View>;
}
function SeekBar({track, disabled}: {track: MusicTrack; disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  return <View><Slider key={`${track.sessionId}:${track.title}`} label="Playback position" value={track.position} max={track.duration} disabled={disabled} step={5000} onChange={value => { void musicCommand('seek', String(value)); }} valueText={value => `${formatMusicTime(value)} of ${formatMusicTime(track.duration)}`} />
    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: T.dim, fontSize: fs(12)}}>{formatMusicTime(track.position)}</Text><Text style={{color: T.dim, fontSize: fs(12)}}>{track.duration ? `−${formatMusicTime(Math.max(0, track.duration - track.position))}` : 'Live'}</Text></View>
  </View>;
}
function PlayerSheet({title, onClose, children}: {title: string; onClose: () => void; children: React.ReactNode}) {
  const T = useTheme(); const fs = fontScale(T); const {height} = useWindowDimensions();
  return <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}><View style={{flex: 1, justifyContent: 'flex-end'}} accessibilityViewIsModal>
    <TouchableOpacity accessible={false} onPress={onClose} style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#00000099'}} />
    <SafeAreaView edges={['bottom']} style={{maxHeight: height * 0.8, backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 18}}>
      <View style={{flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 8, paddingTop: 8}}><Text accessibilityRole="header" style={{flex: 1, color: T.text, fontWeight: '700', fontSize: fs(20)}}>{title}</Text><IconButton name="close" label={`Close ${title.toLowerCase()}`} onPress={onClose} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding: 24, paddingTop: 12, gap: 16}}>{children}</ScrollView>
    </SafeAreaView>
  </View></Modal>;
}
function LyricsPanel({track, busy, tools, onCloseTools}: {track: MusicTrack; busy: boolean; tools: boolean; onCloseTools: () => void}) {
  const T = useTheme(); const fs = fontScale(T); const prefs = useMusicPreferences(); const extra = useExtraCustomization();
  const [lyrics, setLyrics] = useState<Lyrics | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [title, setTitle] = useState(track.title); const [artist, setArtist] = useState(track.artist); const [query, setQuery] = useState({title: track.title, artist: track.artist, duration: track.duration}); const [retry, setRetry] = useState(0);
  const [following, setFollowing] = useState(true); const scroll = useRef<ScrollView>(null); const offsets = useRef<Record<number, number>>({});
  const key = trackKey(query); const active = lyrics ? lyricIndex(lyrics.lines, track.position + prefs.lyricOffset) : -1;
  const save = (update: Partial<MusicPreferences>) => { void musicPreferences.set(update).catch(() => setError('Could not save lyrics settings. Try again.')); };
  useEffect(() => {
    if (!prefs.onlineLyrics) { setLyrics(null); setLoading(false); return; }
    if (lyricsCache.has(key) && !retry) { setLyrics(lyricsCache.get(key)!); setError(''); return; }
    const controller = new AbortController(); let stopped = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setLoading(true); setError(''); setLyrics(null); offsets.current = {};
    void findLyrics(query, controller.signal).then(result => {
      if (stopped || controller.signal.aborted) return;
      if (lyricsCache.size >= 24) lyricsCache.delete(lyricsCache.keys().next().value!);
      lyricsCache.set(key, result); setLyrics(result);
    }).catch(e => { if (!stopped) setError(timedOut ? 'Lyrics lookup timed out. Check your connection and retry.' : e instanceof Error ? e.message : 'Could not load lyrics.'); })
      .finally(() => { clearTimeout(timer); if (!stopped) setLoading(false); });
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [key, retry, prefs.onlineLyrics]);
  useEffect(() => { if (prefs.followLyrics && following && active >= 0 && offsets.current[active] !== undefined) scroll.current?.scrollTo({y: Math.max(0, offsets.current[active] - 80), animated: true}); }, [active, following, prefs.followLyrics]);
  return <View style={{flex: 1, minHeight: 0}}>
    <View style={[{flex: 1, minHeight: 0, overflow: 'hidden', paddingHorizontal: 30}, appearance(extra, 'lyrics')]}>
      <ScrollView ref={scroll} onScrollBeginDrag={() => setFollowing(false)} contentContainerStyle={{paddingTop: 26, paddingBottom: 120, gap: 24}}>
        {!prefs.onlineLyrics ? <View style={{gap: 14}}><Text style={{color: T.dim}}>Online lyrics send the song title, artist, and duration to LRCLIB when this panel is open.</Text><Btn onPress={() => save({onlineLyrics: true})}>Enable online lyrics</Btn></View> : <>
          {loading && <ActivityIndicator accessibilityLabel="Loading lyrics" color={T.text} />}
          {!loading && !error && !lyrics && <Text style={{color: T.dim}}>No lyrics found. Try correcting the song details in lyrics options.</Text>}
          {lyrics?.instrumental && !lyrics.lines.length && !lyrics.plain && <Text style={{color: T.dim}}>This track is instrumental.</Text>}
          {!!lyrics && (lyrics.lines.length ? lyrics.lines.map((line, index) => <TouchableOpacity key={index} disabled={!track.canSeek || busy} accessibilityRole="button" accessibilityLabel={`${line.text || 'Instrumental break'}, ${formatMusicTime(line.time)}`} accessibilityState={{selected: index === active, disabled: !track.canSeek || busy}}
            onLayout={event => { offsets.current[index] = event.nativeEvent.layout.y; if (index === active && prefs.followLyrics && following) scroll.current?.scrollTo({y: Math.max(0, event.nativeEvent.layout.y - 80), animated: false}); }} onPress={() => { void musicCommand('seek', String(Math.round(Math.max(0, Math.min(track.duration, line.time - prefs.lyricOffset))))); setFollowing(true); }}>
            <Text style={{color: T.text, opacity: index === active ? 1 : 0.35, fontSize: fs(prefs.lyricSize), lineHeight: fs(prefs.lyricSize * 1.35), fontWeight: '800'}}>{line.text || '· · ·'}</Text>
          </TouchableOpacity>) : <Text selectable style={{color: T.text, fontSize: fs(prefs.lyricSize), lineHeight: fs(prefs.lyricSize * 1.45), fontWeight: '700'}}>{lyrics.plain}</Text>)}
        </>}
        {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
      </ScrollView>
      {!following && prefs.followLyrics && !!lyrics?.lines.length && <View style={{position: 'absolute', bottom: 4, alignSelf: 'center'}}><Btn onPress={() => setFollowing(true)}>Follow current line</Btn></View>}
    </View>
    {tools && <PlayerSheet title="Lyrics options" onClose={onCloseTools}>
      <ToggleRow label="Follow lyrics" desc="Scroll to the current line. Tap a line to seek." value={prefs.followLyrics} onToggle={() => save({followLyrics: !prefs.followLyrics})} />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><Btn variant="ghost" disabled={prefs.lyricOffset <= -10000} onPress={() => save({lyricOffset: prefs.lyricOffset - 500})}>Delay 0.5s</Btn><Btn variant="ghost" onPress={() => save({lyricOffset: 0})}>{`Timing ${prefs.lyricOffset > 0 ? '+' : ''}${prefs.lyricOffset / 1000}s · reset`}</Btn><Btn variant="ghost" disabled={prefs.lyricOffset >= 10000} onPress={() => save({lyricOffset: prefs.lyricOffset + 500})}>Advance 0.5s</Btn></View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{[18, 22, 28, 34].map(size => <Btn key={size} variant={prefs.lyricSize === size ? 'solid' : 'ghost'} onPress={() => save({lyricSize: size})}>{`${size} pt`}</Btn>)}</View>
      <TextInput accessibilityLabel="Lyrics song title" value={title} onChangeText={setTitle} maxLength={300} placeholder="Song title" placeholderTextColor={T.muted} style={{color: T.text, backgroundColor: T.bg, borderRadius: 8, padding: 12}} />
      <TextInput accessibilityLabel="Lyrics artist" value={artist} onChangeText={setArtist} maxLength={300} placeholder="Artist" placeholderTextColor={T.muted} style={{color: T.text, backgroundColor: T.bg, borderRadius: 8, padding: 12}} />
      <Btn disabled={loading || !title.trim() || !artist.trim() || !prefs.onlineLyrics} onPress={() => { setQuery({title: title.trim(), artist: artist.trim(), duration: track.duration}); setRetry(retry + 1); onCloseTools(); }}>Search lyrics</Btn>
      <Btn variant="ghost" disabled={loading || !prefs.onlineLyrics} onPress={() => { setRetry(retry + 1); onCloseTools(); }}>Retry lyrics</Btn>
      {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
      <Text style={{color: T.muted, fontSize: fs(12)}}>Lyrics from LRCLIB. Player design adapted from BitChord.</Text>
    </PlayerSheet>}
  </View>;
}
function QueuePanel({track, busy}: {track: MusicTrack; busy: boolean}) {
  const T = useTheme(); const fs = fontScale(T); const extra = useExtraCustomization(); const current = track.queue.findIndex(item => item.active);
  return <ScrollView style={[{flex: 1, minHeight: 0}, appearance(extra, 'queue')]} contentContainerStyle={{paddingHorizontal: 30, paddingTop: 22, paddingBottom: 40, gap: 4}}>
    <Text accessibilityRole="header" style={{color: T.text, fontWeight: '700', fontSize: fs(24), marginBottom: 12}}>Queue</Text>
    {!track.queue.length && <View style={{gap: 16}}><Text style={{color: T.dim}}>This music app is not sharing its queue. Open it to manage upcoming songs.</Text><Btn variant="ghost" disabled={busy} onPress={() => { void musicCommand('open'); }}>{`Open ${track.source}`}</Btn></View>}
    {track.queue.map((item, index) => <React.Fragment key={`${item.id}:${index}`}>
      {(index === 0 || index === current || index === current + 1) && <Text style={{color: T.dim, fontSize: fs(13), fontWeight: '600', marginTop: 12, marginBottom: 6}}>{item.active ? 'Now playing' : current >= 0 && index < current ? 'Previously played' : 'Next in queue'}</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.title || `Track ${index + 1}`}${item.active ? ', now playing' : ''}`} accessibilityState={{selected: item.active, disabled: busy || !track.canQueue}} disabled={busy || !track.canQueue} onPress={() => { void musicCommand('queue', item.id); }} style={{minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8}}>
        {item.active ? <Cover track={track} size={44} /> : <View style={{width: 44, height: 44, borderRadius: 8, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}><Icon name="music" size={22} color={T.dim} /></View>}
        <View style={{flex: 1, gap: 3}}><Text numberOfLines={1} style={{color: item.active ? T.accent : T.text, fontSize: fs(16), fontWeight: '500'}}>{item.title || `Track ${index + 1}`}</Text><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(14)}}>{item.artist || track.source}</Text></View>
        {item.active && <Icon name={track.playing ? 'pause' : 'play'} size={18} color={T.accent} />}
      </TouchableOpacity>
    </React.Fragment>)}
  </ScrollView>;
}

type Panel = 'player' | 'lyrics' | 'queue';
type Menu = 'player' | 'lyrics' | 'sources' | null;
function PlayerContent({panel, setPanel, menu, setMenu, onBack}: {panel: Panel; setPanel: (panel: Panel) => void; menu: Menu; setMenu: (menu: Menu) => void; onBack: () => void}) {
  const T = useTheme(); const fs = fontScale(T); const state = useMusic(); const prefs = useMusicPreferences(); const track = state.track;
  const {width, height} = useWindowDimensions(); const compact = height < 700; const landscape = width > height; const [artHeight, setArtHeight] = useState(80);
  const swipe = useSwipe(direction => {
    if (direction === 'up') setPanel('queue'); else if (direction === 'down') onBack();
    else if (track && !state.busy && direction === 'left' && track.canNext) void musicCommand('next');
    else if (track && !state.busy && direction === 'right' && track.canPrevious) void musicCommand('previous');
  });
  const handleSwipe = useSwipe(direction => { if (direction === 'down') onBack(); });
  const active = track && lyricsCache.get(trackKey(track));
  const line = active && prefs.onlineLyrics ? active.lines[lyricIndex(active.lines, track!.position + prefs.lyricOffset)]?.text : '';
  const disabled = state.busy;
  const gutter = landscape ? 20 : 30;
  return <View style={{flex: 1, minHeight: 0}}>
    <View {...handleSwipe} style={{height: 46, alignItems: 'center', justifyContent: 'center'}}><TouchableOpacity accessibilityRole="button" accessibilityLabel={panel === 'player' ? 'Close music player' : 'Back to artwork'} onPress={onBack} style={{width: 90, height: 44, alignItems: 'center', justifyContent: 'center'}}><View style={{width: 38, height: 5, borderRadius: 3, backgroundColor: T.dim, opacity: 0.7}} /></TouchableOpacity></View>
    {!!state.error && <Text accessibilityRole="alert" numberOfLines={3} style={{color: T.danger, paddingHorizontal: gutter, paddingBottom: 8}}>{state.error}</Text>}
    {!state.ready ? <View style={{flex: 1, justifyContent: 'center'}}><ActivityIndicator color={T.accent} accessibilityLabel="Finding music" /></View> : !state.access || !track ? <ScrollView contentContainerStyle={{padding: 30, gap: 18}}>
      <Text accessibilityRole="header" style={{color: T.text, fontSize: fs(26), fontWeight: '700'}}>Music</Text>
      {!state.access ? <><Text style={{color: T.dim}}>Allow music access in Android to see music playing in other apps. Only media sessions are used; notification messages are never read or saved.</Text><Btn onPress={() => { void openMusicAccess(); }}>Allow music access</Btn></> : <Text style={{color: T.dim}}>Nothing is playing. Start music in your music app, then return here.</Text>}
      <Btn variant="ghost" onPress={() => { void refreshMusic(); }}>Check again</Btn>
    </ScrollView> : <View style={{flex: 1, minHeight: 0, flexDirection: landscape ? 'row' : 'column'}}>
      <View style={{flex: 1, minHeight: 0, minWidth: 0}}>
        {panel === 'player' ? <View style={{flex: 1, minHeight: 0, paddingHorizontal: gutter}}>
          <View {...swipe} onLayout={event => setArtHeight(event.nativeEvent.layout.height)} style={{flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingBottom: 12}}><Cover track={track} size={Math.max(48, Math.min(landscape ? width * 0.43 - 40 : width - gutter * 2, 500, artHeight - 20))} /></View>
          <View style={{flexDirection: 'row', alignItems: 'center', minHeight: 80, paddingTop: 12, paddingBottom: 8}}><View style={{flex: 1, gap: 3}}><Text numberOfLines={1} accessibilityRole="header" style={{color: T.text, fontSize: fs(20), fontWeight: '600'}}>{track.title || 'Unknown track'}</Text><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(20), fontWeight: '500'}}>{track.artist || 'Unknown artist'}</Text></View><IconButton name="more" label="Music options" onPress={() => setMenu('player')} /></View>
        </View> : <>
          <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter, paddingBottom: 10, gap: 14}}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to artwork" onPress={() => setPanel('player')}><Cover track={track} size={54} /></TouchableOpacity><View style={{flex: 1, gap: 3}}><Text numberOfLines={1} accessibilityRole="header" style={{color: T.text, fontSize: fs(18), fontWeight: '600'}}>{track.title || 'Unknown track'}</Text><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(16)}}>{track.artist || 'Unknown artist'}</Text></View><IconButton name="more" label={panel === 'lyrics' ? 'Lyrics options' : 'Music options'} onPress={() => setMenu(panel === 'lyrics' ? 'lyrics' : 'player')} /></View>
          {panel === 'lyrics' ? <LyricsPanel key={`${track.sessionId}:${trackKey(track)}`} track={track} busy={disabled} tools={menu === 'lyrics'} onCloseTools={() => setMenu(null)} /> : <QueuePanel track={track} busy={disabled} />}
        </>}
      </View>
      <View style={{paddingHorizontal: gutter, paddingBottom: compact ? 6 : 18, paddingTop: compact ? 0 : 8, justifyContent: 'flex-end', ...(landscape ? {width: '50%'} : {})}}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={panel === 'lyrics' ? 'Back to artwork' : 'Show lyrics'} onPress={() => setPanel(panel === 'lyrics' ? 'player' : 'lyrics')} style={{minHeight: compact ? 24 : 34, justifyContent: 'center'}}><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(12), textAlign: 'center'}}>{panel === 'lyrics' ? 'Lyrics from LRCLIB' : line || ' '}</Text></TouchableOpacity>
        <SeekBar track={track} disabled={disabled || !track.canSeek} />
        <View style={{flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginTop: 8}}>
          <IconButton name="previous" label="Previous track" disabled={disabled || !track.canPrevious} size={40} touchSize={64} onPress={() => { void musicCommand('previous'); }} />
          {track.buffering ? <View style={{width: compact ? 76 : 92, height: compact ? 76 : 92, justifyContent: 'center'}}><ActivityIndicator color={T.text} size="large" accessibilityLabel="Buffering music" /></View> : <IconButton name={track.playing ? 'pause' : 'play'} label={track.playing ? 'Pause music' : 'Play music'} disabled={disabled || !(track.playing ? track.canPause : track.canPlay)} size={compact ? 58 : 74} touchSize={compact ? 76 : 92} onPress={() => { void musicCommand(track.playing ? 'pause' : 'play'); }} />}
          <IconButton name="next" label="Next track" disabled={disabled || !track.canNext} size={40} touchSize={64} onPress={() => { void musicCommand('next'); }} />
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: compact ? 0 : 12}}><Icon name="volumeLow" size={20} color={T.dim} /><View style={{flex: 1}}><Slider key={`${track.sessionId}:volume`} label="Music volume" value={track.volume} max={track.maxVolume} disabled={disabled || !track.canVolume} step={1} onChange={value => { void musicCommand('volume', String(value)); }} valueText={value => track.canVolume ? `${Math.round(value / track.maxVolume * 100)}%` : 'Change volume in your music app'} /></View><Icon name="volumeHigh" size={20} color={T.dim} /></View>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8}}>
          <IconButton name="lyrics" label={panel === 'lyrics' ? 'Hide lyrics' : 'Show lyrics'} selected={panel === 'lyrics'} onPress={() => setPanel(panel === 'lyrics' ? 'player' : 'lyrics')} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose music source" onPress={() => setMenu('sources')} style={{flex: 1, maxWidth: 240, minHeight: 44, borderRadius: 24, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border}}><Icon name="output" size={18} /><Text numberOfLines={1} style={{flexShrink: 1, color: T.text, fontWeight: '500', fontSize: fs(12)}}>{track.source || 'Music source'}</Text><Icon name="down" size={14} /></TouchableOpacity>
          <IconButton name="queue" label={panel === 'queue' ? 'Hide queue' : 'Show queue'} selected={panel === 'queue'} onPress={() => setPanel(panel === 'queue' ? 'player' : 'queue')} />
        </View>
      </View>
    </View>}
    {!!track && (menu === 'player' || menu === 'sources') && <PlayerSheet title={menu === 'sources' ? 'Music source' : 'Music options'} onClose={() => setMenu(null)}>
      {menu === 'sources' ? <>{state.sessions.map(item => <Btn key={item.id} variant={track.sessionId === item.id ? 'solid' : 'ghost'} disabled={disabled} onPress={() => { selectMusicSource(item.id); setMenu(null); }}>{item.name}{item.playing ? ' · playing' : ''}</Btn>)}<Text style={{color: T.dim, fontSize: fs(13)}}>Sources and playback controls are shared by your Android music apps. Use their output controls to choose a speaker.</Text></> : <>
        {!!track.album && <Text style={{color: T.dim}}>{track.album}</Text>}
        <Btn variant="ghost" disabled={disabled} onPress={() => { void musicCommand('open'); setMenu(null); }}>{`Open ${track.source}`}</Btn>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><Btn variant="ghost" disabled={disabled || !track.canSeek} onPress={() => { void musicCommand('seek', String(Math.max(0, track.position - 10000))); }}>Back 10s</Btn><Btn variant="ghost" disabled={disabled || !track.canSeek} onPress={() => { void musicCommand('seek', String(Math.min(track.duration, track.position + 10000))); }}>Forward 10s</Btn></View>
        {track.customActions.map(action => <Btn key={action.id} variant="ghost" disabled={disabled} onPress={() => { void musicCommand('custom', action.id); }}>{action.name}</Btn>)}
        <Btn variant="ghost" onPress={() => setMenu('sources')}>Choose music source</Btn>
        <Text style={{color: T.muted, fontSize: fs(12)}}>Player design adapted from BitChord. Playback, volume and queue controls depend on your music app.</Text>
      </>}
    </PlayerSheet>}
  </View>;
}
export function MusicRoot() {
  useMusicEngine(); const prefs = useMusicPreferences(); const state = useMusic(); const T = useTheme(); const extra = useExtraCustomization();
  const [panel, setPanel] = useState<Panel>('player'); const [menu, setMenu] = useState<Menu>(null);
  useEffect(() => { if (!state.open) { setPanel('player'); setMenu(null); } }, [state.open]);
  const onBack = () => { if (menu) setMenu(null); else if (panel !== 'player') setPanel('player'); else closeMusic(); };
  const changePanel = (next: Panel) => { setMenu(null); setPanel(next); };
  if (!prefs.enabled || !musicSupported || !state.open) return null;
  const transparent = extra.enabled && (extra.cards.music?.transparent || (extra.transparentAllCards && !extra.cards.music?.color));
  return <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onBack}><View style={{flex: 1, backgroundColor: T.bg}}><PlayerBackdrop track={state.track} transparent={!!transparent} /><SafeAreaView style={{flex: 1}}>
    <View style={[{flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', overflow: 'hidden'}, appearance(extra, 'music')]}><PlayerContent panel={panel} setPanel={changePanel} menu={menu} setMenu={setMenu} onBack={onBack} /></View>
  </SafeAreaView></View></Modal>;
}
