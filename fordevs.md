# Developer guide

This is the maintainer's map of the repository. Read the relevant source before changing it. `README.md` describes the user-facing behavior; this file describes where that behavior comes from and how to build, test, and release it. The exact supported inputs and versions are in `payload/base.json`, `payload/release.json`, and `app/build.gradle`, not in this guide.

**Important:** When adding new features, update the feature list in README.md to reflect the new capabilities.

Before adding or changing a mod feature, check Plural Star’s current features, open pull requests, and recent merged pull requests or releases. Tell the administrator when an existing or requested mod feature is already present upstream or was recently added, and link the relevant upstream source. Avoid duplicating upstream behavior; account for supported older versions when deciding whether a mod is still needed.

## Feature Implementation Guide

For detailed guidance on implementing new features in this patcher, please see the [Patcher Feature Implementation Guide](patcher-feature-implementation-guide.md). This document provides:

- Architecture overview and code patterns
- Step-by-step implementation process  
- Security considerations and testing requirements
- Version management procedures
- Integration points with existing systems

## Repository Structure

### Android Application (`app/`)
- Main patching logic in `MainActivity.java`
- APK modification functionality in `ApkPatcher.java` 
- Update handling in `UpdateClient.java` and `UpdatePolicy.java`
- Compatibility pack handling in `CompatibilityPack.java`

### Mod Payloads (`payload/mods/`)
- Core mod functionality with settings persistence  
- PluralKit synchronization features
- Extra customization options
- Patch installation logic
- Update discovery mechanisms
- Mod menu interface in `ModMenu.tsx`

### Native Components (`payload/native/`, `native-tools/`)
- Runtime bundle loading and rollback support
- Biometric/device unlock functionality (added in v0.6.1)
- Android-specific integration points
- Music session controls, notification-access service, and optional background Last.fm accounting

## What this repository builds

The **patcher** is the Android app in `app/` (`dev.sparklecat.pluralmods`). It obtains a verified official Plural Star APK, replaces its React Native bundle and `classes2.dex`, signs the result with a key held in Android Keystore on that device, and offers the APK to Android's installer. It does not change Plural Star's package identity. The patcher's publisher key is separate from the per-device key used for patched APKs.

The optional themed launcher icon is implemented by `ThemedIcon.java`: it reads the original adaptive icon's resource references and substitutes a compiled binary XML icon with an additional monochrome layer. `app/themed-icon-template.xml` is the editable source for `app/src/main/res/raw/themed_icon_template.bin`; compile it with Android `aapt2` using placeholder resources `@color/template_background` and `@mipmap/template_foreground`, assigned IDs `0x7f010000` and `0x7f020000` respectively. Preserve those IDs so the patcher can substitute the original resources. Test both launcher icon resources on an Android 13+ launcher with themed icons enabled.

The **payload** is the modified Plural Star app. `scripts/build-payloads.py` checks out an exact upstream commit into disposable `.work/upstream`, applies the diffs in `payload/*.patch`, copies `payload/mods/` into its `src/mods/`, makes a few checked entry-point edits, and produces JavaScript bundles. `scripts/build-native-updates.py` builds the native host/loader dex. The patcher packages three variants: `wallpaper`, `storage`, and `wallpaper-storage`. Their names are compatibility identifiers; all published patch features are included and switched on or off inside the patched app. Plain JavaScript bundles are intentional for the original app's Hermes host.

The **release streams** are different:

| Stream | Version/source | Contents and purpose |
| --- | --- | --- |
| Patcher APK | `versionCode` and `versionName` in `app/build.gradle`; `v<version>` release | Signed patcher, exact source ZIP, checksums. Required for patcher UI, Java, packaged native dex, or resource changes. |
| JavaScript patches | `version` and `runtime` in `payload/release.json`; `patches-v<version>` release | Verified bundles for the compatible runtime and variants; no new patcher APK. Optional `previous_runtime` and `legacy_runtime` retain older hosts with unavailable native features disabled. |
| Official-version compatibility | Exact official APK SHA-256 and upstream commit; `compat-v<upstream>-patches-v<patch>` release | Matching bundle, native dex, provenance, and source for an official APK other than the embedded fallback. |

Do not change a published release's assets in place. Advance the appropriate version and publish a new release.

## Source map

