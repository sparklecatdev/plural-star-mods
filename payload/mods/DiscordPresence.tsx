import {useEffect} from 'react';
import {NativeModules} from 'react-native';
import {useAppStore} from '../store/appStore';
import {useModPreferences} from './modPreferences';
import {frontingPresence} from './discordPresenceCore';

const discord = NativeModules.SparklecatDiscordPresence as {setPresence(text: string | null): void} | undefined;

export function DiscordPresence() {
  const enabled = useModPreferences().discordPresence;
  const loaded = useAppStore(s => s.loaded);
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const text = enabled && loaded ? frontingPresence(members, front) : null;
  useEffect(() => {
    discord?.setPresence(text);
  }, [text]);
  useEffect(() => () => discord?.setPresence(null), []);
  return null;
}
