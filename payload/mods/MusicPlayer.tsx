import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Image, Modal, PanResponder, ScrollView, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {closeMusic, musicCommand, musicPreferences, musicSupported, openMusic, openMusicAccess, refreshMusic, selectMusicSource, useMusic, useMusicEngine, useMusicPreferences} from './music';
import {findLyrics, formatMusicTime, lyricIndex, trackKey} from './musicCore';
import type {Lyrics, MusicPreferences, MusicTrack} from './musicCore';
import {LastfmSettings} from './LastfmSettings';
import {lastfmMusicEnabled} from './lastfm';

const lyricsCache = new Map<string, Lyrics | null>();
const paths = {play: 'M8 5v14l11-7z', pause: 'M7 5h4v14H7zM14 5h4v14h-4z', previous: 'M5 5v14M19 5L7 12l12 7z', next: 'M19 5v14M5 5l12 7-12 7z', music: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 2-6 4-6 1s6-4 6-1zm11-2c0 2-6 4-6 1s6-4 6-1z'};
function Icon({name, size = 24}: {name: keyof typeof paths; size?: number}) {
  const T = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden><Path d={paths[name]} fill={name === 'play' || name === 'pause' ? T.accent : 'none'} stroke={T.accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function IconButton({name, label, disabled, onPress}: {name: keyof typeof paths; label: string; disabled: boolean; onPress: () => void}) {
  const T = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={{width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1}}><Icon name={name} /></TouchableOpacity>;
}
function Cover({track, size}: {track: MusicTrack; size: number}) {
  const T = useTheme(); const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track.artwork]);
  return track.artwork && !failed ? <Image source={{uri: track.artwork}} accessibilityLabel={`Artwork for ${track.title || 'current track'}`} onError={() => setFailed(true)}
    style={{width: size, height: size, borderRadius: size < 80 ? 10 : 22, backgroundColor: T.surface}} /> :
    <View style={{width: size, height: size, borderRadius: size < 80 ? 10 : 22, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center'}}><Icon name="music" size={Math.max(24, size / 3)} /></View>;
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
  const T = useTheme(); const fs = fontScale(T); const prefs = useMusicPreferences(); const state = useMusic(); const track = state.track;
  if (!prefs.enabled || !prefs.miniPlayer || !musicSupported || !state.foreground || !track) return null;
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: T.surface, borderTopWidth: 1, borderColor: T.border}}>
    <TouchableOpacity onPress={openMusic} accessibilityRole="button" accessibilityLabel={`Open music player. ${track.title || 'Unknown track'}, ${track.artist || track.source}`}
      style={{flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12}}>
      <Cover track={track} size={44} /><View style={{flex: 1}}><Text numberOfLines={1} style={{color: T.text, fontSize: fs(14), fontWeight: '600'}}>{track.title || 'Unknown track'}</Text><Text numberOfLines={1} style={{color: T.dim, fontSize: fs(12)}}>{track.artist || track.source}</Text></View>
    </TouchableOpacity>
    <IconButton name={track.playing ? 'pause' : 'play'} label={track.playing ? 'Pause music' : 'Play music'} disabled={state.busy || !(track.playing ? track.canPause : track.canPlay)} onPress={() => { void musicCommand(track.playing ? 'pause' : 'play'); }} />
  </View>;
}

export function MusicHubButton() {
  const prefs = useMusicPreferences();
  if (!prefs.enabled || !musicSupported) return null;
  return <Btn variant="ghost" style={{marginBottom: 12}} onPress={openMusic}>Music player</Btn>;
}

function SeekBar({track, disabled}: {track: MusicTrack; disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T); const [draft, setDraft] = useState<number | null>(null); const width = useRef(0); const origin = useRef(0); const current = useRef(0);
  const props = useRef({track, disabled}); props.current = {track, disabled};
  const update = (x: number) => { if (width.current > 0) { current.current = Math.max(0, Math.min(props.current.track.duration, x / width.current * props.current.track.duration)); setDraft(current.current); } };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !props.current.disabled,
    onMoveShouldSetPanResponder: () => !props.current.disabled,
    onPanResponderGrant: event => { origin.current = event.nativeEvent.pageX - event.nativeEvent.locationX; update(event.nativeEvent.locationX); },
    onPanResponderMove: event => update(event.nativeEvent.pageX - origin.current),
    onPanResponderRelease: () => { if (!props.current.disabled) void musicCommand('seek', String(Math.round(current.current))); setDraft(null); },
    onPanResponderTerminate: () => setDraft(null),
  })).current;
  useEffect(() => setDraft(null), [track.sessionId, track.title]);
  const position = draft ?? track.position; const percent = track.duration ? Math.min(100, position / track.duration * 100) : 0;
  return <View accessibilityRole="adjustable" accessibilityLabel="Playback position" accessibilityState={{disabled}}
    accessibilityValue={{min: 0, max: Math.round(track.duration / 1000), now: Math.round(position / 1000), text: `${formatMusicTime(position)} of ${formatMusicTime(track.duration)}`}}
    accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]} onAccessibilityAction={event => { if (!disabled) void musicCommand('seek', String(Math.max(0, Math.min(track.duration, position + (event.nativeEvent.actionName === 'increment' ? 5000 : -5000))))); }}>
    <View {...pan.panHandlers} onLayout={event => { width.current = event.nativeEvent.layout.width; }} style={{height: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1}}>
      <View style={{height: 5, borderRadius: 3, backgroundColor: T.border}} /><View pointerEvents="none" style={{position: 'absolute', height: 5, width: `${percent}%`, borderRadius: 3, backgroundColor: T.accent}} />
      <View pointerEvents="none" style={{position: 'absolute', left: `${percent}%`, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: T.accent}} />
    </View>
    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}><Text style={{color: T.dim, fontSize: fs(12)}}>{formatMusicTime(position)}</Text><Text style={{color: T.dim, fontSize: fs(12)}}>{track.duration ? formatMusicTime(track.duration) : 'Live'}</Text></View>
  </View>;
}

