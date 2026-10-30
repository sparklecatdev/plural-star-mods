import React, {useEffect, useState} from 'react';
import {Linking, View} from 'react-native';
import {Text} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {updateChecker, useUpdateCheck, usePatchInstall, patchInstaller, installLatestPatch} from './updateCheck';
import {payloadVersion} from './modOptions';

export function UpdateEntry() {
  const T = useTheme(); const fs = fontScale(T);
  const state = useUpdateCheck();
  const install = usePatchInstall();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void patchInstaller.load(); }, []);
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <Text style={{color: T.dim, fontSize: fs(13)}}>Installed patches: {payloadVersion}</Text>
    <ToggleRow label="Automatic update checks" desc="Check for new patches when Plural Star opens. No popups on boot." value={state.automatic} disabled={saving || install.busy}
      onToggle={() => {
        setSaving(true); setError('');
        updateChecker.setAutomatic(!state.automatic).catch(() => setError('Could not save update preferences.')).finally(() => setSaving(false));
      }} />
    <Text accessibilityLiveRegion="polite" style={{color: T.dim, fontSize: fs(13)}}>{install.busy ? 'Downloading and verifying patches…' : install.ready ? `Patch ${install.ready} is ready. Open app settings, tap Force stop, then reopen Plural Star to apply it.` : state.checking ? 'Checking for updates…' : state.available ? `Patch ${state.available} is available.` : state.lastChecked ? 'No newer compatible patches found.' : 'Ready to check for patch updates.'}</Text>
    <Btn disabled={state.checking || install.busy} variant="ghost" onPress={() => { void updateChecker.check(true); }}>Check for updates</Btn>
    {!!state.available && !install.ready && <Btn disabled={install.busy || state.checking} onPress={() => { setError(''); installLatestPatch().catch(() => setError('Could not download patches. Try again.')); }}>Download patches</Btn>}
    {!!install.ready && <Btn onPress={() => { Linking.openSettings().catch(() => setError('Open Plural Star’s app settings from Android Settings to restart it.')); }}>Open app settings</Btn>}
    <Text style={{color: T.muted, fontSize: fs(12), lineHeight: fs(18)}}>Patch updates download directly to Plural Star and apply on its next full start. No patcher update or reinstall is needed. Changes to the Android app itself still need a new APK from the patcher.</Text>
    {!!(error || state.error || install.error) && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error || state.error || install.error}</Text>}
  </View>;
}
