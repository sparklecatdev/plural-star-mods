# Discord companion

Show your Plural Star fronters in your Discord activity. No PluralKit account or sync is needed.

1. Enable cloud sync in Plural Star and let it upload your data. Note your cloud password and relay URL in its cloud settings.
2. Install Python 3 with Tkinter and open the Discord desktop app. Enable activity sharing in Discord.
3. Open `Start.command` on macOS or `Start.bat` on Windows. On Linux run `sh Start.command`. The launcher installs the required Python packages on first use.
4. Enter your Plural Star cloud password and relay URL. Enter a relay token only if your relay uses one. Select Start.

The companion reads the encrypted cloud save directly and displays primary and co-fronting member names in Discord. These names are visible to others through your Discord activity; check Discord's privacy settings before starting. It checks every 30 seconds and clears the activity when stopped or a refresh fails. Plural Star must sync changes to the cloud, and your computer must be awake with Discord and the companion running.

The password is held in memory while running and is not saved. The companion registers a linked device in your cloud account; you can remove it from Plural Star's linked devices list. Its local device ID is saved so it can reuse the same device slot. The default Plural Star relay uses HTTP, which exposes cloud authentication to the network even though vault data is encrypted. Use an HTTPS relay where possible.

On Linux, install your distribution's Python venv and Tkinter packages if needed. On macOS, allow the launcher in Privacy & Security if the system blocks it.
