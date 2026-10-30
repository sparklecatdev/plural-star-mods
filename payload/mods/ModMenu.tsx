import React, {useState} from 'react';
import {Modal, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {modPreferences, useModPreferences} from './modPreferences';
import type {ModId} from './modPreferencesCore';
import {options} from './modOptions';
import {WallpaperControls} from './WallpaperControls';
import {BackupTools} from './BackupTools';
import {UpdateEntry} from './UpdateEntry';

export function ModSettingsButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Btn variant="ghost" style={{marginBottom: 14}} onPress={() => setOpen(true)}>✦ sparklecat's mods</Btn>
    {open && <ModMenu onClose={() => setOpen(false)} />}
  </>;
}

function ModMenu({onClose}: {onClose: () => void}) {
  const T = useTheme(); const fs = fontScale(T);
  const enabled = useModPreferences();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async (id: ModId) => {
    setSaving(true); setError('');
    try { await modPreferences.setEnabled(id, !enabled[id]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy && !saving) onClose(); }}>
    <SafeAreaView style={{flex: 1, backgroundColor: T.bg}}>
      <ScrollView contentContainerStyle={{padding: 24, gap: 20}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Text accessibilityRole="header" style={{flex: 1, color: T.text, fontSize: fs(24), fontWeight: '700'}}>sparklecat's mods</Text>
          <Btn variant="ghost" disabled={busy || saving} onPress={onClose}>Done</Btn>
        </View>
        <Text style={{color: T.dim, fontSize: fs(14), lineHeight: fs(21)}}>Make Plural Star your own. Turn features on or off whenever you like.</Text>
        {options.wallpaper && <View>
          <ToggleRow label="Wallpaper" desc="Personalize your app background." value={enabled.wallpaper} disabled={busy || saving}
            onToggle={() => { void toggle('wallpaper'); }} />
          {enabled.wallpaper && <WallpaperControls />}
        </View>}
        {options.storage && <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20}}>
          <ToggleRow label="Storage tools" desc="Back up and restore your app data. Turning this off cancels any pending restore." value={enabled.storage} disabled={busy || saving}
            onToggle={() => { void toggle('storage'); }} />
          {enabled.storage && <BackupTools onBusy={setBusy} />}
        </View>}
        {!busy && <UpdateEntry />}
        {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(14)}}>{error}</Text>}
        <Text style={{color: T.muted, fontSize: fs(12)}}>Your choices are saved automatically. Turning a feature off keeps its saved data.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
