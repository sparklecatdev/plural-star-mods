#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_app="$source_dir/Sparklecat-Discord-Companion.app"
target="$HOME/Applications/Sparklecat-Discord-Companion.app"
if [ ! -d "$source_app" ]; then echo 'Extract the release before running this installer.' >&2; exit 1; fi
mkdir -p "$HOME/Applications"
staging=$(mktemp -d "$HOME/Applications/.sparklecat-install.XXXXXXXX")
cleanup() {
    if [ -e "$staging/old.app" ] && [ ! -e "$target" ]; then mv "$staging/old.app" "$target"; fi
    if [ ! -e "$staging/old.app" ] || [ -e "$target" ]; then rm -rf "$staging"; fi
}
trap cleanup EXIT HUP INT TERM
ditto "$source_app" "$staging/new.app"
if [ -e "$target" ]; then mv "$target" "$staging/old.app"; fi
mv "$staging/new.app" "$target"
rm -rf "$staging/old.app"
echo 'Installed in Applications. Find it with Spotlight or Launchpad.'
