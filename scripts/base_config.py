"""Shared exact upstream inputs for reproducible payload builds."""
import json
import os
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]

def load():
    pinned = json.loads((ROOT / 'payload/base.json').read_text())
    base = json.loads(pathlib.Path(os.environ['PLURAL_STAR_BASE']).read_text()) if os.environ.get('PLURAL_STAR_BASE') else pinned
    if not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', base['version']):
        raise ValueError('Invalid upstream version')
    if not re.fullmatch(r'[0-9a-f]{40}', base['commit']) or not re.fullmatch(r'[0-9a-f]{64}', base['sha256']):
        raise ValueError('Invalid upstream checksums')
    if base['url'] != f"https://github.com/ByHanyou/Plural-Star/releases/download/v{base['version']}/app-release.apk":
        raise ValueError('Invalid official APK URL')
    release = json.loads((ROOT / 'payload/release.json').read_text())
    if base['sha256'] != pinned['sha256']:
        release['runtime'] = f"plural-star-{base['version']}-{base['sha256'][:12]}-mods-1"
    return base, release
