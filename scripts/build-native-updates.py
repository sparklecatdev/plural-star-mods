#!/usr/bin/env python3
"""Add the OTA file loader to the pinned host; keep other native classes unchanged."""
import hashlib
import os
import pathlib
import re
import shutil
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
    discord = pathlib.Path(os.environ.get('DISCORD_SOCIAL_SDK_DIR', str(ROOT / '.work/discord-sdk')))
    aar = discord / 'discord_social_sdk/lib/release/discord_partner_sdk.aar'
    if not (discord / 'android/libs/discord_partner_sdk.jar').is_file() and aar.is_file():
        with zipfile.ZipFile(aar) as archive:
            for name in archive.namelist():
                if name.startswith(('libs/', 'jni/')) and not name.endswith('/'):
                    relative = pathlib.PurePosixPath(name)
                    if '..' in relative.parts: raise ValueError('Invalid Discord SDK asset path')
                    target = discord.joinpath('android', *relative.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(name))
    assets = ROOT / 'app/src/main/assets/discord'
    assets.mkdir(parents=True, exist_ok=True)
    bridge_hash = hashlib.sha256((ROOT / 'payload/native/DiscordPresence.cpp').read_bytes()).hexdigest()
    if (discord / 'android/libs/discord_partner_sdk.jar').is_file():
        discord_jar = discord / 'android/libs/discord_partner_sdk.jar'
        run(str(sdk / 'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk / 'platforms/android-36/android.jar'),
            '--output', str(assets), str(discord_jar), str(discord / 'android/libs/libwebrtc.jar'))
        ndk_root = sdk / 'ndk/27.0.12077973/toolchains/llvm/prebuilt'
        hosts = list(ndk_root.glob('*/bin/clang++'))
        if len(hosts) != 1: raise ValueError('Android NDK 27.0.12077973 is required')
        for abi, target_triple in [('arm64-v8a', 'aarch64-linux-android'), ('armeabi-v7a', 'armv7a-linux-androideabi'), ('x86', 'i686-linux-android'), ('x86_64', 'x86_64-linux-android')]:
            out = assets / abi
            out.mkdir(exist_ok=True)
            lib = discord / 'android/jni' / abi
            shutil.copyfile(lib / 'libdiscord_partner_sdk.so', out / 'libdiscord_partner_sdk.so')
            run(str(hosts[0]), '--target=' + target_triple + '26', '-shared', '-fPIC', '-static-libstdc++', '-std=c++17',
                '-I' + str(discord / 'discord_social_sdk/include'), str(ROOT / 'payload/native/DiscordPresence.cpp'),
                '-L' + str(lib), '-ldiscord_partner_sdk', '-Wl,-z,max-page-size=16384', '-o', str(out / 'libsparklecat_discord.so'))
        (assets / 'bridge.sha256').write_text(bridge_hash + '\n')
    else:
        # Reuse the integrated native components from our signed patcher release.
        # A changed bridge requires a fresh SDK build.
        url = 'https://github.com/sparklecatdev/plural-star-mods/releases/download/v0.6.4/sparklecat-plural-star-mods-0.6.4.apk'
        existing = work / 'released-patcher.apk'
        urllib.request.urlretrieve(url, existing)
        verified = subprocess.check_output([str(sdk / 'build-tools/36.0.0/apksigner'), 'verify', '--print-certs', str(existing)], text=True)
        match = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-f]+)', verified)
        if not match or match.group(1) != (ROOT / 'release-signing.sha256').read_text().strip():
            raise ValueError('Released patcher signature does not match')
        with zipfile.ZipFile(existing) as archive:
            prefix = 'assets/discord/'
            for name in archive.namelist():
                if name.startswith(prefix) and not name.endswith('/'):
                    relative = pathlib.PurePosixPath(name[len(prefix):])
                    if '..' in relative.parts: raise ValueError('Invalid Discord asset path')
                    target = assets.joinpath(*relative.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(name))
        if not (assets / 'bridge.sha256').is_file() or (assets / 'bridge.sha256').read_text().strip() != bridge_hash:
            raise ValueError('Discord bridge changed: build with Discord Social SDK 1.10.19337')
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
            '-d', str(target), str(source), str(ROOT / 'payload/native/DeviceUnlockModule.java'), str(ROOT / 'payload/native/DeviceUnlockPackage.java'), str(ROOT / 'payload/native/RestModeModule.java'), str(ROOT / 'payload/native/DiscordPresenceModule.java'))
        run(str(java / 'jar'), '--create', '--file', str(target / 'loader.jar'), '-C', str(target), 'dev')
        run(str(sdk / 'build-tools/36.0.0/d8'), '--min-api', '26', '--lib', str(sdk / 'platforms/android-36/android.jar'),
            '--classpath', str(react_classes), '--output', str(target), str(target / 'loader.jar'))
        run(str(ROOT / 'native-tools/build/install/native-tools/bin/native-tools'), str(work / 'original.dex'), str(target / 'classes.dex'), str(ROOT / f'app/src/main/assets/payloads/{variant}.dex'))

if __name__ == '__main__':
    main()
