type Member = {id: string; name: string; private?: boolean; deleted?: boolean};
type Front = {primary?: {memberIds?: string[]}; coFront?: {memberIds?: string[]}} | null;

// Private members must never be exposed to Discord, even when they are fronting.
export function frontingPresence(members: Member[], front: Front): string | null {
  const ids = new Set([...(front?.primary?.memberIds || []), ...(front?.coFront?.memberIds || [])]);
  const names = members.filter(member => ids.has(member.id) && !member.private && !member.deleted)
    .map(member => member.name.trim()).filter(Boolean);
  if (!names.length) return null;
  const text = `Fronting: ${names.join(', ')}`;
  return Array.from(text).slice(0, 128).join('');
}
