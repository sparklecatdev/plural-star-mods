import React, {useEffect, useState} from 'react';
import {AppState, Linking, View} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {emptyLastfmStatus, lastfmBegin, lastfmConfigure, lastfmDisconnect, lastfmFinish, lastfmRetry, lastfmStatus, lastfmSupported} from './lastfm';

export function LastfmSettings({disabled}: {disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  const [status, setStatus] = useState(emptyLastfmStatus); const [ready, setReady] = useState(false);
  const [key, setKey] = useState(''); const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!lastfmSupported) return;
    let stopped = false, reading = false;
    const refresh = async () => {
      if (reading || AppState.currentState !== 'active') return;
      reading = true;
      try { const value = await lastfmStatus(); if (!stopped) { setStatus(value); setReady(true); } }
      catch { if (!stopped) setError('Could not read Last.fm settings. Try again.'); }
      finally { reading = false; }
    };
    void refresh(); const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setStatus(await lastfmStatus()); setReady(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not connect Last.fm. Try again.'); }
    finally { setBusy(false); }
  };
  const locked = disabled || busy || !ready;
  const input = {color: T.text, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: fs(14)};
  return <View style={{gap: 12, borderTopWidth: 1, borderColor: T.border, paddingTop: 12}}>
    <Text style={{color: T.text, fontSize: fs(16), fontWeight: '600'}}>Last.fm</Text>
    {!lastfmSupported ? <Text style={{color: T.dim}}>Update to patcher 0.6.7 or later, then prepare and install Plural Star again to add scrobbling.</Text> : <>
      <Text style={{color: T.dim, fontSize: fs(13)}}>Optional listening history for Last.fm. Sends song title, artist, album, duration and listen time after half the song or 4 minutes, whichever comes first. Songs must be longer than 30 seconds. Scrobbling continues in the background while Android keeps music access connected. Avoid enabling another scrobbler for the same player.</Text>
      {status.connected ? <>
        <Text style={{color: T.text}}>Connected as {status.username}</Text>
        <ToggleRow label="Last.fm scrobbling" desc="Queue eligible listens offline and send them when connected. Turning off the music player also stops scrobbling." value={status.enabled} disabled={locked} onToggle={() => { void run(() => lastfmConfigure(!status.enabled, status.nowPlaying)); }} />
        <ToggleRow label="Share Now Playing" desc="Also show the current song on Last.fm before it qualifies as a scrobble." value={status.nowPlaying} disabled={locked} onToggle={() => { void run(() => lastfmConfigure(status.enabled, !status.nowPlaying)); }} />
        {!!status.activity && <Text style={{color: T.dim}}>{status.activity}</Text>}
        <Text style={{color: T.dim}}>{status.queued} queued listen{status.queued === 1 ? '' : 's'}{status.lastScrobble ? `\nLast scrobble: ${status.lastScrobble}` : ''}</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
          <Btn variant="ghost" disabled={locked || !status.enabled || !status.queued} onPress={() => { void run(lastfmRetry); }}>Retry queued listens</Btn>
          <Btn variant="ghost" disabled={locked} onPress={() => { void run(lastfmDisconnect); }}>Disconnect Last.fm</Btn>
        </View>
      </> : <>
        <Text style={{color: T.dim, fontSize: fs(13)}}>Create a free Last.fm API account once, then enter its API key and shared secret. Approve access in your browser and return here to finish. Credentials and up to 500 queued listens stay encrypted on this device, outside cloud sync and backups.</Text>
        <Btn variant="ghost" disabled={disabled || busy} onPress={() => { void run(() => Linking.openURL('https://www.last.fm/api/account/create')); }}>Get an API key</Btn>
        <TextInput accessibilityLabel="Last.fm API key" placeholder="API key" placeholderTextColor={T.dim} value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} maxLength={32} editable={!locked} style={input} />
        <TextInput accessibilityLabel="Last.fm shared secret" placeholder="Shared secret" placeholderTextColor={T.dim} value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} maxLength={32} secureTextEntry editable={!locked} style={input} />
        <Btn disabled={locked || !key || !secret} onPress={() => { void run(async () => { const url = await lastfmBegin(key, secret); setKey(''); setSecret(''); await Linking.openURL(url); }); }}>Connect in browser</Btn>
        {status.pendingAuth && <><Text style={{color: T.dim}}>After approving access in your browser, finish connecting below. If the sign-in expired, enter your key and secret to start again.</Text><Btn disabled={locked} onPress={() => { void run(lastfmFinish); }}>Finish connecting</Btn></>}
        <Btn variant="ghost" disabled={locked} onPress={() => { void run(lastfmDisconnect); }}>Clear saved connection</Btn>
      </>}
      {!!status.error && <Text accessibilityRole="alert" style={{color: T.danger}}>{status.error}</Text>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
  </View>;
}
