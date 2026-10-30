import React, {useState} from 'react';
import {View} from 'react-native';
import {Text} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {updateChecker, useUpdateCheck, openUpdater} from './updateCheck';

export function UpdateEntry() {
  const T = useTheme(); const fs = fontScale(T);
  const state = useUpdateCheck();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <ToggleRow label="Automatic update checks" desc="Check for new mod packs when Plural Star opens. No popups on boot." value={state.automatic} disabled={saving}
      onToggle={() => {
        setSaving(true); setError('');
        updateChecker.setAutomatic(!state.automatic).catch(() => setError('Could not save update preferences.')).finally(() => setSaving(false));
      }} />
    <Text accessibilityLiveRegion="polite" style={{color: T.dim, fontSize: fs(13)}}>{state.checking ? 'Checking for updates…' : state.available ? `Mod pack ${state.available} is available.` : 'Updates are managed by the patcher.'}</Text>
    <Btn disabled={state.checking} variant="ghost" onPress={() => { void updateChecker.check(true); }}>Check for updates</Btn>
    <Btn onPress={() => { setError(''); openUpdater().catch(() => setError('Could not open the updater.')); }}>Open updater</Btn>
    <Text style={{color: T.muted, fontSize: fs(12), lineHeight: fs(18)}}>The updater downloads and verifies the patcher APK. Android asks before installing. Then use the patcher to apply updated mods to Plural Star.</Text>
    {!!(error || state.error) && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error || state.error}</Text>}
  </View>;
}
