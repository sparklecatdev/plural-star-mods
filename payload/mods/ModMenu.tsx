import React, {useState} from 'react';
import {Modal, ScrollView, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text} from '../components/AppText';
import {Btn, ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {modPreferences, useModPreferences} from './modPreferences';
import type {ModId} from './modPreferencesCore';
import {nativeUnlockSupported, options} from './modOptions';
import {WallpaperControls} from './WallpaperControls';
import {BackupTools} from './BackupTools';
import {PluralKitSettings} from './PluralKitSettings';
import {CloudModSettings} from './CloudModSettings';
import {ModSupport} from './ModSupport';
import {CustomMods} from './CustomMods';
import {extraCustomization, useExtraCustomization} from './extraCustomization';
import {ExtraCustomizationMenu} from './ExtraCustomizationMenu';
import {RestModeSettings} from './RestModeSettings';
import {DesktopCompanionSettings} from './DesktopCompanionSettings';

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
  const extra = useExtraCustomization();
  const [extraOpen, setExtraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = async (id: ModId) => {
    setSaving(true); setError('');
    try { await modPreferences.setEnabled(id, !enabled[id]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy && !saving && !pkBusy) onClose(); }}>
    <SafeAreaView style={{flex: 1, backgroundColor: T.bg}}>
      <ScrollView contentContainerStyle={{padding: 24, gap: 20}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Text accessibilityRole="header" style={{flex: 1, color: T.text, fontSize: fs(24), fontWeight: '700'}}>sparklecat's mods</Text>
          <Btn variant="ghost" disabled={busy || saving || pkBusy} onPress={onClose}>Done</Btn>
        </View>
        <Text style={{color: T.dim, fontSize: fs(14), lineHeight: fs(21)}}>Make Plural Star your own. Turn features on or off whenever you like.</Text>
        {options.wallpaper && <View>
          <ToggleRow label="Wallpaper" desc="Personalize your app background." value={enabled.wallpaper} disabled={busy || saving || pkBusy}
            onToggle={() => { void toggle('wallpaper'); }} />
          {enabled.wallpaper && <WallpaperControls />}
        </View>}
        {options.storage && <View style={{borderTopWidth: 1, borderColor: T.border, paddingTop: 20}}>
          <ToggleRow label="Storage tools" desc="Back up and restore your app data. Turning this off cancels any pending restore." value={enabled.storage} disabled={busy || saving || pkBusy}
            onToggle={() => { void toggle('storage'); }} />
          {enabled.storage && <BackupTools disabled={pkBusy} onBusy={setBusy} />}
        </View>}
        <ToggleRow label="Allow No speaker" desc="Choose No speaker in chat, polls, and mailbox senders. Polls use one shared No speaker vote." value={enabled.noSpeaker} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('noSpeaker'); }} />
        <ToggleRow label="Archive polls" desc="Move polls out of the main list and restore them later." value={enabled.archivePolls} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('archivePolls'); }} />
        <ToggleRow label="Fix System Chat keyboard position" desc="On Android, let the system position chat when the keyboard opens." value={enabled.chatKeyboardFix} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('chatKeyboardFix'); }} />
        <ToggleRow label="Disable facets" desc="Hide the facets tab and conversion action. Saved facets are kept." value={enabled.disableFacets} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('disableFacets'); }} />
        <ToggleRow label="Single confirmation" desc="Show one confirmation when an action would otherwise ask repeatedly." value={enabled.singleConfirm} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('singleConfirm'); }} />
        <ToggleRow label="Biometric or device unlock" desc={nativeUnlockSupported ? "Use your phone's screen lock when available. Your app password remains available." : "Requires a newer patcher."} value={nativeUnlockSupported && enabled.deviceUnlock} disabled={!nativeUnlockSupported || busy || saving || pkBusy}
          onToggle={() => { void toggle('deviceUnlock'); }} />
        <ToggleRow label="Profile palettes" desc="Choose individual colors for member and system profiles, including shared profiles." value={enabled.profilePalettes} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('profilePalettes'); }} />
        <ToggleRow label="Hide inactive lock icon" desc="Hide the lock icon when app locking is not enabled." value={enabled.hideLockIcon} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('hideLockIcon'); }} />
        <ToggleRow label="Sync mod preferences" desc="Sync mod preferences using your existing cloud or linked-device sync. Enable on each device." value={enabled.syncPreferences} disabled={busy || saving || pkBusy}
          onToggle={() => { void toggle('syncPreferences'); }} />
        <ToggleRow label="Extra Customization" desc="Hide tabs and features, simplify screens, and adjust more colors." value={extra.enabled} disabled={busy || saving || pkBusy}
          onToggle={() => { void extraCustomization.set({...extra, enabled: !extra.enabled}).catch(e => setError(String(e))); }} />
        {extra.enabled && <Btn variant="ghost" disabled={busy || saving || pkBusy} onPress={() => setExtraOpen(true)}>Open Extra Customization</Btn>}
        <RestModeSettings disabled={busy || saving || pkBusy} />
        <PluralKitSettings disabled={busy || saving} onBusy={setPkBusy} />
        {enabled.syncPreferences && <><CloudModSettings disabled={busy || saving || pkBusy} /><DesktopCompanionSettings disabled={busy || saving || pkBusy} /></>}
        <CustomMods disabled={busy || saving || pkBusy} />
        <ModSupport disabled={busy || saving || pkBusy} />
        {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(14)}}>{error}</Text>}
        <Text style={{color: T.muted, fontSize: fs(12)}}>Your choices are saved automatically. Turning a feature off keeps its saved data.</Text>
      </ScrollView>
      {extraOpen && <ExtraCustomizationMenu onClose={() => setExtraOpen(false)} />}
    </SafeAreaView>
  </Modal>;
}
