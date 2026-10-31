import React, {useState} from 'react';
import {Modal, ScrollView, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text} from '../components/AppText';
import {ColorPickerModal} from '../components/ColorPickerModal';
import {Btn, ToggleRow as BaseToggleRow} from '../components/controls';
import {fontScale} from '../theme';
import {options} from './modOptions';
import {useTheme} from '../themeContext';
import {ELEMENT_COLOR_OPTIONS, COLOR_OPTIONS, DEFAULT_EXTRA_CUSTOMIZATION, extraCustomization, TILE_OPTIONS, useExtraCustomization} from './extraCustomization';
import type {ElementColorOption, ColorOption, ExtraCustomization} from './extraCustomization';

const ToggleRow = (props: Omit<React.ComponentProps<typeof BaseToggleRow>, 'desc'>) => <BaseToggleRow {...props} desc="" />;

const TAB_NAMES: Record<string, string> = {members: 'Members', journal: 'Journal', history: 'History'};
const TILE_NAMES: Record<string, string> = {
  planner: 'Planner', retroHistory: 'Past front', statistics: 'Statistics', chat: 'Chat', mailbox: 'Mailbox',
  whiteboard: 'Whiteboard', colors: 'Colors', network: 'Network', polls: 'Polls', systemMap: 'System map',
  customFields: 'Custom fields', systemManager: 'System manager', archive: 'Archive', share: 'Import / export',
  credits: 'Credits', discord: 'Discord', supportPS: 'Support Plural Star',
};
const COLOR_NAMES: Partial<Record<ColorOption, string>> = {
  borderLt: 'Light border', accentBg: 'Accent background', toggleOff: 'Inactive toggle',
  dangerBg: 'Danger background', successBg: 'Success background', infoBg: 'Info background',
};

const ELEMENT_COLOR_NAMES: Record<ElementColorOption, string> = {header: 'Top bar', tabBar: 'Bottom bar', tabActive: 'Selected tab', tabInactive: 'Unselected tabs', hubTile: 'Hub tile', hubTileBorder: 'Hub tile border'};

