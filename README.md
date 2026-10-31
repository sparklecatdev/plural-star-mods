<div align="center">

<img src=".github/assets/logo.svg" width="112" height="112" alt="Lilac cat with a gold sparkle, the app logo" />

# sparklecat's plural star mods

**An Android patcher that adds new or rejected features to Plural Star.**

[![Join the patches Discord](https://img.shields.io/badge/Discord-Join%20the%20patches%20community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/Pf2F2BawKV)

[Download the patcher](https://github.com/sparklecatdev/plural-star-mods/releases) · [Suggest a feature](https://github.com/sparklecatdev/plural-star-mods/issues/new) · [AGPL-3.0](LICENSE)

</div>

An Android patcher that modifies Plural Star to add features that were either rejected or not included in the official app.

This repository is **plural-star-mods**. The Android launcher name is **sparklecat's plural star mods**.

> **Unofficial project:** this project is not officially supported or endorsed by the Plural Star team. Please do not contact them about issues related to these mods or the patcher. Report those issues [here](https://github.com/sparklecatdev/plural-star-mods/issues). We will comply with any takedown requests from the Plural Star team.

## Features

- **Wallpaper:** personalize your app background and change it whenever you like.
- **Storage tools:** save and restore password-protected backups of your app data and local media.
- **PluralKit front sync:** synchronize primary fronts with your PluralKit system (adapted from rejected upstream PR #11).
- **Extra customization:** modify interface appearance and behavior to suit your preferences.
- **Allow No speaker:** enable a "No speaker" choice in features that normally require member selection.
- **Single confirmation:** remove redundant confirmation prompts for common operations.
- **Biometric or device unlock:** supplement application password lock with biometric or screen-lock credentials.
- **Conditional lock icon:** hide the lock icon when application locking is not enabled.

## First install

1. In the official Plural Star app, export a complete backup with media
2. In this patcher, tap **Download latest Plural Star**, choose an APK file, or use the installed official app  
3. Tap **Prepare and install**. The patcher checks for newer compatible patches, verifies the download, applies all mods, and opens Android's installer
4. If the existing app uses a different signing key, the patcher offers shortcuts to Plural Star and Android app settings. After checking your backup, manually uninstall the existing app, return, and tap **Install prepared app**
5. Open Plural Star, complete setup if needed, then use its standard Import screen to import the official JSON/ZIP backup

**Keep the patcher installed and do not clear its app data.**

## Updates

Plural Star checks for compatible patch releases at startup, at most once per day. When updates are available, a small popup offers **Open patcher** or **Later**.

Open the patcher to check for patch updates automatically, then choose **Update installed mods** when an update is available.

The patcher downloads the newest compatible stable patch, verifies its exact size and SHA-256 from GitHub's release metadata, rebuilds from the cached original APK using the existing device signing key, and opens Android's installer. Saved data stays in place.

## Mod sync

Connect Plural Star's existing cloud storage or linked-device sync. Mod switches, PluralKit front sync, and installed patch versions are saved with your app data.

After restoring your save on a patched installation, preferences apply automatically. A newer saved patch version directs you to the patcher to update that device.

## Credits and license

Plural Star by TheHanyou, SPARKLECATDEV, and contributors. PluralKit front sync adapted from [PR #11](https://github.com/ByHanyou/Plural-Star/pull/11) at `c1bd5e2f7a5fbb7934733e331154307948424cb0` for the current store and Settings architecture; the full adaptation is in `payload/pluralkit-pr-11.patch` and `payload/mods/pluralKit*`. Wallpaper adapted from sparklecatdev's PR #24 at `72aa97e443a313016d07c9dfec4f09a06edea304`, applied as a feature diff onto the pinned release so newer release fixes remain present.

This project and its upstream-derived payloads are licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**; see [LICENSE](LICENSE). Independent modification project; it does not use the original publisher's signing key. Android apksig is provided under Apache-2.0; React Native and other payload dependencies retain their respective licenses in the upstream source and npm packages.