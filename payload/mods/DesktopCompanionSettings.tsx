import React, {useCallback, useEffect, useState} from 'react';
import {AppState, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchImageLibrary} from 'react-native-image-picker';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {store} from '../storage';
import {NetworkManager} from '../network/NetworkManager';

const KEY = 'ps:sparklecat:discord-companion';
type Settings = {v: 1; title: string; icon: string; autostart: boolean; close_mode: 'quit' | 'minimize' | 'tray'};
const defaults: Settings = {v: 1, title: 'Sparklecat Discord Companion', icon: '', autostart: false, close_mode: 'quit'};
const valid = (v: any): v is Settings => v && v.v === 1 && typeof v.title === 'string' && v.title.length <= 120 &&
  typeof v.icon === 'string' && v.icon.length <= 400000 && typeof v.autostart === 'boolean' && ['quit', 'minimize', 'tray'].includes(v.close_mode);

export function DesktopCompanionSettings({disabled}: {disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  const [value, setValue] = useState<Settings>(defaults);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      const next: unknown = JSON.parse(raw);
      if (!valid(next)) throw new Error('Invalid companion settings in cloud storage.');
      setValue(next);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }, []);
  useEffect(() => {
    void load();
    const off = NetworkManager.onSyncApplied(keys => { if (keys.includes(KEY)) void load(); });
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { off(); sub.remove(); };
  }, [load]);
  const chooseIcon = async () => {
    try {
      const result = await launchImageLibrary({mediaType: 'photo', selectionLimit: 1, includeBase64: true, maxWidth: 256, maxHeight: 256, quality: 0.8});
      if (result.errorMessage) throw new Error(result.errorMessage);
      const icon = result.assets?.[0]?.base64;
      if (!icon) return;
      if (icon.length > 400000) throw new Error('Choose an image under 300 KB.');
      setValue(current => ({...current, icon}));
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const next = {...value, title: value.title.trim() || defaults.title};
      if (!valid(next)) throw new Error('Check the companion settings.');
      await store.setRaw(KEY, JSON.stringify(next));
      setValue(next);
      setMessage('Saved. Your computer will apply these settings after cloud sync.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 10}}>
    <Text style={{color: T.text, fontSize: fs(18), fontWeight: '700'}}>Discord companion</Text>
    <Text style={{color: T.dim, fontSize: fs(13)}}>Manage the desktop companion through your encrypted Plural Star cloud. Enable settings sync in the companion and connect it to the same cloud account.</Text>
    <Text style={{color: T.text}}>Window and tray title</Text>
    <TextInput value={value.title} onChangeText={title => setValue(current => ({...current, title}))} maxLength={120} editable={!disabled && !busy}
      style={{color: T.text, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12}} />
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => { void chooseIcon(); }}>Choose icon</Btn>
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => setValue(current => ({...current, icon: ''}))}>Use default icon</Btn>
    <ToggleRow label="Start when I sign in" desc="Launch the companion when you sign in on your computer." value={value.autostart} disabled={disabled || busy} onToggle={() => setValue(current => ({...current, autostart: !current.autostart}))} />
    <Text style={{color: T.text}}>When closing: {value.close_mode}</Text>
    {(['quit', 'minimize', 'tray'] as const).map(mode => <Btn key={mode} variant="ghost" disabled={disabled || busy} onPress={() => setValue(current => ({...current, close_mode: mode}))}>{mode}</Btn>)}
    <Btn variant="ghost" disabled={disabled || busy} onPress={() => { void save(); }}>Save companion settings</Btn>
    {!!message && <Text accessibilityLiveRegion="polite" style={{color: T.dim, fontSize: fs(13)}}>{message}</Text>}
  </View>;
}
