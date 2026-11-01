"""Desktop preferences, credential storage, and login startup."""
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

SERVICE = 'sparklecat-discord-companion'


def config_path():
    if sys.platform == 'darwin':
        root = Path.home() / 'Library/Application Support'
    elif os.name == 'nt':
        root = Path(os.environ.get('APPDATA', Path.home()))
    else:
        root = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config'))
    return root / SERVICE / 'settings.json'


def load():
    try:
        data = json.loads(config_path().read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save(data):
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data), encoding='utf-8')
    os.replace(temporary, path)


def credential(name, value=None, delete=False):
    import keyring
    if delete:
        try:
            keyring.delete_password(SERVICE, name)
        except keyring.errors.PasswordDeleteError:
            pass
    elif value is not None:
        keyring.set_password(SERVICE, name, value)
    else:
        return keyring.get_password(SERVICE, name) or ''


def startup_command():
    if getattr(sys, 'frozen', False):
        return [sys.executable, '--autostart']
    return [sys.executable, str(Path(__file__).with_name('companion.py').resolve()), '--autostart']


def set_autostart(enabled):
    command = startup_command()
    if os.name == 'nt':
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
            if enabled:
                winreg.SetValueEx(key, SERVICE, 0, winreg.REG_SZ, subprocess.list2cmdline(command))
            else:
                try:
                    winreg.DeleteValue(key, SERVICE)
                except FileNotFoundError:
                    pass
    elif sys.platform == 'darwin':
        path = Path.home() / 'Library/LaunchAgents' / (SERVICE + '.plist')
        if enabled:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('wb') as file:
                plistlib.dump({'Label': SERVICE, 'ProgramArguments': command, 'RunAtLoad': True}, file)
        else:
            path.unlink(missing_ok=True)
    else:
        path = Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'autostart' / (SERVICE + '.desktop')
        if enabled:
            path.parent.mkdir(parents=True, exist_ok=True)
            # Desktop entries use double-quoted arguments, not shell syntax.
            args = ' '.join('"' + arg.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%') + '"' for arg in command)
            path.write_text('[Desktop Entry]\nType=Application\nName=Sparklecat Discord Companion\nExec=' + args + '\nTerminal=false\n', encoding='utf-8')
        else:
            path.unlink(missing_ok=True)


def save_icon(source):
    """Copy and normalize the chosen image so it survives moving the original."""
    from PIL import Image
    path = config_path().parent / 'icon.png'
    with Image.open(source) as image:
        image.seek(0)
        image = image.convert('RGBA')
        image.thumbnail((256, 256))
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, format='PNG')
    return str(path)
