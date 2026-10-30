import {validateSnapshot} from './snapshotCore';
import type {Snapshot} from './snapshotCore';

// Queue a validated restore from Settings. Only cold startup consumes it, before
// upstream modules or syncing can retain or write the old account's state.
export function createRestoreQueue(io: {
  exists(path: string): Promise<boolean>; read(path: string): Promise<string>;
  write(path: string, value: string): Promise<unknown>; move(from: string, to: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}, docs: string, recovery: {recover(): Promise<void>; restore(s: Snapshot): Promise<void>}) {
  const path = docs + '/.sparklecat-restore-next.json';
  const temporary = path + '.tmp';
  let pending: Promise<void> = Promise.resolve();
  const serial = (work: () => Promise<void>) => {
    const task = pending.then(work); pending = task.catch(() => {}); return task;
  };
  const remove = async (p: string) => { if (await io.exists(p)) await io.remove(p); };
  const queue = (input: Snapshot) => serial(async () => {
    const snapshot = validateSnapshot(input);
    if (await io.exists(path)) throw Error('A restore is already waiting. Cancel it before choosing another backup.');
    await remove(temporary);
    await io.write(temporary, JSON.stringify(snapshot));
    await io.move(temporary, path);
  });
  const apply = () => serial(async () => {
    await recovery.recover();
    if (await io.exists(path)) {
      const snapshot = validateSnapshot(JSON.parse(await io.read(path)));
      await recovery.restore(snapshot);
      // Until this succeeds, the app stays closed. Reapplying the same snapshot
      // after a crash between commit and unlink cannot lose new app writes.
      await io.remove(path);
    }
    await remove(temporary);
  });
  return {queue, apply, hasPending: () => io.exists(path),
    cancel: () => serial(async () => { await remove(path); await remove(temporary); })};
}
