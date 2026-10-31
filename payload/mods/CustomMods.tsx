import React, {useEffect, useRef, useState} from 'react';
import {Alert, View} from 'react-native';
import {pick, keepLocalCopy, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import Blob from 'react-native-blob-util';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {parseSparkle} from './sparkleScriptCore';
import {listScripts, loadScripts, runScripts, saveScripts, SavedScript} from './sparkleScripts';

const EXAMPLE = 'mod "Hello Star" version "1.0.0" {\n  describe "A little greeting"\n  when tap {\n    show "Hello, star!"\n  }\n}';
export function CustomMods({disabled}: {disabled: boolean}) {
  const T = useTheme(), fs = fontScale(T);
  const [rows, setRows] = useState<SavedScript[]>([]), [source, setSource] = useState(EXAMPLE);
  const [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const locked = useRef(false);
  const refresh = () => setRows(listScripts());
  useEffect(() => { void loadScripts().then(refresh).catch(e => setError(String(e))); }, []);
  const action = async (work: () => Promise<void>) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError('');
    try { await work(); refresh(); } catch (e) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) setError(e instanceof Error ? e.message : String(e)); }
    finally { locked.current = false; setBusy(false); }
  };
  const save = () => action(async () => {
    const parsed = parseSparkle(source);
    if (editing) {
      await saveScripts(current => current.map(row => row.id === editing ? {...row, source, enabled: false} : row));
      Alert.alert('Mod saved', `${parsed.name} is disabled until you review and enable it again.`);
    } else {
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      await saveScripts(current => [...current, {id, source, enabled: false}]); setEditing(id);
      Alert.alert('Mod saved', `${parsed.name} is disabled. Enable it after reviewing its code.`);
    }
  });
  const importFile = () => action(async () => {
    const [file] = await pick({allowMultiSelection: false});
    if (file.size != null && file.size > 16384) throw Error('Script exceeds 16 KiB.');
    const [copy] = await keepLocalCopy({files: [{uri: file.uri, fileName: 'sparkle-import.txt'}], destination: 'cachesDirectory'});
    if (copy.status !== 'success') throw Error('Could not read the selected script.');
    const path = copy.localUri.replace(/^file:\/\//, '');
    try {
      const stats = await Blob.fs.stat(path); if (Number(stats.size) > 16384) throw Error('Script exceeds 16 KiB.');
      const text = await Blob.fs.readFile(path, 'utf8'); parseSparkle(text); setSource(text); setEditing(null);
    } finally { if (await Blob.fs.exists(path)) await Blob.fs.unlink(path); }
  });
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <Text accessibilityRole="header" style={{color: T.text, fontSize: fs(18), fontWeight: '700'}}>Custom mods · SparkleScript</Text>
    <Text style={{color: T.dim, fontSize: fs(13)}}>Write a mod here or import a .sparkle file. Scripts can show messages and, with your permission, change the accent background. They cannot access your data, files, network, or JavaScript.</Text>
    {rows.map(row => { const mod = parseSparkle(row.source); return <View key={row.id} style={{gap: 6}}>
      <ToggleRow label={mod.name} desc={`${mod.version} · ${mod.description || 'Custom mod'}`} value={row.enabled} disabled={disabled || busy} onToggle={() => { const toggle = () => { void action(() => saveScripts(current => current.map(item => item.id === row.id ? {...item, enabled: !item.enabled} : item))); }; if (!row.enabled && mod.appearance) Alert.alert('Allow appearance changes?', `${mod.name} can change the accent background. Changes persist after disabling the mod and can be reset in Extra Customization. Turn on Extra Customization to see them.`, [{text: 'Cancel'}, {text: 'Allow and enable', onPress: toggle}]); else toggle(); }} />
      <Btn variant="ghost" disabled={disabled || busy} onPress={() => { setEditing(row.id); setSource(row.source); }}>Edit</Btn>
      <Btn variant="ghost" disabled={disabled || busy || !row.enabled} onPress={() => runScripts('tap', row.id)}>Run</Btn>
      <Btn variant="ghost" disabled={disabled || busy} onPress={() => Alert.alert('Remove custom mod?', `Remove ${mod.name}?`, [{text: 'Cancel'}, {text: 'Remove', style: 'destructive', onPress: () => { void action(() => saveScripts(current => current.filter(item => item.id !== row.id))); }}])}>Remove</Btn>
    </View>; })}
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => { setEditing(null); setSource(EXAMPLE); setError(''); }}>New mod</Btn>
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => { void importFile(); }}>Import .sparkle</Btn>
    <Text style={{color: T.dim, fontSize: fs(13)}}>{editing ? 'Editing mod' : 'New mod'} · Save validates the script and keeps it disabled until enabled.</Text>
    <TextInput accessibilityLabel="SparkleScript editor" multiline autoCapitalize="none" autoCorrect={false} editable={!disabled && !busy} value={source} onChangeText={setSource} maxLength={16384} style={{color: T.text, backgroundColor: T.surface, minHeight: 180, textAlignVertical: 'top', padding: 12, borderRadius: 8, fontSize: fs(13)}} />
    <Btn disabled={disabled || busy} onPress={() => { void save(); }}>Save custom mod</Btn>
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error}</Text>}
  </View>;
}
