<div align="center">

<img src=".github/assets/logo.svg" width="112" height="112" alt="Lilac cat with a gold sparkle, the app logo" />

# sparklecat's plural star mods

**Custom features and community additions for Plural Star on Android.**

[![Join the patches Discord](https://img.shields.io/badge/Discord-Join%20the%20patches%20community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/Pf2F2BawKV)

[Download the patcher](https://github.com/sparklecatdev/plural-star-mods/releases) · [Suggest a feature](https://github.com/sparklecatdev/plural-star-mods/issues/new) · [AGPL-3.0](LICENSE)

</div>

An Android patcher with offline APK patching for [ByHanyou/Plural-Star](https://github.com/ByHanyou/Plural-Star), with wallpaper backgrounds, an encrypted app storage saver/restorer, and optional PluralKit front sync.

Alongside custom features, this project includes adaptations of features that were rejected or have not been added to the official app, such as PluralKit front sync from the closed PR linked below.

The repository is **plural-star-mods**. The Android launcher name is **sparklecat's plural star mods**.

> **Unofficial project:** this project is not officially supported or endorsed by the Plural Star team. Please do not contact them about issues related to these mods or the patcher. Report those issues [here](https://github.com/sparklecatdev/plural-star-mods/issues). We will comply with any takedown requests from the Plural Star team.

## Features

- **Wallpaper:** personalize your app background and change it whenever you like.
- **Storage tools:** save and restore password-protected backups of your app data and local media.
- **Settings mod menu:** open **Settings → sparklecat's mods** to enable or disable included features. Switches save automatically; turning wallpaper off keeps the selected image, and turning storage tools off cancels a pending restore.
- **Quick launch:** a short sparkle animation leads straight into Plural Star. Reduced-motion settings are respected. Release notes appear after updates; mod controls stay in Settings.
- **Real APK patching:** verify the official APK, install the mod bundle and compatibility loader, align stored ZIP entries, sign with a persistent device key, verify the generated signature, then save or install the result.
- **All patches included:** every patched APK includes wallpaper, storage tools, and PluralKit front sync. Enable features in Settings.
- **PluralKit front sync:** opt in under Settings → sparklecat's mods and enter your PluralKit token to mirror primary front changes using imported PluralKit member IDs. Adapted from the closed [PR #11](https://github.com/ByHanyou/Plural-Star/pull/11).
- **Offline source access:** save the complete patcher source ZIP from inside the patcher, including the wallpaper patch, payload build scripts, and exact upstream inputs.
- **Latest upstream support:** the download resolves the newest stable official release. A scheduled build checks new releases every six hours and publishes matching compatibility packs when the mods and APK checks pass. No patcher update is needed for a compatible upstream release.
- **Independent patch updates:** a themed notice at app startup opens the patcher, which downloads verified compatible patches and rebuilds the installed app. Patch releases do not require a new patcher release. The patcher also has its own APK updater.
- **Changelogs and support:** themed release notes appear once after each installed update and can be reopened from **What's new**. Update notices include published release notes. Join the patches Discord or preview and share diagnostics under **Settings → sparklecat's mods → Help and community**, or in the patcher's **Help and community** section. Reports include versions and feature/update status; patcher reports also include device details, compatibility, and the last 20 operation outcomes. No tokens, account data, private paths, or raw error messages are included. Reports are only sent when you choose to share them.
- **Mod sync:** mod preferences and patch versions travel with the existing cloud save and linked-device sync. Preferences restore automatically; the patcher installs patch updates.
- **No root or account required.** Included patches work offline; app downloads and update checks use GitHub over HTTPS. The patched Plural Star retains its original networking behavior.

## Suggestions

Have a feature in mind? Message **sparklecatdev** directly, join the [patches Discord](https://discord.gg/Pf2F2BawKV), or [open a GitHub issue](https://github.com/sparklecatdev/plural-star-mods/issues/new). Suggestions for custom features and features missing from the official app are welcome.

## Supported versions

The patcher requires Android 8.0 or later. The patched app keeps the original package ID, minimum SDK, resources, permissions, version name, and version code. A small compatibility loader is added. Patcher-managed installations always use their embedded bundle, so old downloaded patches cannot override a new installation; other native classes are preserved.

The patcher downloads the latest stable official standalone `app-release.apk`, verifies GitHub’s published SHA-256 and size, and fetches a compatibility pack built for that exact APK. Choose a file or use the installed official app instead if preferred.

**Plural Star 1.23.3** is also bundled for offline patching of this exact original APK:

```text
SHA-256 0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f
Source  fe5259b16d6dc74be2b567738e35a0e3d9d2b759
```

Other official versions need a published matching compatibility pack. Split APKs, already patched APKs, and unknown originals are rejected. If a new upstream release breaks the build or checks, its pack is not published: report the compatibility issue or keep using your existing version until it is fixed. Every patch includes all features; enable or disable them in Settings without repatching. An existing modded installation can be updated when the signing key matches.

## First install and migration

1. In the official Plural Star app, export a complete backup with media. Verify the file is saved outside the app before uninstalling anything.
2. In this patcher, tap **Download latest Plural Star**, choose an APK file, or use the installed official app. The download comes directly from the latest stable official release and must match its published SHA-256 and size. Matching patches download automatically; new upstream releases may take until the next successful scheduled build to become available.
3. Tap **Prepare and install**. The patcher checks for newer compatible patches, verifies the download, applies all mods, and opens Android's installer. Grant install permission if prompted; installation continues when you return. You can also save the APK or install a previously prepared copy.
4. If the existing app uses a different signing key, the patcher offers shortcuts to Plural Star and Android app settings. After checking your backup, manually uninstall the existing app, return, and tap **Install prepared app**. The patcher never uninstalls apps automatically.
5. Open Plural Star, complete setup if needed, then use its standard Import screen to import the official JSON/ZIP backup.

Android prevents a separate patcher from reading the official app's private storage. The first migration therefore uses Plural Star's existing export/import support. Standard exports may omit device identity and other local-only state; friend/device links may need to be set up again. Full storage snapshots become available inside the patched app.

**Keep the patcher installed and do not clear its app data.** Its APK signing key lives in Android Keystore. Uninstalling/resetting the patcher loses that key, so future patched APKs cannot update an installation signed by the old key. Take a storage snapshot before changing patcher installations or signing keys. The v0.1.0 and v0.2.0 development APKs use different signing certificates. Moving from those previews to v0.3.0 requires backing up Plural Star first, then reinstalling the patcher. That resets its device signing key, so the modded Plural Star also needs a backed-up reinstall. Publisher-signed releases from v0.3.0 onward use a persistent certificate and support in-place patcher updates, preserving that device key.

## Updates

Plural Star checks for compatible patch releases at startup, at most once per day. When updates are available, a small popup in the patcher's purple/lilac theme offers **Open patcher** or **Later**. It waits until setup and the app lock are complete and appears at most once per launch. Update controls and downloads are managed by the patcher.

Open the patcher to check for patch updates automatically, then choose **Update installed mods** when an update is available. The patcher downloads the newest compatible stable patch, verifies its exact size and SHA-256 from GitHub's release metadata, rebuilds from the cached original APK using the existing device signing key, and opens Android's installer. Saved data stays in place. If the original APK is missing, download a fresh copy first. Offline checks offer saved matching patches, or the bundled patches for the offline base, only when this would not downgrade a previously prepared patch.

Patch releases have their own version in `payload/release.json` and tags such as `patches-v0.4.3`. Only releases matching the native runtime and feature variant are accepted. Compatibility releases use tags such as `compat-v1.23.3-patches-v0.4.4` and include matching native code, JavaScript, provenance, and offline mod source. A different official APK receives a separate runtime. These packs and JavaScript updates can ship independently of the patcher APK; changes to the patcher itself still require a patcher update. Apps using the older direct downloader can receive the new notice as a compatible patch, then use patcher v0.5.1 or later to rebuild into a patcher-managed installation.

The patcher checks for updates automatically when opened, and again after 15 minutes when returning to it. Use **Check for updates** to check for patcher and mod updates at any time. New patcher releases are downloaded and verified in the background, then offered in a themed **Install / Later** prompt. Installation waits while patching or while the app is in the background. Choose **Later** to continue; the update is offered again the next time you open the patcher or check manually. Preview releases are included by default; turn that option off to check stable releases only. Patch updates are also checked automatically when opening the patcher, and fetched when preparing the modded app.

The updater checks the exact size and SHA-256 from `SHA256SUMS`, verifies the APK signature against the installed patcher's certificate, and requires the same package plus a newer version and version code. Downloads remain private until verified. Android asks for installation permission and confirmation. Offline or rate-limited checks do not interrupt app launch or patching; reopening the patcher retries the check.

Keep the patcher installed and retain its app data so its per-device signing key stays available for future updates.

## Mod sync

Connect Plural Star's existing cloud storage or linked-device sync. Mod switches, PluralKit front sync, and installed patch versions are saved with your app data. Controls are under **Settings → sparklecat's mods → Mod sync**.

After restoring your save on a patched installation, preferences apply automatically. A newer saved patch version directs you to the patcher to update that device. Use **Restore mod preferences** to retry preference restoration manually.

The save contains preferences and release identifiers, never executable code or download URLs. Each device still needs a patched APK installed once; an official unpatched app cannot load mods from a save. Wallpaper image files are not synced by this feature. Native changes still require a rebuilt APK.

## PluralKit front sync

Import your PluralKit members, then open Plural Star **Settings → sparklecat's mods**, enable **PluralKit Front Sync**, and paste your system token (get it with `pk;token`). Changes save automatically. Sync is off by default. Subsequent primary front changes send the imported members' PluralKit IDs to your system; co-front and co-conscious tiers are excluded. An empty or entirely unmapped primary front sends a switch-out. Rapid changes are coalesced with a five-second cooldown; failed requests do not interrupt local saves and are retried on a subsequent front change. The [PluralKit API](https://pluralkit.me/api/endpoints/#create-switch) supports five- and six-character IDs and UUIDs.

The token is stored in app settings and included in backups. Disabling sync cancels queued changes; a request already sent may still complete.

## Storage snapshots

Open **Settings → sparklecat's mods**, turn on **Storage tools**, then choose **Backup app data** or **Restore app data**. On a fresh installation, complete the app's setup first to access Settings. The mod menu follows the app theme and remains behind the existing app lock.

For saving, use a password of at least 12 characters and repeat it. For restoring, enter the backup's password and confirm its timestamp. A confirmed restore is queued privately; use **Open app settings**, tap Android's **Force stop**, then reopen Plural Star to apply it automatically before the app or sync starts. Until then, you can cancel it from the mod menu. A cold restart is needed because notification services can keep the app alive after swiping it away. Changes made after scheduling a restore will be replaced. Disabling Storage tools also cancels it. Keep the password and backup safe; the password cannot be recovered or reset.

Snapshots include `ps:`, `ps.`, and `psdev:` AsyncStorage records and managed files under:

```text
ps_avatars       ps_avatars_full   ps_banners      ps_bio_images
ps_chat_media    ps_mirror_gifs    ps_backgrounds  ps_backup
```

Cache, Android permissions, system notification schedules, and files outside these managed directories are excluded. Device-local mod preference files are excluded; the mod sync record carries those choices and restores them after startup. Notification schedules are managed by the app after startup; confirm reminders after moving devices. Snapshots support **32 MiB of encoded payload** and up to 10,000 media files; use Plural Star's standard export for larger libraries. If data or media change during saving, the operation asks you to retry.

Format v1 uses scrypt (`N=32768, r=8, p=1`, 16-byte random salt) and XSalsa20-Poly1305 secretbox (32-byte key, 24-byte random nonce). Ciphertext is authenticated before any restore writes. Paths, storage keys, format, and size are validated. Media is staged and old directories/records are retained in a private recovery journal until commit. An interrupted restore is rolled back before opening Plural Star. Device-local media paths are rebased during restore.

Snapshots include account keys, journal content, and app lock settings. Only restore your own trusted snapshots. Do not operate two devices with the same restored device identity simultaneously.

## Build

Requirements: Node.js 24, npm, Python 3, Git, JDK 21, Android SDK platform 36/build tools 36.0.0, and accepted Android SDK licenses. Set `JAVA_HOME` and `ANDROID_HOME` for the build scripts.

```sh
python3 scripts/build-payloads.py
bash gradlew :native-tools:test testDebugUnitTest lintDebug lintRelease assembleDebug assembleRelease
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`. This is a development build; inspect and test it before using it with important data. The GitHub Actions workflow also builds this artifact.

By default, the builder uses the exact offline base in `payload/base.json`. It clones that upstream commit into disposable `.work/upstream`, installs the locked dependencies, applies background support where selected, adds the Settings menu and launch animation, runs TypeScript and regression checks, and generates all three production JavaScript bundles. It also downloads and verifies the pinned original APK if needed, compiles the native loader, and adds its host override to `classes2.dex` using build-time dexlib2. Set `JAVA_HOME` and `ANDROID_HOME` for that step. Plain JavaScript is intentional: the original Hermes engine can load it without coupling the patcher to a bytecode compiler version. The builder does not modify a user's external checkout. Generated bundles and APKs are ignored by Git; their complete source and provenance are tracked.

For a single payload: `python3 scripts/build-payloads.py --variant wallpaper-storage`. All three are required to package the patcher.

The **Latest Plural Star compatibility** workflow checks every six hours and can also be run manually. It resolves the latest stable official APK and its release tag’s exact source commit, applies the existing mods, runs TypeScript/component/storage checks, builds matching native code, and signs and verifies test APKs before publishing a compatibility pack. A failure leaves the existing packs untouched. Fix only the affected mods/build integration, increase the patch version, and rerun the workflow when upstream breaks compatibility. Passing checks cannot guarantee every app feature works; report regressions with the upstream and patch versions.

To perform the same build locally (requires authenticated `gh`, plus the build requirements above):

```sh
python3 scripts/compatibility-release.py resolve
export PLURAL_STAR_BASE="$PWD/.work/latest-base.json"
export PLURAL_STAR_APK="$PWD/.work/latest-official.apk"
python3 scripts/build-payloads.py
# Commit changes before staging so the source archive matches the build.
python3 scripts/compatibility-release.py stage
bash gradlew :native-tools:test testDebugUnitTest lintDebug lintRelease assembleDebug
python3 scripts/compatibility-release.py publish
```

Already published versions are immutable. If `resolve` reports that a matching pack exists, no rebuild is needed. Keep the offline base unchanged when building compatibility packs; `PLURAL_STAR_BASE` selects the resolved input without changing the embedded fallback. Restore a default payload build before packaging a patcher APK.

To publish patches independently, increase `version` in `payload/release.json`, commit the patch changes, and run the **Publish patches** workflow on `main` with release notes. It builds and tests all variants, verifies GitHub's uploaded asset digests, then publishes `patches-v<version>` without building or updating the patcher APK or requiring an APK signing key. Releases remain drafts if verification fails. Keep `runtime` unchanged for compatible JavaScript changes. Native loader/module or packaged resource changes need a new runtime and a matching compatibility pack or rebuilt patcher APK before publishing JavaScript updates. Never replace assets for an existing patch version; publish a newer version.

For local patch-only builds (Node.js and Python, no Android SDK):

```sh
python3 scripts/build-payloads.py --patches-only
python3 scripts/prepare-patch-release.py
```

Release assets are staged in `.work/patch-release/`. The source remains available at the matching release tag.

To run real-release signing tests as well:

```sh
PLURAL_STAR_APK=/path/to/original/app-release.apk bash gradlew testDebugUnitTest
```

These tests generate a temporary test key, patch all three bundles, verify their signatures, and compare every unchanged APK entry with the official original. Update tests cover compatible release selection, download verification, patcher-managed bundle selection, and legacy rollback after a failed launch. Storage tests cover interrupted restore recovery, queued cold restores, path/size validation, and password/tamper rejection. Component tests check automatic launch, reduced-motion behavior, app-lock protection, Settings navigation, feature switches, wallpaper retention, and the themed boot notice and patcher handoff.

The included CI builds development APKs and unsigned release APKs. Distributed releases use a separate persistent publisher key; its public certificate SHA-256 is pinned in `release-signing.sha256`. Never replace that pin for an existing installation. The separate per-device key used to sign patched Plural Star APKs is generated on the phone.

For maintainers with the original publisher key, build from a clean committed tree, then run:

```sh
python3 scripts/release-artifact.py sign
```

By default the private PKCS#12 keystore and password file live in ignored `.work/signing/release.p12` and `.work/signing/release-password.txt` (alias `sparklecat-release`). Keep a secure private backup of both files outside a disposable checkout. They must never be committed, included in APKs, or uploaded as release assets. The helper checks the public certificate pin, release package/version, alignment, and complete embedded source against the clean commit. It writes only the signed APK and public manifest to `.work/signed/`.

The release workflow accepts a successful main CI run, a matching draft release, and a staging commit containing only that signed `patcher.apk` and `manifest.json`. It repeats verification before publishing the APK, matching source ZIP, and `SHA256SUMS`. No private signing material is sent to GitHub. Debug artifacts from CI are for development and do not share the publisher signature.

## Credits and license

Plural Star by TheHanyou, SPARKLECATDEV, and contributors. PluralKit front sync adapted from [PR #11](https://github.com/ByHanyou/Plural-Star/pull/11) at `c1bd5e2f7a5fbb7934733e331154307948424cb0` for the current store and Settings architecture; the full adaptation is in `payload/pluralkit-pr-11.patch` and `payload/mods/pluralKit*`. Wallpaper adapted from sparklecatdev's PR #24 at `72aa97e443a313016d07c9dfec4f09a06edea304`, applied as a feature diff onto the pinned release so newer release fixes remain present.

This project and its upstream-derived payloads are licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**; see [LICENSE](LICENSE). Independent modification project; it does not use the original publisher's signing key. Android apksig is provided under Apache-2.0; React Native and other payload dependencies retain their respective licenses in the upstream source and npm packages.