| Area | Files to read or change |
| --- | --- |
| Supported offline original and payload version | `payload/base.json`, `payload/release.json`, `scripts/base_config.py` |
| Upstream integration and build order | `scripts/build-payloads.py`, `payload/*.patch` |
| Custom mod runtime, app wrappers, and import flow | `payload/mods/sparkleScriptCore.ts`, `sparkleScripts.ts`, `CustomMods.tsx`; see `SPARKLESCRIPT.md` |
| Patched-app screens and behavior | `payload/mods/*.tsx`, `payload/mods/*.ts` |
| Feature defaults, persistence, and cloud sync | `payload/mods/modPreferencesCore.ts`, `modPreferences.ts`, `cloudModsCore.ts`, `cloudMods.ts` |
| Extra interface controls | `payload/mods/extraCustomizationCore.ts`, `extraCustomization.ts`, `ExtraCustomizationMenu.tsx` |
| Mod settings search | `payload/mods/SettingsSearch.tsx`, `ModMenu.tsx`, `ExtraCustomizationMenu.tsx` |
| Music player, lyrics and Last.fm | `payload/mods/MusicPlayer.tsx`, `music.ts`, `musicCore.ts`, `LastfmSettings.tsx`, `lastfm.ts`; `payload/native/MusicModule.java`, `MusicNotificationListener.java`, `LastfmCore.java`, `LastfmApi.java`, `LastfmScrobbler.java` |
| Patched-app startup, app lock, and recovery | `payload/mods/ModsRoot.tsx`, `storageSnapshot.ts`, `restoreQueue.ts`, `toolsState.ts` |
| Update notice and handoff to patcher | `payload/mods/PatchUpdatePrompt.tsx`, `updateCheck.ts`, `updateCheckCore.ts`, `patchInstallCore.ts` |
| Discord desktop companion | `desktop-companion/companion.py`, `desktop-companion/test_companion.py`, `desktop-companion/README.md` |
| PluralKit sync | `payload/pluralkit-pr-11.patch`, `payload/mods/PluralKitSettings.tsx`, `pluralKitSync.ts`, `pluralKitSyncCore.ts` |
| Storage backups | `payload/mods/BackupTools.tsx`, `storageSnapshot.ts`, `snapshotCore.ts`, `restoreQueue.ts` |
| Native loader and unlock bridge | `payload/native/*.java`, `scripts/build-native-updates.py`, `native-tools/src/main/java/dev/sparklecat/tools/PatchHost.java` |
| Patcher UI and installation | `app/src/main/java/dev/sparklecat/pluralmods/MainActivity.java`, `ApkPatcher.java`, `SigningIdentity.java`, `ApkProvider.java` |
| Optional music service manifest injection | `app/src/main/java/dev/sparklecat/pluralmods/MusicManifest.java`, `MusicManifestTest.java` |
| Patcher downloads and release selection | `UpdateClient.java`, `UpdatePolicy.java`, `UpdateTrust.java`, `CompatibilityPack.java`, `ReleaseVersion.java` in the same Java package |
| Patcher resources and permissions | `app/src/main/AndroidManifest.xml`, `app/src/main/res/`, `app/build.gradle` |
| Build and publication | `scripts/prepare-patch-release.py`, `compatibility-release.py`, `release-artifact.py`, `.github/workflows/*.yml` |
| Tests | `tests/*.test.cjs`, `app/src/test/`, `native-tools/src/test/` |

The patcher UI is built directly in `MainActivity.java` and uses its existing lilac/dark colors and dialog helpers. Patched-app controls belong in **Settings → sparklecat's mods**, through `ModMenu.tsx`, with the other patch controls. Keep the patched-app update notice styled consistently with the patcher and route update installation through the patcher.

## Local build

Install Node.js 24, npm, Python 3, Git, JDK 21, Android SDK platform 36 and build tools 36.0.0; accept the SDK licenses. Set `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`). `gradlew` is included. The payload build requires network access for the pinned upstream checkout and npm installation; it verifies the pinned official APK hash if it downloads the APK. Set `PLURAL_STAR_APK` to a local copy of the **original standalone** APK to reuse it. Do not pass a split or previously patched APK.

```sh
python3 scripts/build-payloads.py
bash gradlew :native-tools:test testDebugUnitTest lintDebug lintRelease assembleDebug assembleRelease
```

