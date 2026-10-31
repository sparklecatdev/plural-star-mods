import {pickAndSaveImage} from '../utils/imagePicker';
import {saveBioImageFromUri} from '../utils/mediaUtils';
import React, {useRef, useState} from 'react';
import {Image, Modal, PanResponder, ScrollView, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text} from '../components/AppText';
import {ColorPickerModal} from '../components/ColorPickerModal';
import {Btn, ToggleRow as BaseToggleRow} from '../components/controls';
import {fontScale, tierAccent} from '../theme';
import {options} from './modOptions';
import {modPreferences, useModPreferences} from './modPreferences';
import {useTheme} from '../themeContext';
import {FRONT_TIERS, CARD_AREAS, ELEMENT_COLOR_OPTIONS, COLOR_OPTIONS, DEFAULT_EXTRA_CUSTOMIZATION, extraCustomization, TILE_OPTIONS, TAB_OPTIONS, NAV_OPTIONS, useExtraCustomization} from './extraCustomization';
import type {FrontTierOption, CardArea, CardAppearance, ElementColorOption, ColorOption, ExtraCustomization, NavigationOption} from './extraCustomization';

const ToggleRow = (props: Omit<React.ComponentProps<typeof BaseToggleRow>, 'desc'>) => <BaseToggleRow {...props} desc="" />;

const FRONT_TIER_NAMES: Record<FrontTierOption, string> = {primary: 'Primary front', coFront: 'Co-front', coConscious: 'Co-conscious'};

const TAB_NAMES: Record<string, string> = {front: 'Front', hub: 'Hub', members: 'Members', journal: 'Journal', history: 'History'};
const TILE_NAMES: Record<string, string> = {
  ...TAB_NAMES,
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

function Section({title, children}: {title: string; children: React.ReactNode}) {
  const T = useTheme(); const fs = fontScale(T);
  const [expanded, setExpanded] = useState(true);
  return <View style={{gap: 10}}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded}} onPress={() => setExpanded(!expanded)}
      style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: T.border}}>
      <Text style={{flex: 1, color: T.text, fontWeight: '700', fontSize: fs(17)}}>{title}</Text>
      <Text style={{color: T.dim}}>{expanded ? '−' : '+'}</Text>
    </TouchableOpacity>
    {expanded && <View style={{gap: 12}}>{children}</View>}
  </View>;
}

function OpacitySlider({value, disabled, onChange}: {value: number; disabled: boolean; onChange: (value: number) => void}) {
  const T = useTheme();
  const [draft, setDraft] = useState<number | null>(null);
  const width = useRef(0); const origin = useRef(0); const current = useRef(value);
  const props = useRef({disabled, onChange}); props.current = {disabled, onChange};
  const update = (x: number) => {
    if (width.current <= 0) return;
    current.current = Math.max(0, Math.min(100, Math.round(x / width.current * 100)));
    setDraft(current.current);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !props.current.disabled,
    onMoveShouldSetPanResponder: () => !props.current.disabled,
    onPanResponderGrant: e => { origin.current = e.nativeEvent.pageX - e.nativeEvent.locationX; update(e.nativeEvent.locationX); },
    onPanResponderMove: e => update(e.nativeEvent.pageX - origin.current),
    onPanResponderRelease: () => { props.current.onChange(current.current); setDraft(null); },
    onPanResponderTerminate: () => setDraft(null),
  })).current;
  const shown = draft ?? value;
  return <View accessibilityRole="adjustable" accessibilityLabel="Sheet opacity" accessibilityValue={{min: 0, max: 100, now: shown, text: `${shown}%`}}
    accessibilityState={{disabled}} accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
    onAccessibilityAction={event => { if (!disabled) onChange(Math.max(0, Math.min(100, value + (event.nativeEvent.actionName === 'increment' ? 5 : -5)))); }}>
    <Text style={{color: T.text}}>Sheet opacity: {shown}%</Text>
    <View {...pan.panHandlers} onLayout={event => { width.current = event.nativeEvent.layout.width; }} style={{height: 44, justifyContent: 'center'}}>
      <View style={{height: 6, borderRadius: 3, backgroundColor: T.border}} />
      <View pointerEvents="none" style={{position: 'absolute', left: `${shown}%`, marginLeft: -9, width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent}} />
    </View>
  </View>;
}

