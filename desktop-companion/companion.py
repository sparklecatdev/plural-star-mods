#!/usr/bin/env python3
"""Show Plural Star cloud fronters in Discord activity."""
import base64
import csv
import io
import json
import os
import queue
import re
import socket
import struct
import sys
import threading
import time
import uuid
import subprocess
from urllib.parse import urlparse

from cloud import Cloud, DEFAULT_RELAY
from photos import PhotoPublisher
import updater
import settings

CLIENT_ID = '1566174520350347434'
INTERVAL = 30


def discord_socket_paths():
    roots = [os.environ.get(name) for name in ('XDG_RUNTIME_DIR', 'TMPDIR', 'TMP', 'TEMP')]
    runtime = os.environ.get('XDG_RUNTIME_DIR')
    if runtime:
        roots += [os.path.join(runtime, 'app', name) for name in
                  ('com.discordapp.Discord', 'com.discordapp.DiscordCanary', 'com.discordapp.DiscordPTB')]
        roots.append(os.path.join(runtime, 'snap.discord'))
    roots.append('/tmp')
    return [os.path.join(root, 'discord-ipc-' + str(index))
            for root in dict.fromkeys(filter(None, roots)) for index in range(10)]


PRESENCE_DEFAULTS = {'details': 'Currently fronting', 'state': '{fronters}',
                     'large_image': '', 'large_text': '', 'small_image': '', 'small_text': '',
                     'button1_label': '', 'button1_url': '', 'button2_label': '', 'button2_url': '',
                     'show_empty': False}


def clean_presence(value):
    if not isinstance(value, dict):
        value = {}
    result = {}
    for key, default in PRESENCE_DEFAULTS.items():
        item = value.get(key, default)
        if isinstance(default, bool):
            result[key] = item if isinstance(item, bool) else default
        else:
            limit = 300 if key.endswith('_image') else 512 if key.endswith('_url') else 32 if key.endswith('_label') else 128
            result[key] = item[:limit] if isinstance(item, str) else default
    return result


def activity_for(members, presence=None):
    options = clean_presence(presence)
    if not members and not options['show_empty']:
        return None
    members = [{'name': m, 'pronouns': '', 'avatar': ''} if isinstance(m, str) else m for m in members]
    names = [m.get('name', '') for m in members]
    first = members[0] if members else {}
    avatar = first.get('avatar', '')
    parsed_avatar = urlparse(avatar)
    if parsed_avatar.scheme != 'https' or not parsed_avatar.netloc:
        avatar = ''
    substitutions = {'{fronters}': ', '.join(names) or 'Nobody', '{count}': str(len(names)),
                     '{name}': first.get('name', ''), '{pronouns}': first.get('pronouns', ''), '{avatar}': avatar}
    def render(value, limit=128):
        for key, replacement in substitutions.items():
            value = value.replace(key, replacement)
        return value[:limit]
    activity = {}
    for key in ('details', 'state'):
        value = render(options[key]).strip()
        if value:
            activity[key] = value
    assets = {key: value for key in ('large_image', 'large_text', 'small_image', 'small_text')
              if (value := render(options[key], 300 if key.endswith('_image') else 128).strip())}
    if assets:
        activity['assets'] = assets
    buttons = []
    for n in (1, 2):
        label, url = options[f'button{n}_label'].strip(), options[f'button{n}_url'].strip()
        parsed = urlparse(url)
        if label and parsed.scheme in ('http', 'https') and parsed.netloc:
            buttons.append({'label': label, 'url': url})
    if buttons:
        activity['buttons'] = buttons
    return activity


