import React from 'react';
import {View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Text, TextInput} from '../components/AppText';
import {ToggleRow} from '../components/controls';
import {useTheme} from '../themeContext';
import {fontScale} from '../theme';

export const PluralKitSettings = ({enabled, token, onToggle, onToken}: {
  enabled: boolean; token: string; onToggle: () => void; onToken: (token: string) => void;
}) => {
  const T = useTheme();
  const fs = fontScale(T);
  const {t} = useTranslation();
  return <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 14, marginTop: 14}}>
    <ToggleRow label={t('modal.pkFrontSync', {defaultValue: 'PluralKit Front Sync'})}
      desc={t('modal.pkFrontSyncDesc', {defaultValue: 'Mirror primary front changes to your PluralKit system. Import your PluralKit members first.'})}
      value={enabled} onToggle={onToggle} />
    {enabled && <>
      <TextInput value={token} onChangeText={onToken} secureTextEntry autoCapitalize="none" autoCorrect={false}
        placeholder={t('share.pkTokenPlaceholder')} accessibilityLabel={t('share.pkTokenPlaceholder')}
        placeholderTextColor={T.muted}
        style={{backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, marginTop: 10, fontSize: fs(13)}} />
      <Text style={{fontSize: fs(11), color: T.muted, marginTop: 6}}>{t('share.pkTokenHint')}</Text>
    </>}
  </View>;
};
