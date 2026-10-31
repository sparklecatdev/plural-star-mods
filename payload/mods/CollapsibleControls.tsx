import React, {useState} from 'react';
import {TouchableOpacity, View} from 'react-native';
import {Text} from '../components/AppText';
import {fontScale} from '../theme';
import {useTheme} from '../themeContext';
import {useExtraCustomization} from './extraCustomization';

export function CollapsibleControls({children, label = 'controls'}: {children: React.ReactNode; label?: string}) {
  const extra = useExtraCustomization();
  const T = useTheme();
  const fs = fontScale(T);
  const [expanded, setExpanded] = useState(false);
  if (!extra.enabled || !extra.autoCollapseControls) return <>{children}</>;
  return <View>
    <TouchableOpacity onPress={() => setExpanded(value => !value)} accessibilityRole="button"
      accessibilityState={{expanded}} accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${label}`}
      style={{alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6,
        borderRadius: 8, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface}}>
      <Text style={{color: T.accent, fontSize: fs(12)}}>{expanded ? 'Hide' : 'Show'} {label}</Text>
    </TouchableOpacity>
    <View style={{display: expanded ? 'flex' : 'none'}}>{children}</View>
  </View>;
}
