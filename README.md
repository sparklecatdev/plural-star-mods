# sparklecat's plural star mods

An Android patcher with offline APK patching for [ByHanyou/Plural-Star](https://github.com/ByHanyou/Plural-Star), with wallpaper backgrounds, an encrypted app storage saver/restorer, and optional PluralKit front sync.

The repository is **plural-star-mods**. The Android launcher name is **sparklecat's plural star mods**.

## Features

- **Wallpaper:** personalize your app background and change it whenever you like.
- **Storage tools:** save and restore password-protected backups of your app data and local media.
- **Settings mod menu:** open **Settings → sparklecat's mods** to enable or disable included features. Switches save automatically; turning wallpaper off keeps the selected image, and turning storage tools off cancels a pending restore.
- **Quick launch:** a short sparkle animation leads straight into Plural Star. Reduced-motion settings are respected. There is no mod menu or extra button to press on boot.
- **Real APK patching:** verify the official APK, install the mod bundle and patch update loader, align stored ZIP entries, sign with a persistent device key, verify the generated signature, then save or install the result.
- **All patches included:** every patched APK includes wallpaper, storage tools, and PluralKit front sync. Enable features in Settings.
- **PluralKit front sync:** opt in under Settings → sparklecat's mods and enter your PluralKit token to mirror primary front changes using imported PluralKit member IDs. Adapted from the closed [PR #11](https://github.com/ByHanyou/Plural-Star/pull/11).
- **Offline source access:** save the complete patcher source ZIP from inside the patcher, including the pinned wallpaper patch and payload build scripts.
- **Independent patch updates:** check and download patches inside Plural Star under Settings → sparklecat's mods. Verified patches apply on a full restart, with rollback if a new patch cannot start. The patcher has its own APK updater.
- **No root or account required.** Patching works offline; app downloads and optional update checks use GitHub over HTTPS. The patched Plural Star retains its original networking behavior.

## Supported versions

The patcher requires Android 8.0 or later. The patched app keeps the original package ID, minimum SDK, resources, permissions, version name, and version code. A small native loader is added to select verified patch bundles; other native classes are preserved.

Only the original standalone **Plural Star 1.23.3** [`app-release.apk`](https://github.com/ByHanyou/Plural-Star/releases/tag/v1.23.3) is accepted:

```text
SHA-256 0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f
Source  fe5259b16d6dc74be2b567738e35a0e3d9d2b759
```

Other versions, split APKs, and already patched APKs are deliberately rejected. Every patch includes all features; enable or disable them in Settings without repatching. An existing modded installation can be updated when the signing key matches.

## First install and migration

1. In the official Plural Star app, export a complete backup with media. Verify the file is saved outside the app before uninstalling anything.
2. In this patcher, tap **Download Plural Star**, choose an APK file, or use the installed official app. The download comes directly from the supported official release and must match its pinned SHA-256 before use.
3. Tap **Prepare and install**. The patcher applies all mods and opens Android's installer. Grant install permission if prompted; installation continues when you return. You can also save the APK or install a previously prepared copy.
4. If the existing app uses a different signing key, the patcher offers shortcuts to Plural Star and Android app settings. After checking your backup, manually uninstall the existing app, return, and tap **Install prepared app**. The patcher never uninstalls apps automatically.
5. Open Plural Star, complete setup if needed, then use its standard Import screen to import the official JSON/ZIP backup.

Android prevents a separate patcher from reading the official app's private storage. The first migration therefore uses Plural Star's existing export/import support. Standard exports may omit device identity and other local-only state; friend/device links may need to be set up again. Full storage snapshots become available inside the patched app.

**Keep the patcher installed and do not clear its app data.** Its APK signing key lives in Android Keystore. Uninstalling/resetting the patcher loses that key, so future patched APKs cannot update an installation signed by the old key. Take a storage snapshot before changing patcher installations or signing keys. The v0.1.0 and v0.2.0 development APKs use different signing certificates. Moving from those previews to v0.3.0 requires backing up Plural Star first, then reinstalling the patcher. That resets its device signing key, so the modded Plural Star also needs a backed-up reinstall. Publisher-signed releases from v0.3.0 onward use a persistent certificate and support in-place patcher updates, preserving that device key.

## Updates

In Plural Star, open **Settings → sparklecat's mods**, tap **Check for updates**, then **Download patches**. The app downloads its own patches; updating or opening the patcher is unnecessary. Once ready, tap **Open app settings**, use Android's **Force stop**, and reopen Plural Star. A full restart is required because notification services can keep the process alive after swiping it away. Saved data stays in place.

Patch releases have their own version in `payload/release.json` and tags such as `patches-v0.4.2`. Only stable releases matching the installed native runtime and feature variant are accepted. GitHub's release API supplies the asset URL, exact byte size, and SHA-256 digest over HTTPS. The app checks size and SHA-256 before staging, and the native loader checks again before execution. A failed first launch restores the previous bundle (or the embedded bundle) on the next full start and skips that failed patch in future checks. Patch files are private and excluded from storage snapshots. Patches can change JavaScript and use already bundled resources/native modules; changes to native modules, Android permissions, or packaged assets need a newly created APK and a new runtime identifier.

Apps created with the older placeholder updater need one rebuild/install with patcher v0.5.0 or later to gain the native update loader. After that, compatible patch updates install directly inside Plural Star.

The patcher has its own update card. Both apps can check once per day when opened; automatic checks can be disabled independently, and manual checks remain available. With **Update patcher automatically** enabled (the default), the patcher downloads and verifies new releases, then opens Android's installer while the patcher is visible. If patching is in progress or the patcher is in the background, installation waits for you to tap **Install downloaded update**. The patcher includes preview releases by default; turn that option off to check stable releases only. Patch releases do not appear as patcher updates.

With automatic updates disabled, choose **Download and install update** in the patcher. The updater downloads the APK and `SHA256SUMS` from this repository, checks the exact size and SHA-256, verifies the APK signature against the installed patcher's certificate, and requires the same package plus a newer version and version code. Downloads remain private until verified. Android asks for installation permission and confirmation; installation is never silent. Offline or rate-limited checks do not interrupt app launch or patching.

Use the patcher to create the app or rebuild it for native changes. Choose **Update installed mods** to rebuild from the cached original APK and open Android's installer. If the original APK is missing, download a fresh copy first. Keep the patcher installed and retain its app data so its per-device signing key stays available for future APK rebuilds.

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

Cache, Android permissions, system notification schedules, local mod switch preferences, and files outside these managed directories are excluded. Notification schedules are managed by the app after startup; confirm reminders after moving devices. Snapshots support **32 MiB of encoded payload** and up to 10,000 media files; use Plural Star's standard export for larger libraries. If data or media change during saving, the operation asks you to retry.

Format v1 uses scrypt (`N=32768, r=8, p=1`, 16-byte random salt) and XSalsa20-Poly1305 secretbox (32-byte key, 24-byte random nonce). Ciphertext is authenticated before any restore writes. Paths, storage keys, format, and size are validated. Media is staged and old directories/records are retained in a private recovery journal until commit. An interrupted restore is rolled back before opening Plural Star. Device-local media paths are rebased during restore.

Snapshots include account keys, journal content, and app lock settings. Only restore your own trusted snapshots. Do not operate two devices with the same restored device identity simultaneously.

## Build

Requirements: Node.js 24, npm, Python 3, Git, JDK 21, Android SDK platform 36/build tools 36.0.0, and accepted Android SDK licenses. Set `JAVA_HOME` and `ANDROID_HOME` for the build scripts.

```sh
python3 scripts/build-payloads.py
bash gradlew :native-tools:test testDebugUnitTest lintDebug lintRelease assembleDebug assembleRelease
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`. This is a development build; inspect and test it before using it with important data. The GitHub Actions workflow also builds this artifact.

The builder clones the pinned upstream commit into disposable `.work/upstream`, installs the locked dependencies, applies background support where selected, adds the Settings menu and launch animation, runs TypeScript and regression checks, and generates all three production JavaScript bundles. It also downloads and verifies the pinned original APK if needed, compiles the native loader, and adds its host override to `classes2.dex` using build-time dexlib2. Set `JAVA_HOME` and `ANDROID_HOME` for that step. Plain JavaScript is intentional: the original Hermes engine can load it without coupling the patcher to a bytecode compiler version. The builder does not modify a user's external checkout. Generated bundles and APKs are ignored by Git; their complete source and provenance are tracked.

For a single payload: `python3 scripts/build-payloads.py --variant wallpaper-storage`. All three are required to package the patcher.

To publish patches independently, increase `version` in `payload/release.json`, commit the patch changes, and run the **Publish patches** workflow on `main` with release notes. It builds and tests all variants, verifies GitHub's uploaded asset digests, then publishes `patches-v<version>` without building or updating the patcher APK or requiring an APK signing key. Releases remain drafts if verification fails. Keep `runtime` unchanged for compatible JavaScript changes; change it whenever native loader/modules or packaged resources change, and distribute a rebuilt APK first. Never replace assets for an existing patch version; publish a newer version.

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

These tests generate a temporary test key, patch all three bundles, verify their signatures, and compare every unchanged APK entry with the official original. Update tests cover compatibility, download verification, interrupted installs, and rollback after a failed launch. Storage tests cover interrupted restore recovery, queued cold restores, path/size validation, and password/tamper rejection. Component tests check automatic launch, reduced-motion behavior, app-lock protection, Settings navigation, feature switches, and wallpaper retention.

The included CI builds development APKs and unsigned release APKs. Distributed releases use a separate persistent publisher key; its public certificate SHA-256 is pinned in `release-signing.sha256`. Never replace that pin for an existing installation. The separate per-device key used to sign patched Plural Star APKs is generated on the phone.

For maintainers with the original publisher key, build from a clean committed tree, then run:

```sh
python3 scripts/release-artifact.py sign
```

By default the private PKCS#12 keystore and password file live in ignored `.work/signing/release.p12` and `.work/signing/release-password.txt` (alias `sparklecat-release`). Keep a secure private backup of both files outside a disposable checkout. They must never be committed, included in APKs, or uploaded as release assets. The helper checks the public certificate pin, release package/version, alignment, and complete embedded source against the clean commit. It writes only the signed APK and public manifest to `.work/signed/`.

The release workflow accepts a successful main CI run, a matching draft release, and a staging commit containing only that signed `patcher.apk` and `manifest.json`. It repeats verification before publishing the APK, matching source ZIP, and `SHA256SUMS`. No private signing material is sent to GitHub. Debug artifacts from CI are for development and do not share the publisher signature.

## Credits and license

Plural Star by TheHanyou, SPARKLECATDEV, and contributors. PluralKit front sync adapted from [PR #11](https://github.com/ByHanyou/Plural-Star/pull/11) at `c1bd5e2f7a5fbb7934733e331154307948424cb0` for the current store and Settings architecture; the full adaptation is in `payload/pluralkit-pr-11.patch` and `payload/mods/pluralKit*`. Wallpaper adapted from sparklecatdev's PR #24 at `72aa97e443a313016d07c9dfec4f09a06edea304`, applied as a feature diff onto the pinned release so newer release fixes remain present.

This project and its upstream-derived payloads are licensed under **AGPL-3.0**; see [LICENSE](LICENSE). Independent modification project; it does not use the original publisher's signing key. Android apksig is provided under Apache-2.0; React Native and other payload dependencies retain their respective licenses in the upstream source and npm packages.
