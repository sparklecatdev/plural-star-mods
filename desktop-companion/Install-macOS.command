#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_app="$source_dir/Sparklecat-Discord-Companion.app"
target="$HOME/Applications/Sparklecat-Discord-Companion.app"
if [ ! -d "$source_app" ]; then echo 'Extract the release before running this installer.' >&2; exit 1; fi
if [ -e "$target" ]; then echo "Move the existing app at $target before installing." >&2; exit 1; fi
mkdir -p "$HOME/Applications"
ditto "$source_app" "$target"
echo 'Installed in Applications. Find it with Spotlight or Launchpad.'
