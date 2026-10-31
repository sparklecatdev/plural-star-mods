import {useCallback, useEffect, useRef, useState} from 'react';
import {NativeModules} from 'react-native';

type DeviceUnlockModule = {available(): Promise<boolean>; authenticate(): Promise<boolean>};
const deviceUnlock = NativeModules.SparklecatDeviceUnlock as DeviceUnlockModule | undefined;

export function useDeviceUnlock(enabled: boolean, onUnlock: () => void) {
  const [available, setAvailable] = useState(false);
  const onUnlockRef = useRef(onUnlock);
  const prompted = useRef(false);
  const busy = useRef(false);
  onUnlockRef.current = onUnlock;
  const prompt = useCallback(async () => {
    if (!deviceUnlock || busy.current) return;
    busy.current = true;
    try { if (await deviceUnlock.authenticate()) onUnlockRef.current(); }
    catch { /* Password unlock remains available. */ }
    finally { busy.current = false; }
  }, []);
  useEffect(() => {
    if (!enabled || !deviceUnlock) { prompted.current = false; setAvailable(false); return; }
    let active = true;
    deviceUnlock.available().then(ok => {
      if (!active) return;
      setAvailable(ok);
      if (ok && !prompted.current) { prompted.current = true; void prompt(); }
    }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, [enabled, prompt]);
  return {available, prompt};
}
