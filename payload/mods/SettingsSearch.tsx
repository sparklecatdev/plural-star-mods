import React, {createContext, useContext} from 'react';
import {TouchableOpacity, View} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';

export const SettingsQuery = createContext('');
export const useSettingsQuery = () => useContext(SettingsQuery);
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function settingsText(children: React.ReactNode): string {
  return React.Children.toArray(children).map(child => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (!React.isValidElement(child)) return '';
    const props = child.props as {label?: string; desc?: string; title?: string; children?: React.ReactNode};
    return [props.label, props.desc, props.title, settingsText(props.children)].filter(Boolean).join(' ');
  }).join(' ');
}
export const matchesSettings = (query: string, content: string) => fold(query).trim().split(/\s+/).every(word => fold(content).includes(word));

export function SearchSection({keywords = '', children}: {keywords?: string; children: React.ReactNode}) {
  const query = useSettingsQuery();
  // Keep hidden tools mounted so filtering cannot interrupt a save or restore.
  return <View style={{gap: 16, display: matchesSettings(query, `${keywords} ${settingsText(children)}`) ? 'flex' : 'none'}}>{children}</View>;
}

export function SettingsSearch({value, onChange}: {value: string; onChange: (value: string) => void}) {
  const T = useTheme();
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}><TextInput accessibilityLabel="Search settings" value={value} onChangeText={onChange} maxLength={120}
    autoCorrect={false} autoCapitalize="none" placeholder="Search settings…" placeholderTextColor={T.muted}
    returnKeyType="search"
    style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontScale(T)(14)}} />
    {!!value && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear settings search" onPress={() => onChange('')} style={{minHeight: 44, paddingHorizontal: 8, justifyContent: 'center'}}><Text style={{color: T.accent}}>Clear</Text></TouchableOpacity>}
  </View>;
}
