#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
install_dir="$data_home/sparklecat-discord-companion"
applications="$data_home/applications"
if [ ! -x "$source_dir/Sparklecat-Discord-Companion" ]; then
    echo 'Run this installer from the extracted Linux release folder.' >&2
    exit 1
fi
case "$source_dir/" in "$install_dir/"*) echo 'Run the installer from an extracted release, not the installation directory.' >&2; exit 1;; esac
mkdir -p "$data_home" "$applications"
staging=$(mktemp -d "$data_home/.sparklecat-install.XXXXXXXX")
backup=
cleanup() {
    rm -rf "$staging"
    if [ -n "$backup" ] && [ -e "$backup/install" ]; then
        if [ ! -e "$install_dir" ]; then mv "$backup/install" "$install_dir"; fi
        if [ -e "$install_dir" ] && [ -e "$backup/install" ]; then
            echo "Previous installation preserved at $backup/install" >&2
        else
            rmdir "$backup" 2>/dev/null || true
        fi
    fi
}
trap cleanup EXIT HUP INT TERM
cp -R "$source_dir/." "$staging/"
if [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
    backup=$(mktemp -d "$data_home/.sparklecat-backup.XXXXXXXX")
    mv "$install_dir" "$backup/install"
fi
mv "$staging" "$install_dir"
if [ -n "$backup" ]; then rm -rf "$backup"; fi
trap - EXIT HUP INT TERM
# Desktop Exec values require escaped backslashes, double quotes, backticks and dollar signs.
escaped=$(printf '%s' "$install_dir/Sparklecat-Discord-Companion" | sed 's/[\\"`$]/\\&/g; s/%/%%/g')
cat > "$applications/sparklecat-discord-companion.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Sparklecat Discord Companion
Comment=Show Plural Star fronters in Discord
Exec="$escaped"
Terminal=false
Categories=Network;Utility;
EOF
# Refresh KDE’s application menu when its cache utility is available.
if command -v kbuildsycoca6 >/dev/null 2>&1; then kbuildsycoca6 >/dev/null 2>&1 || true
elif command -v kbuildsycoca5 >/dev/null 2>&1; then kbuildsycoca5 >/dev/null 2>&1 || true; fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$applications" || true
echo 'Installed. Search for Sparklecat Discord Companion in your applications menu.'
