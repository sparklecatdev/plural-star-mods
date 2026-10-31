import {useSyncExternalStore} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ThemeColors} from '../theme';
import {DEFAULT_EXTRA_CUSTOMIZATION, sanitizeExtraCustomization} from './extraCustomizationCore';
import type {ExtraCustomization} from './extraCustomizationCore';
export {FRONT_TIERS, CARD_AREAS, cardAppearance, ELEMENT_COLOR_OPTIONS, COLOR_OPTIONS, DEFAULT_EXTRA_CUSTOMIZATION, TAB_OPTIONS, TILE_OPTIONS} from './extraCustomizationCore';
export type {FrontTierOption, CardArea, CardAppearance, ElementColorOption, ColorOption, ExtraCustomization} from './extraCustomizationCore';

export const EXTRA_CUSTOMIZATION_KEY = 'sparklecat:extra-customization';

let state = DEFAULT_EXTRA_CUSTOMIZATION;
let loaded: Promise<void> | undefined;
let pending: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const publish = (value: ExtraCustomization) => { state = value; listeners.forEach(fn => fn()); };
const load = (): Promise<void> => loaded ??= AsyncStorage.getItem(EXTRA_CUSTOMIZATION_KEY).then(raw => {
  let saved: unknown;
  try { saved = raw ? JSON.parse(raw) : null; } catch { saved = null; }
  publish(sanitizeExtraCustomization(saved));
}).catch(error => { loaded = undefined; throw error; });
const set = (value: ExtraCustomization): Promise<void> => {
  const task = pending.then(async () => {
    await load();
    const next = sanitizeExtraCustomization(value);
    await AsyncStorage.setItem(EXTRA_CUSTOMIZATION_KEY, JSON.stringify(next));
    publish(next);
  });
  pending = task.catch(() => {});
  return task;
};
export const extraCustomization = {
  load, set, getSnapshot: () => state,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
export const useExtraCustomization = () => useSyncExternalStore(extraCustomization.subscribe, extraCustomization.getSnapshot, extraCustomization.getSnapshot);
export const applyExtraColors = (theme: ThemeColors, prefs: ExtraCustomization): ThemeColors =>
  prefs.enabled ? {...theme, ...prefs.colors, tierColors: prefs.frontTierColors} : theme;
