# Developer guide

This is the maintainer's map of the repository. Read the relevant source before changing it. `README.md` describes the user-facing behavior; this file describes where that behavior comes from and how to build, test, and release it. The exact supported inputs and versions are in `payload/base.json`, `payload/release.json`, and `app/build.gradle`, not in this guide.

## What this repository builds

The **patcher** is the Android app in `app/` (`dev.sparklecat.pluralmods`). It obtains a verified official Plural Star APK, replaces its React Native bundle and `classes2.dex`, signs the result with a key held in Android Keystore on that device, and offers the APK to Android's installer. It does not change Plural Star's package identity. The patcher's publisher key is separate from the per-device key used for patched APKs.

The **payload** is the modified Plural Star app. `scripts/build-payloads.py` checks out an exact upstream commit into disposable `.work/upstream`, applies the diffs in `payload/*.patch`, copies `payload/mods/` into its `src/mods/`, makes a few checked entry-point edits, and produces JavaScript bundles. `scripts/build-native-updates.py` builds the native host/loader dex. The patcher packages three variants: `wallpaper`, `storage`, and `wallpaper-storage`. Their names are compatibility identifiers; all published patch features are included and switched on or off inside the patched app. Plain JavaScript bundles are intentional for the original app's Hermes host.

The **release streams** are different:

| Stream | Version/source | Contents and purpose |
| --- | --- | --- |
| Patcher APK | `versionCode` and `versionName` in `app/build.gradle`; `v<version>` release | Signed patcher, exact source ZIP, checksums. Required for patcher UI, Java, packaged native dex, or resource changes. |
| JavaScript patches | `version` and `runtime` in `payload/release.json`; `patches-v<version>` release | Verified bundles for the compatible runtime and variants; no new patcher APK. The optional `legacy_runtime` emits older-runtime bundles too. |
| Official-version compatibility | Exact official APK SHA-256 and upstream commit; `compat-v<upstream>-patches-v<patch>` release | Matching bundle, native dex, provenance, and source for an official APK other than the embedded fallback. |

Do not change a published release's assets in place. Advance the appropriate version and publish a new release.

## Source map

| Area | Files to read or change |
| --- | --- |
| Supported offline original and payload version | `payload/base.json`, `payload/release.json`, `scripts/base_config.py` |
| Upstream integration and build order | `scripts/build-payloads.py`, `payload/*.patch` |
| Patched-app screens and behavior | `payload/mods/*.tsx`, `payload/mods/*.ts` |
| Feature defaults, persistence, and cloud sync | `payload/mods/modPreferencesCore.ts`, `modPreferences.ts`, `cloudModsCore.ts`, `cloudMods.ts` |
| Extra interface controls | `payload/mods/extraCustomizationCore.ts`, `extraCustomization.ts`, `ExtraCustomizationMenu.tsx` |
| Patched-app startup, app lock, and recovery | `payload/mods/ModsRoot.tsx`, `storageSnapshot.ts`, `restoreQueue.ts`, `toolsState.ts` |
| Update notice and handoff to patcher | `payload/mods/PatchUpdatePrompt.tsx`, `updateCheck.ts`, `updateCheckCore.ts`, `patchInstallCore.ts` |
| PluralKit sync | `payload/pluralkit-pr-11.patch`, `payload/mods/PluralKitSettings.tsx`, `pluralKitSync.ts`, `pluralKitSyncCore.ts` |
| Storage backups | `payload/mods/BackupTools.tsx`, `storageSnapshot.ts`, `snapshotCore.ts`, `restoreQueue.ts` |
| Native loader and unlock bridge | `payload/native/*.java`, `scripts/build-native-updates.py`, `native-tools/src/main/java/dev/sparklecat/tools/PatchHost.java` |
| Patcher UI and installation | `app/src/main/java/dev/sparklecat/pluralmods/MainActivity.java`, `ApkPatcher.java`, `SigningIdentity.java`, `ApkProvider.java` |
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

The development APK is `app/build/outputs/apk/debug/app-debug.apk`; the release build is unsigned. `app/build.gradle` makes `preBuild` verify all three bundles and dex files and package a complete source ZIP into the APK. Generated bundles, dex files, APKs, and `.work/` are ignored; commit their source, configuration, and provenance instead. `scripts/build-payloads.py --variant wallpaper-storage` is useful during development, but build all three variants before packaging the patcher. `--patches-only` skips the Android dex build; `--legacy-runtime` is valid only with `--patches-only` and a configured `legacy_runtime`.

The builder resets and cleans **only** `.work/upstream`, installs upstream and test dependencies from lockfiles, and applies patches in this order: wallpaper (wallpaper variants only), PluralKit, no-speaker, confirmation, device unlock, lock icon, extra customization, then group view. It copies `payload/mods/`, writes generated `modOptions.ts` with variant/version/runtime flags, injects the mod menu into upstream Settings, adjusts wallpaper controls, adds cloud sync and the update notice to `App.tsx`, and makes `ModsRoot` the entry point in `index.js`. Each variant must typecheck and pass the Node regression tests before its bundle is emitted. Wallpaper variants also run upstream background/restore tests. If an upstream anchor or patch fails, fix the integration against that exact upstream source; do not silently skip the change.