class Discord:
    def __init__(self):
        self.stream = None

    def connect(self):
        if os.name == 'nt':
            import ctypes
            import msvcrt
            for index in range(10):
                try:
                    stream = open(r'\\?\pipe\discord-ipc-' + str(index), 'r+b', buffering=0)
                    mode = ctypes.c_ulong(1)  # PIPE_NOWAIT
                    if not ctypes.windll.kernel32.SetNamedPipeHandleState(
                            ctypes.c_void_p(msvcrt.get_osfhandle(stream.fileno())),
                            ctypes.byref(mode), None, None):
                        stream.close()
                        continue
                    self.stream = stream
                    break
                except OSError:
                    continue
        else:
            for path in discord_socket_paths():
                stream = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                stream.settimeout(5)
                try:
                    stream.connect(path)
                    self.stream = stream
                    break
                except OSError:
                    stream.close()
        if self.stream is None:
            raise ConnectionError('Open the Discord desktop app and try again.')
        self.send(0, {'v': 1, 'client_id': CLIENT_ID})
        opcode, response = self.receive()
        if opcode != 1 or response.get('evt') != 'READY':
            raise ConnectionError('Discord rejected the connection.')

    def send(self, opcode, payload):
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        packet = struct.pack('<II', opcode, len(body)) + body
        if os.name == 'nt':
            self.stream.write(packet)
        else:
            self.stream.sendall(packet)

    def read_exact(self, size):
        result = bytearray()
        deadline = time.monotonic() + 5
        while len(result) < size:
            try:
                part = self.stream.read(size - len(result)) if os.name == 'nt' else self.stream.recv(size - len(result))
                if not part:
                    raise ConnectionError('Discord disconnected.')
                result.extend(part)
            except OSError as error:
                if os.name != 'nt' or getattr(error, 'winerror', None) not in (232, 233, 234):
                    raise
                if time.monotonic() >= deadline:
                    raise TimeoutError('Discord did not respond.') from error
                time.sleep(0.05)
        return bytes(result)

    def receive(self):
        opcode, size = struct.unpack('<II', self.read_exact(8))
        if size > 1024 * 1024:
            raise ValueError('Discord sent an invalid response.')
        return opcode, json.loads(self.read_exact(size))

    def set_activity(self, activity):
        nonce = str(uuid.uuid4())
        self.send(1, {'cmd': 'SET_ACTIVITY', 'args': {'pid': os.getpid(), 'activity': activity}, 'nonce': nonce})
        while True:
            opcode, response = self.receive()
            if opcode == 3:
                self.send(4, response)
            elif opcode == 2:
                raise ConnectionError('Discord disconnected.')
            elif response.get('nonce') == nonce:
                if response.get('evt') == 'ERROR':
                    raise ConnectionError('Discord rejected the activity: ' + str(response.get('data', {}).get('message', 'unknown error')))
                return

    def close(self):
        if self.stream:
            self.stream.close()
            self.stream = None


def running_game(names):
    """Match user-selected executable names without inspecting process arguments."""
    wanted = {name.strip().casefold() for name in names.split(',') if name.strip()}
    if not wanted:
        return False
    if os.name == 'nt':
        output = subprocess.check_output(['tasklist', '/FO', 'CSV', '/NH'], text=True, timeout=10,
                                         creationflags=subprocess.CREATE_NO_WINDOW)
        processes = (row[0] for row in csv.reader(io.StringIO(output)) if row)
    else:
        output = subprocess.check_output(['ps', '-A', '-o', 'comm='], text=True, timeout=10)
        processes = output.splitlines()
    return any(os.path.basename(name.strip()).casefold() in wanted for name in processes)


