# Discord companion

The companion shows your public PluralKit fronters as a Discord activity. It runs on your computer, independently of the patcher.

1. In Plural Star, enable PluralKit front sync under Settings → sparklecat's mods. Import PluralKit members and use their imported IDs. Only primary front changes are mirrored.
2. In PluralKit, find your system ID with `pk;system id`. Your current fronter must be public (`pk;system privacy fronter public`). Anyone can then see that information through PluralKit; check member visibility too.
3. Install Python 3 with Tkinter, open Discord's desktop app, and enable Discord's activity sharing in its settings.
4. Open `Start.command` on macOS or `Start.bat` on Windows. On Linux, run `python3 companion.py` from this folder. Enter your system ID and select Start. Select Stop or close the window to clear the activity.

The companion checks every 30 seconds and retries when Discord or PluralKit is unavailable. It clears the activity if a refresh fails. Discord and the companion must keep running; a sleeping or switched-off computer cannot keep it updated. Changes made only in Plural Star must first be synced to PluralKit. This is not a live connection to Plural Star's cloud save.

On Linux, install your distribution's Tkinter package if Python cannot import `tkinter`. No PluralKit token or Discord login is needed by the companion.
