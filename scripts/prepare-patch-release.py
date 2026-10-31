#!/usr/bin/env python3
"""Prepare independently versioned patch bundles from the verified payload build."""
import hashlib
import argparse
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--legacy-runtime', action='store_true')
    parser.add_argument('--append', action='store_true')
    args = parser.parse_args()
    release = json.loads((ROOT / 'payload/release.json').read_text())
    version = release['version']
    runtime = release['legacy_runtime'] if args.legacy_runtime else release['runtime']
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', version) or not re.fullmatch(r'[a-z0-9.-]{1,80}', runtime):
        raise ValueError('Invalid patch version or runtime')
    source = ROOT / 'app/src/main/assets/payloads'
    provenance = json.loads((source / 'provenance.json').read_text())
    if provenance['version'] != version or provenance['runtime'] != runtime:
        raise ValueError('Rebuild payloads for this patch release')
    output = ROOT / '.work/patch-release'
    output.mkdir(parents=True, exist_ok=True)
    if not args.append:
        for old in output.iterdir():
            if old.is_file(): old.unlink()
    if args.append and not (output / 'SHA256SUMS').is_file():
        raise ValueError('Prepare the legacy runtime before appending')
    sums = (output / 'SHA256SUMS').read_text().splitlines() if args.append else []
    for variant in ('wallpaper', 'storage', 'wallpaper-storage'):
        bundle = source / (variant + '.bundle')
        digest = hashlib.sha256(bundle.read_bytes()).hexdigest()
        if not 0 < bundle.stat().st_size <= 32 * 1024 * 1024 or provenance['bundles'].get(variant) != digest:
            raise ValueError('Missing, stale or oversized payload: ' + variant)
        name = f'patches-{runtime}-{variant}-{version}.bundle'
        shutil.copyfile(bundle, output / name)
        sums.append(f'{digest}  {name}')
    (output / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
    shutil.copyfile(source / 'provenance.json', output / f'provenance-{runtime}.json')
    if not args.legacy_runtime:
        shutil.copyfile(source / 'provenance.json', output / 'provenance.json')
    print(f'Prepared patches-v{version} in {output}')

if __name__ == '__main__':
    main()
