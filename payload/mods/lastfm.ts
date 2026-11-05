import {NativeModules, Platform} from 'react-native';

type Bridge = {
  lastfmStatus: () => Promise<string>; lastfmMusicEnabled: (enabled: boolean) => Promise<void>;
  lastfmConfigure: (enabled: boolean, nowPlaying: boolean) => Promise<void>;
  lastfmBegin: (key: string, secret: string) => Promise<string>; lastfmFinish: () => Promise<string>;
  lastfmDisconnect: () => Promise<void>; lastfmRetry: () => Promise<void>;
};
const bridge: Bridge | undefined = Platform.OS === 'android' ? NativeModules.SparklecatMusic : undefined;
export const lastfmSupported = !!bridge && ['lastfmStatus', 'lastfmMusicEnabled', 'lastfmConfigure', 'lastfmBegin', 'lastfmFinish', 'lastfmDisconnect', 'lastfmRetry'].every(key => typeof (bridge as unknown as Record<string, unknown>)[key] === 'function');
export type LastfmStatus = {connected: boolean; username: string; enabled: boolean; nowPlaying: boolean; pendingAuth: boolean; queued: number; listening: boolean; activity: string; error: string; lastScrobble: string};
export const emptyLastfmStatus: LastfmStatus = {connected: false, username: '', enabled: false, nowPlaying: false, pendingAuth: false, queued: 0, listening: false, activity: '', error: '', lastScrobble: ''};
export async function lastfmStatus(): Promise<LastfmStatus> {
  if (!lastfmSupported) return emptyLastfmStatus;
  const value = JSON.parse(await bridge!.lastfmStatus());
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Could not read Last.fm settings.');
  const text = (key: string) => typeof value[key] === 'string' ? value[key].slice(0, 2000) : '';
  return {connected: value.connected === true, username: text('username'), enabled: value.enabled === true, nowPlaying: value.nowPlaying === true,
    pendingAuth: value.pendingAuth === true, queued: Number.isFinite(value.queued) ? Math.max(0, Math.min(500, Math.trunc(value.queued))) : 0,
    listening: value.listening === true, activity: text('activity'), error: text('error'), lastScrobble: text('lastScrobble')};
}
export const lastfmMusicEnabled = async (enabled: boolean) => { if (lastfmSupported) await bridge!.lastfmMusicEnabled(enabled); };
export const lastfmConfigure = (enabled: boolean, nowPlaying: boolean) => bridge!.lastfmConfigure(enabled, nowPlaying);
export async function lastfmBegin(key: string, secret: string) {
  if (!lastfmSupported || !/^[a-f0-9]{32}$/i.test(key.trim()) || !/^[a-f0-9]{32}$/i.test(secret.trim())) throw Error('Enter the 32-character API key and shared secret from Last.fm.');
  const url = await bridge!.lastfmBegin(key.trim(), secret.trim());
  if (!/^https:\/\/www\.last\.fm\/api\/auth\/\?api_key=[a-f0-9]{32}&token=[a-z0-9]{1,128}$/i.test(url)) throw Error('Last.fm returned an invalid sign-in link.');
  return url;
}
export const lastfmFinish = () => bridge!.lastfmFinish();
export const lastfmDisconnect = () => bridge!.lastfmDisconnect();
export const lastfmRetry = () => bridge!.lastfmRetry();
