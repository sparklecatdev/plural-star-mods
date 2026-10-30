import React, {useEffect, useRef, useState} from 'react';
import {AppState, Linking, Modal, Pressable, Text, View} from 'react-native';
import {useUpdateCheck} from './updateCheck';

// Match the patcher's palette, independent of the selected Plural Star theme.
const colors = {card: '#241B33', ink: '#FFF6FF', muted: '#C5B9D4', accent: '#E5B5FF', button: '#5C417D'};
export function PatchUpdatePrompt({enabled}: {enabled: boolean}) {
  const update = useUpdateCheck();
  const shown = useRef(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!enabled || !foreground || shown.current || update.checking || update.error || !update.available) return;
    shown.current = true;
    setVisible(true);
  }, [enabled, foreground, update.checking, update.error, update.available]);
  if (!visible || !enabled || !foreground) return null;
  return <Modal transparent animationType="fade" visible onRequestClose={() => setVisible(false)}>
    <View style={{flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#14101FCC'}}>
      <View accessibilityViewIsModal style={{backgroundColor: colors.card, borderRadius: 20, padding: 24, gap: 16}}>
        <Text accessibilityRole="header" style={{color: colors.accent, fontSize: 21, fontWeight: '700'}}>Patches available</Text>
        <Text style={{color: colors.ink, fontSize: 15, lineHeight: 22}}>Patch {update.available} is available. Open the patcher to prepare and install the update.</Text>
        {!!error && <Text accessibilityRole="alert" style={{color: colors.muted, fontSize: 14}}>{error}</Text>}
        <Pressable accessibilityRole="button" onPress={() => {
          void Linking.openURL('sparklecatmods://patches').then(() => setVisible(false)).catch(() => {
            setError('Could not open the patcher. Install or open sparklecat’s plural star mods, then choose Update installed mods.');
          });
        }} style={{backgroundColor: colors.button, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 12}}>
          <Text style={{color: colors.ink, fontSize: 15, fontWeight: '600'}}>Open patcher</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{minHeight: 48, alignItems: 'center', justifyContent: 'center'}}>
          <Text style={{color: colors.muted, fontSize: 15}}>Later</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
