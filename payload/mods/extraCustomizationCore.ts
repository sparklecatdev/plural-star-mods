export const TAB_OPTIONS = ['front', 'members', 'hub', 'journal', 'history'] as const;
export const TILE_OPTIONS = ['planner', 'retroHistory', 'statistics', 'chat', 'mailbox', 'whiteboard', 'colors', 'network', 'polls', 'systemMap', 'customFields', 'systemManager', 'archive', 'share', 'credits', 'discord', 'supportPS'] as const;
export const COLOR_OPTIONS = ['canvas', 'surface', 'card', 'border', 'borderLt', 'accentBg', 'dim', 'muted', 'toggleOff', 'danger', 'dangerBg', 'success', 'successBg', 'info', 'infoBg'] as const;
export type ColorOption = typeof COLOR_OPTIONS[number];
export type ExtraCustomization = {
  enabled: boolean;
  hiddenTabs: string[];
  hiddenTiles: string[];
  hideTabLabels: boolean;
  hideTileLabels: boolean;
  hideSystemName: boolean;
  hideFrontTitle: boolean;
  hideFrontSort: boolean;
  hideHubTitle: boolean;
  hideHubReorder: boolean;
  hideMemberSort: boolean;
  hideMemberGroupFilter: boolean;
  hideMemberTagFilter: boolean;
  hideMemberSearch: boolean;
  hideMemberBackToTop: boolean;
  hideJournalTitle: boolean;
  hideJournalTagFilter: boolean;
  hideJournalAuthorFilter: boolean;
  hideHistoryTitle: boolean;
  colors: Partial<Record<ColorOption, string>>;
};
export const DEFAULT_EXTRA_CUSTOMIZATION: ExtraCustomization = {
  enabled: false, hiddenTabs: [], hiddenTiles: [], hideTabLabels: false, hideTileLabels: false,
  hideSystemName: false, hideFrontTitle: false, hideFrontSort: false, hideHubTitle: false,
  hideHubReorder: false, hideMemberSort: false, hideMemberGroupFilter: false, hideMemberTagFilter: false,
  hideMemberSearch: false, hideMemberBackToTop: false, hideJournalTitle: false,
  hideJournalTagFilter: false, hideJournalAuthorFilter: false, hideHistoryTitle: false, colors: {},
};

const hex = /^#[0-9a-fA-F]{6}$/;
export function sanitizeExtraCustomization(value: unknown): ExtraCustomization {
  const v = value && typeof value === 'object' ? value as Partial<ExtraCustomization> : {};
  const colors: ExtraCustomization['colors'] = {};
  for (const key of COLOR_OPTIONS) {
    const color = v.colors?.[key];
    if (typeof color === 'string' && hex.test(color)) colors[key] = color.toUpperCase();
  }
  return {
    enabled: v.enabled === true,
    // Keep Front and Hub available so settings and primary navigation remain reachable.
    hiddenTabs: Array.isArray(v.hiddenTabs) ? v.hiddenTabs.filter((id): id is string =>
      (TAB_OPTIONS as readonly string[]).includes(id) && id !== 'front' && id !== 'hub') : [],
    hiddenTiles: Array.isArray(v.hiddenTiles) ? v.hiddenTiles.filter((id): id is string =>
      (TILE_OPTIONS as readonly string[]).includes(id)) : [],
    hideTabLabels: v.hideTabLabels === true, hideTileLabels: v.hideTileLabels === true,
    hideSystemName: v.hideSystemName === true, hideFrontTitle: v.hideFrontTitle === true,
    hideFrontSort: v.hideFrontSort === true, hideHubTitle: v.hideHubTitle === true,
    hideHubReorder: v.hideHubReorder === true, hideMemberSort: v.hideMemberSort === true,
    hideMemberGroupFilter: v.hideMemberGroupFilter === true, hideMemberTagFilter: v.hideMemberTagFilter === true,
    hideMemberSearch: v.hideMemberSearch === true, hideMemberBackToTop: v.hideMemberBackToTop === true,
    hideJournalTitle: v.hideJournalTitle === true, hideJournalTagFilter: v.hideJournalTagFilter === true,
    hideJournalAuthorFilter: v.hideJournalAuthorFilter === true, hideHistoryTitle: v.hideHistoryTitle === true, colors,
  };
}