function LyricsPanel({track, busy}: {track: MusicTrack; busy: boolean}) {
  const T = useTheme(); const fs = fontScale(T); const prefs = useMusicPreferences(); const [lyrics, setLyrics] = useState<Lyrics | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [title, setTitle] = useState(track.title); const [artist, setArtist] = useState(track.artist); const [manual, setManual] = useState(false); const [query, setQuery] = useState({title: track.title, artist: track.artist, duration: track.duration}); const [retry, setRetry] = useState(0);
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
  useEffect(() => { if (prefs.followLyrics && following && active >= 0 && offsets.current[active] !== undefined) scroll.current?.scrollTo({y: Math.max(0, offsets.current[active] - 90), animated: true}); }, [active, following, prefs.followLyrics]);
  if (!prefs.onlineLyrics) return <View style={{gap: 12}}><Text style={{color: T.dim}}>Online lyrics send the song title, artist, and duration to LRCLIB when this panel is open.</Text><Btn onPress={() => save({onlineLyrics: true})}>Enable online lyrics</Btn>{!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}</View>;
  return <View style={{gap: 14}}>
    {loading && <ActivityIndicator accessibilityLabel="Loading lyrics" color={T.accent} />}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
    {!loading && !error && !lyrics && <Text style={{color: T.dim}}>No lyrics found. Try correcting the title or artist below.</Text>}
    {lyrics?.instrumental && !lyrics.lines.length && !lyrics.plain && <Text style={{color: T.dim}}>This track is instrumental.</Text>}
    {!!lyrics && <>
      <ScrollView ref={scroll} nestedScrollEnabled onScrollBeginDrag={() => setFollowing(false)} style={{height: 360}} contentContainerStyle={{paddingVertical: 40, gap: 18}}>
        {lyrics.lines.length ? lyrics.lines.map((line, index) => <TouchableOpacity key={index} disabled={!track.canSeek || busy} accessibilityRole="button" accessibilityLabel={`${line.text || 'Instrumental break'}, ${formatMusicTime(line.time)}`} accessibilityState={{selected: index === active, disabled: !track.canSeek || busy}}
          onLayout={event => { offsets.current[index] = event.nativeEvent.layout.y; if (index === active && prefs.followLyrics && following) scroll.current?.scrollTo({y: Math.max(0, event.nativeEvent.layout.y - 90), animated: false}); }} onPress={() => { void musicCommand('seek', String(Math.round(Math.max(0, Math.min(track.duration, line.time - prefs.lyricOffset))))); setFollowing(true); }}>
          <Text style={{color: index === active ? T.accent : T.dim, fontSize: fs(prefs.lyricSize), lineHeight: fs(prefs.lyricSize * 1.45), fontWeight: index === active ? '700' : '500'}}>{line.text || '· · ·'}</Text>
        </TouchableOpacity>) : <Text selectable style={{color: T.text, fontSize: fs(prefs.lyricSize), lineHeight: fs(prefs.lyricSize * 1.5)}}>{lyrics.plain}</Text>}
      </ScrollView>
      {!!lyrics.lines.length && <>
        {!following && prefs.followLyrics && <Btn variant="ghost" onPress={() => setFollowing(true)}>Follow current line</Btn>}
        <ToggleRow label="Follow lyrics" desc="Scroll to the current line. Tap a line to seek." value={prefs.followLyrics} onToggle={() => save({followLyrics: !prefs.followLyrics})} />
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><Btn variant="ghost" disabled={prefs.lyricOffset <= -10000} onPress={() => save({lyricOffset: prefs.lyricOffset - 500})}>Delay 0.5s</Btn><Btn variant="ghost" onPress={() => save({lyricOffset: 0})}>{`Timing ${prefs.lyricOffset > 0 ? '+' : ''}${prefs.lyricOffset / 1000}s · reset`}</Btn><Btn variant="ghost" disabled={prefs.lyricOffset >= 10000} onPress={() => save({lyricOffset: prefs.lyricOffset + 500})}>Advance 0.5s</Btn></View>
      </>}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{[18, 22, 28, 34].map(size => <Btn key={size} variant={prefs.lyricSize === size ? 'solid' : 'ghost'} onPress={() => save({lyricSize: size})}>{`${size} pt`}</Btn>)}</View>
    </>}
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}><Btn variant="ghost" onPress={() => setManual(!manual)}>{manual ? 'Hide search' : 'Correct song details'}</Btn><Btn variant="ghost" disabled={loading} onPress={() => setRetry(retry + 1)}>Retry lyrics</Btn></View>
    {manual && <View style={{gap: 10}}>
      <TextInput accessibilityLabel="Lyrics song title" value={title} onChangeText={setTitle} maxLength={300} placeholder="Song title" placeholderTextColor={T.muted} style={{color: T.text, backgroundColor: T.surface, borderRadius: 8, padding: 12}} />
      <TextInput accessibilityLabel="Lyrics artist" value={artist} onChangeText={setArtist} maxLength={300} placeholder="Artist" placeholderTextColor={T.muted} style={{color: T.text, backgroundColor: T.surface, borderRadius: 8, padding: 12}} />
      <Btn disabled={loading || !title.trim() || !artist.trim()} onPress={() => { setQuery({title: title.trim(), artist: artist.trim(), duration: track.duration}); setRetry(retry + 1); }}>Search lyrics</Btn>
    </View>}
    <Text style={{color: T.muted, fontSize: fs(12)}}>Lyrics from LRCLIB. Player and lyric behavior adapted from BitChord.</Text>
  </View>;
}

