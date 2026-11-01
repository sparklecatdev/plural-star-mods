# Discord companion

Show your Plural Star fronters in your Discord activity. No PluralKit account or sync is needed.

1. Enable cloud sync in Plural Star and let it upload your data. Note your cloud password and relay URL in its cloud settings.
2. Download your computer's build from the [desktop releases](https://github.com/sparklecatdev/plural-star-mods/releases), extract it, and open Sparklecat Discord Companion. On Linux, run the executable inside the extracted folder. Windows and Linux downloads support 64-bit systems; Linux also has an ARM64 build. Choose the Intel or Apple silicon build for your Mac.
3. Open the Discord desktop app and enable activity sharing in Discord.
4. Enter your Plural Star cloud password and relay URL. Enter a relay token only if your relay uses one. Select Start.

The companion reads the encrypted cloud save directly and displays primary and co-fronting member names in Discord. These names are visible to others through your Discord activity; check Discord's privacy settings before starting. It checks every 30 seconds and clears the activity when stopped or a refresh fails. Plural Star must sync changes to the cloud, and your computer must be awake with Discord and the companion running.

The password is held in memory while running and is not saved. The companion registers a linked device in your cloud account; you can remove it from Plural Star's linked devices list. Its local device ID is saved so it can reuse the same device slot. The default Plural Star relay uses HTTP, which exposes cloud authentication to the network even though vault data is encrypted. Use an HTTPS relay where possible.

The downloads do not require Python. macOS and Windows may warn about the unsigned application. On macOS, open it from Finder and allow it in Privacy & Security if needed. On Linux, the build requires a graphical desktop and is built on Ubuntu 22.04. Flatpak and Snap Discord are supported when their IPC socket is accessible.

To run from source, install Python 3 with Tkinter, then use `Start.command` on macOS, `Start.bat` on Windows, or `sh Start.command` on Linux. The launcher installs the required packages on first use.