The development APK is `app/build/outputs/apk/debug/app-debug.apk`; the release build is unsigned. `app/build.gradle` makes `preBuild` verify all three bundles and dex files and package a complete source ZIP into the APK. Generated bundles, dex files, APKs, and `.work/` are ignored; commit their source, configuration, and provenance instead. `scripts/build-payloads.py --variant wallpaper-storage` is useful during development, but build all three variants before packaging the patcher. `--patches-only` skips the Android dex build. `--legacy-runtime` and `--previous-runtime` each require `--patches-only` and their configured release field; they are mutually exclusive. Restore a full current-runtime build before packaging an APK.

The builder resets and cleans **only** `.work/upstream`, installs upstream and test dependencies from lockfiles, and applies patches in this order: wallpaper (wallpaper variants only), profile palettes, PluralKit, no-speaker, confirmation, device unlock, extra customization, lock icon, then group view, with the blank-page navigation patch applied after the tab bar customization edits. It copies `payload/mods/`, writes generated `modOptions.ts` with variant/version/runtime flags, injects the mod menu into upstream Settings, adjusts wallpaper controls, adds cloud sync and the update notice to `App.tsx`, and makes `ModsRoot` the entry point in `index.js`. The builder keeps the original group pane alongside the enhanced one and switches between them using the group-view preference. Preference-sync opt-in is device-local and must never be restored from cloud data. Each variant must typecheck and pass the Node regression tests before its bundle is emitted. Wallpaper variants also run upstream background/restore tests. If an upstream anchor or patch fails, fix the integration against that exact upstream source; do not silently skip the change.

`payload/base.json` pins the offline fallback to one official tag, commit, URL, and APK SHA-256. `scripts/base_config.py` validates those inputs. `PLURAL_STAR_BASE=/absolute/path/to/base.json` selects a different, exact upstream input for compatibility builds; its runtime is derived from the upstream version and APK hash. Restore the default build before packaging a patcher APK.

## Adding or changing a feature

1. Find the upstream behavior in `.work/upstream` after a payload build and read the relevant `payload/mods/` code and patch files. Work in `payload/mods/` for self-contained logic and UI. Use a small `payload/*.patch` diff when an upstream file must change. Put cross-cutting entry-point edits in `scripts/build-payloads.py` only when the existing injection pattern fits. Never edit `.work/upstream` as the source of truth.
2. Add the user control to `ModMenu.tsx` or `ExtraCustomizationMenu.tsx`, backed by the existing preference helpers. Patch-specific settings belong under **Settings → sparklecat's mods**. All optional features must default to off for fresh installs and missing or invalid settings; preserve explicit saved preferences on upgrades. Add an off switch for every optional feature, including UI changes and preference syncing; validate values loaded from storage and cloud saves. If a setting should travel with cloud saves, update the declarative allowlist and validation in `cloudModsCore.ts` and the restore path in `cloudMods.ts`. Cloud saves carry preferences and patch identifiers, not executable code, URLs, or secrets.
3. If the feature touches native APIs, update `payload/native/` and `scripts/build-native-updates.py`; check the React Native package registration and dex host in `PatchHost.java`. A native API or host change requires a new runtime and a rebuilt patcher/compatibility pack. `BundleLoader` checks runtime, variant, version, size, and SHA-256 before using a downloaded bundle and rolls back a failed launch. Patcher-managed APKs use their embedded bundle so an old downloaded bundle cannot override a newly installed app.
4. If the feature changes the patcher, update its Java class and any needed manifest/resources. The patcher downloads through `UpdateClient`, selects releases with `UpdatePolicy`/`CompatibilityPack`, validates trust with `UpdateTrust`, rewrites and signs through `ApkPatcher`/`SigningIdentity`, and hands installation to Android via `ApkProvider`. Keep package, version, size, hash, certificate, and HTTPS-host checks intact. Keep network and file work off the UI thread, surface useful errors, and clean partial downloads.
5. Add or adjust the nearest meaningful tests: `tests/*.test.cjs` for patched-app behavior, `app/src/test/` for patcher behavior, and `native-tools/src/test/` for native loader behavior. Include a test for a failure or compatibility boundary when relevant. Update `README.md`, release notes/changelog, and this guide when behavior or the build contract changes.

The existing feature switches are in `modPreferencesCore.ts`; the extra customization controls have their own core file. The enhanced group view switch also defaults normal member cards to banner backgrounds; preserve an explicitly selected background in the display options. Keep feature behavior gated at use sites, not only hidden in the menu. Test disabled behavior and saved preference restoration. For sensitive features, keep PluralKit tokens in app settings, omit them from diagnostics, and avoid putting private data into logs or release assets. Storage snapshots and restore have strict size, path, authentication, and cold-start recovery rules; read `snapshotCore.ts`, `storageSnapshot.ts`, and `restoreQueue.ts` before changing their format or timing.

