import {useSyncExternalStore} from 'react';
import type {NavigationOption} from './extraCustomizationCore';

let pending: NavigationOption | null = null;
let active: NavigationOption | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
export const requestHubShortcut = (id: NavigationOption) => { pending = id; notify(); };
export const takeHubShortcut = () => { const id = pending; pending = null; return id; };
export const setActiveHubShortcut = (id: NavigationOption | null) => { if (active !== id) { active = id; notify(); } };
export const subscribeHubShortcuts = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useActiveHubShortcut = () => useSyncExternalStore(subscribeHubShortcuts, () => active, () => active);
export const NAVIGATION_NAMES: Record<NavigationOption, string> = {
  front: 'Front', members: 'Members', hub: 'Hub', journal: 'Journal', history: 'History',
  planner: 'Planner', retroHistory: 'Past front', statistics: 'Statistics', chat: 'Chat', mailbox: 'Mailbox', whiteboard: 'Whiteboard', colors: 'Colors', network: 'Network', polls: 'Polls', systemMap: 'System map', customFields: 'Custom fields', systemManager: 'System manager', archive: 'Archive', share: 'Import / export', credits: 'Credits', discord: 'Discord', supportPS: 'Support Plural Star',
};
