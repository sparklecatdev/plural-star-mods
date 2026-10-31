import React, {useState} from 'react';
import {NativeModules, View} from 'react-native';
import {Text} from '../components/AppText';
import {Btn, Field, ToggleRow} from '../components/controls';
import {validRestMode} from '../model/restMode';
import {saveAppSettings} from '../store/actions';
import {useAppStore} from '../store/appStore';
import {useTheme} from '../themeContext';

export function RestModeSettings({disabled}: {disabled: boolean}) {
  const T = useTheme();
  const settings = useAppStore(s => s.appSettings);
  const rest = settings.restMode;
  const [start, setStart] = useState(rest?.start ?? '22:00');
  const [end, setEnd] = useState(rest?.end ?? '08:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (enabled: boolean) => {
    const next = {enabled, start: start.trim(), end: end.trim()};
    if (!validRestMode(next)) { setError('Enter two different times in 24-hour HH:MM format.'); return; }
    setBusy(true); setError('');
    try { await saveAppSettings({...useAppStore.getState().appSettings, restMode: next}); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <View>
    <ToggleRow label="Notification rest mode" desc={NativeModules.RestMode ? "Pause notifications during scheduled quiet hours." : "Requires an updated patcher and a newly prepared app."} value={rest?.enabled === true} disabled={disabled || busy || !NativeModules.RestMode} onToggle={() => { void save(!rest?.enabled); }} />
    {rest?.enabled && <View>
      <Field label="Start" value={start} onChange={setStart} placeholder="22:00" />
      <Field label="End" value={end} onChange={setEnd} placeholder="08:00" />
      <Btn disabled={disabled || busy} onPress={() => { void save(true); }}>Save schedule</Btn>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger}}>{error}</Text>}
  </View>;
}
