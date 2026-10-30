import React, {useEffect, useState} from 'react';
import {Alert, Button, SafeAreaView, ScrollView, Text, TextInput, View, ActivityIndicator} from 'react-native';
import {pick, keepLocalCopy, saveDocuments, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import Blob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {recovery, recoverBeforeStart, saveSnapshot, openSnapshot} from './storageSnapshot';
import {setToolsOpen, waitForStorageIdle} from './toolsState';
import {options} from './modOptions';

export default function ModsRoot() {
  const [ready, setReady] = useState(false);
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState('Checking storage…');
  const [error, setError] = useState('');
  const [gatePassword, setGatePassword] = useState<string | null>(null);
  const [unlockInput, setUnlockInput] = useState('');
  useEffect(() => {
    waitForStorageIdle().then(recoverBeforeStart).then(async () => {
      const raw = await AsyncStorage.getItem('ps:settings');
      const settings = raw ? JSON.parse(raw) : {};
      if (typeof settings.appLockPassword === 'string' && settings.appLockPassword) setGatePassword(settings.appLockPassword);
      setReady(true);
    }).catch(e => setError(String(e))).finally(() => setBusy(''));
  }, []);
  setToolsOpen(!opened);
  if (gatePassword !== null) return <SafeAreaView style={{flex: 1, backgroundColor: '#14101F', padding: 24, justifyContent: 'center', gap: 16}}>
    <Text style={{color: '#FFF6FF', fontSize: 24}}>Unlock Plural Star</Text>
    <Text style={{color: '#C5B9D4'}}>Your existing app password also protects the storage tools.</Text>
    <TextInput accessibilityLabel="App password" secureTextEntry autoCorrect={false} autoCapitalize="none" value={unlockInput} onChangeText={setUnlockInput} style={{color: '#FFF6FF', backgroundColor: '#2A203B', padding: 14}} />
    <Button title="Unlock" onPress={() => {
      if (unlockInput === gatePassword) { setUnlockInput(''); setGatePassword(null); setError(''); }
      else setError('Incorrect app password.');
    }} />
    {!!error && <Text accessibilityRole="alert" style={{color: '#FFB4C8'}}>{error}</Text>}
  </SafeAreaView>;
  if (opened) {
    // Delay loading upstream singletons and sync until recovery/tools have finished.
    const App = require('../../App').default;
    return <App />;
  }
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await work(); }
    catch (e) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  };
  const save = () => run('Encrypting snapshot…', async () => {
    if (password !== repeat) throw Error('The passwords do not match.');
    const path = await saveSnapshot(password);
    try {
      const [result] = await saveDocuments({sourceUris: ['file://' + path], fileName: 'plural-star-' + new Date().toISOString().slice(0, 10) + '.scat', mimeType: 'application/octet-stream'});
      if (result.error) throw Error(result.error);
      setPassword(''); setRepeat('');
      Alert.alert('Snapshot saved', 'Keep the file and password somewhere safe. The password cannot be recovered.');
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  const restore = () => run('Opening snapshot…', async () => {
    if (!password) throw Error('Enter the snapshot password first.');
    const [file] = await pick({allowMultiSelection: false});
    if (file.size != null && file.size > 64 * 1024 * 1024) throw Error('Snapshot is too large.');
    const [copy] = await keepLocalCopy({files: [{uri: file.uri, fileName: 'sparklecat-restore.scat'}], destination: 'cachesDirectory'});
    if (copy.status !== 'success') throw Error('Could not read the selected file.');
    const path = copy.localUri.replace(/^file:\/\//, '');
    try {
      const snapshot = await openSnapshot(path, password);
      await new Promise<void>(resolve => Alert.alert('Replace app storage?',
        `Snapshot: ${snapshot.created}\n${Object.keys(snapshot.records).length} records · ${Object.keys(snapshot.files).length} media files\n\nThis replaces current app data, wallpaper, and device identity. Save a snapshot of the current data first. Only restore your own snapshots; close other devices using this identity.`, [
          {text: 'Cancel', style: 'cancel', onPress: () => resolve()},
          {text: 'Replace storage', style: 'destructive', onPress: () => {
            setBusy('Restoring storage…');
            recovery.restore(snapshot).then(() => {
              setPassword(''); setRepeat('');
              Alert.alert('Storage restored', 'Open Plural Star to load your restored data.');
              resolve();
            }).catch(e => { setError('Restore failed: ' + String(e) + '. Recovery will run again on next launch if needed.'); setReady(false); resolve(); });
          }},
        ], {cancelable: false}));
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  const muted = {color: '#C5B9D4', fontSize: 15, lineHeight: 23, marginBottom: 16};
  const input = {color: '#FFF6FF', backgroundColor: '#2A203B', padding: 14, borderRadius: 12, marginBottom: 12};
  return <SafeAreaView style={{flex: 1, backgroundColor: '#14101F'}}>
    <ScrollView contentContainerStyle={{padding: 24, paddingTop: 40, gap: 12}} keyboardShouldPersistTaps="handled">
      <Text style={{color: '#E5B5FF', fontSize: 42}}>✦ ฅ^•ﻌ•^ฅ</Text>
      <Text accessibilityRole="header" style={{color: '#FFF6FF', fontSize: 30, fontWeight: '700'}}>sparklecat's{ '\n' }plural star mods</Text>
      <Text style={muted}>{[options.wallpaper && 'Palette-tinted wallpaper', options.storage && 'Encrypted storage saver & restorer'].filter(Boolean).join(' · ')}</Text>
      <Button title="Open Plural Star" color="#8963BB" disabled={!ready || !!busy} onPress={() => setOpened(true)} />
      {options.wallpaper && <Text style={muted}>Choose your wallpaper in Plural Star → Settings → Background image.</Text>}
      {options.storage && <View style={{marginTop: 20, gap: 10}}>
        <Text accessibilityRole="header" style={{color: '#FFF6FF', fontSize: 22, fontWeight: '700'}}>Your storage, saved</Text>
        <Text style={muted}>Save app records, local media, wallpaper, and identity to a password-encrypted .scat file. Return here by fully closing and reopening the app. Tools run before app sync starts. Snapshots support up to 32 MiB of encoded data; use standard Export for larger libraries. Cache, Android permissions, system notification schedules, and external files are excluded.</Text>
        <TextInput accessibilityLabel="Snapshot password" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="Password · at least 12 characters" placeholderTextColor="#B3A1C7" style={input} value={password} onChangeText={setPassword} />
        <TextInput accessibilityLabel="Confirm password for saving" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} placeholder="Repeat password to save a snapshot" placeholderTextColor="#B3A1C7" style={input} value={repeat} onChangeText={setRepeat} />
        <Button title="Save storage snapshot" color="#8963BB" disabled={!ready || !!busy} onPress={save} />
        <Button title="Restore storage snapshot" color="#8963BB" disabled={!ready || !!busy} onPress={restore} />
        <Text style={muted}>Keep the password safe. It protects journal content and account keys, and cannot be reset. For official JSON/ZIP exports, open Plural Star → Import instead.</Text>
      </View>}
      {!!busy && <View accessibilityLiveRegion="polite"><ActivityIndicator color="#E5B5FF" /><Text style={muted}>{busy}</Text></View>}
      {!!error && <Text accessibilityRole="alert" style={{color: '#FFB4C8', fontSize: 16}}>{error}</Text>}
      <Text style={muted}>Independent AGPL-3.0 mods · Plural Star 1.23.3{ '\n' }Wallpaper adapted from ByHanyou/Plural-Star PR #24.</Text>
    </ScrollView>
  </SafeAreaView>;
}
