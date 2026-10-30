#!/usr/bin/env python3
"""Sign locally with the private publisher key, or verify a public release artifact.

No signing key or password is ever uploaded in the staging repository/manifest.
"""
import argparse
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def command(*args, capture=False):
    return subprocess.run([str(a) for a in args], cwd=ROOT, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout

def sdk_tool(name):
    sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
    if not sdk:
        props = ROOT / 'local.properties'
        if props.exists():
            sdk = next((line.split('=', 1)[1] for line in props.read_text().splitlines() if line.startswith('sdk.dir=')), None)
    if not sdk:
        raise RuntimeError('Set ANDROID_HOME to the Android SDK.')
    return pathlib.Path(sdk) / 'build-tools/36.0.0' / name

def verify(apk, source, manifest=None):
    command('git', 'diff', '--quiet', 'HEAD', '--')
    version_file = (ROOT / 'app/build.gradle').read_text()
    version = re.search(r"versionName '([^']+)'", version_file).group(1)
    code = re.search(r'versionCode (\d+)', version_file).group(1)
    actual_source = command('git', 'rev-parse', 'HEAD', capture=True).strip()
    if source != actual_source:
        raise RuntimeError('Check out the exact source commit before verifying.')
    output = command(sdk_tool('apksigner'), 'verify', '--print-certs', apk, capture=True)
    certificate = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', output).group(1)
    expected = (ROOT / 'release-signing.sha256').read_text().strip()
    if certificate != expected:
        raise RuntimeError('APK does not use the persistent publisher signing key.')
    badging = command(sdk_tool('aapt'), 'dump', 'badging', apk, capture=True)
    package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not package or package.groups() != ('dev.sparklecat.pluralmods', code, version) or 'application-debuggable' in badging:
        raise RuntimeError('APK package, version, or release build type is incorrect.')
    command(sdk_tool('zipalign'), '-c', '-P', '16', '4', apk)
    tracked = set(command('git', 'ls-files', capture=True).splitlines()) - {'.gitattributes', '.gitignore'}
    with zipfile.ZipFile(apk) as archive:
        with zipfile.ZipFile(io.BytesIO(archive.read('assets/source/plural-star-mods-source.zip'))) as embedded:
            names = {name for name in embedded.namelist() if not name.endswith('/')}
            if names != tracked:
                raise RuntimeError('Embedded source file list does not match the source commit.')
            for name in names:
                actual, expected_bytes = embedded.read(name), (ROOT / name).read_bytes()
                if name.endswith('.bat'):
                    actual, expected_bytes = actual.replace(b'\r\n', b'\n'), expected_bytes.replace(b'\r\n', b'\n')
                if actual != expected_bytes:
                    raise RuntimeError('Embedded source differs: ' + name)
    metadata = {'source_commit': source, 'release_tag': 'v' + version,
                'apk_sha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'signer_sha256': certificate}
    if manifest is not None and json.loads(manifest.read_text()) != metadata:
        raise RuntimeError('Staged release manifest does not match this APK/source.')
    return metadata

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['sign', 'verify'])
    parser.add_argument('--apk', type=pathlib.Path)
    parser.add_argument('--source-commit')
    parser.add_argument('--manifest', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, default=ROOT / '.work/signed/patcher.apk')
    parser.add_argument('--keystore', type=pathlib.Path, default=ROOT / '.work/signing/release.p12')
    parser.add_argument('--password-file', type=pathlib.Path, default=ROOT / '.work/signing/release-password.txt')
    args = parser.parse_args()
    source = args.source_commit or command('git', 'rev-parse', 'HEAD', capture=True).strip()
    if args.action == 'sign':
        if not args.keystore.is_file() or not args.password_file.is_file():
            raise RuntimeError('The original private publisher key is required. Do not replace it for an existing app.')
        apk = args.apk or ROOT / 'app/build/outputs/apk/release/app-release-unsigned.apk'
        args.output.parent.mkdir(parents=True, exist_ok=True)
        command(sdk_tool('apksigner'), 'sign', '--ks', args.keystore, '--ks-key-alias', 'sparklecat-release',
                '--ks-pass', 'file:' + str(args.password_file), '--key-pass', 'file:' + str(args.password_file),
                '--v1-signing-enabled', 'false', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true',
                '--out', args.output, apk)
        metadata = verify(args.output, source)
        (args.output.parent / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print('Signed and verified public release artifact. Private signing files stay in .work/signing.')
    else:
        if args.apk is None:
            parser.error('--apk is required for verification')
        verify(args.apk, source, args.manifest)
        print('APK signature, package, version, alignment, source, and manifest verified.')

if __name__ == '__main__':
    main()
