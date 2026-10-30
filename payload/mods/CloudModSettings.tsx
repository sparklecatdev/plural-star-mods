import React from 'react';
import {View} from 'react-native';
import {Text} from '../components/AppText';
import {Btn} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {cloudMods, useCloudMods} from './cloudMods';

export function CloudModSettings({disabled}: {disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  const state = useCloudMods();
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <Text style={{color: T.text, fontSize: fs(18), fontWeight: '700'}}>Mod sync</Text>
    <Text style={{color: T.dim, fontSize: fs(13), lineHeight: fs(19)}}>Mod switches, PluralKit front sync, and installed patch versions are included in your Plural Star cloud save and linked-device sync. Connect cloud storage in Plural Star to sync across installs.</Text>
    {!!state.message && <Text accessibilityLiveRegion="polite" style={{color: T.dim, fontSize: fs(13)}}>{state.message}</Text>}
    <Btn variant="ghost" disabled={disabled || state.restoring} onPress={() => { void cloudMods.sync(true); }}>Restore mod preferences</Btn>
    <Text style={{color: T.muted, fontSize: fs(12), lineHeight: fs(18)}}>Use the patcher to install and update mods on each device. Wallpaper image files are not synced by this feature.</Text>
    {!!state.error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{state.error}</Text>}
  </View>;
}
