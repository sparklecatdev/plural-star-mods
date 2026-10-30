import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, ActivityIndicator, Animated, Button, Easing, StyleSheet, Text, TextInput, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {modPreferences} from './modPreferences';
import {recovery, recoverBeforeStart, restoreQueue, retryStoragePreparation} from './storageSnapshot';
import {setToolsOpen, waitForStorageIdle} from './toolsState';
import {updateChecker} from './updateCheck';

function LaunchAnimation({onFinished}: {onFinished: () => void}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    let stopped = false;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().catch(() => true).then(reduceMotion => {
      if (stopped) return;
      if (reduceMotion) { onFinished(); return; }
      animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {toValue: 1, duration: 180, useNativeDriver: true}),
          Animated.timing(scale, {toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
        ]),
        Animated.delay(100),
        Animated.timing(opacity, {toValue: 0, duration: 220, useNativeDriver: true}),
      ]);
      animation.start(({finished}) => { if (finished && !stopped) onFinished(); });
    });
    return () => { stopped = true; animation?.stop(); };
  }, [opacity, scale, onFinished]);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.launch}>
    <Animated.View style={{opacity, transform: [{scale}]}}>
      <Text style={styles.cat}>✦ ฅ^•ﻌ•^ฅ</Text>
    </Animated.View>
  </View>;
}

export default function ModsRoot() {
  const [ready, setReady] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const [error, setError] = useState('');
  const [gatePassword, setGatePassword] = useState<string | null>(null);
  const [unlockInput, setUnlockInput] = useState('');
  const [working, setWorking] = useState(false);
  const finishAnimation = useCallback(() => setAnimationDone(true), []);
  const prepare = useCallback(async (retry = false) => {
    setWorking(true); setError('');
    try {
      await waitForStorageIdle();
      await (retry ? retryStoragePreparation() : recoverBeforeStart());
      await modPreferences.load();
      const raw = await AsyncStorage.getItem('ps:settings');
      const password = raw ? JSON.parse(raw)?.appLockPassword : undefined;
      setGatePassword(typeof password === 'string' && password ? password : null);
      setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setWorking(false); }
  }, []);
  useEffect(() => { void prepare(); }, [prepare]);
  useEffect(() => { if (ready && gatePassword === null && !error) void updateChecker.check(); }, [ready, gatePassword, error]);
  setToolsOpen(!ready || gatePassword !== null || !!error);

  let content: React.ReactNode;
  if (error && !gatePassword) content = <View style={styles.center}>
    <Text style={styles.heading}>Unable to open Plural Star</Text>
    <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
    <Button title="Try again" disabled={working} onPress={() => { void prepare(true); }} />
    <Button title="Cancel pending restore" disabled={working} onPress={() => {
      setWorking(true);
      recovery.recover().then(() => restoreQueue.cancel()).then(() => prepare(true))
        .catch(e => { setError(String(e)); setWorking(false); });
    }} />
  </View>;
  else if (gatePassword !== null) content = <View style={styles.center}>
    <Text style={styles.heading}>Unlock Plural Star</Text>
    <TextInput accessibilityLabel="App password" secureTextEntry autoCapitalize="none" autoCorrect={false}
      value={unlockInput} onChangeText={setUnlockInput} style={styles.input} />
    <Button title="Unlock" onPress={() => {
      if (unlockInput === gatePassword) { setUnlockInput(''); setGatePassword(null); setError(''); }
      else setError('Incorrect app password.');
    }} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
  else if (ready) {
    // Recovery and queued restores finish before upstream singletons can start.
    const App = require('../../App').default;
    content = <App />;
  } else content = <View style={styles.center}><ActivityIndicator color="#E5B5FF" /></View>;

  return <View style={styles.root}>
    {content}
    {!animationDone && <LaunchAnimation onFinished={finishAnimation} />}
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#14101F'},
  launch: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#14101F', alignItems: 'center', justifyContent: 'center'},
  cat: {fontSize: 42, color: '#E5B5FF'},
  center: {flex: 1, backgroundColor: '#14101F', padding: 28, justifyContent: 'center', gap: 16},
  heading: {fontSize: 24, color: '#FFF6FF'},
  error: {fontSize: 16, color: '#FFB4C8'},
  input: {color: '#FFF6FF', backgroundColor: '#2A203B', padding: 14, borderRadius: 12},
});
