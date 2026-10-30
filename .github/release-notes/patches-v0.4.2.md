Mod preferences and installed patch versions now sync through Plural Star's existing cloud save and linked-device sync.

- Restore mod switches, PluralKit front sync, and update preferences automatically.
- Download newer compatible saved patches through the verified updater and apply them on the next full app start.
- Manage automatic patch restore and retry failed restores under Settings → sparklecat's mods → Mod sync.
- Keep preferences and restore information when offline so restoration can retry later.

Each device needs a patched APK installed once. Saves contain preferences and release identifiers; executable code and download URLs are excluded. Wallpaper image files are not synced by this feature.

Validated all three production payload builds, TypeScript checks, and regression tests. Compatible with the existing v0.5.0 patcher and native runtime; no patcher update is required.