`UpdateClient` and the patched app's `updateCheckCore.ts` read the newest 100 GitHub releases in pages of 20, bounded to 2 MiB per page. Patcher, patch and compatibility selection share the Java client's feed, cached for one minute per client to avoid duplicate requests at startup. Keep selection independent of list order and preserve the preview, runtime, variant and asset validation rules. A failed or malformed page must fail the check rather than report that a partial list is up to date. Test release histories larger than 1 MiB in both clients; the old single-response limit broke discovery as releases accumulated. APK and patch download limits remain separate.

## Music and settings usability

Music is Android-only and off by default. `musicCore.ts` validates preferences, snapshots, LRC parsing, and LRCLIB responses. `music.ts` owns the local `sparklecat.music.v1` preferences, foreground polling, and command lifecycle. Keep this record out of cloud sync. `MusicRoot` mounts only after setup and app unlock; poll only while enabled and foreground, discard stale native responses after disable/background, and clear sessions on stop. Use the existing `AppText`, theme, and controls so fonts and colors follow app settings. Render the dock in `TabHost` and the full-player shortcut in `HubScreen`.

`MusicPlayer.tsx` follows BitChord's mobile player: artwork and title above pinned seek/playback/volume controls, lyrics and queue replacing artwork, a source capsule, bottom sheets, and a floating mini player. Keep portrait, short screens and landscape usable; keep controls available while scrolling lyrics/queue. Android back closes an open sheet, then returns to artwork, then closes the player. Gate commands by source capabilities and busy state; do not add inert streaming/library controls. Extra Customization's validated `CardArea` values `music`, `miniPlayer`, `lyrics`, and `queue` use the existing card appearance controls and cloud preference record. Always gate these overrides with the Extra Customization switch. The full player remains an opaque modal; its own backdrop renders validated local wallpaper paths or blurred artwork so transparency cannot expose overlapping page content. Read wallpaper through `mediaFiles.fs` and `options.wallpaper`, since storage-only variants have no wallpaper-specific exports.

`DeviceUnlockPackage` registers `SparklecatMusic`. `MusicModule.java` reads active Android media sessions only after explicit notification-access approval and sends commands only when supported by the selected source. `MusicNotificationListener` reports service availability to the native scrobbler; it never reads notification contents. `MusicManifest.java` appends its binary-XML service declaration while preserving original string indices, resources, and style data; it must remain idempotent and reject malformed manifests. Inject it only for provenance declaring `native_music: true`. Music requires runtime `mods-6` and patcher 0.6.6 or later. Current `mods-7` and previous `mods-6` bundles declare music support; legacy `mods-5` does not. All three retained hosts support device unlock. Keep these flags aligned when rotating runtimes. A JavaScript-only update cannot add a manifest service or bridge.

Online lyrics requires a separate local opt-in. Send only song metadata to LRCLIB, never app/account data. Keep the bounded lyrics cache in memory, abort obsolete requests, handle missing/plain/instrumental lyrics and network/rate-limit errors, and allow corrected searches. Keep synchronized seeking capability-gated. New preferences default to 34-point lyrics; preserve an existing explicit size. The player UI and lyrics behavior adapt BitChord's `NowPlayingScreen`, `PlayerControls`, `MiniPlayer`, `PlayerLyrics`, `PlayerQueue`, and `LrcLib`; preserve the attribution in `THIRD_PARTY_NOTICES.md` and `LICENSES/BitChord-GPL-3.0.txt` in source exports.

Last.fm requires runtime `mods-7` and patcher 0.6.7 or later. `lastfm.ts` checks every bridge method so older music hosts show rebuild guidance. `LastfmSettings.tsx` stays under Music player in the mod menu. Users supply their own API key and shared secret, obtain a token with signed `auth.getToken`, approve it in the browser, then finish with `auth.getSession`. Never embed a shared application secret or collect a Last.fm password. Scrobbling and Now Playing sharing both start off; Now Playing additionally requires scrobbling to be enabled. The music master switch gates native accounting, including after restart. Player UI polling still stops on background/lock; separately enabled scrobbling continues through the protected notification listener while Android permits the process to run. Do not imply that it can survive force-stop or battery restrictions.

