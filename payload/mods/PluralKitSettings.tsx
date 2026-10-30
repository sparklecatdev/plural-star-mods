import React, {useRef, useState} from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../components/AppText';
import {ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';
import {useAppStore} from '../store/appStore';
import {saveAppSettings} from '../store/actions';
import type {AppSettings} from '../model/types';

export const PluralKitSettings = ({disabled, onBusy}: {
  disabled: boolean; onBusy: (busy: boolean) => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  const enabled = useAppStore(s => !!s.appSettings.pkFrontSyncEnabled);
  const [token, setToken] = useState(() => useAppStore.getState().appSettings.pkToken || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(Promise.resolve());
  const count = useRef(0);
  const save = (patch: Partial<AppSettings>) => {
    count.current++;
    setSaving(true); onBusy(true); setError('');
    pending.current = pending.current.then(() => saveAppSettings({...useAppStore.getState().appSettings, ...patch}))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (--count.current === 0) { setSaving(false); onBusy(false); } });
  };
  return <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
    <ToggleRow label={t('modal.pkFrontSync', {defaultValue: 'PluralKit Front Sync'})}
      desc={t('modal.pkFrontSyncDesc', {defaultValue: 'Mirror primary front changes to your PluralKit system. Import your PluralKit members first.'})}
      value={enabled} disabled={disabled || saving} onToggle={() => save({pkFrontSyncEnabled: !enabled})} />
    {enabled && <>
      <TextInput value={token} onChangeText={value => { setToken(value); save({pkToken: value.trim() || undefined}); }}
        editable={!disabled} secureTextEntry autoCapitalize="none" autoCorrect={false}
        placeholder={t('share.pkTokenPlaceholder')} accessibilityLabel={t('share.pkTokenPlaceholder')}
        placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, marginTop: 10, fontSize: fs(13)}} />
      <Text style={{fontSize: fs(11), color: T.muted, marginTop: 6}}>{t('share.pkTokenHint')}</Text>
    </>}
    {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(13)}}>{error}</Text>}
  </View>;
};
