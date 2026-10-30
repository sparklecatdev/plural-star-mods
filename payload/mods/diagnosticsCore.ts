type DiagnosticInput = {
  appVersion: string; patchVersion: string; runtime: string; variant: string;
  platform: string; platformVersion: string | number;
  wallpaper: boolean; storage: boolean; pkFrontSync: boolean;
  lastChecked: number; available: string | null; checking: boolean; updateError: boolean;
  cloudReady: boolean; cloudRestoring: boolean; cloudError: boolean;
};
const identifier = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9.-]{1,96}$/.test(value) ? value : 'unknown';
// Explicit fields only: never serialize app settings, sync records, or error messages.
export function diagnosticReport(input: DiagnosticInput): string {
  return JSON.stringify({format: 1,
    appVersion: identifier(input.appVersion), patchVersion: identifier(input.patchVersion),
    runtime: identifier(input.runtime), variant: identifier(input.variant),
    platform: identifier(input.platform), platformVersion: identifier(String(input.platformVersion)),
    mods: {wallpaper: input.wallpaper === true, storage: input.storage === true, pkFrontSync: input.pkFrontSync === true},
    updates: {lastChecked: Number.isSafeInteger(input.lastChecked) && input.lastChecked >= 0 ? input.lastChecked : 0,
      available: input.available === null ? null : identifier(input.available), checking: input.checking === true, failed: input.updateError === true},
    cloud: {ready: input.cloudReady === true, restoring: input.cloudRestoring === true, failed: input.cloudError === true},
  }, null, 2);
}