`LastfmCore` counts observed playback progress, not seeks, paused time or process downtime. Require artist/title and a duration over 30 seconds; qualify at half the song or four minutes. Preserve the original UTC listen timestamp, checkpoint recent progress without counting downtime, and queue at most 500 listens. `LastfmApi` signs raw sorted UTF-8 parameter values with MD5 plus the shared secret, excludes `format`/`callback` from signatures, uses HTTPS and POST for submissions, and checks API errors even on HTTP 200. Batch at most 50 oldest listens, validate every acknowledgement before removing exact queued events, retry transient failures with backoff, and require reconnection for invalid credentials. Now Playing is ephemeral and must never retry stale tracks.

`LastfmScrobbler` serializes state and playback accounting on one worker and sends uploads on a separate executor. Persist eligible listens before uploading; keep pending data on malformed responses or storage failures. Store credentials, session, progress and queue in AES-GCM-encrypted `getNoBackupFilesDir()/sparklecat-lastfm-v1`, using the Android Keystore key `sparklecat.lastfm.v1` and atomic writes. These records must never enter cloud preferences, snapshots, diagnostics, logs, source archives, or script-facing status. Status exposes only account name, switches, activity, queue count and last submitted song. Disconnect clears the saved account and queue. API errors must use sanitized messages without echoing credentials or raw responses.

`SettingsSearch.tsx` matches visible labels/descriptions with case/accent folding and all query words. Never index input values, tokens, or other private settings. Hidden search sections remain mounted so filtering cannot interrupt saves; matching Extra Customization sections expand while searching. Keep Done outside the scrolling content, preserve keyboard dismissal, and display preference-save failures.

## Desktop companion

The companion's installed builds check GitHub's `desktop-vX.Y.Z` releases on startup and offer a manual check. Bump `VERSION` in `desktop-companion/updater.py` for each desktop release, and include the platform archives and installers from the desktop workflow. Updates verify GitHub's asset SHA-256 digest before replacing an installed copy, recover interrupted swaps, and restore the old copy if replacement or launch fails. Source and extracted builds do not self-update. Installers register the app in the Linux XDG menu, macOS Applications, or Windows Start menu; reinstalls replace the app and preserve user settings. Linux builds must include Pillow's `PIL._tkinter_finder` hidden import; the workflow opens the packaged GUI and tests the installed desktop launcher under Xvfb to catch startup failures.

The Python/Tkinter desktop companion reads Plural Star's encrypted cloud vault and publishes primary and co-fronting member names through Discord desktop IPC. It does not require PluralKit. Preserve opt-in sharing, store remembered credentials only in the operating system credential store, reuse the linked-device ID, and clear presence on stop or failed refresh. Optional settings sync writes only `ps:sparklecat:discord-companion`, using encrypted vault objects and version-checked manifest updates that preserve other entries. Mobile controls live under sparklecat's mods and require mod preference sync. Presence text, public image URLs and button links also sync in this dedicated record; never sync credentials. Concurrent edits to the same settings record use the last saved version. The upstream default relay uses HTTP; disclose that authentication is exposed in transit and allow HTTPS custom relays. Run `python3 -m unittest discover -s desktop-companion -p "test_*.py"` with its requirements installed; test against a real cloud account and Discord where available. Include `desktop-companion/` in the patcher source ZIP. `.github/workflows/desktop.yml` tests and packages Windows x64, macOS Intel and Apple silicon, and Linux x64 and ARM64 downloads on their respective platforms. Run it on the exact release commit, check all jobs and their self-tests, download the artifacts, and publish them in a new `desktop-v<version>` release without marking it latest. Include a source archive; do not replace published assets. These builds are unsigned; test actual Discord/cloud integration on each platform when available.

The presence editor can pause Discord presence for locally configured executable names. This setting stays on the computer, defaults off, checks the process list every 30 seconds, and clears presence if process detection fails. It does not inspect command-line arguments or detect Discord activities.