export function ExtraCustomizationMenu({onClose}: {onClose: () => void}) {
  const T = useTheme(); const fs = fontScale(T);
  const prefs = useExtraCustomization();
  const enabled = useModPreferences();
  const colorOf = (key: ColorOption) => key === 'canvas' ? ('canvas' in T && typeof T.canvas === 'string' ? T.canvas : T.bg) : T[key];
  const elementColorOf = (key: ElementColorOption) => ({header: T.bg, tabBar: T.surface, tabActive: T.accent, tabInactive: T.dim, hubTile: T.card, hubTileBorder: T.border})[key];
  const [navigationPicker, setNavigationPicker] = useState<number | null>(null);
  const [tierPicker, setTierPicker] = useState<FrontTierOption | null>(null);
  const [tierDrafts, setTierDrafts] = useState(prefs.frontTierNames);
  const [elementPicker, setElementPicker] = useState<ElementColorOption | null>(null);
  const [cardPicker, setCardPicker] = useState<{area: CardArea; key: 'color' | 'borderColor'} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<ColorOption | null>(null);
  const save = async (next: ExtraCustomization) => {
    setBusy(true); setError('');
    try { await extraCustomization.set(next); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const toggle = (key: 'blankStartPage' | 'transparentAllCards' | 'minimalHubIcons' | 'autoCollapseControls' | 'hideHeaderBorder' | 'hideTabBarBorder' | 'hideTabIcons' | 'hideTileIcons' | 'transparentHubTiles' | 'hideHubTileBorders' | 'fullScreenWallpaper' | 'transparentHeader' | 'transparentTabBar' | 'hideTabLabels' | 'hideTileLabels' | 'hideSystemName' | 'hideFrontTitle' | 'hideFrontSort' | 'hideHubTitle'
    | 'hideHubReorder' | 'hideMemberSort' | 'hideMemberGroupFilter' | 'hideMemberTagFilter' | 'hideMemberSearch'
    | 'hideMemberBackToTop' | 'hideJournalTitle' | 'hideJournalTagFilter' | 'hideJournalAuthorFilter' | 'hideHistoryTitle') => {
    void save({...prefs, [key]: !prefs[key]});
  };
  const toggleHidden = (key: 'hiddenTabs' | 'hiddenTiles', id: string) => {
    const hidden = prefs[key].includes(id);
    void save({...prefs, [key]: hidden ? prefs[key].filter(item => item !== id) : [...prefs[key], id]});
  };
  const updateCard = (area: CardArea, update: Partial<CardAppearance>) => {
    const current = prefs.cards[area] || {transparent: false, hideBorder: false, radius: null, padding: null};
    void save({...prefs, cards: {...prefs.cards, [area]: {...current, ...update}}});
  };
  const choices = <K extends 'hubColumns' | 'tileRadius' | 'wallpaperDim' | 'wallpaperFit'>(key: K, label: string, values: ReadonlyArray<[string, ExtraCustomization[K]]>) => <View>
    <Text style={{color: T.text, fontSize: fs(14)}}>{label}</Text>
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{values.map(([name, value]) => <Btn key={name} variant={prefs[key] === value ? 'solid' : 'ghost'} disabled={busy} onPress={() => { void save({...prefs, [key]: value}); }}>{name}</Btn>)}</View>
  </View>;
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy && !picker && !elementPicker && !cardPicker && !tierPicker) onClose(); }}>
    <SafeAreaView style={{flex: 1, backgroundColor: T.bg}}>
      <ScrollView contentContainerStyle={{padding: 24, gap: 14}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Text accessibilityRole="header" style={{flex: 1, color: T.text, fontSize: fs(24), fontWeight: '700'}}>Extra Customization</Text>
          <Btn variant="ghost" disabled={busy} onPress={onClose}>Done</Btn>
        </View>
        <Text style={{color: T.dim, fontSize: fs(14)}}>Hide what you do not use and adjust more of the app's colors.</Text>
        <Section title="Screen controls">
        <BaseToggleRow label="Auto-collapse page controls (experimental)" desc="Collapse sorting, filtering, and front note controls until opened." value={prefs.autoCollapseControls} disabled={busy} onToggle={() => toggle('autoCollapseControls')} />
        </Section>
        <Section title="Background and bars">
        {options.wallpaper && <ToggleRow label="Extend wallpaper across the whole screen" value={prefs.fullScreenWallpaper} disabled={busy} onToggle={() => toggle('fullScreenWallpaper')} />}
        <ToggleRow label="Transparent top bar" value={prefs.transparentHeader} disabled={busy} onToggle={() => toggle('transparentHeader')} />
        <ToggleRow label="Transparent bottom bar" value={prefs.transparentTabBar} disabled={busy} onToggle={() => toggle('transparentTabBar')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Extend the wallpaper and make the bars transparent to see it behind them.</Text>
        <ToggleRow label="Show top bar border" value={!prefs.hideHeaderBorder} disabled={busy} onToggle={() => toggle('hideHeaderBorder')} />
        <ToggleRow label="Show bottom bar border" value={!prefs.hideTabBarBorder} disabled={busy} onToggle={() => toggle('hideTabBarBorder')} />
        {options.wallpaper && choices('wallpaperDim', 'Wallpaper dimming', [['None', 0], ['25%', 0.25], ['50%', 0.5], ['Default', 0.78], ['90%', 0.9]])}
        {options.wallpaper && choices('wallpaperFit', 'Wallpaper fit', [['Fill', 'cover'], ['Fit', 'contain'], ['Stretch', 'stretch']])}
        </Section>
        <Section title="Navigation">
        <BaseToggleRow label="Blank first page" desc="Open to an empty page and add it as the first navigation tab." value={prefs.blankStartPage} disabled={busy} onToggle={() => toggle('blankStartPage')} />
        {(['members', 'journal', 'history'] as const).map(id =>
          <ToggleRow key={id} label={`Show ${TAB_NAMES[id]} tab`} value={!prefs.hiddenTabs.includes(id)} disabled={busy}
            onToggle={() => toggleHidden('hiddenTabs', id)} />)}
        <Text style={{color: T.dim, fontSize: fs(13)}}>Choose what appears in each bottom bar position. Hub stays available.</Text>
        {prefs.navigationSlots.map((id, index) => <Btn key={index} variant="ghost" disabled={busy} onPress={() => setNavigationPicker(index)}>{`Position ${index + 1}: ${TILE_NAMES[id]}`}</Btn>)}
        <Text style={{color: T.dim, fontSize: fs(13)}}>Add navigation pages to the hub.</Text>
        {TAB_OPTIONS.filter(id => id !== 'hub').map(id => <ToggleRow key={id} label={`Show ${TAB_NAMES[id]} in hub`} value={prefs.hubTabs.includes(id)} disabled={busy} onToggle={() => {
          void save({...prefs, hubTabs: prefs.hubTabs.includes(id) ? prefs.hubTabs.filter(item => item !== id) : [...prefs.hubTabs, id]});
        }} />)}
        <ToggleRow label="Show tab labels" value={!prefs.hideTabLabels} disabled={busy} onToggle={() => toggle('hideTabLabels')} />
        <ToggleRow label="Show tab icons" value={!prefs.hideTabIcons} disabled={busy} onToggle={() => toggle('hideTabIcons')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Icons stay visible if labels are hidden.</Text>
        </Section>
        <Section title="Front screen">
        <ToggleRow label="Show system name in header" value={!prefs.hideSystemName} disabled={busy} onToggle={() => toggle('hideSystemName')} />
        <ToggleRow label="Show front title" value={!prefs.hideFrontTitle} disabled={busy} onToggle={() => toggle('hideFrontTitle')} />
        <ToggleRow label="Show front sorting" value={!prefs.hideFrontSort} disabled={busy} onToggle={() => toggle('hideFrontSort')} />
        </Section>
        <Section title="Front tiers">
        <Text style={{color: T.dim, fontSize: fs(13)}}>Hidden tiers disappear from the front screen and front selection. Saved front data is kept.</Text>
        {FRONT_TIERS.map(tier => <View key={tier} style={{gap: 6}}>
          <ToggleRow label={`Show ${FRONT_TIER_NAMES[tier]}`} value={!prefs.hiddenFrontTiers.includes(tier)} disabled={busy} onToggle={() => {
            const hiddenFrontTiers = prefs.hiddenFrontTiers.includes(tier) ? prefs.hiddenFrontTiers.filter(item => item !== tier) : [...prefs.hiddenFrontTiers, tier];
            void save({...prefs, hiddenFrontTiers});
          }} />
          <TextInput accessibilityLabel={`${FRONT_TIER_NAMES[tier]} name`} value={tierDrafts[tier] || ''} maxLength={40} placeholder="Default name" placeholderTextColor={T.dim}
            onChangeText={name => setTierDrafts({...tierDrafts, [tier]: name})} style={{color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 10}} />
          <Btn variant="ghost" disabled={busy} onPress={() => { void save({...prefs, frontTierNames: {...prefs.frontTierNames, [tier]: tierDrafts[tier] || ''}}); }}>Save name</Btn>
          <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={`Edit ${FRONT_TIER_NAMES[tier]} color`} onPress={() => setTierPicker(tier)} style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9}}>
            <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: tierAccent(T, tier)}} />
            <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>Color</Text><Text style={{color: T.dim}}>{prefs.frontTierColors[tier] || 'Default'}</Text>
          </TouchableOpacity>
        </View>)}
        </Section>
        <Section title="Hub appearance">
        <ToggleRow label="Show hub title" value={!prefs.hideHubTitle} disabled={busy} onToggle={() => toggle('hideHubTitle')} />
        <ToggleRow label="Show hub reorder control" value={!prefs.hideHubReorder} disabled={busy} onToggle={() => toggle('hideHubReorder')} />
        <ToggleRow label="Show hub tile labels" value={!prefs.hideTileLabels} disabled={busy} onToggle={() => toggle('hideTileLabels')} />
        <ToggleRow label="Show hub tile icons" value={!prefs.hideTileIcons} disabled={busy} onToggle={() => toggle('hideTileIcons')} />
        <ToggleRow label="Transparent hub tiles" value={prefs.transparentHubTiles} disabled={busy} onToggle={() => toggle('transparentHubTiles')} />
        <ToggleRow label="Show hub tile borders" value={!prefs.hideHubTileBorders} disabled={busy} onToggle={() => toggle('hideHubTileBorders')} />
        {choices('hubColumns', 'Hub columns', [['Automatic', 0], ['1', 1], ['2', 2], ['3', 3]])}
        {choices('tileRadius', 'Hub tile corners', [['Square', 0], ['Slight', 8], ['Default', 14], ['Round', 24]])}
        </Section>
        <Section title="Hub icons">
        <ToggleRow label="Minimal line hub icons" value={prefs.minimalHubIcons} disabled={busy} onToggle={() => toggle('minimalHubIcons')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Choose an image for any hub icon. Custom images take priority over the line icons and are stored on this device.</Text>
        {NAV_OPTIONS.map(id => <View key={id} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          {prefs.hubIconImages[id] && <Image source={{uri: prefs.hubIconImages[id]}} style={{width: 32, height: 32}} resizeMode="contain" />}
          <Text style={{flex: 1, color: T.text}}>{TILE_NAMES[id]}</Text>
          <Btn variant="ghost" disabled={busy} onPress={() => { void (async () => {
            const uri = await pickAndSaveImage(src => saveBioImageFromUri(`hub-icon-${id}`, src));
            if (uri) await save({...prefs, hubIconImages: {...prefs.hubIconImages, [id]: uri}});
          })(); }}>Choose image</Btn>
          {prefs.hubIconImages[id] && <Btn variant="ghost" disabled={busy} onPress={() => { const images = {...prefs.hubIconImages}; delete images[id]; void save({...prefs, hubIconImages: images}); }}>Reset</Btn>}
        </View>)}
        </Section>
        <Section title="Hub features">
        {TILE_OPTIONS.map(id => <ToggleRow key={id} label={TILE_NAMES[id]} value={!prefs.hiddenTiles.includes(id)} disabled={busy}
          onToggle={() => toggleHidden('hiddenTiles', id)} />)}
        </Section>
        <Section title="Members">
        <BaseToggleRow label="Enhanced group view" desc="Show richer cards in both views, plus search, filters, and custom fronts in group view." value={enabled.groupView} disabled={busy} onToggle={() => {
          setBusy(true); setError('');
          void modPreferences.setEnabled('groupView', !enabled.groupView).catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
        }} />
        <ToggleRow label="Show sorting" value={!prefs.hideMemberSort} disabled={busy} onToggle={() => toggle('hideMemberSort')} />
        <ToggleRow label="Show group filter" value={!prefs.hideMemberGroupFilter} disabled={busy} onToggle={() => toggle('hideMemberGroupFilter')} />
        <ToggleRow label="Show tag filter" value={!prefs.hideMemberTagFilter} disabled={busy} onToggle={() => toggle('hideMemberTagFilter')} />
        <ToggleRow label="Show search" value={!prefs.hideMemberSearch} disabled={busy} onToggle={() => toggle('hideMemberSearch')} />
        <ToggleRow label="Show back-to-top button" value={!prefs.hideMemberBackToTop} disabled={busy} onToggle={() => toggle('hideMemberBackToTop')} />
        </Section>
        <Section title="Journal">
        <ToggleRow label="Show title" value={!prefs.hideJournalTitle} disabled={busy} onToggle={() => toggle('hideJournalTitle')} />
        <ToggleRow label="Show tag filter" value={!prefs.hideJournalTagFilter} disabled={busy} onToggle={() => toggle('hideJournalTagFilter')} />
        <ToggleRow label="Show author filter" value={!prefs.hideJournalAuthorFilter} disabled={busy} onToggle={() => toggle('hideJournalAuthorFilter')} />
        </Section>
        <Section title="History">
        <ToggleRow label="Show title" value={!prefs.hideHistoryTitle} disabled={busy} onToggle={() => toggle('hideHistoryTitle')} />
        </Section>
        <Section title="Cards and panels">
        <BaseToggleRow label="Transparent cards throughout the app" desc="Remove the shared card background across screens. Individual card settings can override this." value={prefs.transparentAllCards} disabled={busy} onToggle={() => toggle('transparentAllCards')} />
        <Text style={{color: T.dim, fontSize: fs(13)}}>Sheet opacity controls how much of the page shows through settings and profile panels.</Text>
        <OpacitySlider value={prefs.sheetOpacity ?? 100} disabled={busy} onChange={value => { void save({...prefs, sheetOpacity: value}); }} />
        <Btn variant="ghost" disabled={busy || prefs.sheetOpacity === null} onPress={() => { void save({...prefs, sheetOpacity: null}); }}>Use default sheet background</Btn>
        <Text style={{color: T.dim, fontSize: fs(13)}}>Choose the appearance of cards on each screen. Default keeps the original style.</Text>
        {CARD_AREAS.map(area => {
          const card = prefs.cards[area];
          const name = area[0].toUpperCase() + area.slice(1);
          return <Section key={area} title={`${name} cards`}>
            <ToggleRow label="Transparent background" value={card?.transparent === true} disabled={busy} onToggle={() => updateCard(area, {transparent: !card?.transparent})} />
            <ToggleRow label="Show border" value={!card?.hideBorder} disabled={busy} onToggle={() => updateCard(area, {hideBorder: !card?.hideBorder})} />
            {(['color', 'borderColor'] as const).map(key => <TouchableOpacity key={key} disabled={busy} accessibilityRole="button" accessibilityLabel={`Edit ${name} card ${key === 'color' ? 'background' : 'border'} color`} onPress={() => setCardPicker({area, key})} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12}}>
              <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: card?.[key] || (key === 'color' ? T.card : T.border)}} />
              <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>{key === 'color' ? 'Background color' : 'Border color'}</Text>
              <Text style={{color: T.dim, fontSize: fs(12)}}>{card?.[key] || 'Default'}</Text>
            </TouchableOpacity>)}
            {(['radius', 'padding'] as const).map(key => <View key={key}>
              <Text style={{color: T.text, fontSize: fs(14)}}>{key === 'radius' ? 'Corners' : 'Spacing'}</Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>{(key === 'radius' ? [['Default', null], ['Square', 0], ['Slight', 8], ['Round', 16], ['Extra round', 24]] : [['Default', null], ['Compact', 8], ['Medium', 12], ['Roomy', 20]]).map(([label, value]) => <Btn key={String(label)} variant={(card?.[key] ?? null) === value ? 'solid' : 'ghost'} disabled={busy} onPress={() => updateCard(area, {[key]: value})}>{String(label)}</Btn>)}</View>
            </View>)}
          </Section>;
        })}
        </Section>
        <Section title="Interface colors">
        {ELEMENT_COLOR_OPTIONS.map(key => <TouchableOpacity key={key} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Edit ${ELEMENT_COLOR_NAMES[key]} color`} onPress={() => setElementPicker(key)}
          style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12}}>
          <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: prefs.elementColors[key] || elementColorOf(key)}} />
          <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>{ELEMENT_COLOR_NAMES[key]}</Text>
          <Text style={{color: T.dim, fontSize: fs(12)}}>{prefs.elementColors[key] || 'Default'}</Text>
        </TouchableOpacity>)}
        </Section>
        <Section title="More colors">
        <Text style={{color: T.dim, fontSize: fs(13)}}>Base, accent, and text colors are in the regular palette editor.</Text>
        {COLOR_OPTIONS.map(key => <TouchableOpacity key={key} disabled={busy} accessibilityRole="button"
          accessibilityLabel={`Edit ${COLOR_NAMES[key] || key} color`} onPress={() => setPicker(key)}
          style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12}}>
          <View style={{width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: T.border, backgroundColor: prefs.colors[key] || colorOf(key)}} />
          <Text style={{flex: 1, color: T.text, fontSize: fs(14)}}>{COLOR_NAMES[key] || key[0].toUpperCase() + key.slice(1)}</Text>
          <Text style={{color: T.dim, fontSize: fs(12)}}>{prefs.colors[key] || 'Default'}</Text>
        </TouchableOpacity>)}
        </Section>
        <Btn variant="ghost" disabled={busy} onPress={() => { void save({...DEFAULT_EXTRA_CUSTOMIZATION, enabled: true}); }}>Reset extra customization</Btn>
        {!!error && <Text accessibilityRole="alert" style={{color: T.danger, fontSize: fs(14)}}>{error}</Text>}
      </ScrollView>
      {tierPicker && <ColorPickerModal visible title={`${FRONT_TIER_NAMES[tierPicker]} color`} value={tierAccent(T, tierPicker)} onClose={() => setTierPicker(null)}
        onSave={hex => { void save({...prefs, frontTierColors: {...prefs.frontTierColors, [tierPicker]: hex}}); setTierPicker(null); }}
        onClear={() => { const frontTierColors = {...prefs.frontTierColors}; delete frontTierColors[tierPicker]; void save({...prefs, frontTierColors}); setTierPicker(null); }} clearLabel="Use default" />}
      {cardPicker && <ColorPickerModal visible title={`${cardPicker.area[0].toUpperCase() + cardPicker.area.slice(1)} card ${cardPicker.key === 'color' ? 'background' : 'border'} color`}
        value={prefs.cards[cardPicker.area]?.[cardPicker.key] || (cardPicker.key === 'color' ? T.card : T.border)} onClose={() => setCardPicker(null)}
        onSave={hex => { updateCard(cardPicker.area, {[cardPicker.key]: hex}); setCardPicker(null); }}
        onClear={() => { updateCard(cardPicker.area, {[cardPicker.key]: undefined}); setCardPicker(null); }} clearLabel="Use default" />}
      {elementPicker && <ColorPickerModal visible title={`${ELEMENT_COLOR_NAMES[elementPicker]} color`}
        value={prefs.elementColors[elementPicker] || elementColorOf(elementPicker)} onClose={() => setElementPicker(null)}
        onSave={hex => { void save({...prefs, elementColors: {...prefs.elementColors, [elementPicker]: hex}}); setElementPicker(null); }}
        onClear={() => { const elementColors = {...prefs.elementColors}; delete elementColors[elementPicker]; void save({...prefs, elementColors}); setElementPicker(null); }} clearLabel="Use default" />}
      {picker && <ColorPickerModal visible title={`${COLOR_NAMES[picker] || picker[0].toUpperCase() + picker.slice(1)} color`}
        value={prefs.colors[picker] || colorOf(picker)} onClose={() => setPicker(null)}
        onSave={hex => { void save({...prefs, colors: {...prefs.colors, [picker]: hex}}); setPicker(null); }}
        onClear={() => { const colors = {...prefs.colors}; delete colors[picker]; void save({...prefs, colors}); setPicker(null); }} clearLabel="Use default" />}
      <Modal visible={navigationPicker !== null} animationType="slide" onRequestClose={() => setNavigationPicker(null)}>
        <SafeAreaView style={{flex: 1, backgroundColor: T.bg}}><ScrollView contentContainerStyle={{padding: 24, gap: 8}}>
          <Text style={{color: T.text, fontSize: fs(20)}}>Choose a bottom bar page</Text>
          {NAV_OPTIONS.map(id => <Btn key={id} variant="ghost" disabled={busy || (prefs.navigationSlots.includes(id) && prefs.navigationSlots[navigationPicker ?? 0] !== id) || (prefs.navigationSlots[navigationPicker ?? 0] === 'hub' && id !== 'hub')} onPress={() => {
            if (navigationPicker === null) return;
            const navigationSlots = [...prefs.navigationSlots]; navigationSlots[navigationPicker] = id as NavigationOption;
            void save({...prefs, navigationSlots}); setNavigationPicker(null);
          }}>{TILE_NAMES[id]}</Btn>)}
          <Btn variant="ghost" onPress={() => setNavigationPicker(null)}>Cancel</Btn>
        </ScrollView></SafeAreaView>
      </Modal>
    </SafeAreaView>
  </Modal>;
}
