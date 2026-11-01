"""Update installed companion releases from GitHub."""
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

VERSION = (0, 5, 0)
RELEASES = 'https://api.github.com/repos/sparklecatdev/plural-star-mods/releases?per_page=100'
NAME = 'Sparklecat-Discord-Companion'


def target():
    if not getattr(sys, 'frozen', False):
        return None
    exe = Path(sys.executable).resolve()
    if sys.platform == 'darwin':
        root = exe.parents[2]
        expected = Path.home() / 'Applications' / (NAME + '.app')
    elif os.name == 'nt':
        root = exe.parent
        expected = Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs' / 'Sparklecat Discord Companion'
    else:
        root = exe.parent
        expected = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'sparklecat-discord-companion'
    return root if root == expected.resolve() else None


def platform_asset():
    machine = platform.machine().lower()
    arm = machine in ('arm64', 'aarch64')
    if sys.platform == 'darwin':
        return 'macos-apple-silicon.zip' if arm else 'macos-intel.zip'
    if os.name == 'nt':
        return 'windows-x64.zip' if machine in ('amd64', 'x86_64') else None
    if sys.platform.startswith('linux'):
        return 'linux-arm64.tar.gz' if arm else ('linux-x64.tar.gz' if machine in ('amd64', 'x86_64') else None)
    return None


def fetch_update():
    suffix = platform_asset()
    if not suffix:
        return None
    req = urllib.request.Request(RELEASES, headers={'User-Agent': 'Sparklecat-Discord-Companion', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=10) as response:
        releases = json.loads(response.read(4 * 1024 * 1024))
    choices = []
    for release in releases:
        match = re.fullmatch(r'desktop-v(\d+)\.(\d+)\.(\d+)', release.get('tag_name', ''))
        if match and not release.get('draft') and not release.get('prerelease'):
            version = tuple(map(int, match.groups()))
            if version > VERSION:
                choices.append((version, release))
    if not choices:
        return None
    release = max(choices, key=lambda item: item[0])[1]
    wanted = 'sparklecat-discord-companion-' + suffix
    asset = next((a for a in release.get('assets', []) if a.get('name') == wanted), None)
    if not asset or not re.fullmatch(r'sha256:[0-9a-f]{64}', asset.get('digest') or ''):
        raise ValueError('Update is missing a verified download for this platform.')
    url = asset.get('browser_download_url', '')
    if not url.startswith('https://github.com/sparklecatdev/plural-star-mods/releases/download/'):
        raise ValueError('Invalid update URL.')
    staging = Path(tempfile.mkdtemp(prefix='sparklecat-update-'))
    try:
        archive = staging / 'download'
        digest = hashlib.sha256()
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Sparklecat-Discord-Companion'}), timeout=30) as response, archive.open('wb') as output:
            total = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 300 * 1024 * 1024:
                    raise ValueError('Update download is too large.')
                digest.update(chunk)
                output.write(chunk)
        if 'sha256:' + digest.hexdigest() != asset['digest']:
            raise ValueError('Update download failed verification.')
        unpack = (staging / 'unpacked').resolve()
        unpack.mkdir()
        if suffix.endswith('.tar.gz'):
            with tarfile.open(archive) as tar:
                tar.extractall(unpack, filter='data')
        else:
            with zipfile.ZipFile(archive) as z:
                links = []
                for info in z.infolist():
                    path = (unpack / info.filename).resolve()
                    if not path.is_relative_to(unpack):
                        raise ValueError('Update archive contains an unsafe path.')
                    if stat.S_ISLNK(info.external_attr >> 16):
                        link = z.read(info).decode('utf-8')
                        if not (path.parent / link).resolve().is_relative_to(unpack):
                            raise ValueError('Update archive contains an unsafe link.')
                        links.append((path, link))
                    else:
                        z.extract(info, unpack)
                for info in z.infolist():
                    mode = info.external_attr >> 16
                    if mode and not info.is_dir() and not stat.S_ISLNK(mode):
                        (unpack / info.filename).chmod(mode & 0o777)
                for path, link in links:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.symlink_to(link)
        new_root = unpack / (NAME + '.app' if sys.platform == 'darwin' else NAME)
        new_exe = new_root / ('Contents/MacOS/' + NAME if sys.platform == 'darwin' else NAME + ('.exe' if os.name == 'nt' else ''))
        if not new_exe.is_file():
            raise ValueError('Update archive is incomplete.')
        return staging, new_root, new_exe
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def apply_update(destination, pid):
    destination = Path(destination)
    source = Path(sys.executable).resolve()
    source_root = source.parents[2] if sys.platform == 'darwin' else source.parent
    relative_exe = source.relative_to(source_root)
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.windll.kernel32
        handle = kernel.OpenProcess(0x00100000, False, pid)
        if handle:
            result = kernel.WaitForSingleObject(handle, 30000)
            kernel.CloseHandle(handle)
            if result != 0:
                raise RuntimeError('Previous version did not exit.')
    else:
        for _ in range(300):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Previous version did not exit.')
    replacement = destination.with_name(destination.name + '.new')
    backup = destination.with_name(destination.name + '.old')
    if replacement.exists() or backup.exists():
        raise RuntimeError('An unfinished update needs attention.')
    shutil.copytree(source_root, replacement, symlinks=True)
    try:
        destination.rename(backup)
        try:
            replacement.rename(destination)
        except Exception:
            backup.rename(destination)
            raise
        subprocess.Popen([str(destination / relative_exe)], close_fds=True)
        shutil.rmtree(backup, ignore_errors=True)
    finally:
        shutil.rmtree(replacement, ignore_errors=True)
