import React, {useEffect, useRef, useState} from 'react';
import {AppState, Linking, Modal, Pressable, ScrollView, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useUpdateCheck} from './updateCheck';
import {payloadVersion} from './modOptions';
import {changelog} from './changelog';

// Match the patcher's palette, independent of the selected Plural Star theme.
const colors = {card: '#241B33', ink: '#FFF6FF', muted: '#C5B9D4', accent: '#E5B5FF', button: '#5C417D'};
export function PatchUpdatePrompt({enabled}: {enabled: boolean}) {
  const update = useUpdateCheck();
  const shown = useRef(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [newVersion, setNewVersion] = useState<boolean | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    void AsyncStorage.getItem('sparklecat:changelog').then(version => {
      if (!stopped) setNewVersion(version !== payloadVersion);
    }).catch(() => { if (!stopped) setNewVersion(true); });
    return () => { stopped = true; };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !foreground || newVersion !== false || shown.current || update.checking || update.error || !update.available) return;
    shown.current = true;
    setVisible(true);
  }, [enabled, foreground, newVersion, update.checking, update.error, update.available]);
  const dismiss = () => {
    if (newVersion) {
      setNewVersion(false);
      void AsyncStorage.setItem('sparklecat:changelog', payloadVersion).catch(() => { /* Retry the notice next launch if storage is unavailable. */ });
    } else setVisible(false);
  };
  if ((!visible && !newVersion) || !enabled || !foreground) return null;
  return <Modal transparent animationType="fade" visible onRequestClose={dismiss}>
    <View style={{flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#14101FCC'}}>
      <View accessibilityViewIsModal style={{backgroundColor: colors.card, borderRadius: 20, padding: 24, gap: 16, maxHeight: '90%'}}>
        <Text accessibilityRole="header" style={{color: colors.accent, fontSize: 21, fontWeight: '700'}}>{newVersion ? `What's new · patches ${payloadVersion}` : 'Patches available'}</Text>
        <ScrollView style={{flexShrink: 1}}>
          <Text selectable style={{color: colors.ink, fontSize: 15, lineHeight: 22}}>{newVersion ? changelog : `Patch ${update.available} is available. Open the patcher to prepare and install the update.\n\n${update.release?.notes || 'Open the patcher for release details.'}`}</Text>
        </ScrollView>
        {!!error && <Text accessibilityRole="alert" style={{color: colors.muted, fontSize: 14}}>{error}</Text>}
        {!newVersion && <Pressable accessibilityRole="button" onPress={() => {
          void Linking.openURL('sparklecatmods://patches').then(() => setVisible(false)).catch(() => {
            setError('Could not open the patcher. Install or open sparklecat’s plural star mods, then choose Update installed mods.');
          });
        }} style={{backgroundColor: colors.button, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 12}}>
          <Text style={{color: colors.ink, fontSize: 15, fontWeight: '600'}}>Open patcher</Text>
        </Pressable>}
        <Pressable accessibilityRole="button" onPress={dismiss} style={{minHeight: 48, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{color: colors.muted, fontSize: 15}}>{newVersion ? 'Done' : 'Later'}</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
