import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {RichText} from '../components/MarkdownRenderer';
import {useTheme} from '../themeContext';
import {useExtraCustomization} from './extraCustomization';
import {sparkleCss} from './sparkleScriptCore';
import {parseFieldTables} from './fieldTablesCore';

const viewKeys = new Set(['backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight']);
const textKeys = new Set(['color', 'fontSize', 'fontWeight', 'fontStyle', 'textAlign', 'textDecorationLine']);
function styles(css: string) {
  const view: Record<string, string | number> = {}; const text: Record<string, string | number> = {};
  for (const declaration of css.split(';')) {
    try {
      const parsed = sparkleCss(declaration);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 500)) continue;
        if ((key === 'color' || key === 'backgroundColor' || key === 'borderColor') && (typeof value !== 'string' || !/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value))) continue;
        if (key === 'fontWeight' && !/^(normal|bold|[1-9]00)$/.test(String(value))) continue;
        if (key === 'fontStyle' && value !== 'normal' && value !== 'italic') continue;
        if (key === 'textAlign' && !/^(left|right|center|justify|auto)$/.test(String(value))) continue;
        if (key === 'textDecorationLine' && !/^(none|underline|line-through|underline line-through)$/.test(String(value))) continue;
        if (viewKeys.has(key)) view[key] = value;
        if (textKeys.has(key)) text[key] = value;
      }
    } catch { /* Ignore unsupported declarations, not the whole table. */ }
  }
  return {view, text};
}
export function FieldRichText(props: React.ComponentProps<typeof RichText>) {
  const prefs = useExtraCustomization(); const theme = useTheme();
  const parts = React.useMemo(() => prefs.enabled && prefs.fieldTables ? parseFieldTables(props.text) : null, [prefs.enabled, prefs.fieldTables, props.text]);
  if (!parts) return <RichText {...props} />;
  return <View>{parts.map((part, index) => part.kind === 'text' ? <RichText key={index} {...props} text={part.text} /> :
    <ScrollView key={index} horizontal><View>{part.rows.map((row, rowIndex) => <View key={rowIndex} style={{flexDirection: 'row'}}>{row.map((cell, cellIndex) => {
      const css = styles(cell.css);
      return <View key={cellIndex} style={[{width: 140, padding: 8, borderWidth: 1, borderColor: theme.border}, css.view as any]}><Text style={[{color: theme.text, fontWeight: cell.header ? 'bold' : 'normal'}, css.text as any]}>{cell.text}</Text></View>;
    })}</View>)}</View></ScrollView>)}</View>;
}