function PlayerContent() {
  const T = useTheme(); const fs = fontScale(T); const state = useMusic(); const track = state.track; const {width} = useWindowDimensions(); const [tab, setTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  if (!state.ready) return <ActivityIndicator color={T.accent} accessibilityLabel="Finding music" />;
  if (!state.access) return <View style={{gap: 14}}><Text style={{color: T.text}}>Allow music access in Android to see music playing in other apps. Only media sessions are used; notification messages are never read or saved.</Text><Btn onPress={() => { void openMusicAccess(); }}>Allow music access</Btn><Btn variant="ghost" onPress={() => { void refreshMusic(); }}>Check again</Btn></View>;
  return <View style={{gap: 18}}>
    {state.sessions.length > 1 && <View style={{gap: 8}}><Text style={{color: T.dim, fontSize: fs(13)}}>Music source</Text><View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{state.sessions.map(item => <Btn key={item.id} variant={track?.sessionId === item.id ? 'solid' : 'ghost'} disabled={state.busy} onPress={() => selectMusicSource(item.id)}>{item.name}{item.playing ? ' · playing' : ''}</Btn>)}</View></View>}
    {!track ? <><Text style={{color: T.dim}}>Nothing is playing. Start music in your music app, then return here.</Text><Btn variant="ghost" onPress={() => { void refreshMusic(); }}>Refresh music</Btn></> : <>
      <View style={{alignItems: 'center'}}><Cover track={track} size={Math.max(80, Math.min(width - 64, 300))} /></View>
      <View style={{gap: 5}}><Text accessibilityRole="header" selectable style={{color: T.text, fontSize: fs(24), fontWeight: '700'}}>{track.title || 'Unknown track'}</Text><Text selectable style={{color: T.dim, fontSize: fs(17)}}>{track.artist || 'Unknown artist'}</Text>{!!track.album && <Text numberOfLines={2} style={{color: T.muted, fontSize: fs(13)}}>{track.album}</Text>}</View>
      <View style={{gap: 5}}><Text style={{color: T.dim, fontSize: fs(12)}}>{track.source}{track.buffering ? ' · buffering' : track.playing ? ' · playing' : ' · paused'}</Text><SeekBar track={track} disabled={state.busy || !track.canSeek} /></View>
      <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14}}><IconButton name="previous" label="Previous track" disabled={state.busy || !track.canPrevious} onPress={() => { void musicCommand('previous'); }} /><IconButton name={track.playing ? 'pause' : 'play'} label={track.playing ? 'Pause music' : 'Play music'} disabled={state.busy || !(track.playing ? track.canPause : track.canPlay)} onPress={() => { void musicCommand(track.playing ? 'pause' : 'play'); }} /><IconButton name="next" label="Next track" disabled={state.busy || !track.canNext} onPress={() => { void musicCommand('next'); }} /></View>
      <View style={{flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8}}><Btn variant="ghost" disabled={state.busy || !track.canSeek} onPress={() => { void musicCommand('seek', String(Math.max(0, track.position - 10000))); }}>Back 10s</Btn><Btn variant="ghost" disabled={state.busy || !track.canSeek} onPress={() => { void musicCommand('seek', String(Math.min(track.duration, track.position + 10000))); }}>Forward 10s</Btn></View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{(['player', 'lyrics', 'queue'] as const).map(item => <Btn key={item} variant={tab === item ? 'solid' : 'ghost'} onPress={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</Btn>)}</View>
      {tab === 'lyrics' && <LyricsPanel key={trackKey(track)} track={track} busy={state.busy} />}
      {tab === 'queue' && <View style={{gap: 8}}>{!track.queue.length && <Text style={{color: T.dim}}>This music app is not sharing its queue. Open it to manage upcoming songs.</Text>}{track.queue.map((item, index) => <TouchableOpacity key={`${item.id}:${index}`} accessibilityRole="button" accessibilityState={{selected: item.active, disabled: state.busy || !track.canQueue}} disabled={state.busy || !track.canQueue} onPress={() => { void musicCommand('queue', item.id); }} style={{padding: 14, borderRadius: 10, borderWidth: 1, borderColor: item.active ? T.accent : T.border, backgroundColor: T.surface}}><Text style={{color: item.active ? T.accent : T.text, fontSize: fs(15)}}>{item.title || `Track ${index + 1}`}{item.active ? ' · current' : ''}</Text>{!!item.artist && <Text style={{color: T.dim, fontSize: fs(13)}}>{item.artist}</Text>}</TouchableOpacity>)}</View>}
      {tab === 'player' && <>
        {!!track.customActions.length && <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>{track.customActions.map(action => <Btn key={action.id} variant="ghost" disabled={state.busy} onPress={() => { void musicCommand('custom', action.id); }}>{action.name}</Btn>)}</View>}
        {track.canVolume && <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}><Btn variant="ghost" disabled={state.busy || track.volume === 0} onPress={() => { void musicCommand('volume', String(track.volume - 1)); }}>Volume −</Btn><Text style={{color: T.dim}}>{`${Math.round(track.volume / track.maxVolume * 100)}%`}</Text><Btn variant="ghost" disabled={state.busy || track.volume === track.maxVolume} onPress={() => { void musicCommand('volume', String(track.volume + 1)); }}>Volume +</Btn></View>}
        <Text style={{color: T.muted, fontSize: fs(13)}}>Music plays in {track.source}. Some controls may be unavailable if that app does not share them.</Text>
      </>}
      <Btn variant="ghost" disabled={state.busy} onPress={() => { void musicCommand('open'); }}>{`Open ${track.source}`}</Btn>
    </>}
  </View>;
}

export function MusicRoot() {
  useMusicEngine(); const prefs = useMusicPreferences(); const state = useMusic(); const T = useTheme(); const fs = fontScale(T);
  if (!prefs.enabled || !musicSupported || !state.open) return null;
  return <Modal visible animationType="slide" onRequestClose={closeMusic}><SafeAreaView style={{flex: 1, backgroundColor: T.bg}}>
    <View style={{paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: T.border}}><Text accessibilityRole="header" style={{flex: 1, color: T.text, fontSize: fs(23), fontWeight: '700'}}>Music</Text><Btn variant="ghost" onPress={closeMusic}>Done</Btn></View>
    {!!state.error && <Text accessibilityRole="alert" style={{color: T.danger, paddingHorizontal: 20, paddingVertical: 10}}>{state.error}</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{padding: 24, width: '100%', maxWidth: 680, alignSelf: 'center', paddingBottom: 40}}><PlayerContent /></ScrollView>
  </SafeAreaView></Modal>;
}
