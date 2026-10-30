type Settings = {pkFrontSyncEnabled?: boolean; pkToken?: string};
type Switch = {token: string; members: string[]; key: string};
const memberRef = /^(?:[a-z]{5,6}|[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;

export const createPluralKitSync = (io: {
  settings: () => Settings;
  send: (token: string, members: string[]) => Promise<void>;
  failed: () => void;
  now: () => number;
  schedule: (run: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
}) => {
  let pending: Switch | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;
  let nextAt = 0;
  let lastKey: string | undefined;
  let generation = 0;
  const flush = async () => {
    timer = undefined;
    if (sending || !pending) return;
    const current = pending;
    pending = undefined;
    const settings = io.settings();
    if (!settings.pkFrontSyncEnabled || settings.pkToken?.trim() !== current.token || current.key === lastKey) return;
    sending = true;
    const started = generation;
    nextAt = io.now() + 5000;
    try {
      await io.send(current.token, current.members);
      if (started === generation) lastKey = current.key;
    } catch {
      io.failed();
    } finally {
      sending = false;
      schedule();
    }
  };
  const schedule = () => {
    if (pending && !sending && timer === undefined) timer = io.schedule(() => { void flush(); }, Math.max(0, nextAt - io.now()));
  };
  return {
    cancel() {
      generation++;
      pending = undefined;
      lastKey = undefined;
      if (timer !== undefined) io.clear(timer);
      timer = undefined;
    },
    queue(ids: string[], members: {id: string; sourceId?: string}[]) {
      const settings = io.settings();
      const token = settings.pkToken?.trim();
      if (!settings.pkFrontSyncEnabled || !token) return;
      const sources = new Map(members.map(m => [m.id, m.sourceId]));
      const refs = [...new Set(ids.map(id => sources.get(id)).filter((id): id is string => !!id && memberRef.test(id)))];
      pending = {token, members: refs, key: JSON.stringify([token, refs])};
      schedule();
    },
  };
};
