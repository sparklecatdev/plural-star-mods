// Headless notifications and foreground startup share one recovery gate.
// Settings tools never restore over the running app; they queue a cold restore.
let toolsOpen = false;
let active = 0;
const waiters: (() => void)[] = [];
export const toolsAreOpen = (): boolean => toolsOpen;
export const setToolsOpen = (value: boolean): void => { toolsOpen = value; };
export const waitForStorageIdle = (): Promise<void> => active === 0 ? Promise.resolve() : new Promise(resolve => waiters.push(resolve));
export async function runNotification(work: () => Promise<void>): Promise<void> {
  if (toolsOpen) return;
  active++;
  try { await work(); }
  finally {
    active--;
    if (active === 0) for (const resolve of waiters.splice(0)) resolve();
  }
}
