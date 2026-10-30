import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Linking, View} from 'react-native';
import {pick, keepLocalCopy, saveDocuments, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import Blob from 'react-native-blob-util';
import {Text, TextInput} from '../components/AppText';
import {Btn} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {openSnapshot, restoreQueue, saveSnapshot} from './storageSnapshot';

export function BackupTools({onBusy, disabled = false}: {onBusy: (value: boolean) => void; disabled?: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);
  const locked = useRef(false);
  useEffect(() => { restoreQueue.hasPending().then(setQueued).catch(e => setError(String(e))); }, []);
  const run = async (label: string, work: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(label); setError(''); onBusy(true);
    try { await work(); }
    catch (e) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) setError(e instanceof Error ? e.message : String(e)); }
    finally { locked.current = false; setBusy(''); onBusy(false); }
  };
  const save = () => run('Saving backup…', async () => {
    if (password !== repeat) throw Error('The passwords do not match.');
    const path = await saveSnapshot(password);
    try {
      const [result] = await saveDocuments({sourceUris: ['file://' + path], fileName: 'plural-star-' + new Date().toISOString().slice(0, 10) + '.scat', mimeType: 'application/octet-stream'});
      if (result.error) throw Error(result.error);
      setPassword(''); setRepeat('');
      Alert.alert('Backup saved', 'Keep the file and password somewhere safe. The password cannot be recovered.');
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  const restore = () => run('Opening backup…', async () => {
    if (!password) throw Error('Enter your backup password first.');
    const [file] = await pick({allowMultiSelection: false});
    if (file.size != null && file.size > 64 * 1024 * 1024) throw Error('Backup is too large.');
    const [copy] = await keepLocalCopy({files: [{uri: file.uri, fileName: 'sparklecat-restore.scat'}], destination: 'cachesDirectory'});
    if (copy.status !== 'success') throw Error('Could not read the selected backup.');
    const path = copy.localUri.replace(/^file:\/\//, '');
    try {
      const snapshot = await openSnapshot(path, password);
      const confirmed = await new Promise<boolean>(resolve => Alert.alert('Restore app data?',
        `Backup: ${snapshot.created}\n\nThis replaces your app data, media, and device identity on the next launch. Save your current data first. Changes made after scheduling this restore will be replaced. Only use your own backups.`, [
          {text: 'Cancel', style: 'cancel', onPress: () => resolve(false)},
          {text: 'Restore on next launch', style: 'destructive', onPress: () => resolve(true)},
        ], {cancelable: false}));
      if (confirmed) {
        await restoreQueue.queue(snapshot);
        setQueued(true); setPassword(''); setRepeat('');
        Alert.alert('Restore ready', 'Open Android app settings, tap Force stop, then reopen Plural Star. Your backup will be applied automatically before the app opens.', [
          {text: 'Later'},
          {text: 'Open app settings', onPress: () => { Linking.openSettings().catch(e => setError(String(e))); }},
        ]);
      }
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  const input = {color: T.text, backgroundColor: T.surface, padding: 12, borderRadius: 10, fontSize: fs(14), borderWidth: 1, borderColor: T.border};
  return <View style={{gap: 12, marginTop: 16}}>
    <Text style={{color: T.dim, fontSize: fs(13), lineHeight: fs(19)}}>Save your app data and local media in a password-protected backup. Up to 32 MiB; system settings and external files are excluded.</Text>
    {queued && <View style={{gap: 10}}>
      <Text accessibilityLiveRegion="polite" style={{color: T.accent, fontSize: fs(14)}}>A restore is ready. Force stop Plural Star in Android app settings, then reopen it to apply your backup.</Text>
      <Btn variant="ghost" disabled={disabled || !!busy} onPress={() => { Linking.openSettings().catch(e => setError(String(e))); }}>Open app settings</Btn>
      <Btn variant="ghost" disabled={disabled || !!busy} onPress={() => { void run('Canceling restore…', async () => { await restoreQueue.cancel(); setQueued(false); }); }}>Cancel pending restore</Btn>
    </View>}
    <TextInput accessibilityLabel="Backup password" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!disabled && !busy}
      placeholder="Password · at least 12 characters" placeholderTextColor={T.muted} style={input} value={password} onChangeText={setPassword} />
    <TextInput accessibilityLabel="Repeat password to save a backup" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!disabled && !busy}
      placeholder="Repeat password to save a backup" placeholderTextColor={T.muted} style={input} value={repeat} onChangeText={setRepeat} />
    <Btn disabled={disabled || !!busy} onPress={save}>Backup app data</Btn>
    <Btn variant="ghost" disabled={disabled || !!busy || queued} onPress={restore}>Restore app data</Btn>
    <Text style={{color: T.muted, fontSize: fs(12), lineHeight: fs(18)}}>Your password protects private content and account keys. Standard JSON/ZIP backups can still be restored through the app's Import screen.</Text>
    {!!busy && <View accessibilityLiveRegion="polite" style={{gap: 8}}><ActivityIndicator color={T.accent} /><Text style={{color: T.dim}}>{busy}</Text></View>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(14)}}>{error}</Text>}
  </View>;
}
