export const TAB_OPTIONS = ['front', 'members', 'hub', 'journal', 'history'] as const;
export const TILE_OPTIONS = ['planner', 'retroHistory', 'statistics', 'chat', 'mailbox', 'whiteboard', 'colors', 'network', 'polls', 'systemMap', 'customFields', 'systemManager', 'archive', 'share', 'credits', 'discord', 'supportPS'] as const;
export const COLOR_OPTIONS = ['canvas', 'surface', 'card', 'border', 'borderLt', 'accentBg', 'dim', 'muted', 'toggleOff', 'danger', 'dangerBg', 'success', 'successBg', 'info', 'infoBg'] as const;
export const ELEMENT_COLOR_OPTIONS = ['header', 'tabBar', 'tabActive', 'tabInactive', 'hubTile', 'hubTileBorder'] as const;
export type ElementColorOption = typeof ELEMENT_COLOR_OPTIONS[number];
export type ColorOption = typeof COLOR_OPTIONS[number];
export type ExtraCustomization = {
  enabled: boolean;
  hiddenTabs: string[];
  hiddenTiles: string[];
  fullScreenWallpaper: boolean;
  transparentHeader: boolean;
  transparentTabBar: boolean;
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
  hideHeaderBorder: boolean;
  hideTabBarBorder: boolean;
  hideTabIcons: boolean;
  hideTileIcons: boolean;
  transparentHubTiles: boolean;
  hideHubTileBorders: boolean;
  hubColumns: 0 | 1 | 2 | 3;
  tileRadius: 0 | 8 | 14 | 24;
  wallpaperDim: 0 | 0.25 | 0.5 | 0.78 | 0.9;
  wallpaperFit: 'cover' | 'contain' | 'stretch';
  elementColors: Partial<Record<ElementColorOption, string>>;
  colors: Partial<Record<ColorOption, string>>;
};
export const DEFAULT_EXTRA_CUSTOMIZATION: ExtraCustomization = {
  hideHeaderBorder: false, hideTabBarBorder: false, hideTabIcons: false, hideTileIcons: false,
  transparentHubTiles: false, hideHubTileBorders: false, hubColumns: 0, tileRadius: 14,
  wallpaperDim: 0.78, wallpaperFit: 'cover', elementColors: {},
  enabled: false, fullScreenWallpaper: false, transparentHeader: false, transparentTabBar: false, hiddenTabs: [], hiddenTiles: [], hideTabLabels: false, hideTileLabels: false,
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
  const elementColors: ExtraCustomization['elementColors'] = {};
  for (const key of ELEMENT_COLOR_OPTIONS) {
    const color = v.elementColors?.[key];
    if (typeof color === 'string' && hex.test(color)) elementColors[key] = color.toUpperCase();
  }
  return {
    hideHeaderBorder: v.hideHeaderBorder === true, hideTabBarBorder: v.hideTabBarBorder === true,
    hideTabIcons: v.hideTabIcons === true, hideTileIcons: v.hideTileIcons === true,
    transparentHubTiles: v.transparentHubTiles === true, hideHubTileBorders: v.hideHubTileBorders === true,
    hubColumns: v.hubColumns === 1 || v.hubColumns === 2 || v.hubColumns === 3 ? v.hubColumns : 0,
    tileRadius: v.tileRadius === 0 || v.tileRadius === 8 || v.tileRadius === 24 ? v.tileRadius : 14,
    wallpaperDim: v.wallpaperDim === 0 || v.wallpaperDim === 0.25 || v.wallpaperDim === 0.5 || v.wallpaperDim === 0.9 ? v.wallpaperDim : 0.78,
    wallpaperFit: v.wallpaperFit === 'contain' || v.wallpaperFit === 'stretch' ? v.wallpaperFit : 'cover',
    elementColors,
    enabled: v.enabled === true,
    fullScreenWallpaper: v.fullScreenWallpaper === true, transparentHeader: v.transparentHeader === true,
    transparentTabBar: v.transparentTabBar === true,
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
