import React, {useState} from 'react';
import {Linking, Platform, Share, View} from 'react-native';
import {Text} from '../components/AppText';
import {Btn} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {useAppStore} from '../store/appStore';
import {version} from '../../package.json';
import {payloadVersion, patchRuntime, patchVariant} from './modOptions';
import {modPreferences} from './modPreferences';
import {updateChecker} from './updateCheck';
import {cloudMods} from './cloudMods';
import {changelog} from './changelog';
import {diagnosticReport} from './diagnosticsCore';

export function ModSupport({disabled}: {disabled: boolean}) {
  const T = useTheme(); const fs = fontScale(T);
  const [notes, setNotes] = useState(false);
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  return <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20, gap: 12}}>
    <Text style={{color: T.text, fontSize: fs(18), fontWeight: '700'}}>Help and community</Text>
    <Text style={{color: T.dim, fontSize: fs(13)}}>Patches {payloadVersion}</Text>
    <Btn variant="ghost" disabled={disabled} onPress={() => setNotes(!notes)}>What's new</Btn>
    {notes && <Text style={{color: T.text, fontSize: fs(14), lineHeight: fs(21)}}>{changelog}</Text>}
    <Btn variant="ghost" disabled={disabled} onPress={() => {
      setError('');
      void Linking.openURL('https://discord.gg/Pf2F2BawKV').catch(() => setError('Could not open Discord. Try discord.gg/Pf2F2BawKV in your browser.'));
    }}>Patches Discord</Btn>
    <Btn variant="ghost" disabled={disabled} onPress={() => {
      const enabled = modPreferences.getSnapshot(), update = updateChecker.getSnapshot(), cloud = cloudMods.getSnapshot();
      setError('');
      setReport(diagnosticReport({appVersion: version, patchVersion: payloadVersion, runtime: patchRuntime, variant: patchVariant,
        platform: Platform.OS, platformVersion: Platform.Version,
        wallpaper: enabled.wallpaper, storage: enabled.storage, pkFrontSync: useAppStore.getState().appSettings.pkFrontSyncEnabled === true,
        lastChecked: update.lastChecked, available: update.available, checking: update.checking, updateError: !!update.error,
        cloudReady: cloud.ready, cloudRestoring: cloud.restoring, cloudError: !!cloud.error}));
    }}>Preview diagnostics</Btn>
    {!!report && <>
      <Text style={{color: T.dim, fontSize: fs(13)}}>Review before sharing. Contains versions and feature status; no account data, tokens, or private file paths.</Text>
      <Text selectable style={{color: T.text, fontSize: fs(12), lineHeight: fs(18)}}>{report}</Text>
      <Btn variant="ghost" disabled={disabled} onPress={() => {
        setError('');
        void Share.share({message: report, title: 'sparklecat mod diagnostics'}).catch(() => setError('Could not share diagnostics. You can select and copy the report above.'));
      }}>Share diagnostics</Btn>
      <Btn variant="ghost" onPress={() => setReport('')}>Close diagnostics</Btn>
    </>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error}</Text>}
  </View>;
}