def run_worker(password, relay, token, stop, messages, commands, sync_enabled, initial, share_photos, game_settings=None):
    discord = Discord()
    photos = PhotoPublisher()
    cloud = None
    pending = None
    previous = None
    current = initial or {}
    try:
        while not stop.is_set():
            sync_started = time.monotonic_ns()
            try:
                if cloud is None:
                    cloud = Cloud(password, relay, token)
                members = cloud.get_front_members(include_avatars=True)
                names = [member['name'] for member in members]
                messages.put(('front', members))
                sync_error = None
                while True:
                    try:
                        current = commands.get_nowait()
                        if sync_enabled.is_set():
                            pending = current
                    except queue.Empty:
                        break
                if sync_enabled.is_set():
                    try:
                        if pending is not None:
                            cloud.put_companion_settings(pending)
                            previous = pending
                            initial = None
                            pending = None
                        else:
                            remote = cloud.get_companion_settings()
                            if remote is None and initial is not None:
                                cloud.put_companion_settings(initial)
                                previous = initial
                                initial = None
                            elif remote != previous:
                                previous = remote
                                if remote is not None:
                                    current = remote
                                    messages.put(('settings', remote, sync_started))
                    except (OSError, ValueError, ConnectionError, json.JSONDecodeError) as error:
                        sync_error = str(error)
                else:
                    pending = None
                    previous = None
                if not discord.stream:
                    discord.connect()
                game_settings = game_settings if game_settings is not None else {}
                paused = game_settings.get('enabled', False) and running_game(game_settings.get('names', ''))
                photo_error = None
                try:
                    if not paused:
                        members = photos.for_activity(members, clean_presence(current.get('presence')), share_photos.is_set())
                except (OSError, ValueError) as error:
                    photo_error = str(error)
                discord.set_activity(None if paused else activity_for(members, current.get('presence')))
                status = 'Paused while a selected game is running.' if paused else ('Showing: ' + ', '.join(names) if names else 'No fronters to show.')
                if photo_error:
                    status += ' Photo: ' + photo_error
                messages.put(status + (' Settings sync: ' + sync_error + ' Retrying automatically.' if sync_error else ''))
            except (OSError, ValueError, ConnectionError, json.JSONDecodeError, subprocess.SubprocessError) as error:
                if discord.stream:
                    try:
                        discord.set_activity(None)
                    except (OSError, ValueError, ConnectionError):
                        pass
                    discord.close()
                messages.put(str(error) + ' Retrying automatically.')
            stop.wait(INTERVAL)
    finally:
        if discord.stream:
            try:
                discord.set_activity(None)
            except (OSError, ValueError, ConnectionError):
                pass
            discord.close()
        messages.put(None)