The presence editor can load fronter names, pronouns, encrypted cloud avatars, inline image data and public HTTPS photos for its local preview. External image requests must never receive vault credentials. Report photo failures without stopping presence updates. The packaged GUI self-test must open the presence editor and render a real profile photo. Presence templates use `{name}`, `{pronouns}`, `{fronters}`, `{count}` and `{avatar}`; Discord requires a public HTTPS image URL. Private photos may be uploaded only after explicit local consent in the presence editor. `share_photos` defaults off, stays local, and must never be imported or enabled through cloud/mobile settings. `desktop-companion/photos.py` uploads only the first fronter's photo when an image field uses `{avatar}`, strips original metadata, limits the image to 512px, and uses Uguu's [temporary upload API](https://uguu.se/api). Links expire after 3 hours; cache them in memory and renew after 2.5 hours. A random PNG upload token prevents host deduplication from reusing an expiring link; original image metadata is discarded. Explain public access, copying/caching and expiry before consent. Disabling stops new uploads, not existing links. Retry failed uploads with backoff while keeping text presence active. Preserve the specific HTTP, certificate, DNS, timeout or response error during backoff; never display raw host responses or private data. The packaged OpenSSL library uses Ubuntu certificate paths: when no CA certificates are loaded on Linux, try the installed distribution CA bundles with verification enabled. The Linux packaged self-test must also pass with the default OpenSSL paths overridden to nonexistent locations. Test consent/selection guards, metadata stripping, caching/renewal and failure recovery without uploading real user photos.

## Validation

Run the full payload build and Gradle checks above before a patcher release. Build and stage each configured runtime for patch releases:

```sh
python3 scripts/build-payloads.py --patches-only --legacy-runtime
python3 scripts/prepare-patch-release.py --legacy-runtime
python3 scripts/build-payloads.py --patches-only --previous-runtime
python3 scripts/prepare-patch-release.py --previous-runtime --append
python3 scripts/build-payloads.py --patches-only
python3 scripts/prepare-patch-release.py --append
```

The staged assets are in `.work/patch-release/`; inspect `provenance.json` and each bundle SHA-256 before publishing. With a local official APK, run `PLURAL_STAR_APK=/absolute/path/to/app-release.apk bash gradlew testDebugUnitTest` to exercise real APK rewriting, signature checks, and unchanged-entry comparisons. CI runs the full build on push and pull request and uploads a **debug** APK for testing, not distribution.

For music changes, run `tests/music.test.cjs` through the payload builder and the manifest/real-APK Gradle tests. `:native-tools:test` covers Last.fm playback timing, seeking/pauses, restart checkpoints, signatures, authentication, API errors and durable batch acknowledgements. Component tests cover connection approval, switches, secret clearing, errors and old-host messaging. On Android, test access denied/granted/revoked, multiple media sources, supported/unsupported commands, lyrics failure/retry, enable/disable/restart, lock/background behavior, Last.fm defaults and encrypted storage, and older-host messaging. Test with an actual media app and Last.fm account where available; synthetic sessions and mocked API responses do not prove real account submission or every provider's metadata support. State any unavailable integration checks when reporting validation.

For changes to installation or UI, test on an Android device or emulator: fresh official install, file/imported-installed APK selection, patch and install, an in-place rebuild with the same device signing key, offline behavior, and update prompts. For mod changes, also exercise enabled/disabled settings, restart, save restore, app lock, and the affected screen. Check all three variants and a matching compatibility pack when the change is variant- or upstream-sensitive. Android will reject an in-place update if the existing Plural Star installation has a different signing key; preserve user backups and never automate uninstalling it.

## Versioning and publishing

- **JavaScript-only mod change:** increase `payload/release.json` `version`; leave `runtime` unchanged if the native API and embedded resources remain compatible. Replace the notes in `payload/mods/changelog.ts` with only this release's changes and set `changelogVersion` to the same version; the payload builder checks it. These notes appear after installing the patch and in the mod menu. Build/stage patches and publish `patches-v<version>` using `.github/workflows/patches.yml` or equivalent local checks. That workflow verifies uploaded asset digests and needs no APK signing key.
- **Native loader, bridge, or packaged-resource change:** assign a new `runtime` in `payload/release.json` and retain `previous_runtime`/`legacy_runtime` only if you intentionally support those hosts. Build and release a patcher APK containing the new dex and publish matching compatibility packs. Do not offer new-runtime JavaScript to older native hosts. Keep corresponding build flags, capability guards, and `.github/workflows/patches.yml` stages in sync.
- **Notification delivery changes:** rest mode also patches Notifee in the official APK's primary dex. `scripts/build-native-updates.py` and `PatchNotifications.java` generate `primary.dex` for the exact supported APK; compatibility packs must include that matching dex. Verify the injection when updating the official APK or Notifee, and keep rest mode disabled when its native bridge is unavailable.
- **Patcher code/UI change or a new patcher APK:** increase both `versionCode` and `versionName` in `app/build.gradle`, replace `app/src/main/res/raw/changelog.txt` with only this release's changes, update release notes, then build, test, and sign the new APK. Keep `packageSource` includes current when adding top-level files so the next APK's source export contains every tracked source file. A documentation-only release does not require rebuilding the patcher.
- **New official Plural Star version:** use `.github/workflows/compatibility.yml` or the local compatibility process. It resolves the latest stable official APK and tag commit, checks the exact APK digest, builds/tests/signs temporary test APKs, and publishes only a matching pack. A failing build does not replace older packs. If upstream changed in a way that breaks a patch or injection, fix that integration, advance the patch version, and rerun.

Local compatibility sequence (authenticated `gh` required):

```sh
python3 scripts/compatibility-release.py resolve
export PLURAL_STAR_BASE="$PWD/.work/latest-base.json"
export PLURAL_STAR_APK="$PWD/.work/latest-official.apk"
python3 scripts/build-payloads.py
# Commit the exact source before staging it.
python3 scripts/compatibility-release.py stage
bash gradlew :native-tools:test testDebugUnitTest lintDebug lintRelease assembleDebug
python3 scripts/compatibility-release.py publish
```

`resolve` can report that an exact pack already exists. Published compatibility packs are immutable. Staging requires a clean committed tree and records that commit in provenance. Do not ship an untested pack for a newer upstream APK just because its version string looks compatible.

Patcher releases require the **original persistent publisher key**. `release-signing.sha256` pins its public certificate. Never replace that pin for an existing installation or commit a keystore/password. With the key in ignored `.work/signing/release.p12` and `.work/signing/release-password.txt`, `python3 scripts/release-artifact.py sign` signs the clean commit's unsigned release APK and writes a verified `patcher.apk` plus public `manifest.json` to `.work/signed/`. The helper checks the certificate, package/version, ZIP alignment, complete embedded source, and source commit. A signed artifact can be rechecked with `scripts/release-artifact.py verify`.

`.github/workflows/release.yml` needs a successful Android CI run on `main`, a draft `v<version>` release targeting that exact commit, and a staging commit containing the signed `patcher.apk` and `manifest.json`. It re-verifies both, publishes the signed APK, `git archive` source ZIP, and `SHA256SUMS`, then marks the release as a preview. No private key enters CI. The per-device Android Keystore key that signs patched Plural Star APKs must remain on the user's patcher installation; clearing its data or uninstalling it prevents in-place updates of that device's previously patched APK.

Keep release assets, source archives, and diagnostics free of credentials and user data. Published source must correspond to the exact shipped artifact; do not substitute a CI debug APK for a signed release.

## When something fails

- **`git apply` or an injection assertion fails:** the selected upstream commit no longer matches the expected source. Inspect `.work/upstream` at that commit, update the smallest relevant patch or anchor, and rerun every variant. Do not force a patch through without checking behavior.
- **Gradle reports a missing payload:** run the full `scripts/build-payloads.py` command; a single `--variant` build or `--patches-only` build is insufficient for the patcher APK.
- **An official APK is rejected:** compare its SHA-256 with `payload/base.json` or the exact compatibility pack. Use the standalone official release; inspect `CompatibilityPack.java` and the compatibility workflow if the official app was updated. Never loosen hash validation to make an unknown APK pass.
- **Patch/update discovery fails:** check the release tag, `payload/release.json` version/runtime, variant-specific asset names, release draft status, published size/digest, and `UpdatePolicy.java`. Check network errors in `UpdateClient.java` separately from selection errors. Publish a new immutable release after fixing bad assets.
- **Installation says the signatures differ:** inspect the installed app's signer and the patcher's retained Android Keystore identity. The publisher key signs only the patcher; it cannot replace the per-device key for an already installed patched app. Back up user data before any reinstall.
- **Source verification fails:** commit the exact files first, rebuild the unsigned APK so `packageSource` embeds that commit's source, then sign and verify again. The release verifier compares the embedded ZIP with every tracked file.

SparkleScript is unrestricted JavaScript after explicit device-local opt-in. Keep the master switch off by default and never restore it from cloud preferences. `sparkleScripts.ts` owns script lifecycle and app wrappers; scripts must register cleanup with `api.onDispose`. Keep legacy scripts compatible and update `SPARKLESCRIPT.md` when the API changes.
