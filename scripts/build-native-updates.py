#!/usr/bin/env python3
"""Add the OTA file loader to the pinned host; keep other native classes unchanged."""
import hashlib
import json
import os
import pathlib
import subprocess
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
PIN = '0357111d02c6e6bb0ce4946e2aeb7e216e96d23aa4ae7ef29017c4fd1dc19e6f'

def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)

def main():
    work = ROOT / '.work/native-updates'
    work.mkdir(parents=True, exist_ok=True)
    apk = pathlib.Path(os.environ.get('PLURAL_STAR_APK', str(ROOT / '.work/plural-star.apk')))
    if not apk.exists():
        apk.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve('https://github.com/ByHanyou/Plural-Star/releases/download/v1.23.3/app-release.apk', apk)
    if hashlib.sha256(apk.read_bytes()).hexdigest() != PIN:
        raise ValueError('Unsupported original APK')
    with zipfile.ZipFile(apk) as source:
        (work / 'original.dex').write_bytes(source.read('classes2.dex'))
    release = json.loads((ROOT / 'payload/release.json').read_text())
    sdk = pathlib.Path(os.environ['ANDROID_HOME'])
    java = pathlib.Path(os.environ['JAVA_HOME']) / 'bin'
    run('bash', 'gradlew', ':native-tools:installDist')
    for variant in ('wallpaper', 'storage', 'wallpaper-storage'):
        target = work / variant
        target.mkdir(exist_ok=True)
        code = (ROOT / 'payload/native/BundleLoader.java').read_text()
        for key, value in {'RUNTIME': release['runtime'], 'VERSION': release['version'], 'VARIANT': variant}.items():
            code = code.replace('@' + key + '@', value)
        source = target / 'BundleLoader.java'
        source.write_text(code)
        run(str(java / 'javac'), '--release', '17', '-classpath', str(sdk / 'platforms/android-36/android.jar'), '-d', str(target), str(source))
        run(str(java / 'jar'), '--create', '--file', str(target / 'loader.jar'), '-C', str(target), 'dev')
        run(str(sdk / 'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk / 'platforms/android-36/android.jar'), '--output', str(target), str(target / 'loader.jar'))
        run(str(ROOT / 'native-tools/build/install/native-tools/bin/native-tools'), str(work / 'original.dex'), str(target / 'classes.dex'), str(ROOT / f'app/src/main/assets/payloads/{variant}.dex'))

if __name__ == '__main__':
    main()
