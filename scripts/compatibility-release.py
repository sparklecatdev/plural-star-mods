#!/usr/bin/env python3
"""Resolve an official release, stage tested payloads, and publish an immutable pack."""
import argparse
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import urllib.request
import zipfile
from base_config import ROOT, load

WORK = ROOT / '.work'
CONFIG = WORK / 'latest-base.json'
DEST = WORK / 'compat-release'

def gh(*args):
    return json.loads(subprocess.check_output(['gh', 'api', *args], cwd=ROOT))

def tag(base, release):
    return f"compat-v{base['version']}-patches-v{release['version']}"

def resolve():
    row = gh('repos/ByHanyou/Plural-Star/releases/latest')
    version = row['tag_name']
    if row['draft'] or row['prerelease'] or not re.fullmatch(r'v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version):
        raise ValueError('Invalid official release')
    assets = [a for a in row['assets'] if a['name'] == 'app-release.apk']
    if len(assets) != 1:
        raise ValueError('Expected one standalone official APK')
    asset = assets[0]
    url = f'https://github.com/ByHanyou/Plural-Star/releases/download/{version}/app-release.apk'
    if asset['state'] != 'uploaded' or asset['browser_download_url'] != url or not re.fullmatch(r'sha256:[0-9a-f]{64}', asset.get('digest') or '') or not isinstance(asset['size'], int) or not 0 < asset['size'] <= 128 * 1024 * 1024:
        raise ValueError('Invalid official APK metadata')
    obj = gh(f'repos/ByHanyou/Plural-Star/git/ref/tags/{version}')['object']
    for _ in range(5):
        if obj['type'] == 'commit':
            break
        if obj['type'] != 'tag' or not re.fullmatch(r'[0-9a-f]{40}', obj['sha']):
            raise ValueError('Invalid upstream tag')
        obj = gh(f"repos/ByHanyou/Plural-Star/git/tags/{obj['sha']}")['object']
    if obj['type'] != 'commit' or not re.fullmatch(r'[0-9a-f]{40}', obj['sha']):
        raise ValueError('Cannot resolve upstream commit')
    base = {'version': version[1:], 'commit': obj['sha'], 'sha256': asset['digest'][7:], 'url': url}
    WORK.mkdir(exist_ok=True)
    CONFIG.write_text(json.dumps(base, indent=2) + '\n')
    os.environ['PLURAL_STAR_BASE'] = str(CONFIG)
    base, release = load()
    # A published exact pack is immutable. Failed/draft publications are retried.
    releases = gh('repos/sparklecatdev/plural-star-mods/releases?per_page=100')
    existing = next((r for r in releases if r['tag_name'] == tag(base, release) and not r['draft']), None)
    if existing and not any(a['name'] == f"compat-{base['sha256']}.zip" for a in existing['assets']):
        raise ValueError('Official APK changed under an existing release tag; review compatibility')
    needed = existing is None
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write(f"needed={'true' if needed else 'false'}\n")
    if not needed:
        print('Matching compatibility pack is already published.')
        return
    apk = WORK / 'latest-official.apk'
    temporary = WORK / 'latest-official.part'
    try:
        digest = hashlib.sha256()
        count = 0
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as out:
            while block := response.read(65536):
                count += len(block)
                if count > asset['size']:
                    raise ValueError('Official APK exceeds its published size')
                digest.update(block)
                out.write(block)
        if count != asset['size'] or digest.hexdigest() != base['sha256']:
            raise ValueError('Official APK checksum failed')
        temporary.replace(apk)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Resolved Plural Star {base['version']} at {base['commit']}")

def stage():
    subprocess.run(["git", "diff", "--exit-code", "HEAD"], cwd=ROOT, check=True)
    base, release = load()
    payloads = ROOT / 'app/src/main/assets/payloads'
    info = json.loads((payloads / 'provenance.json').read_text())
    if any(info[k] != v for k, v in {'version': release['version'], 'runtime': release['runtime'], 'upstream': base['commit'], 'supported_apk_sha256': base['sha256']}.items()):
        raise ValueError('Payloads do not match the resolved official release')
    info["source_commit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    # Corresponding mod source plus the exact upstream inputs are available offline.
    archive = subprocess.check_output(['git', 'archive', '--format=zip', 'HEAD'], cwd=ROOT)
    source = io.BytesIO(archive)
    with zipfile.ZipFile(source, 'a', compression=zipfile.ZIP_DEFLATED) as zip_source:
        zip_source.writestr('compatibility-base.json', json.dumps(base, indent=2) + '\n')
    files = {name: (payloads / name).read_bytes() for name in ('wallpaper-storage.bundle', 'wallpaper-storage.dex')}
    files['source.zip'] = source.getvalue()
    if any(not data or len(data) > (16 if name == 'source.zip' else 32) * 1024 * 1024 for name, data in files.items()):
        raise ValueError('Compatibility pack contents exceed their limits')
    info['files'] = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    if info['files']['wallpaper-storage.bundle'] != info['bundles']['wallpaper-storage']:
        raise ValueError('Bundle provenance checksum failed')
    DEST.mkdir(exist_ok=True)
    for old in DEST.iterdir():
        if old.is_file():
            old.unlink()
    with zipfile.ZipFile(DEST / f"compat-{base['sha256']}.zip", 'w', compression=zipfile.ZIP_DEFLATED) as pack:
        for name, data in files.items():
            pack.writestr(name, data)
        pack.writestr('provenance.json', json.dumps(info, indent=2) + '\n')
    # Boot notices and the patcher can discover JS updates for this exact runtime.
    for variant, digest in info['bundles'].items():
        data = (payloads / f'{variant}.bundle').read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('Bundle provenance checksum failed')
        (DEST / f"patches-{release['runtime']}-{variant}-{release['version']}.bundle").write_bytes(data)
    (DEST / 'provenance.json').write_text(json.dumps(info, indent=2) + '\n')

def publish():
    base, release = load()
    name = tag(base, release)
    # Refuse publication from a changed tree.
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD'], cwd=ROOT, check=True)
    info = json.loads((DEST / "provenance.json").read_text())
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if any(info[k] != v for k, v in {"source_commit": commit, "version": release["version"], "runtime": release["runtime"], "upstream": base["commit"], "supported_apk_sha256": base["sha256"]}.items()):
        raise ValueError("Restage compatibility assets from the current commit")
    expected = {"provenance.json", f"compat-{base['sha256']}.zip"} | {f"patches-{release['runtime']}-{variant}-{release['version']}.bundle" for variant in info["bundles"]}
    if {file.name for file in DEST.iterdir()} != expected:
        raise ValueError("Compatibility release assets are incomplete")
    existing = next((r for r in gh('repos/sparklecatdev/plural-star-mods/releases?per_page=100') if r['tag_name'] == name), None)
    if existing and not existing['draft']:
        raise ValueError('Never replace a published compatibility pack; increase the patch version')
    if not existing:
        subprocess.run(['gh', 'release', 'create', name, '--draft', '--target', subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), '--title', f"Plural Star {base['version']} compatibility · patches {release['version']}", '--notes', 'Automatically built and checked against the official standalone release. Download matching patches through the patcher.'], cwd=ROOT, check=True)
    else:
        subprocess.run(['gh', 'release', 'edit', name, '--target', commit], cwd=ROOT, check=True)
    subprocess.run(['gh', 'release', 'upload', name, '--clobber', *map(str, sorted(DEST.iterdir()))], cwd=ROOT, check=True)
    published = next(r for r in gh('repos/sparklecatdev/plural-star-mods/releases?per_page=100') if r['tag_name'] == name)
    assets = {a['name']: a for a in published['assets']}
    for file in DEST.iterdir():
        asset = assets[file.name]
        if asset['size'] != file.stat().st_size or asset['digest'] != 'sha256:' + hashlib.sha256(file.read_bytes()).hexdigest():
            raise ValueError('Published asset verification failed; release remains a draft')
    subprocess.run(['gh', 'release', 'edit', name, '--draft=false', '--latest=false'], cwd=ROOT, check=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['resolve', 'stage', 'publish'])
    args = parser.parse_args()
    {'resolve': resolve, 'stage': stage, 'publish': publish}[args.action]()
