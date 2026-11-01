import React, {useCallback, useEffect, useState} from 'react';
import {AppState, Image, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchImageLibrary} from 'react-native-image-picker';
import {Text, TextInput} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {store} from '../storage';
import {NetworkManager} from '../network/NetworkManager';

const KEY = 'ps:sparklecat:discord-companion';
type Presence = {details: string; state: string; large_image: string; large_text: string; small_image: string; small_text: string; button1_label: string; button1_url: string; button2_label: string; button2_url: string; show_empty: boolean};
const presenceDefaults: Presence = {details: 'Currently fronting', state: '{fronters}', large_image: '', large_text: '', small_image: '', small_text: '', button1_label: '', button1_url: '', button2_label: '', button2_url: '', show_empty: false};
type Settings = {v: 1; title: string; icon: string; autostart: boolean; close_mode: 'quit' | 'minimize' | 'tray'; presence?: Presence};
const defaults: Settings = {v: 1, title: 'Sparklecat Discord Companion', icon: '', autostart: false, close_mode: 'quit'};
const valid = (v: any): v is Settings => v && v.v === 1 && typeof v.title === 'string' && v.title.length <= 120 &&
  (v.presence === undefined || (v.presence && typeof v.presence === 'object' && Object.entries(v.presence).every(([key, item]) => key === 'show_empty' ? typeof item === 'boolean' : key in presenceDefaults && typeof item === 'string' && item.length <= 512))) &&
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
  const presence = {...presenceDefaults, ...value.presence};
  const updatePresence = (key: keyof Presence, text: string | boolean) => setValue(current => ({...current, presence: {...presenceDefaults, ...current.presence, [key]: text}}));
  const renderPreview = (text: string) => text.replace(/\{fronters\}/g, 'Alex, Sam').replace(/\{count\}/g, '2');
  const fields: Array<[keyof Presence, string, number]> = [['details', 'First line', 128], ['state', 'Second line', 128], ['large_image', 'Large image URL or asset key', 300], ['large_text', 'Large image hover text', 128], ['small_image', 'Small image URL or asset key', 300], ['small_text', 'Small image hover text', 128], ['button1_label', 'First button label', 32], ['button1_url', 'First button URL', 512], ['button2_label', 'Second button label', 32], ['button2_url', 'Second button URL', 512]];
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
    <Text style={{color: T.text, fontSize: fs(17), fontWeight: '700'}}>Discord presence</Text>
    <Text style={{color: T.dim}}>Use {'{fronters}'} for names and {'{count}'} for the number fronting. The preview uses example names.</Text>
    <View style={{backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, borderRadius: 10, padding: 12, gap: 4}}>
      <Text style={{color: T.dim}}>Presence preview</Text>
      <Text style={{color: T.text, fontWeight: '700'}}>Discord application</Text>
      {!!presence.large_image && /^https?:\/\//i.test(presence.large_image) && <Image source={{uri: presence.large_image}} style={{width: 64, height: 64, borderRadius: 8}} />}
      {!!presence.details && <Text style={{color: T.text}}>{renderPreview(presence.details)}</Text>}
      {!!presence.state && <Text style={{color: T.text}}>{renderPreview(presence.state)}</Text>}
      {[presence.button1_label, presence.button2_label].filter(Boolean).map((label, i) => <Text key={i} style={{color: T.dim}}>[ {label} ]</Text>)}
    </View>
    {fields.map(([key, label, max]) => <View key={key} style={{gap: 4}}><Text style={{color: T.text}}>{label}</Text><TextInput value={presence[key] as string} onChangeText={text => updatePresence(key, text)} maxLength={max} editable={!disabled && !busy} autoCapitalize="none" style={{color: T.text, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12}} /></View>)}
    <ToggleRow label="Show when nobody is fronting" desc="Keep the presence visible with an empty front." value={presence.show_empty} disabled={disabled || busy} onToggle={() => updatePresence('show_empty', !presence.show_empty)} />
    <Text style={{color: T.dim}}>Discord controls the application name and icon; change those in the Discord Developer Portal. Image URLs must be publicly accessible.</Text>
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
