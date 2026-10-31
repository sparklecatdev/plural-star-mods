import type {Member} from '../model/types';
import type {PickerPool} from '../picker/memberPicker';

// A stable author/voter identity, never inserted into the system's member roster.
export const NO_SPEAKER_ID = 'sparklecat:no-speaker';
export function noSpeakerMember(color: string): Member {
  return {id: NO_SPEAKER_ID, name: 'No speaker', color, pronouns: '', role: '', description: ''};
}
export function withNoSpeaker(pools: PickerPool[], member: Member, enabled: boolean): PickerPool[] {
  return enabled ? [{label: '', members: [member]}, ...pools] : pools;
}
