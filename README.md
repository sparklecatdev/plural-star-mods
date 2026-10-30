# sparklecat's plural star mods

An offline Android patcher for [ByHanyou/Plural-Star](https://github.com/ByHanyou/Plural-Star), with selectable wallpaper backgrounds and an encrypted app storage saver/restorer.

The repository is **plural-star-mods**. The Android launcher name is **sparklecat's plural star mods**.

## Features

- **Wallpaper:** personalize your app background and change it whenever you like.
- **Storage tools:** save and restore password-protected backups of your app data and local media.
- **Settings mod menu:** open **Settings → sparklecat's mods** to enable or disable included features. Switches save automatically; turning wallpaper off keeps the selected image, and turning storage tools off cancels a pending restore.
- **Quick launch:** a short sparkle animation leads straight into Plural Star. Reduced-motion settings are respected. There is no mod menu or extra button to press on boot.
- **Real APK patching:** verify the official APK, replace its JavaScript bundle, align stored ZIP entries, sign with a persistent device key, verify the generated signature, then save or install the result.
- **Selectable mods:** include wallpaper, storage tools, or both when patching; control them in Settings afterward.
- **Offline source access:** save the complete patcher source ZIP from inside the patcher, including the pinned wallpaper patch and payload build scripts.
- **No root, account, server, or network permission required by the patcher.** The patched Plural Star retains its original networking behavior.

## Supported versions

The patcher requires Android 8.0 or later. The patched app keeps the original package ID, minimum SDK, native code, resources, permissions, version name, and version code.

Only the original standalone **Plural Star 1.23.3** [`app-release.apk`](https://github.com/ByHanyou/Plural-Star/releases/tag/v1.23.3) is accepted:

```text
SHA-256 0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f
Source  fe5259b16d6dc74be2b567738e35a0e3d9d2b759
```

Other versions, split APKs, and already patched APKs are deliberately rejected. Repatch the original APK to add features that were omitted from a patch; included features can be switched on or off in Settings without repatching. An existing modded installation can be updated when the signing key matches.

## First install and migration

1. In the official Plural Star app, export a complete backup with media. Verify the file is saved outside the app before uninstalling anything.
2. In this patcher, choose the original APK or use the installed official APK, select your mods, and tap **Patch APK**.
3. Save the patched APK if you want a copy. The patcher never uninstalls an app automatically.
4. Android cannot update the official app with a different signature. After verifying your backup, manually uninstall the official app, install the patched APK, and grant Android's install permission when prompted.
5. Open Plural Star, complete setup if needed, then use its standard Import screen to import the official JSON/ZIP backup.

Android prevents a separate patcher from reading the official app's private storage. The first migration therefore uses Plural Star's existing export/import support. Standard exports may omit device identity and other local-only state; friend/device links may need to be set up again. Full storage snapshots become available inside the patched app.

**Keep the patcher installed and do not clear its app data.** Its APK signing key lives in Android Keystore. Uninstalling/resetting the patcher loses that key, so future patched APKs cannot update an installation signed by the old key. Take a storage snapshot before changing patcher installations or signing keys. Development APKs from separate CI runs may also use different patcher signing certificates.

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

Requirements: Node.js 24, npm, Python 3, Git, JDK 21, Android SDK platform 36/build tools 36.0.0, and accepted Android SDK licenses. Set `ANDROID_HOME` or create an ignored `local.properties` with `sdk.dir=/path/to/sdk`.

```sh
python3 scripts/build-payloads.py
bash gradlew testDebugUnitTest lintDebug assembleDebug
```

The APK is `app/build/outputs/apk/debug/app-debug.apk`. This is a development build; inspect and test it before using it with important data. The GitHub Actions workflow also builds this artifact.

The builder clones the pinned upstream commit into disposable `.work/upstream`, installs the locked dependencies, applies background support where selected, adds the Settings menu and launch animation, runs TypeScript and regression checks, and generates all three production JavaScript bundles. Plain JavaScript is intentional: the original Hermes engine can load it without coupling the patcher to a bytecode compiler version. The builder does not modify a user's external checkout. Generated bundles and APKs are ignored by Git; their complete source and provenance are tracked.

For a single payload: `python3 scripts/build-payloads.py --variant wallpaper-storage`. All three are required to package the patcher.

To run real-release signing tests as well:

```sh
PLURAL_STAR_APK=/path/to/original/app-release.apk bash gradlew testDebugUnitTest
```

These tests generate a temporary test key, patch all three bundles, verify their signatures, and compare every unchanged APK entry with the official original. Storage tests cover interrupted restore recovery, queued cold restores, path/size validation, and password/tamper rejection. Component tests check automatic launch, reduced-motion behavior, app-lock protection, Settings navigation, feature switches, and wallpaper retention.

The included CI builds development APKs. For distribution, use your own stable patcher signing key and retain it privately; never commit a keystore or password. The separate per-device key used to sign patched Plural Star APKs is generated on the phone.

## Credits and license

Plural Star by [ByHanyou](https://github.com/ByHanyou/Plural-Star) and contributors. Wallpaper adapted from sparklecatdev's PR #24 at `72aa97e443a313016d07c9dfec4f09a06edea304`, applied as a feature diff onto the pinned release so newer release fixes remain present.

This project and its upstream-derived payloads are licensed under **AGPL-3.0**; see [LICENSE](LICENSE). Independent modification project; it does not use the original publisher's signing key. Android apksig is provided under Apache-2.0; React Native and other payload dependencies retain their respective licenses in the upstream source and npm packages.
