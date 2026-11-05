Gradle wrapper files retain the notices of their original authors under Apache-2.0:
https://www.apache.org/licenses/LICENSE-2.0

The wrapper scripts copied from the Plural Star React Native setup also carry this notice:

Copyright (c) Meta Platforms, Inc. and affiliates.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

The patcher links Android apksig under Apache-2.0. Payload dependencies and their
individual notices are available in the pinned upstream repository and its locked
npm dependency packages. Plural Star source and the wallpaper feature are
AGPL-3.0; the complete feature diff is included in payload/wallpaper-pr-24.patch.

PluralKit front sync is adapted from sparklecatdev's Plural Star PR #11
(c1bd5e2f7a5fbb7934733e331154307948424cb0) under AGPL-3.0. The adapted
feature diff is in payload/pluralkit-pr-11.patch with runtime code in payload/mods.

The build-time native-tools utility uses dexlib2 (smali) under BSD-3-Clause.
Its copyright and license are retained in the dependency JAR. dexlib2 is not
included in either Android app; the generated DEX contains the upstream classes
and this project's bundle loader.

The optional music player and lyrics behavior in payload/mods/MusicPlayer.tsx
and musicCore.ts adapt BitChord contributors’ NowPlayingScreen, PlayerLyrics,
PlayerQueue, and LrcLib at commit b690dc146009d4815825fa4a20815ef2e4ee8898:
https://github.com/sparklecatdev/BitChord-desktop

The adaptation was made on 2026-11-05 for Android media-session control in
Plural Star. BitChord is licensed under GPL-3.0; its license is retained in
LICENSES/BitChord-GPL-3.0.txt. The combined project is distributed under
AGPL-3.0, with the source available alongside releases.
