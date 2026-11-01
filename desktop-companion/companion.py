#!/usr/bin/env python3
"""Show Plural Star cloud fronters in Discord activity."""
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

from cloud import Cloud, DEFAULT_RELAY
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


def activity_for(names):
    if not names:
        return None
    return {'details': 'Currently fronting', 'state': ', '.join(names)[:128]}


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


def run_worker(password, relay, token, stop, messages):
    discord = Discord()
    cloud = None
    try:
        while not stop.is_set():
            try:
                if cloud is None:
                    cloud = Cloud(password, relay, token)
                names = cloud.get_front()
                if not discord.stream:
                    discord.connect()
                discord.set_activity(activity_for(names))
                messages.put('Showing: ' + ', '.join(names) if names else 'No fronters to show.')
            except (OSError, ValueError, ConnectionError, json.JSONDecodeError) as error:
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
    from tkinter import ttk

    root = tk.Tk()
    root.title('Sparklecat Discord Companion')
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
    status = tk.StringVar(value='Stopped. Open Discord, then select Start.')
    ttk.Label(frame, textvariable=status, wraplength=420).grid(row=12, column=0, columnspan=2, pady=(12, 0), sticky='w')
    messages = queue.Queue()
    state = {'stop': None, 'closing': False, 'tray': None}
    try:
        if saved.get('remember'):
            value.set(settings.credential('password'))
            token.set(settings.credential('token'))
    except Exception as error:
        status.set('Could not unlock saved credentials: ' + str(error))

    def save_preferences():
        try:
            if remember.get():
                if not value.get():
                    raise ValueError('Enter your Plural Star cloud password.')
                settings.credential('password', value.get())
                if token.get():
                    settings.credential('token', token.get())
                else:
                    settings.credential('token', delete=True)
            elif saved.get('remember'):
                settings.credential('password', delete=True)
                settings.credential('token', delete=True)
            settings.set_autostart(autostart.get())
            preferences = {'relay': relay.get(), 'remember': remember.get(), 'autostart': autostart.get(), 'close_mode': close_mode.get()}
            settings.save(preferences)
            saved.update(preferences)
            status.set('Settings saved.')
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
        threading.Thread(target=run_worker, args=(current, current_relay, current_token, state['stop'], messages), daemon=True).start()

    ttk.Button(frame, text='Save settings', command=save_preferences).grid(row=11, column=0, columnspan=2, sticky='w', pady=(8, 0))
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
                    from PIL import Image, ImageDraw
                    image = Image.new('RGBA', (64, 64), (30, 26, 48, 255))
                    ImageDraw.Draw(image).text((18, 14), 'S', fill='white', stroke_width=1)
                    tray = pystray.Icon('sparklecat-companion', image, 'Sparklecat Discord Companion',
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
    root.mainloop()


if __name__ == '__main__':
    if len(sys.argv) == 4 and sys.argv[1] == '--apply-update':
        updater.apply_update(sys.argv[2], int(sys.argv[3]))
    elif '--self-test' in sys.argv:
        import tkinter
        from cloud import derive
        from nacl.secret import SecretBox
        tkinter.Tcl()
        assert len(derive('test')[2]) == SecretBox.KEY_SIZE
    else:
        main()