export function ExtraCustomizationMenu({onClose}: {onClose: () => void}) {
  const T = useTheme(); const fs = fontScale(T);
  const prefs = useExtraCustomization();
  const colorOf = (key: ColorOption) => key === 'canvas' ? ('canvas' in T && typeof T.canvas === 'string' ? T.canvas : T.bg) : T[key];
  const elementColorOf = (key: ElementColorOption) => ({header: T.bg, tabBar: T.surface, tabActive: T.accent, tabInactive: T.dim, hubTile: T.card, hubTileBorder: T.border})[key];
  const [elementPicker, setElementPicker] = useState<ElementColorOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<ColorOption | null>(null);
  const save = async (next: ExtraCustomization) => {
    setBusy(true); setError('');
    try { await extraCustomization.set(next); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const toggle = (key: 'hideHeaderBorder' | 'hideTabBarBorder' | 'hideTabIcons' | 'hideTileIcons' | 'transparentHubTiles' | 'hideHubTileBorders' | 'fullScreenWallpaper' | 'transparentHeader' | 'transparentTabBar' | 'hideTabLabels' | 'hideTileLabels' | 'hideSystemName' | 'hideFrontTitle' | 'hideFrontSort' | 'hideHubTitle'
    | 'hideHubReorder' | 'hideMemberSort' | 'hideMemberGroupFilter' | 'hideMemberTagFilter' | 'hideMemberSearch'
    | 'hideMemberBackToTop' | 'hideJournalTitle' | 'hideJournalTagFilter' | 'hideJournalAuthorFilter' | 'hideHistoryTitle') => {
    void save({...prefs, [key]: !prefs[key]});
  };
  const toggleHidden = (key: 'hiddenTabs' | 'hiddenTiles', id: string) => {
    const hidden = prefs[key].includes(id);
    void save({...prefs, [key]: hidden ? prefs[key].filter(item => item !== id) : [...prefs[key], id]});
  };
  const choices = <K extends 'hubColumns' | 'tileRadius' | 'wallpaperDim' | 'wallpaperFit'>(key: K, label: string, values: ReadonlyArray<[string, ExtraCustomization[K]]>) => <View>
    <Text style={{color: T.text, fontSize: fs(14)}}>{label}</Text>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{values.map(([name, value]) => <Btn key={name} variant={prefs[key] === value ? 'solid' : 'ghost'} disabled={busy} onPress={() => { void save({...prefs, [key]: value}); }}>{name}</Btn>)}</View>
  </View>;
  const section = (title: string) => <Text accessibilityRole="header" style={{color: T.text, fontWeight: '700', fontSize: fs(17), marginTop: 12}}>{title}</Text>;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy && !picker && !elementPicker) onClose(); }}>
    <SafeAreaView style={{flex: 1, backgroundColor: T.bg}}>
      <ScrollView contentContainerStyle={{padding: 24, gap: 14}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Text accessibilityRole="header" style={{flex: 1, color: T.text, fontSize: fs(24), fontWeight: '700'}}>Extra Customization</Text>
          <Btn variant="ghost" disabled={busy} onPress={onClose}>Done</Btn>
        </View>
        <Text style={{color: T.dim, fontSize: fs(14)}}>Hide what you do not use and adjust more of the app's colors.</Text>
        {section('Background and bars')}
        {options.wallpaper && <ToggleRow label="Extend wallpaper across the whole screen" value={prefs.fullScreenWallpaper} disabled={busy} onToggle={() => toggle('fullScreenWallpaper')} />}
        <ToggleRow label="Transparent top bar" value={prefs.transparentHeader} disabled={busy} onToggle={() => toggle('transparentHeader')} />
        <ToggleRow label="Transparent bottom bar" value={prefs.transparentTabBar} disabled={busy} onToggle={() => toggle('transparentTabBar')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Extend the wallpaper and make the bars transparent to see it behind them.</Text>
        <ToggleRow label="Show top bar border" value={!prefs.hideHeaderBorder} disabled={busy} onToggle={() => toggle('hideHeaderBorder')} />
        <ToggleRow label="Show bottom bar border" value={!prefs.hideTabBarBorder} disabled={busy} onToggle={() => toggle('hideTabBarBorder')} />
        {options.wallpaper && choices('wallpaperDim', 'Wallpaper dimming', [['None', 0], ['25%', 0.25], ['50%', 0.5], ['Default', 0.78], ['90%', 0.9]])}
        {options.wallpaper && choices('wallpaperFit', 'Wallpaper fit', [['Fill', 'cover'], ['Fit', 'contain'], ['Stretch', 'stretch']])}
        {section('Navigation')}
        {(['members', 'journal', 'history'] as const).map(id =>
          <ToggleRow key={id} label={`Show ${TAB_NAMES[id]} tab`} value={!prefs.hiddenTabs.includes(id)} disabled={busy}
            onToggle={() => toggleHidden('hiddenTabs', id)} />)}
        <ToggleRow label="Show tab labels" value={!prefs.hideTabLabels} disabled={busy} onToggle={() => toggle('hideTabLabels')} />
        <ToggleRow label="Show tab icons" value={!prefs.hideTabIcons} disabled={busy} onToggle={() => toggle('hideTabIcons')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Icons stay visible if labels are hidden.</Text>
        {section('Screens')}
        <ToggleRow label="Show system name in header" value={!prefs.hideSystemName} disabled={busy} onToggle={() => toggle('hideSystemName')} />
        <ToggleRow label="Show front title" value={!prefs.hideFrontTitle} disabled={busy} onToggle={() => toggle('hideFrontTitle')} />
        <ToggleRow label="Show front sorting" value={!prefs.hideFrontSort} disabled={busy} onToggle={() => toggle('hideFrontSort')} />
        <ToggleRow label="Show hub title" value={!prefs.hideHubTitle} disabled={busy} onToggle={() => toggle('hideHubTitle')} />
        <ToggleRow label="Show hub reorder control" value={!prefs.hideHubReorder} disabled={busy} onToggle={() => toggle('hideHubReorder')} />
        <ToggleRow label="Show hub tile labels" value={!prefs.hideTileLabels} disabled={busy} onToggle={() => toggle('hideTileLabels')} />
        <ToggleRow label="Show hub tile icons" value={!prefs.hideTileIcons} disabled={busy} onToggle={() => toggle('hideTileIcons')} />
        <ToggleRow label="Transparent hub tiles" value={prefs.transparentHubTiles} disabled={busy} onToggle={() => toggle('transparentHubTiles')} />
        <ToggleRow label="Show hub tile borders" value={!prefs.hideHubTileBorders} disabled={busy} onToggle={() => toggle('hideHubTileBorders')} />
        {choices('hubColumns', 'Hub columns', [['Automatic', 0], ['1', 1], ['2', 2], ['3', 3]])}
        {choices('tileRadius', 'Hub tile corners', [['Square', 0], ['Slight', 8], ['Default', 14], ['Round', 24]])}
        {section('Members')}
        <ToggleRow label="Show sorting" value={!prefs.hideMemberSort} disabled={busy} onToggle={() => toggle('hideMemberSort')} />
        <ToggleRow label="Show group filter" value={!prefs.hideMemberGroupFilter} disabled={busy} onToggle={() => toggle('hideMemberGroupFilter')} />
        <ToggleRow label="Show tag filter" value={!prefs.hideMemberTagFilter} disabled={busy} onToggle={() => toggle('hideMemberTagFilter')} />
        <ToggleRow label="Show search" value={!prefs.hideMemberSearch} disabled={busy} onToggle={() => toggle('hideMemberSearch')} />
        <ToggleRow label="Show back-to-top button" value={!prefs.hideMemberBackToTop} disabled={busy} onToggle={() => toggle('hideMemberBackToTop')} />
        {section('Journal')}
        <ToggleRow label="Show title" value={!prefs.hideJournalTitle} disabled={busy} onToggle={() => toggle('hideJournalTitle')} />
        <ToggleRow label="Show tag filter" value={!prefs.hideJournalTagFilter} disabled={busy} onToggle={() => toggle('hideJournalTagFilter')} />
        <ToggleRow label="Show author filter" value={!prefs.hideJournalAuthorFilter} disabled={busy} onToggle={() => toggle('hideJournalAuthorFilter')} />
        {section('History')}
        <ToggleRow label="Show title" value={!prefs.hideHistoryTitle} disabled={busy} onToggle={() => toggle('hideHistoryTitle')} />
        {section('Hub features')}
        {TILE_OPTIONS.map(id => <ToggleRow key={id} label={TILE_NAMES[id]} value={!prefs.hiddenTiles.includes(id)} disabled={busy}
          onToggle={() => toggleHidden('hiddenTiles', id)} />)}
        {section('Individual colors')}
        {ELEMENT_COLOR_OPTIONS.map(key => <TouchableOpacity key={key} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Edit ${ELEMENT_COLOR_NAMES[key]} color`} onPress={() => setElementPicker(key)}
          style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12}}>
          <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: prefs.elementColors[key] || elementColorOf(key)}} />
          <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>{ELEMENT_COLOR_NAMES[key]}</Text>
          <Text style={{color: T.dim, fontSize: fs(12)}}>{prefs.elementColors[key] || 'Default'}</Text>
        </TouchableOpacity>)}
        {section('More colors')}
        <Text style={{color: T.dim, fontSize: fs(13)}}>Base, accent, and text colors are in the regular palette editor.</Text>
        {COLOR_OPTIONS.map(key => <TouchableOpacity key={key} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Edit ${COLOR_NAMES[key] || key} color`} onPress={() => setPicker(key)}
          style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12}}>
          <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: prefs.colors[key] || colorOf(key)}} />
          <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>{COLOR_NAMES[key] || key[0].toUpperCase() + key.slice(1)}</Text>
          <Text style={{color: T.dim, fontSize: fs(12)}}>{prefs.colors[key] || 'Default'}</Text>
        </TouchableOpacity>)}
        <Btn variant="ghost" disabled={busy} onPress={() => { void save({...DEFAULT_EXTRA_CUSTOMIZATION, enabled: true}); }}>Reset extra customization</Btn>
        {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(14)}}>{error}</Text>}
      </ScrollView>
      {elementPicker && <ColorPickerModal visible title={`${ELEMENT_COLOR_NAMES[elementPicker]} color`}
        value={prefs.elementColors[elementPicker] || elementColorOf(elementPicker)} onClose={() => setElementPicker(null)}
        onSave={hex => { void save({...prefs, elementColors: {...prefs.elementColors, [elementPicker]: hex}}); setElementPicker(null); }}
        onClear={() => { const elementColors = {...prefs.elementColors}; delete elementColors[elementPicker]; void save({...prefs, elementColors}); setElementPicker(null); }} clearLabel="Use default" />}
      {picker && <ColorPickerModal visible title={`${COLOR_NAMES[picker] || picker[0].toUpperCase() + picker.slice(1)} color`}
        value={prefs.colors[picker] || colorOf(picker)} onClose={() => setPicker(null)}
        onSave={hex => { void save({...prefs, colors: {...prefs.colors, [picker]: hex}}); setPicker(null); }}
        onClear={() => { const colors = {...prefs.colors}; delete colors[picker]; void save({...prefs, colors}); setPicker(null); }} clearLabel="Use default" />}
    </SafeAreaView>
  </Modal>;
}