`payload/base.json` pins the offline fallback to one official tag, commit, URL, and APK SHA-256. `scripts/base_config.py` validates those inputs. `PLURAL_STAR_BASE=/absolute/path/to/base.json` selects a different, exact upstream input for compatibility builds; its runtime is derived from the upstream version and APK hash. Restore the default build before packaging a patcher APK.

## Adding or changing a feature

1. Find the upstream behavior in `.work/upstream` after a payload build and read the relevant `payload/mods/` code and patch files. Work in `payload/mods/` for self-contained logic and UI. Use a small `payload/*.patch` diff when an upstream file must change. Put cross-cutting entry-point edits in `scripts/build-payloads.py` only when the existing injection pattern fits. Never edit `.work/upstream` as the source of truth.
2. Add the user control to `ModMenu.tsx` or `ExtraCustomizationMenu.tsx`, backed by the existing preference helpers. Patch-specific settings belong under **Settings → sparklecat's mods**. Preserve defaults and previous saved preferences; validate values loaded from storage and cloud saves. If a setting should travel with cloud saves, update the declarative allowlist and validation in `cloudModsCore.ts` and the restore path in `cloudMods.ts`. Cloud saves carry preferences and patch identifiers, not executable code, URLs, or secrets.
3. If the feature touches native APIs, update `payload/native/` and `scripts/build-native-updates.py`; check the React Native package registration and dex host in `PatchHost.java`. A native API or host change requires a new runtime and a rebuilt patcher/compatibility pack. `BundleLoader` checks runtime, variant, version, size, and SHA-256 before using a downloaded bundle and rolls back a failed launch. Patcher-managed APKs use their embedded bundle so an old downloaded bundle cannot override a newly installed app.
4. If the feature changes the patcher, update its Java class and any needed manifest/resources. The patcher downloads through `UpdateClient`, selects releases with `UpdatePolicy`/`CompatibilityPack`, validates trust with `UpdateTrust`, rewrites and signs through `ApkPatcher`/`SigningIdentity`, and hands installation to Android via `ApkProvider`. Keep package, version, size, hash, certificate, and HTTPS-host checks intact. Keep network and file work off the UI thread, surface useful errors, and clean partial downloads.
5. Add or adjust the nearest meaningful tests: `tests/*.test.cjs` for patched-app behavior, `app/src/test/` for patcher behavior, and `native-tools/src/test/` for native loader behavior. Include a test for a failure or compatibility boundary when relevant. Update `README.md`, release notes/changelog, and this guide when behavior or the build contract changes.

The existing feature switches are in `modPreferencesCore.ts`; the extra customization controls have their own core file. Keep feature behavior gated at use sites, not only hidden in the menu. Test disabled behavior and saved preference restoration. For sensitive features, keep PluralKit tokens in app settings, omit them from diagnostics, and avoid putting private data into logs or release assets. Storage snapshots and restore have strict size, path, authentication, and cold-start recovery rules; read `snapshotCore.ts`, `storageSnapshot.ts`, and `restoreQueue.ts` before changing their format or timing.

## Validation

Run the full payload build and Gradle checks above before a patcher release. For a JavaScript-only patch release, build and stage both runtimes when `legacy_runtime` is configured:

```sh
python3 scripts/build-payloads.py --patches-only --legacy-runtime
python3 scripts/prepare-patch-release.py --legacy-runtime
python3 scripts/build-payloads.py --patches-only
python3 scripts/prepare-patch-release.py --append
```

The staged assets are in `.work/patch-release/`; inspect `provenance.json` and each bundle SHA-256 before publishing. With a local official APK, run `PLURAL_STAR_APK=/absolute/path/to/app-release.apk bash gradlew testDebugUnitTest` to exercise real APK rewriting, signature checks, and unchanged-entry comparisons. CI runs the full build on push and pull request and uploads a **debug** APK for testing, not distribution.

For changes to installation or UI, test on an Android device or emulator: fresh official install, file/imported-installed APK selection, patch and install, an in-place rebuild with the same device signing key, offline behavior, and update prompts. For mod changes, also exercise enabled/disabled settings, restart, save restore, app lock, and the affected screen. Check all three variants and a matching compatibility pack when the change is variant- or upstream-sensitive. Android will reject an in-place update if the existing Plural Star installation has a different signing key; preserve user backups and never automate uninstalling it.

## Versioning and publishing

- **JavaScript-only mod change:** increase `payload/release.json` `version`; leave `runtime` unchanged if the native API and embedded resources remain compatible. Build/stage patches and publish `patches-v<version>` using `.github/workflows/patches.yml` or equivalent local checks. That workflow verifies uploaded asset digests and needs no APK signing key.
- **Native loader, bridge, or packaged-resource change:** assign a new `runtime` in `payload/release.json` and retain a `legacy_runtime` only if you intentionally support it. Build and release a patcher APK containing the new dex and publish matching compatibility packs. Do not offer new-runtime JavaScript to older native hosts.
- **Patcher code/UI change or a new patcher APK:** increase both `versionCode` and `versionName` in `app/build.gradle`, update `app/src/main/res/raw/changelog.txt` and release notes, then build, test, and sign the new APK. Keep `packageSource` includes current when adding top-level files so the next APK's source export contains every tracked source file. A documentation-only release does not require rebuilding the patcher.
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
