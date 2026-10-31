import React, {useEffect, useRef, useState} from 'react';
import {Alert, Linking, Share, View} from 'react-native';
import {pick, keepLocalCopy, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import Blob from 'react-native-blob-util';
import {Text} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {parseSparkle} from './sparkleScriptCore';
import {listScripts, loadScripts, runScripts, saveScripts, SavedScript} from './sparkleScripts';

const DOCS = 'https://github.com/sparklecatdev/plural-star-mods/blob/main/SPARKLESCRIPT.md';
export function CustomMods({disabled}: {disabled: boolean}) {
  const T = useTheme(), fs = fontScale(T);
  const [rows, setRows] = useState<SavedScript[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const refresh = () => setRows(listScripts());
  useEffect(() => { void loadScripts().then(refresh).catch(e => setError(String(e))); }, []);
  const action = async (work: () => Promise<void>) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { await work(); refresh(); } catch (e) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) setError(e instanceof Error ? e.message : String(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  const importFile = (replaceId?: string) => action(async () => {
    const [file] = await pick({allowMultiSelection: false});
    if (file.size != null && file.size > 16384) throw Error('Script exceeds 16 KiB.');
    const [copy] = await keepLocalCopy({files: [{uri: file.uri, fileName: 'sparkle-import.txt'}], destination: 'cachesDirectory'});
    if (copy.status !== 'success') throw Error('Could not read the selected script.');
    const path = copy.localUri.replace(/^file:\/\//, '');
    try {
      const stats = await Blob.fs.stat(path); if (Number(stats.size) > 16384) throw Error('Script exceeds 16 KiB.');
      const source = await Blob.fs.readFile(path, 'utf8'); const mod = parseSparkle(source);
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      await saveScripts(current => replaceId ? current.map(row => row.id === replaceId ? {...row, source, enabled: false} : row) : [...current, {id, source, enabled: false}]);
      Alert.alert('Mod imported', `${mod.name} is disabled until you review and enable it.`);
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <Text accessibilityRole="header" style={{color: T.text, fontSize: fs(18), fontWeight: '700'}}>Custom mods · SparkleScript</Text>
    <Text style={{color: T.dim, fontSize: fs(13)}}>Create or edit a .sparkle file in a text editor, then import it here. Scripts can show messages and, with your permission, change the accent background. They cannot access your data, files, network, or JavaScript.</Text>
    {rows.map(row => { const mod = parseSparkle(row.source); return <View key={row.id} style={{gap: 6}}>
      <ToggleRow label={mod.name} desc={`${mod.version} · ${mod.description || 'Custom mod'}`} value={row.enabled} disabled={disabled || busy} onToggle={() => { const toggle = () => { void action(() => saveScripts(current => current.map(item => item.id === row.id ? {...item, enabled: !item.enabled} : item))); }; if (!row.enabled && mod.appearance) Alert.alert('Allow appearance changes?', `${mod.name} can change the accent background. Changes persist after disabling the mod and can be reset in Extra Customization. Turn on Extra Customization to see them.`, [{text: 'Cancel'}, {text: 'Allow and enable', onPress: toggle}]); else toggle(); }} />
      <Btn variant="ghost" disabled={disabled || busy} onPress={() => Alert.alert('Edit in a text editor', 'Share the current code to a text editor, save it as a .sparkle file, then import the edited file here.', [{text: 'Cancel'}, {text: 'Share code', onPress: () => { void Share.share({message: row.source, title: mod.name}).catch(() => setError('Could not share the mod code.')); }}, {text: 'Import edited file', onPress: () => { void importFile(row.id); }}])}>Edit</Btn>
      <Btn variant="ghost" disabled={disabled || busy || !row.enabled} onPress={() => runScripts('tap', row.id)}>Run</Btn>
      <Btn variant="ghost" disabled={disabled || busy} onPress={() => Alert.alert('Remove custom mod?', `Remove ${mod.name}?`, [{text: 'Cancel'}, {text: 'Remove', style: 'destructive', onPress: () => { void action(() => saveScripts(current => current.filter(item => item.id !== row.id))); }}])}>Remove</Btn>
    </View>; })}
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => Alert.alert('Create in a text editor', 'Open a text editor to write a mod, save it as a .sparkle file, then import it here. See the SparkleScript guide for examples and syntax.')}>New mod</Btn>
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => { void importFile(); }}>Import .sparkle</Btn>
    <Btn variant="ghost" onPress={() => { void Linking.openURL(DOCS).catch(() => setError('Could not open the SparkleScript guide.')); }}>SparkleScript guide</Btn>
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error}</Text>}
  </View>;
}
