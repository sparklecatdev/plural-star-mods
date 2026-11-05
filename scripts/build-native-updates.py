#!/usr/bin/env python3
"""Add the OTA file loader to the pinned host; keep other native classes unchanged."""
import hashlib
import os
import pathlib
import subprocess
import urllib.request
import zipfile
from base_config import load

ROOT = pathlib.Path(__file__).resolve().parents[1]

def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)

def main():
    base, release = load()
    work = ROOT / '.work/native-updates'
    work.mkdir(parents=True, exist_ok=True)
    apk = pathlib.Path(os.environ.get('PLURAL_STAR_APK', str(ROOT / '.work/plural-star.apk')))
    if not apk.exists():
        apk.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(base['url'], apk)
    if hashlib.sha256(apk.read_bytes()).hexdigest() != base['sha256']:
        raise ValueError('Unsupported original APK')
    with zipfile.ZipFile(apk) as source:
        (work / 'original.dex').write_bytes(source.read('classes2.dex'))
        (work / 'original-primary.dex').write_bytes(source.read('classes.dex'))
    sdk = pathlib.Path(os.environ['ANDROID_HOME'])
    java = pathlib.Path(os.environ['JAVA_HOME']) / 'bin'
    run('bash', 'gradlew', ':native-tools:installDist', ':native-tools:extractReactClasses')
    react_classes = ROOT / 'native-tools/build/react-android/classes.jar'
    stub_root = work / 'stubs'
    stubs = {
        'androidx/core/app/NotificationCompat.java': 'package androidx.core.app; public class NotificationCompat { public static class Builder { public Builder setTimeoutAfter(long value) { return this; } } }',
        'app/notifee/core/ContextHolder.java': 'package app.notifee.core; public class ContextHolder { public static android.content.Context getApplicationContext() { return null; } }',
        'app/notifee/core/EventBus.java': 'package app.notifee.core; public class EventBus { public static void post(Object event) {} }',
        'app/notifee/core/event/NotificationEvent.java': 'package app.notifee.core.event; public class NotificationEvent { public NotificationEvent(int type, app.notifee.core.model.NotificationModel model) {} }',
        'app/notifee/core/model/NotificationModel.java': 'package app.notifee.core.model; public class NotificationModel { public NotificationAndroidModel getAndroid() { return null; } }',
        'app/notifee/core/model/NotificationAndroidModel.java': 'package app.notifee.core.model; public class NotificationAndroidModel { public Long getTimeoutAfter() { return null; } }',
    }
    for name, code in stubs.items():
        source = stub_root / name
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text(code)
    hook = work / 'hook'
    hook.mkdir(exist_ok=True)
    guava = ROOT / 'native-tools/build/install/native-tools/lib/guava-27.1-android.jar'
    run(str(java / 'javac'), '--release', '17', '-classpath', os.pathsep.join((str(sdk / 'platforms/android-36/android.jar'), str(guava))),
        '-d', str(hook), *(str(stub_root / name) for name in stubs), str(ROOT / 'payload/native/RestMode.java'), str(ROOT / 'payload/native/RestModeHook.java'))
    run(str(java / 'jar'), '--create', '--file', str(hook / 'hook.jar'), '-C', str(hook), 'app/notifee/core/RestMode.class', '-C', str(hook), 'app/notifee/core/RestModeHook.class')
    run(str(sdk / 'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk / 'platforms/android-36/android.jar'),
        '--classpath', str(guava), '--output', str(hook), str(hook / 'hook.jar'))
    run(str(java / 'java'), '-cp', str(ROOT / 'native-tools/build/install/native-tools/lib/*'), 'dev.sparklecat.tools.PatchNotifications',
        str(work / 'original-primary.dex'), str(hook / 'classes.dex'), str(ROOT / 'app/src/main/assets/payloads/primary.dex'))
    for variant in ('wallpaper', 'storage', 'wallpaper-storage'):
        target = work / variant
        target.mkdir(exist_ok=True)
        code = (ROOT / 'payload/native/BundleLoader.java').read_text()
        for key, value in {'RUNTIME': release['runtime'], 'VERSION': release['version'], 'VARIANT': variant}.items():
            code = code.replace('@' + key + '@', value)
        source = target / 'BundleLoader.java'
        source.write_text(code)
        run(str(java / 'javac'), '--release', '17', '-classpath', os.pathsep.join((str(sdk / 'platforms/android-36/android.jar'), str(react_classes))),
            '-d', str(target), str(source), str(ROOT / 'payload/native/DeviceUnlockModule.java'), str(ROOT / 'payload/native/DeviceUnlockPackage.java'), str(ROOT / 'payload/native/RestModeModule.java'),
            str(ROOT / 'payload/native/MusicModule.java'), str(ROOT / 'payload/native/MusicNotificationListener.java'),
            *(str(path) for path in sorted((ROOT / 'payload/native').glob('Lastfm*.java'))))
        run(str(java / 'jar'), '--create', '--file', str(target / 'loader.jar'), '-C', str(target), 'dev')
        run(str(sdk / 'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk / 'platforms/android-36/android.jar'),
            '--classpath', str(react_classes), '--output', str(target), str(target / 'loader.jar'))
        run(str(ROOT / 'native-tools/build/install/native-tools/bin/native-tools'), str(work / 'original.dex'), str(target / 'classes.dex'), str(ROOT / f'app/src/main/assets/payloads/{variant}.dex'))

if __name__ == '__main__':
    main()