def main():
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox
    from PIL import Image, ImageDraw, ImageTk

    root = tk.Tk()
    default_title = 'Sparklecat Discord Companion'
    root.title(default_title)
    root.resizable(False, False)
    saved = settings.load()
    frame = ttk.Frame(root, padding=20)
    frame.grid(sticky='nsew')
    ttk.Label(frame, text='Discord fronting presence', font=('TkDefaultFont', 15, 'bold')).grid(row=0, column=0, columnspan=2, sticky='w')
    ttk.Label(frame, text='Plural Star cloud password').grid(row=1, column=0, columnspan=2, pady=(10, 0), sticky='w')
    value = tk.StringVar()
    entry = ttk.Entry(frame, textvariable=value, width=40, show='•')
    entry.grid(row=2, column=0, sticky='ew')
    ttk.Label(frame, text='Cloud relay URL').grid(row=3, column=0, columnspan=2, pady=(10, 0), sticky='w')
    relay = tk.StringVar(value=saved.get('relay', DEFAULT_RELAY))
    relay_entry = ttk.Entry(frame, textvariable=relay, width=40)
    relay_entry.grid(row=4, column=0, columnspan=2, sticky='ew')
    ttk.Label(frame, text='Relay token (only if your relay requires one)').grid(row=5, column=0, columnspan=2, pady=(10, 0), sticky='w')
    token = tk.StringVar()
    token_entry = ttk.Entry(frame, textvariable=token, show='•')
    token_entry.grid(row=6, column=0, columnspan=2, sticky='ew')
    ttk.Label(frame, text='Your fronting names will be visible through Discord. The default relay uses an unencrypted connection; use HTTPS if available.', wraplength=420).grid(row=7, column=0, columnspan=2, pady=(10, 0), sticky='w')
    remember = tk.BooleanVar(value=saved.get('remember', True))
    autostart = tk.BooleanVar(value=saved.get('autostart', False))
    close_mode = tk.StringVar(value=saved.get('close_mode', 'quit'))
    ttk.Checkbutton(frame, text='Remember password securely', variable=remember).grid(row=8, column=0, columnspan=2, sticky='w', pady=(10, 0))
    ttk.Checkbutton(frame, text='Start when I sign in', variable=autostart).grid(row=9, column=0, columnspan=2, sticky='w')
    ttk.Label(frame, text='When closing the window').grid(row=10, column=0, sticky='w', pady=(8, 0))
    ttk.Combobox(frame, textvariable=close_mode, values=('quit', 'minimize', 'tray'), state='readonly', width=12).grid(row=10, column=1, sticky='e', pady=(8, 0))
    title = tk.StringVar(value=saved.get('window_title', default_title))
    icon_path = tk.StringVar(value=saved.get('icon_path', ''))
    ttk.Label(frame, text='Window and tray title').grid(row=11, column=0, columnspan=2, sticky='w', pady=(8, 0))
    ttk.Entry(frame, textvariable=title).grid(row=12, column=0, columnspan=2, sticky='ew')
    def choose_icon():
        path = filedialog.askopenfilename(title='Choose an icon', filetypes=[('Images', '*.png *.jpg *.jpeg *.gif *.ico *.bmp'), ('All files', '*')])
        if path:
            icon_path.set(path)
    icon_buttons = ttk.Frame(frame)
    icon_buttons.grid(row=13, column=0, columnspan=2, sticky='w', pady=(8, 0))
    ttk.Button(icon_buttons, text='Choose icon', command=choose_icon).pack(side='left')
    ttk.Button(icon_buttons, text='Default icon', command=lambda: icon_path.set('')).pack(side='left', padx=8)
    presence = clean_presence(saved.get('presence'))
    sync_settings = tk.BooleanVar(value=saved.get('sync_settings', False))
    ttk.Checkbutton(frame, text='Sync appearance and startup settings with Plural Star', variable=sync_settings).grid(row=16, column=0, columnspan=2, sticky='w')
    status = tk.StringVar(value='Stopped. Open Discord, then select Start.')
    ttk.Label(frame, textvariable=status, wraplength=420).grid(row=15, column=0, columnspan=2, pady=(12, 0), sticky='w')
    messages = queue.Queue()
    commands = queue.Queue()
    sync_enabled = threading.Event()
    game_settings = {'enabled': saved.get('pause_for_games') is True, 'names': saved.get('game_processes', '') if isinstance(saved.get('game_processes', ''), str) else ''}
    share_photos = threading.Event()
    if saved.get('share_photos') is True:
        share_photos.set()
    state = {'stop': None, 'closing': False, 'tray': None, 'front': None, 'preview_update': None, 'settings_saved_at': 0}
    def icon_image(path):
        if path:
            with Image.open(path) as source:
                return source.convert('RGBA').copy()
        image = Image.new('RGBA', (64, 64), (30, 26, 48, 255))
        ImageDraw.Draw(image).text((18, 14), 'S', fill='white', stroke_width=1)
        return image

    def apply_appearance():
        name = title.get().strip() or default_title
        root.title(name)
        image = icon_image(icon_path.get())
        image.thumbnail((256, 256))
        root._icon_photo = ImageTk.PhotoImage(image)
        try:
            root.iconphoto(True, root._icon_photo)
        except tk.TclError:
            pass  # Some desktop environments do not support window icons.
        if state['tray']:
            state['tray'].icon = image
            state['tray'].title = name

    try:
        apply_appearance()
    except (OSError, ValueError):
        icon_path.set('')
        apply_appearance()
    try:
        if saved.get('remember'):
            value.set(settings.credential('password'))
            token.set(settings.credential('token'))
    except Exception as error:
        status.set('Could not unlock saved credentials: ' + str(error))

    def export_settings():
        window_title = title.get().strip() or default_title
        if len(window_title) > 120:
            raise ValueError('Title must be at most 120 characters to sync.')
        icon = ''
        if icon_path.get():
            from io import BytesIO
            with Image.open(icon_path.get()) as source:
                image = source.convert('RGBA')
                image.thumbnail((256, 256))
            encoded = BytesIO()
            image.save(encoded, format='PNG')
            icon = base64.b64encode(encoded.getvalue()).decode('ascii')
            if len(icon) > 400000:
                raise ValueError('Icon is too large to sync.')
        return {'v': 1, 'title': window_title, 'icon': icon,
                'autostart': autostart.get(), 'close_mode': close_mode.get(), 'presence': dict(presence)}

    def apply_cloud_settings(data):
        if not sync_settings.get():
            return
        if not isinstance(data, dict) or data.get('v') != 1 or not isinstance(data.get('title'), str) or len(data['title']) > 120 or not isinstance(data.get('autostart'), bool) or data.get('close_mode') not in ('quit', 'minimize', 'tray') or not isinstance(data.get('icon'), str) or len(data['icon']) > 400000:
            raise ValueError('Invalid synced companion settings.')
        path = ''
        if data['icon']:
            from io import BytesIO
            raw = base64.b64decode(data['icon'], validate=True)
            with Image.open(BytesIO(raw)) as image:
                if image.format not in ('PNG', 'JPEG', 'GIF', 'WEBP') or image.width > 4096 or image.height > 4096:
                    raise ValueError('Invalid synced icon.')
                image.seek(0)
                image = image.convert('RGBA')
                image.thumbnail((256, 256))
            target = settings.config_path().parent / 'cloud-icon.png'
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target, format='PNG')
            path = str(target)
        presence.update(clean_presence(data.get('presence')))
        settings.set_autostart(data['autostart'])
        title.set(data['title'])
        icon_path.set(path)
        autostart.set(data['autostart'])
        close_mode.set(data['close_mode'])
        apply_appearance()
        preferences = dict(saved, window_title=data['title'], icon_path=path, autostart=data['autostart'], close_mode=data['close_mode'], presence=dict(presence))
        settings.save(preferences)
        saved.update(preferences)

    def save_preferences():
        try:
            credential_error = None
            try:
                if remember.get() and value.get():
                    settings.credential('password', value.get())
                    if token.get():
                        settings.credential('token', token.get())
                    else:
                        settings.credential('token', delete=True)
                elif not remember.get() and saved.get('remember'):
                    settings.credential('password', delete=True)
                    settings.credential('token', delete=True)
            except Exception as error:
                credential_error = str(error)
            if icon_path.get() and icon_path.get() != saved.get('icon_path'):
                icon_path.set(settings.save_icon(icon_path.get()))
            synced = export_settings() if sync_settings.get() else None
            apply_appearance()
            settings.set_autostart(autostart.get())
            preferences = {'relay': relay.get(), 'remember': remember.get(), 'autostart': autostart.get(), 'close_mode': close_mode.get(), 'window_title': title.get().strip() or default_title, 'icon_path': icon_path.get(), 'sync_settings': sync_settings.get(), 'presence': dict(presence), 'share_photos': share_photos.is_set(), 'pause_for_games': game_settings['enabled'], 'game_processes': game_settings['names']}
            settings.save(preferences)
            saved.update(preferences)
            state['settings_saved_at'] = time.monotonic_ns()
            if sync_settings.get():
                sync_enabled.set()
                if state['stop']:
                    commands.put(synced)
            else:
                sync_enabled.clear()
                if state['stop']:
                    commands.put(export_settings())
            status.set('Settings saved. Could not update saved credentials: ' + credential_error if credential_error else 'Settings saved.')
            return True
        except Exception as error:
            status.set('Could not save settings or credentials: ' + str(error))
            return False

    def toggle():
        if state['stop']:
            state['stop'].set()
            button.config(state='disabled')
            status.set('Stopping...')
            return
        current = value.get()
        if not current:
            status.set('Enter your Plural Star cloud password.')
            return
        current_relay, current_token = relay.get(), token.get()
        if not save_preferences():
            return
        state['stop'] = threading.Event()
        entry.config(state='disabled')
        relay_entry.config(state='disabled')
        token_entry.config(state='disabled')
        button.config(text='Stop')
        status.set('Connecting...')
        threading.Thread(target=run_worker, args=(current, current_relay, current_token, state['stop'], messages, commands, sync_enabled, export_settings(), share_photos, game_settings), daemon=True).start()

    def edit_presence():
        dialog = tk.Toplevel(root)
        dialog.title('Discord presence')
        panel = ttk.Frame(dialog, padding=12)
        panel.grid(sticky='nsew')
        fields = [('details', 'First line'), ('state', 'Second line'),
                  ('large_image', 'Large image URL or asset key'), ('large_text', 'Large image hover text'),
                  ('small_image', 'Small image URL or asset key'), ('small_text', 'Small image hover text'),
                  ('button1_label', 'First button label'), ('button1_url', 'First button URL'),
                  ('button2_label', 'Second button label'), ('button2_url', 'Second button URL')]
        variables = {key: tk.StringVar(value=presence[key]) for key, _ in fields}
        show_empty = tk.BooleanVar(value=presence['show_empty'])
        allow_photos = tk.BooleanVar(value=share_photos.is_set())
        pause_games = tk.BooleanVar(value=game_settings['enabled'])
        game_names = tk.StringVar(value=game_settings['names'])
        ttk.Label(panel, text='Use {fronters}, {count}, {name}, {pronouns} and {avatar}.\n{name}, {pronouns} and {avatar} use the first fronter.\n{avatar} needs a public HTTPS photo URL for Discord.', justify='left').grid(row=0, column=0, columnspan=2, sticky='w')
        for row, (key, label) in enumerate(fields, 1):
            ttk.Label(panel, text=label).grid(row=row, column=0, sticky='w', padx=(0, 8))
            ttk.Entry(panel, textvariable=variables[key], width=42).grid(row=row, column=1, sticky='ew')
        ttk.Checkbutton(panel, text='Show presence when nobody is fronting', variable=show_empty).grid(row=11, column=0, columnspan=2, sticky='w')
        def confirm_photos():
            if allow_photos.get():
                allowed = messagebox.askyesno('Share photos publicly?',
                    'The companion will upload the first fronter\'s photo to Uguu when {avatar} is used in an image field. '
                    'Photos leave your encrypted vault and become publicly accessible to anyone with the link. '
                    'Links expire after 3 hours and renew automatically while needed. Others and Discord may keep copies. '
                    'Disabling stops new uploads; existing uploads remain until they expire. '
                    'Names, pronouns and vault credentials are not uploaded to the photo host.\n\nEnable photo sharing on this computer?', parent=dialog)
                allow_photos.set(allowed)
                if allowed and not variables['large_image'].get():
                    variables['large_image'].set('{avatar}')
            update_preview()
        ttk.Checkbutton(panel, text='Share cloud photos publicly for Discord (temporary hosting)', variable=allow_photos, command=confirm_photos).grid(row=12, column=0, columnspan=2, sticky='w')
        ttk.Checkbutton(panel, text='Pause presence while selected games are running', variable=pause_games).grid(row=13, column=0, columnspan=2, sticky='w')
        ttk.Label(panel, text='Game executable names (comma-separated)').grid(row=14, column=0, sticky='w')
        ttk.Entry(panel, textvariable=game_names, width=42).grid(row=14, column=1, sticky='ew')
        preview = tk.StringVar()
        preview_frame = ttk.Frame(panel)
        preview_frame.grid(row=15, column=0, columnspan=2, sticky='w', pady=10)
        photo_label = ttk.Label(preview_frame)
        photo_label.pack(side='left', padx=(0, 8))
        ttk.Label(preview_frame, textvariable=preview, wraplength=360, justify='left').pack(side='left')
        def values():
            return clean_presence({**{key: var.get() for key, var in variables.items()}, 'show_empty': show_empty.get()})
        def update_preview(*_):
            members = state['front'] if state['front'] is not None else [{'name': 'Alex', 'pronouns': 'they/them', 'avatar': ''}, {'name': 'Sam', 'pronouns': 'she/her', 'avatar': ''}]
            activity = activity_for(members, values()) or {}
            lines = ['Preview (' + ('your cloud data' if state['front'] is not None else 'example data') + ')', activity.get('details', ''), activity.get('state', '')]
            first = members[0] if members else {}
            photo_label.config(image='')
            photo_label.image = None
            if first.get('photo'):
                try:
                    from io import BytesIO
                    with Image.open(BytesIO(first['photo'])) as photo:
                        photo.thumbnail((72, 72))
                        photo_label.image = ImageTk.PhotoImage(photo.convert('RGBA'), master=dialog)
                    photo_label.config(image=photo_label.image)
                    if urlparse(first.get('avatar', '')).scheme == 'https':
                        if not activity.get('assets', {}).get('large_image'):
                            lines.append('Select Use fronter photo to show this photo on Discord.')
                    else:
                        lines.append('Cloud photo will be shared publicly while presence is running.' if allow_photos.get() else 'Private cloud photo (local preview only).')
                except (OSError, ValueError):
                    lines.append('This photo could not be displayed. Try choosing it again in Plural Star.')
            elif state['front'] is not None:
                lines.append(first.get('photo_error') or 'No profile photo found for the first fronter.')
            if any('{avatar}' in variables[key].get() and not activity.get('assets', {}).get(key) for key in ('large_image', 'small_image')):
                if not allow_photos.get():
                    lines.append('Enable public photo sharing above to show cloud photos on Discord.')
            lines += ['Image: ' + activity['assets'].get('large_image', '')] if activity.get('assets') else []
            lines += ['Buttons: ' + ', '.join(button['label'] for button in activity['buttons'])] if activity.get('buttons') else []
            preview.set('\n'.join(lines))
        for var in variables.values():
            var.trace_add('write', update_preview)
        show_empty.trace_add('write', update_preview)
        update_preview()
        state['preview_update'] = update_preview
        def load_front():
            if not value.get():
                preview.set('Enter your Plural Star cloud password first.')
                return
            password, address, relay_token = value.get(), relay.get(), token.get()
            preview.set('Loading your cloud data...')
            def fetch():
                try:
                    messages.put(('preview_front', Cloud(password, address, relay_token).get_front_members(include_avatars=True)))
                except Exception as error:
                    messages.put(('preview_error', str(error)))
            threading.Thread(target=fetch, daemon=True).start()
        def close_dialog():
            state['preview_update'] = None
            dialog.destroy()
        def apply():
            names = game_names.get().strip()
            if pause_games.get() and not any(part.strip() for part in names.split(',')):
                messagebox.showerror('Choose games', 'Enter at least one executable name.', parent=dialog)
                return
            game_settings.update(enabled=pause_games.get(), names=names)
            presence.update(values())
            if allow_photos.get():
                share_photos.set()
            else:
                share_photos.clear()
            if save_preferences():
                close_dialog()
            else:
                messagebox.showerror('Could not save presence', status.get(), parent=dialog)
        ttk.Button(panel, text='Save presence', command=apply).grid(row=16, column=0, sticky='w')
        ttk.Button(panel, text='Load my fronters', command=load_front).grid(row=16, column=1, sticky='e')
        ttk.Button(panel, text='Use fronter photo', command=lambda: variables['large_image'].set('{avatar}')).grid(row=17, column=0, columnspan=2, sticky='w', pady=(8, 0))
        if value.get() and state['front'] is None:
            load_front()
        dialog.protocol('WM_DELETE_WINDOW', close_dialog)
        return photo_label

    ttk.Button(icon_buttons, text='Edit Discord presence', command=edit_presence).pack(side='left')
    ttk.Button(frame, text='Save settings', command=save_preferences).grid(row=14, column=0, columnspan=2, sticky='w', pady=(8, 0))
    button = ttk.Button(frame, text='Start', command=toggle)
    button.grid(row=2, column=1, padx=(8, 0))

    def start_saved():
        if saved.get('remember') and value.get() and not state['stop']:
            toggle()

    install = updater.target()
    updates = queue.Queue()
    if install:
        button.config(state='disabled')
        status.set('Checking for updates...')

        def check_updates():
            try:
                updates.put((updater.fetch_update(), None))
            except Exception as error:
                updates.put((None, str(error)))

        threading.Thread(target=check_updates, daemon=True).start()

        def poll_updates():
            try:
                result, error = updates.get_nowait()
            except queue.Empty:
                root.after(200, poll_updates)
                return
            if result:
                _, _, executable = result
                try:
                    subprocess.Popen([str(executable), '--apply-update', str(install), str(os.getpid())], close_fds=True)
                    root.destroy()
                    return
                except OSError as exc:
                    error = str(exc)
            button.config(state='normal')
            status.set('Update check failed: ' + error if error else 'Stopped. Open Discord, then select Start.')
            start_saved()

        root.after(200, poll_updates)

    def poll():
        try:
            while True:
                message = messages.get_nowait()
                if message is None:
                    state['stop'] = None
                    if state['closing']:
                        root.destroy()
                        return
                    entry.config(state='normal')
                    relay_entry.config(state='normal')
                    token_entry.config(state='normal')
                    button.config(text='Start', state='normal')
                    status.set('Stopped.')
                elif isinstance(message, tuple) and message[0] in ('front', 'preview_front'):
                    state['front'] = message[1]
                    if state['preview_update']:
                        state['preview_update']()
                elif isinstance(message, tuple) and message[0] == 'preview_error':
                    status.set('Could not load preview: ' + message[1])
                    if state['preview_update']:
                        state['preview_update']()
                elif isinstance(message, tuple) and message[0] == 'settings':
                    if message[2] <= state['settings_saved_at']:
                        continue
                    try:
                        apply_cloud_settings(message[1])
                    except Exception as error:
                        status.set('Could not apply synced settings: ' + str(error))
                elif not state['closing']:
                    status.set(message)
        except queue.Empty:
            pass
        root.after(200, poll)

    def quit_app():
        if state['tray']:
            state['tray'].stop()
            state['tray'] = None
        if state['stop']:
            state['closing'] = True
            state['stop'].set()
            root.withdraw()
        else:
            root.destroy()

    def show_window():
        root.deiconify()
        root.lift()

    def close():
        mode = close_mode.get()
        if mode == 'tray':
            try:
                if not state['tray']:
                    import pystray
                    image = icon_image(icon_path.get())
                    tray = pystray.Icon('sparklecat-companion', image, title.get().strip() or default_title,
                        menu=pystray.Menu(pystray.MenuItem('Open', lambda: root.after(0, show_window), default=True),
                                          pystray.MenuItem('Quit', lambda: root.after(0, quit_app))))
                    tray.run_detached()
                    state['tray'] = tray
                root.withdraw()
            except Exception as error:
                status.set('Tray unavailable: ' + str(error))
        elif mode == 'minimize':
            root.iconify()
        else:
            quit_app()

    root.protocol('WM_DELETE_WINDOW', close)
    root.after(200, poll)
    if not install:
        root.after(200, start_saved)
    if '--autostart' in sys.argv and saved.get('close_mode') in ('tray', 'minimize'):
        root.after(300, close)
    if '--gui-self-test' in sys.argv:
        from io import BytesIO
        photo = BytesIO()
        Image.new('RGB', (96, 96), 'blue').save(photo, format='PNG')
        state['front'] = [{'name': 'Test', 'pronouns': 'they/them', 'avatar': 'cloud:media', 'photo': photo.getvalue()}]
        label = edit_presence()
        root.update()
        assert label.image is not None and label.image.width() == 72
        panel = label.master.master
        first_line = panel.grid_slaves(row=1, column=1)[0]
        first_line.delete(0, 'end')
        first_line.insert(0, 'Saved presence test')
        panel.grid_slaves(row=14, column=0)[0].invoke()
        assert settings.load()['presence']['details'] == 'Saved presence test'
        value.set('test password')
        original_credential = settings.credential
        def unavailable_credential(*args, **kwargs):
            raise RuntimeError('Keyring unavailable')
        settings.credential = unavailable_credential
        assert save_preferences() and 'Keyring unavailable' in status.get()
        settings.credential = original_credential
        sync_settings.set(True)
        messages.put(('settings', {'v': 1, 'title': 'Old settings', 'icon': '',
                                    'autostart': False, 'close_mode': 'quit'}, 0))
        poll()
        assert settings.load()['presence']['details'] == 'Saved presence test'
        root.after(500, root.destroy)
    root.mainloop()


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--apply-update':
        updater.apply_update(sys.argv[2], int(sys.argv[3]))
    elif '--self-test' in sys.argv:
        import tkinter
        import importlib.util
        import keyring
        from PIL import Image
        from cloud import derive
        from nacl.secret import SecretBox
        tkinter.Tcl()
        assert keyring.get_keyring() and Image.new('RGB', (1, 1)) and importlib.util.find_spec('pystray')
        assert len(derive('test')[2]) == SecretBox.KEY_SIZE
        if sys.platform.startswith('linux'):
            from photos import upload_context
            assert upload_context().cert_store_stats()['x509_ca'] > 0
    else:
        main()
