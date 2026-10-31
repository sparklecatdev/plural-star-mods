import {useMemo} from 'react';
import {useTheme} from '../themeContext';
import {useModPreferences} from './modPreferences';
import {noSpeakerMember} from './noSpeakerCore';

export function useNoSpeaker() {
  const {accent} = useTheme();
  const {noSpeaker: enabled} = useModPreferences();
  const member = useMemo(() => noSpeakerMember(accent), [accent]);
  return {enabled, member};
}
