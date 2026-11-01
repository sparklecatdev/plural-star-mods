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
trap 'rm -rf "$staging"' EXIT HUP INT TERM
cp -R "$source_dir/." "$staging/"
if [ -e "$install_dir" ]; then
    echo "Remove or move the existing installation at $install_dir before installing." >&2
    exit 1
fi
mv "$staging" "$install_dir"
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
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$applications" || true
echo 'Installed. Search for Sparklecat Discord Companion in your applications menu.'
